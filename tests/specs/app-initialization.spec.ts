import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  closeApp,
  launchApp,
  test,
  testDataDirs,
} from '../fixtures/electronApp.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import { setUserViaIpc } from '../helpers/user.js';
import { openWindowCount } from '../helpers/window.js';

test.describe('App Initialization', () => {
  test('should be able to launch the app successfully', async ({
    mainWindow,
  }) => {
    // Verify the renderer loaded and its mount point is visible
    await expect(mainWindow.locator('#app')).toBeVisible();

    // Verify the title set by the root route
    await expect(mainWindow).toHaveTitle('elek.io Desktop');

    // Verify the initial "/" to "/projects" redirect happened
    await verifyCurrentRouteHash(mainWindow, '#/projects');
  });

  test.describe('activated while it is still starting', () => {
    // The start is held by replacing the User file with a named pipe, which the
    // read at the beginning of the start waits on, and mkfifo is POSIX. macOS
    // is where an activation during the start happens for real, from the dock
    // or the Finder icon.
    test.skip(
      process.platform === 'win32',
      'A named pipe is what holds the start, and mkfifo is POSIX'
    );

    test('opens no window of its own, so one window holds one claim', async ({
      electronApp,
      mainWindow,
    }, testInfo) => {
      // Written by Core rather than by hand, so the file the pipe later stands
      // in for is in the shape Core reads back.
      await setUserViaIpc(mainWindow);
      const { dataDir, userDataDir } = testDataDirs(testInfo);
      const userFile = path.join(dataDir, 'user.json');
      const storedUser = readFileSync(userFile, 'utf8');
      await closeApp(electronApp);

      // A read of a pipe nothing has written to blocks, which holds the start
      // between reading the User and creating its window.
      rmSync(userFile);
      execFileSync('mkfifo', [userFile]);
      const heldApp = await launchApp(testInfo, { dataDir, userDataDir });

      try {
        // The start is held, so the app has no window yet. Read first, since
        // everything below is about what is counted at this moment.
        expect(await openWindowCount(heldApp)).toBe(0);

        // What the dock click is. It is emitted into the app's own handler
        // because only macOS raises it, and the gap it has to land in is this
        // one: the window the start is about to create does not exist yet.
        await heldApp.evaluate(({ app }) => {
          app.emit('activate');
        });

        // The activation waits for the start instead of counting windows now.
        // A window made here would be a second one with no state of its own:
        // both renderers would claim the one unsaved-changes field, so a clean
        // window's answer could clear what the edited one claimed. It would
        // also come up before the IPC handlers exist and land on the error
        // screen, see contributing/overview.md.
        expect(await openWindowCount(heldApp)).toBe(0);

        // Let the start finish. The pipe is replaced with a file first, so the
        // renderer's own read of the User finds something to read too.
        writeFileSync(userFile, storedUser);
        rmSync(userFile);
        writeFileSync(userFile, storedUser);

        const window = await heldApp.firstWindow({ timeout: 20000 });
        await expect(window.locator('#app')).toBeVisible();

        // One window, the start's own, and it came up with its handlers in
        // place rather than on the error screen.
        expect(await openWindowCount(heldApp)).toBe(1);
        await verifyCurrentRouteHash(window, '#/projects');
      } finally {
        // Launched here, so it is not the fixture's to close.
        await closeApp(heldApp);
      }
    });
  });
});

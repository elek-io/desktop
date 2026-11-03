import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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

  // Both ways a window can go while its own first load is still running: the
  // close button somebody presses, which takes the window's web contents down
  // a tick before the window itself, and the destroy every close of a running
  // app goes through, see `closeApp`.
  for (const wayOut of ['closed', 'destroyed'] as const) {
    test(`${wayOut} while it is still starting, it ends rather than reporting a failed start`, async ({
      cloudUrl,
    }, testInfo) => {
      const launched = await launchApp(testInfo, { cloudUrl });
      // Held while the app is up, since a closed app answers nothing anymore.
      const appProcess = launched.process();
      const reportedFailures: string[] = [];
      launched.on('console', (message) => {
        if (message.text().includes('Failed to initialize the app')) {
          reportedFailures.push(message.text());
        }
      });
      await launched.firstWindow();

      try {
        // The window goes while its own first load is still running, which is
        // what closing the app right after it launched does. That rejects the
        // load, and a rejection taken for a failed start would put a modal box
        // on screen for somebody who is already closing the app.
        const wentWhileLoading = await launched.evaluate(
          ({ BrowserWindow }, how) => {
            const [window] = BrowserWindow.getAllWindows();

            if (
              window === undefined ||
              window.webContents.isLoading() === false
            ) {
              return false;
            }

            if (how === 'closed') {
              window.close();
            } else {
              window.destroy();
            }

            return true;
          },
          wayOut
        );
        expect(wentWhileLoading).toBe(true);
      } finally {
        // Nobody is here to answer that box, so an app that took the rejection
        // for a failed start would hold its process for good and this close
        // would never return.
        await closeApp(launched);
      }

      expect({
        reportedFailures,
        ended: appProcess.exitCode !== null || appProcess.signalCode !== null,
      }).toEqual({ reportedFailures: [], ended: true });

      // Launched here, so the data dirs are this spec's to drop, best effort
      // like the fixture's. Left behind on a failure, like every other spec's,
      // since the artifact ships them.
      const { dataDir } = testDataDirs(testInfo);
      await rm(path.dirname(dataDir), { recursive: true, force: true }).catch(
        () => {}
      );
    });
  }

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

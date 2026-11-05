import {
  expect,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  closeApp,
  launchApp,
  test,
  testDataDirs,
} from '../fixtures/electronApp.js';
import { bootOnHash, verifyCurrentRouteHash } from '../helpers/navigation.js';
import { setUserViaIpc } from '../helpers/user.js';
import { openWindowCount } from '../helpers/window.js';

/**
 * Launch the app with its start held between reading the User and creating its
 * window, and hand back what lets the start go on.
 *
 * A read of a pipe nothing has written to blocks, so the User file is replaced
 * with one, which stops the start at Core's read of the User. That is before
 * the window is created, so a spec about the window the start is about to
 * create arranges what it needs from there rather than racing the start.
 *
 * The app the fixture launched writes that User first, rather than this
 * writing one by hand, so the file the pipe stands in for is in the shape Core
 * reads back. It is closed here, since the held app takes its data
 * directories over.
 */
async function launchWithHeldStart(
  electronApp: ElectronApplication,
  mainWindow: Page,
  testInfo: TestInfo
): Promise<{
  heldApp: ElectronApplication;
  letTheStartGoOn: () => void;
}> {
  await setUserViaIpc(mainWindow);
  const { dataDir, userDataDir } = testDataDirs(testInfo);
  const userFile = path.join(dataDir, 'user.json');
  const storedUser = readFileSync(userFile, 'utf8');
  await closeApp(electronApp);

  rmSync(userFile);
  execFileSync('mkfifo', [userFile]);
  const heldApp = await launchApp(testInfo, { dataDir, userDataDir });

  return {
    heldApp,
    letTheStartGoOn: (): void => {
      // The blocked read takes what is written to the pipe, and the pipe is
      // then replaced with a file so the renderer's own read of the User finds
      // something to read too.
      writeFileSync(userFile, storedUser);
      rmSync(userFile);
      writeFileSync(userFile, storedUser);
    },
  };
}

/**
 * Take every file the app's own window asks for and answer none of them, so
 * the window's first load keeps running for as long as the app does.
 *
 * Registered while the start is held, which is before the window exists, so
 * the load cannot get past it. Without it a spec about a load that is still
 * running would rest on how long the packaged page takes, which is a margin
 * rather than a condition: where the page is loaded before the window can be
 * acted on, such a spec fails with nothing regressed.
 *
 * Nothing answers the held requests afterwards. The window they belong to is
 * gone by then, and a request still in flight holds nothing of the app, which
 * is what each spec's own assertion that the app ended covers.
 */
async function holdEveryFileTheWindowAsks(
  app: ElectronApplication
): Promise<void> {
  await app.evaluate(({ protocol }) => {
    globalThis.heldFileRequests = [];

    protocol.handle('file', async (request) => {
      globalThis.heldFileRequests?.push(request.url);
      return new Promise<Response>(() => {});
    });
  });
}

/** Whether the app's window is up with its first load held. */
async function firstLoadIsHeld(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    return (
      window !== undefined &&
      window.webContents.isLoading() &&
      (globalThis.heldFileRequests?.length ?? 0) > 0
    );
  });
}

test.describe('App Initialization', () => {
  test('should be able to launch the app successfully', async ({
    mainWindow,
  }) => {
    // Verify the renderer loaded and its mount point is visible
    await expect(mainWindow.locator('#app')).toBeVisible();

    // Verify the title set by the root route
    await expect(mainWindow).toHaveTitle('elek.io Desktop');

    // Nothing can be written before a User exists, so the gate on the root
    // route settles every address on the first start until there is one
    await verifyCurrentRouteHash(mainWindow, '#/welcome');

    // With a User, "/" redirects to the Projects page as it did before
    await setUserViaIpc(mainWindow);
    await bootOnHash(mainWindow, '#/', '#/projects');
  });

  test.describe('while its own first load is still running', () => {
    // The load is held from inside the start, which a named pipe holds, and
    // mkfifo is POSIX. The guard these drive branches on nothing but which of
    // the two is gone, so Windows loses a run of it rather than a case of its
    // own.
    test.skip(
      process.platform === 'win32',
      'The load is held from inside a held start, and mkfifo is POSIX'
    );

    // Both ways a window can go while that load runs: the close button
    // somebody presses, which takes the window's web contents down a tick
    // before the window itself, and the destroy every close of a running app
    // goes through, see `closeApp`.
    for (const wayOut of ['closed', 'destroyed'] as const) {
      test(`${wayOut}, it ends rather than reporting a failed start`, async ({
        electronApp,
        mainWindow,
      }, testInfo) => {
        // Slow on purpose: two app launches, the second one held.
        test.slow();
        const { heldApp, letTheStartGoOn } = await launchWithHeldStart(
          electronApp,
          mainWindow,
          testInfo
        );
        // Held while the app is up, since a closed app answers nothing anymore.
        const appProcess = heldApp.process();
        const reportedFailures: string[] = [];
        heldApp.on('console', (message) => {
          if (message.text().includes('Failed to initialize the app')) {
            reportedFailures.push(message.text());
          }
        });

        try {
          await holdEveryFileTheWindowAsks(heldApp);
          letTheStartGoOn();
          await expect
            .poll(async () => firstLoadIsHeld(heldApp), {
              message: 'the window never came up with its first load held',
              // The same room the fixture gives a window to open in, since
              // this waits for the one the released start creates.
              timeout: 20000,
            })
            .toBe(true);

          // The window goes while its own first load is still running, which
          // is what closing the app right after it launched does. That rejects
          // the load, and a rejection taken for a failed start would put a
          // modal box on screen for somebody who is already closing the app.
          const loadWasStillRunning = await heldApp.evaluate(
            ({ BrowserWindow }, how) => {
              const [window] = BrowserWindow.getAllWindows();

              if (window === undefined) {
                return null;
              }

              // Read rather than waited for: the hold above is what makes it
              // true, so anything else here means the hold stopped working and
              // the spec says so instead of passing on a load that is done.
              const stillRunning = window.webContents.isLoading();

              if (how === 'closed') {
                window.close();
              } else {
                window.destroy();
              }

              return stillRunning;
            },
            wayOut
          );
          expect(loadWasStillRunning).toBe(true);
        } finally {
          // Nobody is here to answer that box, so an app that took the
          // rejection for a failed start would hold its process for good and
          // this close would never return.
          await closeApp(heldApp);
        }

        expect({
          reportedFailures,
          ended: appProcess.exitCode !== null || appProcess.signalCode !== null,
        }).toEqual({ reportedFailures: [], ended: true });
      });
    }
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
      const { heldApp, letTheStartGoOn } = await launchWithHeldStart(
        electronApp,
        mainWindow,
        testInfo
      );

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

        letTheStartGoOn();

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

import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { parseColor, toBytes } from '../helpers/color.js';
import { stubCoreHang, stubCoreReject } from '../helpers/ipc.js';
import { recordLogsViaIpc, recordedLogs } from '../helpers/log.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/**
 * What a pane of the main panel shows while it reads, and what it shows when
 * the read fails.
 *
 * Both are built once, for every screen, so they are driven here through the
 * History's list of changes, whose read happens inside its own pane. The
 * matching rule for the other half, that a failed write still takes the whole
 * view to the root error screen, is asserted by the specs of each mutation
 * (see error-handling.md).
 */
test.describe('A pane that is still reading', () => {
  test('shows still rows, and nothing moves', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A read that never settles, so the loading state is stable to measure
    // instead of racing the answer.
    await stubCoreHang(electronApp, 'core:projects:history');
    await navigate(mainWindow, `#/projects/${project.id}/history`);

    const measured = await mainWindow.evaluate(() => {
      const skeletons = Array.from(
        document.querySelectorAll('[data-slot="skeleton"]')
      );
      return {
        count: skeletons.length,
        animations: Array.from(
          new Set(skeletons.map((row) => getComputedStyle(row).animationName))
        ),
        surfaces: Array.from(
          new Set(skeletons.map((row) => getComputedStyle(row).backgroundColor))
        ),
        muted: getComputedStyle(document.documentElement).getPropertyValue(
          '--color-muted'
        ),
        running: document.getAnimations().length,
      };
    });

    // Still rows in the muted surface: ci rules out the pulse, since nothing
    // moves while a page loads. Nothing in the whole document runs an
    // animation, which is what catches a pulse put back anywhere else too.
    expect(measured.count).toBeGreaterThan(0);
    expect(measured.animations).toEqual(['none']);
    expect(measured.running).toBe(0);

    // The muted surface is the token's, read off the running app rather than
    // written out here.
    expect(measured.surfaces).toHaveLength(1);
    expect(toBytes(parseColor(measured.surfaces[0] ?? ''))).toEqual(
      toBytes(parseColor(measured.muted))
    );
  });
});

test.describe('A pane whose read fails', () => {
  test('says so in its place, with Try again, and logs it', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await recordLogsViaIpc(electronApp);
    await stubCoreReject(electronApp, 'core:projects:history');
    await navigate(mainWindow, `#/projects/${project.id}/history`);

    // The sentence stands where the pane is, not in place of the window. React
    // Query retries the read a few times first, so the wait is longer.
    const failed = mainWindow.getByRole('alert');
    await expect(failed).toContainText(
      "Desktop can't read the changes of this Project.",
      { timeout: 20000 }
    );

    // The rest of the window keeps working: the sidebar, the header and the
    // other pane are all still there, and the root error screen did not take
    // over.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(mainWindow.locator('[data-slot="sidebar"]')).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: 'elek.io Desktop, Projects' })
    ).toBeVisible();

    // It is logged the way the root error screen logs, so a read that failed
    // inside a pane is in the log file with its type, message and stack.
    const records = await recordedLogs(electronApp);
    const logged = records.filter(
      (record) =>
        record.level === 'error' && record.message.startsWith('Uncaught pane')
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]?.message).toContain('E2E injected failure');
    expect(logged[0]?.source).toBe('desktop');
    expect(Object.keys(logged[0]?.meta ?? {})).toContain(
      'exception.stacktrace'
    );
  });

  test('reads again when Try again is pressed', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await stubCoreReject(electronApp, 'core:projects:history');
    await navigate(mainWindow, `#/projects/${project.id}/history`);
    await expect(mainWindow.getByRole('alert')).toContainText("can't read", {
      timeout: 20000,
    });

    // With the read working again, Try again clears the query's error and the
    // boundary, and the pane fills.
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('core:projects:history');
      ipcMain.handle('core:projects:history', () => ({
        history: [],
        fullHistory: [],
      }));
    });
    await mainWindow.getByRole('button', { name: 'Try again' }).click();

    await expect(mainWindow.getByText('No Changes found')).toBeVisible();
    await expect(mainWindow.getByRole('alert')).toBeHidden();
  });
});

test.describe("A Project's navigation", () => {
  test('keeps every row at full height and scrolls instead', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await waitForLayout(mainWindow);

    const measured = await mainWindow.evaluate(() => {
      const navigation = document.querySelector(
        '[data-slot="sidebar"] [data-slot="sidebar-content"]'
      );
      if (navigation === null) {
        throw new Error('The sidebar has no navigation');
      }
      const style = getComputedStyle(navigation);

      return {
        rowHeights: Array.from(
          new Set(
            Array.from(
              navigation.querySelectorAll('[data-slot="sidebar-menu-button"]')
            ).map((row) => Math.round(row.getBoundingClientRect().height))
          )
        ),
        overflowY: style.overflowY,
        scrollbarWidth: style.getPropertyValue('scrollbar-width'),
        childrenShrink: Array.from(
          new Set(
            Array.from(navigation.querySelectorAll(':scope > *')).map(
              (child) => getComputedStyle(child).flexShrink
            )
          )
        ),
        fitsTheWindow:
          navigation.getBoundingClientRect().bottom <= window.innerHeight,
      };
    });

    // Every row is the 32 px it is drawn at, at the smallest window the app
    // supports. The design's own measurement found rows shrinking to 26 px
    // instead of the list scrolling, which is what this holds.
    expect(measured.rowHeights).toEqual([32]);

    // What gives way instead is the list: it scrolls, its scrollbar stays
    // hidden, and nothing inside it is allowed to shrink.
    expect(measured.overflowY).toBe('auto');
    expect(measured.scrollbarWidth).toBe('none');
    expect(measured.childrenShrink).toEqual(['0']);
    expect(measured.fitsTheWindow).toBe(true);
  });
});

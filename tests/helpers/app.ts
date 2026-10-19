import {
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { launchApp, testDataDirs } from '../fixtures/electronApp.js';

/**
 * Close the running app and relaunch it against the same data directory, to
 * model a real restart and test that content survives a full main-process and
 * Core restart (not just a renderer reload, which `reloadWindow` covers).
 *
 * Closing first releases the data dir, then a fresh app is launched with the
 * same ELEK_IO_DATA_DIR and userData dir the fixture used. The returned window
 * is a new first window and is not covered by the `mainWindow` fixture's
 * console and axe teardown, which watch the original window.
 *
 * Pass the `cloudUrl` the first launch used, such as the Cloud stub's, or the
 * relaunch talks to the closed port every launch defaults to.
 */
export async function relaunchApp(
  testInfo: TestInfo,
  app: ElectronApplication,
  overrides: { cloudUrl?: string; env?: Record<string, string> } = {}
): Promise<{ app: ElectronApplication; window: Page }> {
  await app.close();

  const relaunched = await launchApp(testInfo, {
    ...testDataDirs(testInfo),
    ...overrides,
  });
  const window = await relaunched.firstWindow({ timeout: 20000 });

  return { app: relaunched, window };
}

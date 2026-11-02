import { expect, type ElectronApplication, type Page } from '@playwright/test';

import type { WindowTheme } from '../../src/shared/windowTheme.js';

/**
 * The smallest window elek.io Desktop supports, in CSS pixels at 100% zoom.
 *
 * The same pair the main process passes to Electron. Written out here rather
 * than imported, so a spec fails when the app's value drifts from what the
 * design asks for instead of following it.
 */
export const MINIMUM_WINDOW_SIZE = { width: 1168, height: 560 };

/** The height of the bar the window controls get to themselves. */
export const WINDOW_CONTROLS_BAR_HEIGHT = 32;

/** The height of the header below it, the same on every system. */
export const HEADER_BAR_HEIGHT = 48;

/** What Electron refuses to make the window smaller than. */
export async function windowMinimumSize(
  app: ElectronApplication
): Promise<{ width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => {
    const [width = 0, height = 0] =
      BrowserWindow.getAllWindows()[0]?.getMinimumSize() ?? [];
    return { width, height };
  });
}

/** The window's size right now. */
export async function windowSize(
  app: ElectronApplication
): Promise<{ width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => {
    const [width = 0, height = 0] =
      BrowserWindow.getAllWindows()[0]?.getSize() ?? [];
    return { width, height };
  });
}

/**
 * Ask the window for a size and wait until it has it and has been laid out at
 * it.
 *
 * Asked repeatedly on purpose: a window manager can swallow a resize issued
 * while it is still mapping the window, which it does right after a launch, and
 * a swallowed one leaves a spec measuring the size the window opened at. What
 * counts as arrived is the asked size raised to the window's own minimum, which
 * Electron enforces, read off the window rather than written out here, so what
 * the minimum is stays the spec's own assertion.
 */
export async function resizeWindow(
  app: ElectronApplication,
  page: Page,
  size: { width: number; height: number }
): Promise<void> {
  await expect
    .poll(
      async () =>
        app.evaluate(({ BrowserWindow }, target) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (window === undefined) {
            return false;
          }

          window.setSize(target.width, target.height);

          const [minimumWidth = 0, minimumHeight = 0] = window.getMinimumSize();
          const [width = 0, height = 0] = window.getSize();

          return (
            width === Math.max(target.width, minimumWidth) &&
            height === Math.max(target.height, minimumHeight)
          );
        }, size),
      { message: `the window never reached ${size.width}x${size.height}` }
    )
    .toBe(true);
  await waitForLayout(page);
}

/** Two frames, so a resize has been laid out before anything is read. */
export async function waitForLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = async (): Promise<void> =>
      new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    await frame();
    await frame();
  });
}

/**
 * Where macOS draws the traffic lights, or `null` on a system that does not.
 *
 * Electron answers the custom position a frameless window was given, so this
 * reads what the app asked for rather than the pixels, which only macOS draws.
 */
export async function windowButtonPosition(
  app: ElectronApplication
): Promise<{ x: number; y: number } | null> {
  return app.evaluate(({ BrowserWindow }) => {
    if (process.platform !== 'darwin') {
      return null;
    }
    return BrowserWindow.getAllWindows()[0]?.getWindowButtonPosition() ?? null;
  });
}

/**
 * Hand the window theme channel a value and say what the main process did
 * with it.
 *
 * `theme` is `unknown`, because what this proves is which values the main
 * process refuses. The bridge's own type allows only the two it takes, so a
 * refused value has to come in untyped.
 *
 * The rejection's own message comes back as well, since Electron carries it to
 * the caller. A spec asserts it rather than only the rejection, because a
 * channel that stopped parsing would still reject a value it then tripped over
 * somewhere else.
 */
export async function setWindowTheme(
  page: Page,
  theme: unknown
): Promise<{ accepted: boolean; message: string }> {
  return page.evaluate(async (value) => {
    try {
      // The one cast in the suite that is the point of the test: the bridge is
      // typed to the two values it takes, so handing it anything else needs the
      // type out of the way. What the main process does with it is what this
      // measures.
      await window.ipc.electron.window.setTheme(value as WindowTheme);
      return { accepted: true, message: '' };
    } catch (error) {
      return { accepted: false, message: String(error) };
    }
  }, theme);
}

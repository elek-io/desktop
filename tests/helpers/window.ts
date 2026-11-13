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

/** How many windows the app holds open right now. */
export async function openWindowCount(
  app: ElectronApplication
): Promise<number> {
  return app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
  );
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
 * What the window the app opened can keep: Electron's own minimum, which it
 * enforces, and the work area of the screen the window stands on, which no
 * window is bigger than.
 */
async function windowLimits(app: ElectronApplication): Promise<{
  minimum: { width: number; height: number };
  room: { width: number; height: number };
}> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const [width = 0, height = 0] = window?.getMinimumSize() ?? [];
    const display =
      window === undefined
        ? screen.getPrimaryDisplay()
        : screen.getDisplayMatching(window.getBounds());
    return {
      minimum: { width, height },
      room: display.workAreaSize,
    };
  });
}

/**
 * Ask the window for a size, wait until it keeps it, and return the size it
 * settled at.
 *
 * Asked repeatedly on purpose. A window manager can swallow a resize issued
 * while it is still mapping the window, which it does right after a launch, and
 * it can take one and hand the old size back a moment later. Either leaves a
 * spec measuring the size the window opened at, so the size is read in a round
 * trip of its own after the one that asks, and anything but the size it settled
 * at means asking again.
 *
 * What is asked for is the size raised to the window's own minimum and lowered
 * to the work area of its screen, which is how the app sizes the window it
 * opens too: a screen too small for the asked size gets its whole work area
 * rather than a window hanging off it, and macOS keeps no window bigger than
 * its screen at all. Both limits are read off the running app rather than
 * written out here, so what either should be stays the spec's own assertion,
 * and the size the window settled at is returned for a spec that measures
 * against it.
 */
export async function resizeWindow(
  app: ElectronApplication,
  page: Page,
  size: { width: number; height: number }
): Promise<{ width: number; height: number }> {
  const { minimum, room } = await windowLimits(app);
  // One pixel inside the work area, because a window asked for the size of its
  // screen comes back a pixel smaller on X11: on a screen of 1280 by 800, a
  // window asked for 1280 by 800 reports 1279 by 799, while one asked for that
  // reports it. The window's own minimum wins over both, since Electron
  // enforces it whatever the screen is.
  const largest = {
    width: Math.max(room.width - 1, minimum.width),
    height: Math.max(room.height - 1, minimum.height),
  };
  const asked = {
    width: Math.min(Math.max(size.width, minimum.width), largest.width),
    height: Math.min(Math.max(size.height, minimum.height), largest.height),
  };
  let settled = asked;

  await expect
    .poll(
      async () => {
        const asking = await app.evaluate(({ BrowserWindow }, target) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (window === undefined) {
            return false;
          }

          window.setSize(target.width, target.height);
          return true;
        }, asked);

        if (asking === false) {
          return false;
        }

        // Read the size the window ended up with after it was laid out, inside
        // the same attempt. A window manager that hands the old size back a
        // frame later would otherwise pass a check taken before the bounce and
        // leave the caller measuring a window of another size.
        await waitForLayout(page);
        settled = await windowSize(app);
        return settled.width === asked.width && settled.height === asked.height;
      },
      {
        // The room says why a size was lowered, so a window that will not keep
        // what its screen has room for reads apart from one that was asked for
        // more than that.
        message: `the window never kept ${asked.width}x${asked.height}, asked for ${size.width}x${size.height} on a screen with room for ${room.width}x${room.height}`,
      }
    )
    .toBe(true);

  return settled;
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
 * Keep every style the main process hands the window controls overlay.
 *
 * The overlay is Electron's and sits outside the document, so the renderer
 * cannot read its colors and a spec has to watch the call instead. The
 * window's own method is wrapped rather than replaced, so the window is styled
 * exactly as it is without the recorder.
 *
 * macOS draws its traffic lights in the system's own colors and has no such
 * method, so nothing is wrapped there and the list stays empty, which is the
 * no-op the channel is on that system.
 */
export async function recordTitleBarOverlay(
  app: ElectronApplication
): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.titleBarOverlayCalls = [];

    if (process.platform === 'darwin') {
      return;
    }

    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) {
      throw new Error('No window to record the title bar overlay of');
    }

    const setTitleBarOverlay = window.setTitleBarOverlay.bind(window);
    window.setTitleBarOverlay = (options): void => {
      globalThis.titleBarOverlayCalls?.push(options);
      setTitleBarOverlay(options);
    };
  });
}

/**
 * Every style the overlay was given since `recordTitleBarOverlay`, newest
 * last.
 */
export async function recordedTitleBarOverlays(
  app: ElectronApplication
): Promise<RecordedTitleBarOverlay[]> {
  return app.evaluate(() => globalThis.titleBarOverlayCalls ?? []);
}

/**
 * Record every claim about unsaved changes the window makes, as the main
 * process takes it.
 *
 * The claim is what the main process decides on before it closes a window, and
 * it only travels one way: the renderer says so over
 * `electron:window:setUnsavedChanges` whenever a guarded form turns dirty or
 * clean. It is still on its way while the spec goes on, so a close driven
 * right behind the typing can be taken before the claim is, and then it is
 * correctly not held and the window goes with what was typed in it. A spec
 * that drives a close waits for the claim rather than for the clock, see
 * `waitForUnsavedChangesClaim`.
 *
 * Watched here rather than in the window, because the bridge the renderer
 * calls is frozen and cannot be wrapped. The app's own handler is called first
 * and its answer handed back, so the channel does what it did, which is what
 * sets `stubCore*` apart: those replace a handler, this one wraps it.
 */
export async function recordUnsavedChangesClaims(
  app: ElectronApplication
): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const channel = 'electron:window:setUnsavedChanges';
    const handlers = ipcMain._invokeHandlers;
    const handler = handlers?.get(channel);

    // Asked before anything is set up, so a helper that cannot watch leaves
    // no record of its own behind to read as an empty one.
    if (handlers === undefined || handler === undefined) {
      throw new Error(
        `No handler of "${channel}" to watch, so nothing would be recorded`
      );
    }

    globalThis.unsavedChangesClaims = [];
    handlers.set(channel, async (event, ...args) => {
      const answer: unknown = await Promise.resolve(handler(event, ...args));
      globalThis.unsavedChangesClaims?.push(args[0]);
      return answer;
    });
  });
}

/**
 * Wait until the main process has taken the claim the window was going to
 * make, so what it decides a close on is in place.
 */
export async function waitForUnsavedChangesClaim(
  app: ElectronApplication,
  claim: boolean
): Promise<void> {
  await expect
    .poll(
      async () =>
        app.evaluate(() => globalThis.unsavedChangesClaims?.at(-1) ?? null),
      {
        message: `the window never claimed unsaved changes to be ${claim}`,
      }
    )
    .toBe(claim);
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

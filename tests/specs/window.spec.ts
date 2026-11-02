import { expect } from '@playwright/test';

import { colors } from '@elek-io/branding';

import { test } from '../fixtures/electronApp.js';
import { contrastRatio, parseColor, toBytes } from '../helpers/color.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  HEADER_BAR_HEIGHT,
  MINIMUM_WINDOW_SIZE,
  recordedTitleBarOverlays,
  recordTitleBarOverlay,
  resizeWindow,
  setWindowTheme,
  WINDOW_CONTROLS_BAR_HEIGHT,
  windowButtonPosition,
  windowMinimumSize,
} from '../helpers/window.js';

/**
 * The window itself: the size it refuses to go below, the two bars of its
 * header, and the one channel its title bar overlay follows the theme through.
 *
 * Every screen inside it is measured by its own spec. What this pins is the
 * frame they all sit in.
 */
test.describe('The window', () => {
  test('cannot be made smaller than the smallest size it supports', async ({
    electronApp,
    mainWindow,
  }) => {
    expect(await windowMinimumSize(electronApp)).toEqual(MINIMUM_WINDOW_SIZE);

    // Electron enforces it, so asking for less gives the minimum back rather
    // than a window the layout cannot hold. `resizeWindow` answers the size
    // the window settled at.
    expect(
      await resizeWindow(electronApp, mainWindow, { width: 800, height: 400 })
    ).toEqual(MINIMUM_WINDOW_SIZE);
  });

  test('keeps every screen of a Project inside it at the smallest size', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    const screens = [
      `#/projects`,
      `#/projects/${project.id}/dashboard`,
      `#/projects/${project.id}/collections`,
      `#/projects/${project.id}/history`,
      `#/projects/${project.id}/settings/general`,
    ];

    for (const screen of screens) {
      await navigate(mainWindow, screen);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

      const measured = await mainWindow.evaluate(() => {
        const box = (selector: string): { right: number; bottom: number } => {
          const element = document.querySelector(selector);
          if (element === null) {
            return { right: 0, bottom: 0 };
          }
          const rect = element.getBoundingClientRect();
          return {
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          };
        };

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          document: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
          },
          panel: box('[data-slot="panel"]'),
          sidebar: box('[data-slot="sidebar"]'),
        };
      });

      // Nothing clips: the document is exactly the window, so no screen is cut
      // off and nothing scrolls the window itself. The panes scroll inside.
      expect(measured.document, screen).toEqual({
        width: measured.viewport.width,
        height: measured.viewport.height,
      });

      // Nothing collides with the window's edges either: the main panel, and
      // the sidebar where there is one, end inside it.
      expect(measured.panel.right, screen).toBeLessThanOrEqual(
        measured.viewport.width
      );
      expect(measured.panel.bottom, screen).toBeLessThanOrEqual(
        measured.viewport.height
      );
      expect(measured.sidebar.bottom, screen).toBeLessThanOrEqual(
        measured.viewport.height
      );
    }
  });

  test('inset the main panel on the ground, with the header in two bars', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

    const measured = await mainWindow.evaluate(() => {
      const rect = (
        selector: string
      ): { x: number; y: number; width: number; height: number } => {
        const element = document.querySelector(selector);
        if (element === null) {
          throw new Error(`Nothing matches ${selector}`);
        }
        const box = element.getBoundingClientRect();
        return {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      };
      const background = (selector: string): string => {
        const element = document.querySelector(selector);
        if (element === null) {
          throw new Error(`Nothing matches ${selector}`);
        }
        return getComputedStyle(element).backgroundColor;
      };

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        header: rect('header'),
        controlsBar: rect('header > .window-draggable-area'),
        panel: rect('[data-slot="panel"]'),
        panelRadius: getComputedStyle(
          document.querySelector('[data-slot="panel"]')!
        ).getPropertyValue('border-top-left-radius'),
        sidebar: rect('[data-slot="sidebar"]'),
        ground: background('body'),
        panelSurface: background('[data-slot="panel"]'),
      };
    });

    // Two bars: the window controls get one of their own, as high on every
    // system, and the header below it is the same everywhere.
    expect(measured.controlsBar.height).toBe(WINDOW_CONTROLS_BAR_HEIGHT);
    expect(measured.controlsBar.width).toBe(measured.viewport.width);
    expect(measured.header.height).toBe(
      WINDOW_CONTROLS_BAR_HEIGHT + HEADER_BAR_HEIGHT
    );

    // The panel starts below both bars, sits 8 px from the window's right and
    // bottom edges and has 12 px corners. Its left edge is where the sidebar
    // ends, whose own padding is the gap.
    expect(measured.panel.y).toBe(measured.header.height);
    expect(
      measured.viewport.width - (measured.panel.x + measured.panel.width)
    ).toBe(8);
    expect(
      measured.viewport.height - (measured.panel.y + measured.panel.height)
    ).toBe(8);
    expect(measured.panelRadius).toBe('12px');
    expect(measured.panel.x).toBe(measured.sidebar.width);

    // The sidebar is the 248 px ci's Sidebar rule gives it, the gap to the
    // panel included, which is its own padding.
    expect(measured.sidebar.width).toBe(248);

    // The panel is a surface on the ground, not the ground itself, and the
    // lighter of the two in both themes. Measured as the contrast each reaches
    // against black, which is higher the lighter a color is.
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(
      contrastRatio(parseColor(measured.panelSurface), black)
    ).toBeGreaterThan(contrastRatio(parseColor(measured.ground), black));
  });

  test('keeps the panel the lighter surface in both themes', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigate(mainWindow, `#/projects/${project.id}/dashboard`);

    const black = { r: 0, g: 0, b: 0, a: 1 };

    for (const theme of ['light', 'dark'] as const) {
      // setTheme reloads the renderer, so the route is set again after it.
      await setTheme(mainWindow, theme);
      await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

      const surfaces = await mainWindow.evaluate(() => {
        const background = (selector: string): string => {
          const element = document.querySelector(selector);
          if (element === null) {
            throw new Error(`Nothing matches ${selector}`);
          }
          return getComputedStyle(element).backgroundColor;
        };

        return {
          ground: background('body'),
          panel: background('[data-slot="panel"]'),
        };
      });

      expect(
        contrastRatio(parseColor(surfaces.panel), black),
        `the panel is lighter than the ground in ${theme} mode`
      ).toBeGreaterThan(contrastRatio(parseColor(surfaces.ground), black));
    }
  });

  test('divides its panes with a rule that stops short of its edges', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The History splits the panel into the list of changes and what it opens,
    // which is two panes with one divider between them.
    await navigate(mainWindow, `#/projects/${project.id}/history`);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

    const measured = await mainWindow.evaluate(() => {
      const panes = Array.from(
        document.querySelectorAll('[data-slot="panes"] > [data-slot="pane"]')
      );

      return {
        count: panes.length,
        dividers: panes.map((pane) => {
          const divider = getComputedStyle(pane, '::before');
          return {
            display: divider.display,
            width: divider.width,
            color: divider.backgroundColor,
            top: divider.top,
            bottom: divider.bottom,
          };
        }),
        border: getComputedStyle(document.documentElement).getPropertyValue(
          '--color-border'
        ),
      };
    });

    expect(measured.count).toBe(2);

    // The first pane draws none: a divider belongs between two panes.
    expect(measured.dividers[0]?.display).toBe('none');

    // The second draws a hairline rule in the border color, 8 px short of the
    // panel's top and bottom, which is the rule a row's own rule ends on.
    const divider = measured.dividers[1];
    expect(divider?.display).toBe('block');
    expect(divider?.width).toBe('1px');
    expect(divider?.top).toBe('8px');
    expect(divider?.bottom).toBe('8px');
    expect(toBytes(parseColor(divider?.color ?? ''))).toEqual(
      toBytes(parseColor(measured.border))
    );
  });

  test('leaves the window controls bar to the system, as high as it draws it', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    // Waited for through a locator, which retries until the bar is there.
    // `#app` is empty until React renders, and the IPC round trip above waits
    // only for the main process to answer, so the one-shot read below can
    // otherwise land before the header has mounted.
    await expect(
      mainWindow.locator('header > .window-draggable-area')
    ).toBeAttached();

    const bar = await mainWindow.evaluate(() => {
      const element = document.querySelector('header > .window-draggable-area');
      if (element === null) {
        throw new Error('The header has no window controls bar');
      }
      const overlay = navigator.windowControlsOverlay;

      return {
        controls: element.querySelectorAll('a, button').length,
        appRegion: getComputedStyle(element).getPropertyValue('app-region'),
        overlayHeight:
          overlay?.visible === true
            ? overlay.getTitlebarAreaRect().height
            : null,
      };
    });

    // Nothing of the app is in it, so the controls the system draws there have
    // it to themselves and the whole bar moves the window.
    expect(bar.controls).toBe(0);
    expect(bar.appRegion).toBe('drag');

    // Where the system draws the controls into an overlay, which is Windows
    // and Linux, it is as high as the bar the app left it. macOS draws its
    // traffic lights instead, which the group below places.
    if (bar.overlayHeight !== null) {
      expect(bar.overlayHeight).toBe(WINDOW_CONTROLS_BAR_HEIGHT);
    }
  });

  // Only macOS draws traffic lights, and only there does Electron answer a
  // custom position. Windows and Linux get the overlay instead, whose height
  // the bar above is measured against. Skipped for the whole group, so no app
  // is launched for it where it does not apply.
  test.describe('on macOS', () => {
    test.skip(
      process.platform !== 'darwin',
      'Only macOS draws the traffic lights'
    );

    test('places the traffic lights where the design draws them', async ({
      electronApp,
      mainWindow,
    }) => {
      // The window has to be open before it has buttons to place, and
      // `mainWindow` is what waits for it. Without it the position is read, and
      // the app is quit again, while the first window is still being created,
      // and a window that opens during the quit cancels it, which on macOS
      // leaves the app running with no window to close it (see
      // `onAppAllWindowsClosed`).
      await expect(mainWindow.locator('header')).toBeAttached();

      // 16 px in, and centered in the 32 px bar: the buttons are 12 px, so
      // 10 px down.
      expect(await windowButtonPosition(electronApp)).toEqual({ x: 16, y: 10 });
    });
  });

  test('colors the window controls with the theme it is given', async ({
    electronApp,
    mainWindow,
  }) => {
    // The renderer tells the main process which theme it resolved to as soon
    // as it mounts, so the recorder starts after that one call and reads only
    // what the two below add.
    await expect(
      mainWindow.locator('header > .window-draggable-area')
    ).toBeAttached();
    await recordTitleBarOverlay(electronApp);

    await setWindowTheme(mainWindow, 'light');
    const afterLight = (await recordedTitleBarOverlays(electronApp)).at(-1);
    await setWindowTheme(mainWindow, 'dark');
    const afterDark = (await recordedTitleBarOverlays(electronApp)).at(-1);

    // macOS has no overlay to restyle, so the channel sets nothing there and
    // the traffic lights stay the system's own.
    if (process.platform === 'darwin') {
      expect(await recordedTitleBarOverlays(electronApp)).toEqual([]);
      return;
    }

    // The ground the header sits on and the text color on it, read from the
    // brand package rather than written out, and the height of the bar the app
    // left the controls.
    expect(afterLight).toEqual({
      color: colors.light.sidebar.hex,
      symbolColor: colors.light.foreground.hex,
      height: WINDOW_CONTROLS_BAR_HEIGHT,
    });
    expect(afterDark).toEqual({
      color: colors.dark.sidebar.hex,
      symbolColor: colors.dark.foreground.hex,
      height: WINDOW_CONTROLS_BAR_HEIGHT,
    });
  });

  test('takes the theme for its title bar overlay and nothing else', async ({
    mainWindow,
  }) => {
    // The two the channel is for.
    expect((await setWindowTheme(mainWindow, 'light')).accepted).toBe(true);
    expect((await setWindowTheme(mainWindow, 'dark')).accepted).toBe(true);

    // Everything else is refused in the main process, so neither a color nor a
    // window option can reach Electron through it. The neighbors of the two
    // names are in here on purpose: the third theme the app itself knows, the
    // other casing, and each shape that wraps a valid value.
    for (const refused of [
      'system',
      '',
      'Light',
      'DARK',
      ' dark',
      'light dark',
      null,
      undefined,
      0,
      true,
      ['dark'],
      { theme: 'dark' },
      { color: '#ffffff', symbolColor: '#000000' },
      { width: 1, height: 1 },
    ]) {
      const answer = await setWindowTheme(mainWindow, refused);
      const what = `${String(JSON.stringify(refused))} must be refused`;

      expect(answer.accepted, what).toBe(false);
      // Refused by the parse, which is the only thing between the renderer and
      // Electron here. A channel that stopped parsing would still reject some
      // of these, by tripping over them further in.
      expect(answer.message, what).toContain(
        'Refused to set a title bar theme'
      );
    }
  });
});

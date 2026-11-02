import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  HEADER_BAR_HEIGHT,
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  setWindowTheme,
  WINDOW_CONTROLS_BAR_HEIGHT,
  windowButtonPosition,
  windowMinimumSize,
  windowSize,
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
    // than a window the layout cannot hold.
    await resizeWindow(electronApp, mainWindow, { width: 800, height: 400 });
    expect(await windowSize(electronApp)).toEqual(MINIMUM_WINDOW_SIZE);
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

    // The sidebar is 248 px including the gap, which is what puts its icons on
    // the column the header lockup's ring sits on.
    expect(measured.sidebar.width).toBe(248);

    // The panel is a surface on the ground, not the ground itself. ci asks for
    // the lighter of the two in both themes, which only holds if they differ.
    expect(measured.panelSurface).not.toBe(measured.ground);
  });

  test('leaves the window controls bar to the system', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    const bar = await mainWindow.evaluate(() => {
      const element = document.querySelector('header > .window-draggable-area');
      if (element === null) {
        throw new Error('The header has no window controls bar');
      }
      return {
        controls: element.querySelectorAll('a, button').length,
        appRegion: getComputedStyle(element).getPropertyValue('app-region'),
      };
    });

    // Nothing of the app is in it, so the controls the system draws there have
    // it to themselves and the whole bar moves the window.
    expect(bar.controls).toBe(0);
    expect(bar.appRegion).toBe('drag');
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
    }) => {
      // 16 px in, and centered in the 32 px bar: the buttons are 12 px, so
      // 10 px down.
      expect(await windowButtonPosition(electronApp)).toEqual({ x: 16, y: 10 });
    });
  });

  test('takes the theme for its title bar overlay and nothing else', async ({
    mainWindow,
  }) => {
    // The two the channel is for.
    expect(await setWindowTheme(mainWindow, 'light')).toBe('accepted');
    expect(await setWindowTheme(mainWindow, 'dark')).toBe('accepted');

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
      expect(
        await setWindowTheme(mainWindow, refused),
        `${String(JSON.stringify(refused))} must be refused`
      ).toBe('refused');
    }
  });
});

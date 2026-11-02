import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { colors } from '@elek-io/branding';

import { test } from '../fixtures/electronApp.js';
import { contrastRatio, over, parseColor, toBytes } from '../helpers/color.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';

/**
 * What the brand package gives the app, checked against the running app rather
 * than against the source: the tokens, the type, the icons and the focus ring.
 *
 * The brand package is the single source of truth here. Every expected value is
 * read from `@elek-io/branding`, so a token that changes in a release shows up
 * as a difference between the package and the app, never as a stale number in
 * this file.
 */

/** Where electron-builder reads the packaged app's icons from. */
const BUILD_RESOURCES = 'build';

/** The installed release of the brand package, as electron-builder sees it. */
const PACKAGED_ICONS = 'node_modules/@elek-io/branding/dist/icons';

/** The renderer electron-vite builds, which is what the app loads. */
const RENDERER_BUNDLE = 'out/renderer/assets';

/** The icon the main process gives a window, shipped inside the app. */
const WINDOW_ICON = 'resources/icon.png';

async function sha256(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

test.describe('Branding', () => {
  test('stands on shadcn base-vega with no Radix package left', async () => {
    const manifest: unknown = JSON.parse(
      await readFile('components.json', 'utf8')
    );
    expect(manifest).toMatchObject({ style: 'base-vega' });

    const packageJson: unknown = JSON.parse(
      await readFile('package.json', 'utf8')
    );
    expect(packageJson).toMatchObject({
      devDependencies: { '@base-ui/react': expect.any(String) },
    });
    const dependencies = Object.keys({
      ...(packageJson as { dependencies?: Record<string, string> })
        .dependencies,
      ...(packageJson as { devDependencies?: Record<string, string> })
        .devDependencies,
    });
    expect(
      dependencies.filter((name) => name.startsWith('@radix-ui/'))
    ).toStrictEqual([]);

    // A package the app never names is still installed and still shipped, which
    // is how sixteen Radix packages came in behind one dependency. The lockfile
    // is the whole installed tree, so it is read rather than the manifest alone.
    const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
    expect(
      lockfile.split('\n').filter((line) => line.includes('@radix-ui/'))
    ).toStrictEqual([]);

    // The five controls ci draws that the app did not have before.
    const components = await readdir('src/renderer/components/ui');
    for (const added of [
      'radio-group.tsx',
      'checkbox.tsx',
      'toggle-group.tsx',
      'toggle.tsx',
      'spinner.tsx',
    ]) {
      expect(components).toContain(added);
    }

    const sources = await readdir('src', {
      recursive: true,
      withFileTypes: true,
    });
    const importingRadix: string[] = [];
    for (const entry of sources) {
      if (entry.isFile() === false || /\.tsx?$/.test(entry.name) === false) {
        continue;
      }
      const file = path.join(entry.parentPath, entry.name);
      if ((await readFile(file, 'utf8')).includes('@radix-ui/')) {
        importingRadix.push(file);
      }
    }
    expect(importingRadix).toStrictEqual([]);

    // And what the built renderer carries, which is what a person runs. The two
    // markers are the import specifier and the attributes Radix's primitives
    // write into the DOM, rather than the word "radix", which a bundle may hold
    // for `parseInt`'s second argument.
    const bundles = await readdir(RENDERER_BUNDLE);
    const shippingRadix: string[] = [];
    for (const bundle of bundles.filter((name) => name.endsWith('.js'))) {
      const code = await readFile(path.join(RENDERER_BUNDLE, bundle), 'utf8');
      if (code.includes('@radix-ui') || code.includes('data-radix')) {
        shippingRadix.push(bundle);
      }
    }
    expect(shippingRadix).toStrictEqual([]);
  });

  test('ships the brand package icons as the app icons', async () => {
    // electron-builder takes the installer icons from
    // directories.buildResources, so these three files are what an installer
    // leaves on a person's machine.
    for (const icon of ['icon.png', 'icon.icns', 'icon.ico']) {
      expect(await sha256(path.join(BUILD_RESOURCES, icon))).toBe(
        await sha256(path.join(PACKAGED_ICONS, icon))
      );
    }

    // The window icon is a fourth file, which none of the three covers: on
    // Linux the window carries no icon of the executable, so the main process
    // sets one from the app's own resources (see src/main/index.ts).
    expect(await sha256(WINDOW_ICON)).toBe(
      await sha256(path.join(PACKAGED_ICONS, 'png', '512x512.png'))
    );
  });

  test('takes every color from the brand package in both themes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);

      const resolved = await mainWindow.evaluate((tokens) => {
        const style = getComputedStyle(document.documentElement);
        return tokens.map((token) => style.getPropertyValue(`--${token}`));
      }, Object.keys(colors[theme]));

      // Chromium drops a leading zero when it serializes a number, so compare
      // the values without it rather than the strings as written.
      const normalize = (value: string): string =>
        value
          .trim()
          .replace(/\b0(\.\d)/g, '$1')
          .replace(/\s+/g, ' ');

      const expected = Object.values(colors[theme]).map((color) =>
        normalize(color.oklch)
      );
      expect(resolved.map(normalize)).toStrictEqual(expected);
    }
  });

  test('sets its text in Geist and its code in Geist Mono', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const type = await mainWindow.evaluate(async () => {
      await document.fonts.ready;
      const style = getComputedStyle(document.documentElement);
      return {
        body: getComputedStyle(document.querySelector('body')!).fontFamily,
        sans: style.getPropertyValue('--font-family-sans'),
        mono: style.getPropertyValue('--font-family-mono'),
        // The faces the app actually ships, not the stack it asks for.
        faces: Array.from(document.fonts).map((face) => face.family),
      };
    });

    expect(type.body).toContain('Geist Variable');
    expect(type.sans).toContain('Geist Variable');
    expect(type.mono).toContain('Geist Mono Variable');
    expect(type.faces).toContain('Geist Variable');
    expect(type.faces).toContain('Geist Mono Variable');
    expect(type.faces).not.toContain('Roboto');
    expect(type.faces).not.toContain('Montserrat Variable');
    // The two typefaces Geist replaced are gone from the app.
    expect(type.body).not.toContain('Roboto');
    expect(type.body).not.toContain('Montserrat');
  });

  test('draws every icon with Lucide', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Three screens' worth of icons: the Projects page and its cards, a
    // Project's sidebar and header, and the user menu, which holds the most
    // icons of any one surface.
    const screens = [
      '#/projects',
      `#/projects/${project.id}/releases`,
      `#/projects/${project.id}/components`,
    ];

    for (const screen of screens) {
      await navigate(mainWindow, screen);
      await expect(
        mainWindow.getByRole('button', { name: 'Feedback' })
      ).toBeVisible();
      await mainWindow.getByRole('button', { name: /Test User/ }).click();
      await expect(mainWindow.getByRole('menu')).toBeVisible();

      // A Git host's logo is a brand logo, which ci takes from Simple Icons and
      // the app marks `data-brand-logo`. Every other icon is Lucide, which
      // marks each of its own with a `lucide` class.
      const nonLucide = await mainWindow.evaluate(() =>
        Array.from(document.querySelectorAll('svg:not([data-brand-logo])'))
          .map((icon) => icon.getAttribute('class') ?? '')
          .filter((className) => !className.split(' ').includes('lucide'))
      );

      expect(nonLucide, `on ${screen}`).toStrictEqual([]);
      await mainWindow.keyboard.press('Escape');
    }
  });

  test('reaches WCAG AA on the primary fill, a destructive fill and an input in both themes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    for (const theme of ['light', 'dark'] as const) {
      await navigate(mainWindow, `#/projects/${project.id}/settings/general`);
      await setTheme(mainWindow, theme);
      await expect(
        mainWindow.locator('input[data-slot="input"]').first()
      ).toBeVisible();

      const measured = await mainWindow.evaluate(() => {
        const read = (
          selector: string
        ): { color: string; background: string; border: string } => {
          const element = document.querySelector(selector);
          if (element === null) {
            throw new Error(`Nothing matches ${selector}`);
          }
          const style = getComputedStyle(element);
          return {
            color: style.color,
            background: style.backgroundColor,
            border: style.borderTopColor,
          };
        };
        const surface = getComputedStyle(
          document.querySelector('body')!
        ).backgroundColor;
        return {
          surface,
          // The one primary button of the page, and the destructive one that
          // deletes the Project.
          primary: read('button.bg-primary'),
          destructive: read('button.bg-destructive'),
          input: read('input[data-slot="input"]'),
        };
      });

      const page = parseColor(measured.surface);

      // A label on a fill: 4.5:1, WCAG 1.4.3.
      expect(
        contrastRatio(
          parseColor(measured.primary.color),
          over(parseColor(measured.primary.background), page)
        )
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          parseColor(measured.destructive.color),
          over(parseColor(measured.destructive.background), page)
        )
      ).toBeGreaterThanOrEqual(4.5);

      // What an editor types in a field: 4.5:1 against the field's own fill.
      expect(
        contrastRatio(
          parseColor(measured.input.color),
          over(parseColor(measured.input.background), page)
        )
      ).toBeGreaterThanOrEqual(4.5);

      // The border is what shows where the field is: 3:1, WCAG 1.4.11.
      expect(
        contrastRatio(
          over(parseColor(measured.input.border), page),
          over(parseColor(measured.input.background), page)
        )
      ).toBeGreaterThanOrEqual(3);
    }
  });

  test('draws the focus ring in the ring color at full opacity', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);

      const primary = mainWindow
        .getByRole('button', { name: 'Create Project' })
        .first();
      await expect(primary).toBeVisible();

      // Reach the button with the keyboard, which is what :focus-visible means.
      await primary.focus();
      await mainWindow.keyboard.press('Tab');
      await mainWindow.keyboard.press('Shift+Tab');
      await expect(primary).toBeFocused();

      const box = await primary.boundingBox();
      if (box === null) {
        throw new Error('The primary button has no box');
      }

      /**
       * One pixel column above the middle of the button, from 4 px above its
       * box down to its top edge. The window's own pixels are read rather than
       * a computed style, because Chromium reports its own focus ring for a
       * focused element whatever the page asks for.
       */
      const column = async (): Promise<[number, number, number][]> => {
        const captured = await electronApp.evaluate(
          async ({ BrowserWindow }, rect) => {
            const window = BrowserWindow.getAllWindows()[0];
            if (window === undefined) {
              throw new Error('No window to capture');
            }
            const image = await window.webContents.capturePage({
              x: Math.round(rect.x + rect.width / 2),
              y: Math.round(rect.y) - 4,
              width: 1,
              height: 4,
            });
            return Array.from(image.toBitmap());
          },
          { x: box.x, y: box.y, width: box.width }
        );

        // The bitmap is BGRA, so each pixel is read back to front.
        const pixels: [number, number, number][] = [];
        for (let index = 0; index + 3 < captured.length; index += 4) {
          pixels.push([
            captured[index + 2] ?? 0,
            captured[index + 1] ?? 0,
            captured[index] ?? 0,
          ]);
        }
        return pixels;
      };

      const ring = toBytes(parseColor(colors[theme]['ring'].oklch));
      const near = (
        pixel: [number, number, number],
        expected: [number, number, number]
      ): boolean =>
        pixel.every(
          (channel, index) => Math.abs(channel - (expected[index] ?? 0)) <= 6
        );

      // ci's ring is 2 px wide and sits 2 px outside the element, so of the
      // four rows above the button's edge the outer two are the ring and the
      // two below them are the gap. The ring fades in, so poll until it has
      // settled rather than reading the first frame.
      await expect
        .poll(async () =>
          (await column()).slice(0, 2).every((p) => near(p, ring))
        )
        .toBe(true);

      const settled = await column();
      // The gap carries no ring, which is what "2 px away" means. A ring drawn
      // at half opacity would blend with the surface and miss the color above.
      expect(settled.slice(2, 4).some((pixel) => near(pixel, ring))).toBe(
        false
      );
    }
  });

  test('marks a pressed segment by more than its color', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    await mainWindow.getByRole('button', { name: 'Feedback' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const segments = await mainWindow.evaluate(() => {
      const read = (
        pressed: string
      ): { boxShadow: string; background: string } => {
        const element = document.querySelector(
          `[role="dialog"] [data-slot="button"][aria-pressed="${pressed}"]`
        );
        if (element === null) {
          throw new Error(`No segment with aria-pressed=${pressed}`);
        }
        const style = getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          background: style.backgroundColor,
        };
      };
      return { pressed: read('true'), unpressed: read('false') };
    });

    // The chosen segment carries a 1 px ring in the input color on top of the
    // muted surface, so the choice is not color alone.
    const input = toBytes(parseColor(colors.light['input'].oklch));
    const ringLayer = segments.pressed.boxShadow
      .split(/,(?![^(]*\))/)
      .map((layer) => layer.trim())
      .find((layer) => layer.endsWith('0px 0px 0px 1px'));
    expect(ringLayer).toBeDefined();
    expect(
      toBytes(parseColor((ringLayer ?? '').replace(' 0px 0px 0px 1px', '')))
    ).toStrictEqual(input);
    expect(segments.unpressed.boxShadow).not.toContain('0px 0px 0px 1px');
    expect(segments.pressed.background).not.toBe(segments.unpressed.background);
  });
});

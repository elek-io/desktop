import { expect, type Page } from '@playwright/test';

import { colors } from '@elek-io/branding';

import { test } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  markdownFieldDefinition,
  referenceFieldDefinition,
  selectFieldDefinition,
  slugFieldDefinition,
  textFieldDefinition,
  toggleFieldDefinition,
} from '../helpers/collection.js';
import { parseColor, toBytes, type Rgb } from '../helpers/color.js';
import {
  assetReferenceValue,
  createEntryViaIpc,
  markdownValue,
  referenceValue,
  stringValue,
} from '../helpers/entry.js';
import { mainPanel, navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/**
 * The heights, borders, corners, shadows and type roles ci gives the controls,
 * menus and dialogs every screen shares, measured off the running app.
 *
 * Every expected value is ci's: a control is 32 px and 28 px in its small
 * role, a selection is marked in ink and never in cyan, and a menu or a dialog
 * takes 8 px corners, a hairline border and the overlay shadow. The colors come
 * from the brand package rather than being written out here, so a token that
 * moves in a release shows up as a difference between the package and the app.
 *
 * What each screen does with these parts is in its own spec. This one holds the
 * shared parts, so a height or a selection color cannot drift from ci again
 * without a test going red.
 */

/** ci's control height, and the height of its small role. */
const CONTROL = 32;
const CONTROL_SMALL = 28;

/**
 * What the app is given to measure: a Project with an Entry of every control.
 *
 * `assets` is how many Assets the Project holds, one by default, which is what
 * the Entry's Cover points at. A measurement that needs more than one row of
 * them in the picker asks for more, and they are made before the screen opens,
 * so the list the picker reads holds them.
 */
async function anEntryOfEveryControl(
  page: Page,
  testInfo: Parameters<typeof makeTempFile>[0],
  { assets = 1 }: { assets?: number } = {}
): Promise<void> {
  await setUserViaIpc(page);
  const project = await createProjectViaIpc(page);
  const asset = await createAssetViaIpc(page, {
    projectId: project.id,
    filePath: makeTempFile(testInfo, 'cover.png', pngBytes),
    name: 'Showroom',
  });
  for (let index = 1; index < assets; index += 1) {
    await createAssetViaIpc(page, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, `more-${String(index)}.png`, pngBytes),
      name: `More ${String(index)}`,
    });
  }
  const team = await createCollectionViaIpc(page, {
    projectId: project.id,
    name: { singular: { en: 'Team member' }, plural: { en: 'Team' } },
    slug: { singular: 'team-member', plural: 'team' },
  });
  const member = await createEntryViaIpc(page, {
    projectId: project.id,
    collectionId: team.id,
    values: { title: stringValue({ en: 'Mara Klein' }) },
  });
  // A second one the field does not hold, so the Entry picker lists more than
  // one row and the rule between two rows can be told from the last row's.
  await createEntryViaIpc(page, {
    projectId: project.id,
    collectionId: team.id,
    values: { title: stringValue({ en: 'Jonas Brandt' }) },
  });
  const collection = await createCollectionViaIpc(page, {
    projectId: project.id,
    fieldDefinitions: [
      textFieldDefinition({ description: { en: 'Shown in lists' } }),
      assetFieldDefinition({ slug: 'cover', label: { en: 'Cover' }, max: 1 }),
      referenceFieldDefinition({
        slug: 'authors',
        label: { en: 'Authors' },
        ofCollections: [team.id],
        max: 2,
      }),
      markdownFieldDefinition({
        slug: 'body',
        features: {
          ...markdownFieldDefinition().features,
          strong: true,
          emphasis: true,
        },
      }),
      selectFieldDefinition({ slug: 'style', label: { en: 'Style' } }),
      toggleFieldDefinition({ slug: 'featured', label: { en: 'Featured' } }),
      // Last, so the first input and the first button of a field stay the
      // Title's and the Cover's, which the measurements above read.
      slugFieldDefinition({
        slug: 'handle',
        label: { en: 'Handle' },
        isRequired: false,
      }),
    ],
  });
  const entry = await createEntryViaIpc(page, {
    projectId: project.id,
    collectionId: collection.id,
    values: {
      title: stringValue({ en: 'Spring opening hours' }),
      cover: assetReferenceValue(asset.id),
      authors: referenceValue(member.id, team.id),
      body: markdownValue({ en: null }),
      style: stringValue({ en: 'primary' }),
      featured: {
        objectType: 'value',
        valueType: 'boolean',
        content: { en: true },
      },
      handle: stringValue({ en: 'spring-opening-hours' }),
    },
  });

  await navigate(
    page,
    `#/projects/${project.id}/collections/${collection.id}/${entry.id}/update`
  );
  await expect(page.getByRole('textbox', { name: /^Title/ })).toBeVisible();
}

/**
 * The box shadow layers an element actually draws.
 *
 * Tailwind writes a layer per shadow slot, so the ones a control leaves empty
 * come back fully transparent and are dropped here. An inset layer is a ring
 * rather than a shadow, such as the one that says a switch is off, so it is
 * dropped too.
 */
function layers(boxShadow: string): string[] {
  return boxShadow === 'none'
    ? []
    : boxShadow
        .split(/,(?![^(]*\))/)
        .map((layer) => layer.trim())
        .filter(
          (layer) =>
            layer.includes('inset') === false &&
            parseColor(layer.replace(/ [\d.-]+px.*$/, '')).a !== 0
        );
}

/**
 * One shadow layer, as its color and the lengths beside it.
 *
 * A computed box shadow names its color first and a token names it last, so
 * the two notations of one shadow are compared by their parts rather than as
 * strings. Throws on a layer with no color, so a notation this cannot read
 * never passes for a match.
 */
function shadowLayers(boxShadow: string): { color: Rgb; lengths: string }[] {
  return boxShadow === 'none'
    ? []
    : boxShadow
        .split(/,(?![^(]*\))/)
        .map((layer) => layer.trim())
        .filter((layer) => layer !== '')
        .map((layer) => {
          const color = /(?:oklch|oklab|rgba?|color)\([^)]*\)/.exec(layer);
          if (color === null) {
            throw new Error(`A shadow layer names no color: ${layer}`);
          }
          return {
            color: parseColor(color[0]),
            lengths: layer.replace(color[0], '').trim().split(/\s+/).join(' '),
          };
        });
}

/**
 * Wait until an overlay has finished the animation it opens with, so its box
 * is its own rather than the 95% it grows from.
 */
async function opened(page: Page, selector: string): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate((element) => {
        const found = document.querySelector(element);
        return found === null ? null : getComputedStyle(found).transform;
      }, selector)
    )
    .toBe('none');
}

test.describe('Every control', () => {
  test('takes ci’s height and draws no shadow of its own', async ({
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);

    const measured = await mainWindow.evaluate(() => {
      // A selector that matches nothing measures nothing, so it throws rather
      // than reporting a control that is not on the screen as correct.
      const one = (selector: string): ProbedElement => {
        const element = document.querySelector(selector);
        if (element === null) {
          throw new Error(`Nothing matches ${selector}`);
        }
        return element;
      };
      const height = (selector: string): number =>
        Math.round(one(selector).getBoundingClientRect().height);
      const shadow = (selector: string): string =>
        getComputedStyle(one(selector)).boxShadow;

      return {
        heights: {
          input: height('[data-slot="input"]'),
          primary: height('[data-slot="button"][type="submit"]'),
          // Replace and Remove inside a field are ci's small role.
          small: height('[data-slot="field"] [data-slot="button"]'),
          // Every button of a field rather than its first one, so a control
          // further along the row is measured too.
          fieldButtons: Array.from(
            document.querySelectorAll(
              '[data-slot="field"] [data-slot="button"]'
            )
          ).map((button) => Math.round(button.getBoundingClientRect().height)),
          toolbar: height('.markdown-editor [data-slot="toggle"]'),
        },
        shadows: {
          input: shadow('[data-slot="input"]'),
          outline: shadow('[data-slot="field"] [data-slot="button"]'),
          switch: shadow('[data-slot="switch"]'),
          editor: shadow('.markdown-editor'),
          radio: shadow('[data-slot="radio-group-item"]'),
          toggle: shadow('.markdown-editor [data-slot="toggle"]'),
        },
      };
    });

    // 32 px, and 28 px for the small role, which is what ci's mockup draws
    // every control with.
    expect(measured.heights.input).toBe(CONTROL);
    expect(measured.heights.primary).toBe(CONTROL);
    expect(measured.heights.small).toBe(CONTROL_SMALL);
    expect(measured.heights.toolbar).toBe(CONTROL_SMALL);
    expect(Array.from(new Set(measured.heights.fieldButtons))).toEqual([
      CONTROL_SMALL,
    ]);

    // Buttons and inputs get no shadow, although shadcn gives an outline
    // button and an input one.
    for (const [part, shadow] of Object.entries(measured.shadows)) {
      expect(layers(shadow), part).toEqual([]);
    }
  });

  test('marks a selection in ink, never in cyan', async ({
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);
    await setTheme(mainWindow, 'light');

    // One of the select field's options and the toggle are on, so what a
    // selection looks like can be read off the screen.
    await mainWindow.getByRole('radio', { name: 'Primary' }).click();
    const toggle = mainWindow.getByRole('switch', { name: /^Featured/ });
    if ((await toggle.getAttribute('aria-checked')) === 'false') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const read = async (
      selector: string,
      property: 'backgroundColor' | 'borderTopColor' | 'boxShadow'
    ): Promise<string> =>
      mainWindow.evaluate(
        ([element, read]) => {
          const found = document.querySelector(element ?? '');
          if (found === null) {
            throw new Error(`Nothing matches ${element ?? ''}`);
          }
          const style = getComputedStyle(found);
          if (read === 'borderTopColor') {
            return style.borderTopColor;
          }
          return read === 'boxShadow' ? style.boxShadow : style.backgroundColor;
        },
        [selector, property]
      );

    const ink = toBytes(parseColor(colors.light.foreground.oklch));
    const brand = toBytes(parseColor(colors.light.primary.oklch));

    // A chosen radio button keeps its surface and marks itself with an ink
    // ring and an ink dot, and a switch that is on is an ink track. Each one
    // takes the color over its own transition, so each is polled rather than
    // read on the first frame.
    const inInk: [string, 'backgroundColor' | 'borderTopColor'][] = [
      ['[data-slot="radio-group-item"][aria-checked="true"]', 'borderTopColor'],
      ['[data-slot="radio-group-indicator"] span', 'backgroundColor'],
      ['[data-slot="switch"][aria-checked="true"]', 'backgroundColor'],
    ];
    for (const [selector, property] of inInk) {
      await expect
        .poll(async () => toBytes(parseColor(await read(selector, property))), {
          message: selector,
        })
        .toEqual(ink);
    }

    // ci rules cyan out for a selection: it has three jobs, and this is none
    // of them. A chosen radio button takes no fill at all.
    const fill = await read(
      '[data-slot="radio-group-item"][aria-checked="true"]',
      'backgroundColor'
    );
    expect(parseColor(fill).a).toBe(0);
    expect(toBytes(parseColor(fill))).not.toEqual(brand);

    // A checkbox stands where more than one thing can be chosen, which is a
    // picker's list, so the one the Authors field already holds is read there.
    // A ticked box is an ink square, never cyan, and draws no shadow either.
    await mainWindow.getByRole('button', { name: /^Choose Authors/ }).click();
    await expect(
      mainWindow.getByRole('dialog', { name: 'Choose Authors' })
    ).toBeVisible();
    const ticked = '[data-slot="checkbox"][aria-checked="true"]';
    await expect
      .poll(
        async () => toBytes(parseColor(await read(ticked, 'backgroundColor'))),
        {
          message: ticked,
        }
      )
      .toEqual(ink);
    expect(
      toBytes(parseColor(await read(ticked, 'backgroundColor')))
    ).not.toEqual(brand);
    expect(layers(await read(ticked, 'boxShadow'))).toEqual([]);
  });

  test('draws a switch that is off as a ring with a muted thumb', async ({
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);
    await setTheme(mainWindow, 'light');

    const toggle = mainWindow.getByRole('switch', { name: /^Featured/ });
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const measured = await mainWindow.evaluate(() => {
      const track = document.querySelector('[data-slot="switch"]');
      const thumb = document.querySelector('[data-slot="switch-thumb"]');
      if (track === null || thumb === null) {
        throw new Error('The form draws no switch');
      }
      const box = track.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();

      return {
        size: { w: Math.round(box.width), h: Math.round(box.height) },
        thumb: {
          w: Math.round(thumbBox.width),
          h: Math.round(thumbBox.height),
        },
        track: getComputedStyle(track).backgroundColor,
        ring: getComputedStyle(track).boxShadow,
        thumbFill: getComputedStyle(thumb).backgroundColor,
      };
    });

    // ci draws it 32 by 18 px with a 12 px thumb: the panel's own surface, a
    // 1 px ring in the input color, and the thumb in the muted color.
    expect(measured.size).toEqual({ w: 32, h: 18 });
    expect(measured.thumb).toEqual({ w: 12, h: 12 });
    expect(toBytes(parseColor(measured.track))).toEqual(
      toBytes(parseColor(colors.light.card.oklch))
    );
    expect(toBytes(parseColor(measured.thumbFill))).toEqual(
      toBytes(parseColor(colors.light['muted-foreground'].oklch))
    );

    const ring = measured.ring
      .split(/,(?![^(]*\))/)
      .map((layer) => layer.trim())
      .find((layer) => layer.endsWith('0px 0px 0px 1px inset'));
    expect(ring).toBeDefined();
    expect(
      toBytes(parseColor((ring ?? '').replace(' 0px 0px 0px 1px inset', '')))
    ).toEqual(toBytes(parseColor(colors.light.input.oklch)));
  });

  test('draws a refused control with the error border alone', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A Title of at least three characters, so a Value that is there and too
    // short is refused on submit. A Value that is missing blocks Save instead,
    // so it never reaches the validator, see forms.md#saves-block.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition({ min: 3 })],
    });
    await navigate(
      mainWindow,
      `#/projects/${project.id}/collections/${collection.id}/create`
    );
    await setTheme(mainWindow, 'light');

    const title = mainWindow.getByLabel('Title', { exact: true });
    await title.fill('Ab');
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(title).toHaveAttribute('aria-invalid', 'true');

    const measured = await mainWindow.evaluate(() => {
      const input = document.querySelector(
        '[data-slot="input"][aria-invalid="true"]'
      );
      const error = document.querySelector('[data-slot="field-error"]');
      if (input === null || error === null) {
        throw new Error('No field was refused');
      }
      const style = getComputedStyle(input);
      const errorStyle = getComputedStyle(error);
      return {
        border: style.borderTopColor,
        shadow: style.boxShadow,
        error: {
          size: errorStyle.fontSize,
          line: errorStyle.lineHeight,
          color: errorStyle.color,
        },
      };
    });

    // ci marks a refused field with its border in the error color and nothing
    // else, where shadcn adds a ring at 20% around it.
    expect(toBytes(parseColor(measured.border))).toEqual(
      toBytes(parseColor(colors.light.error.oklch))
    );
    expect(layers(measured.shadow)).toEqual([]);

    // What it says is ci's small role in the error color, like the field's
    // description beside it rather than a size of its own.
    expect(measured.error.size).toBe('12px');
    expect(measured.error.line).toBe('16px');
    expect(toBytes(parseColor(measured.error.color))).toEqual(
      toBytes(parseColor(colors.light.error.oklch))
    );
  });

  test('draws a warned control with the warning border and surface', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    // A new Entry holds no Value yet, so its required field is one the
    // language on screen is missing, which is what ci warns on.
    await navigate(
      mainWindow,
      `#/projects/${project.id}/collections/${collection.id}/create`
    );

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await expect(mainWindow.getByText('Missing in English')).toBeVisible();

      const measured = await mainWindow.evaluate(() => {
        const input = document.querySelector('[data-slot="input"]');
        if (input === null) {
          throw new Error('The form draws no input');
        }
        const style = getComputedStyle(input);
        return {
          border: style.borderTopColor,
          background: style.backgroundColor,
        };
      });

      // An input's border is what says where the field is, so a warned one
      // takes the warning color itself rather than its border tint, which ci
      // asks 3:1 of. The surface stays the fill behind it.
      expect(toBytes(parseColor(measured.border)), theme).toEqual(
        toBytes(parseColor(colors[theme].warning.oklch))
      );
      expect(toBytes(parseColor(measured.background)), theme).toEqual(
        toBytes(parseColor(colors[theme]['warning-surface'].oklch))
      );
    }
  });

  test('fills its field with a row, an editor and the rules of the field', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);
    // An Entry stands between the list of its Collection and its History, so
    // the editor is 592 px narrower than the panel. A row is measured at the
    // width ci draws it at, which the editor gets here from closing the
    // History rather than from a wider window: every screen has room for the
    // smallest window the app supports, and only some have room for more, so a
    // window wide enough for this row is a window some runners cannot keep.
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await mainWindow.getByRole('button', { name: 'Close the History' }).click();
    await expect(
      mainWindow.getByRole('button', { name: 'Show the History of this Entry' })
    ).toBeVisible();
    await waitForLayout(mainWindow);

    const measured = await mainWindow.evaluate(() => {
      const fieldOf = (label: string): ProbedElement | null => {
        const found = Array.from(
          document.querySelectorAll('[data-slot="field-label"]')
        ).find((element) => element.textContent?.startsWith(label) === true);
        return found?.closest('[data-slot="field"]') ?? null;
      };
      const width = (
        element: ProbedElement | null | undefined
      ): number | null =>
        element === null || element === undefined
          ? null
          : Math.round(element.getBoundingClientRect().width);
      const rowOf = (label: string): ProbedElement | null | undefined =>
        fieldOf(label)?.querySelector('[data-slot="field-row"]');

      const title = fieldOf('Title');
      const description = title?.querySelector(
        '[data-slot="field-description"]'
      );
      const titleLabel = title?.querySelector('[data-slot="field-label"]');
      if (title === null || titleLabel === null || titleLabel === undefined) {
        throw new Error('The form draws no Title field');
      }
      const labelStyle = getComputedStyle(titleLabel);
      const descriptionStyle =
        description === null || description === undefined
          ? null
          : getComputedStyle(description);

      const assetRow = rowOf('Cover');
      const entryRow = rowOf('Authors');
      // The box an Asset's preview is drawn in, rather than the image inside
      // it, because the box is what gives the row its height. The Entry row
      // beside it holds its Collection's icon in a box of the same size.
      const preview = assetRow?.querySelector('img')?.parentElement;
      const icon = entryRow?.querySelector('span[aria-hidden="true"]');
      // A field is an item of the form's own grid, so what stands between two
      // fields is that grid's row gap.
      const grid = title.parentElement;
      if (
        assetRow === null ||
        assetRow === undefined ||
        entryRow === null ||
        entryRow === undefined ||
        preview === null ||
        preview === undefined ||
        icon === null ||
        icon === undefined ||
        grid === null
      ) {
        throw new Error('The form draws no Asset row, Entry row or grid');
      }
      const gridStyle = getComputedStyle(grid);
      const box = (element: ProbedElement): { w: number; h: number } => ({
        w: Math.round(element.getBoundingClientRect().width),
        h: Math.round(element.getBoundingClientRect().height),
      });

      return {
        field: width(fieldOf('Cover')),
        asset: width(assetRow),
        entry: width(entryRow),
        editor: width(document.querySelector('.markdown-editor')),
        label: { size: labelStyle.fontSize, line: labelStyle.lineHeight },
        description:
          descriptionStyle === null
            ? null
            : {
                size: descriptionStyle.fontSize,
                line: descriptionStyle.lineHeight,
              },
        preview: box(preview),
        icon: box(icon),
        assetRow: box(assetRow),
        entryRow: box(entryRow),
        fields: { display: gridStyle.display, rowGap: gridStyle.rowGap },
      };
    });

    // A chosen Asset's row, a chosen Entry's row and the markdown editor each
    // fill their field, where they used to shrink to their content.
    expect(measured.field).toBeGreaterThan(0);
    expect(measured.asset).toBe(measured.field);
    expect(measured.entry).toBe(measured.field);
    expect(measured.editor).toBe(measured.field);

    // A field's label is ci's label role and its description the small one.
    expect(measured.label).toEqual({ size: '14px', line: '20px' });
    expect(measured.description).toEqual({ size: '12px', line: '16px' });

    // ci's row holds a 64 by 40 px box, and an Asset's preview and an Entry's
    // icon are the same box, so the two rows of one Entry read alike. With
    // 8 px of padding and its border that makes the row 58 px.
    expect(measured.preview).toEqual({ w: 64, h: 40 });
    expect(measured.icon).toEqual(measured.preview);
    expect(measured.assetRow.h).toBe(58);
    expect(measured.entryRow.h).toBe(58);

    // The fields stand 16 px apart, where they used to stand 32 px apart.
    expect(measured.fields).toEqual({ display: 'grid', rowGap: '16px' });
  });

  test('sets a slug in Geist Mono and stands its options on ci’s rows', async ({
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);

    const measured = await mainWindow.evaluate(() => {
      const slug = document.querySelector('[data-slot="input-group-control"]');
      const options = document.querySelector('[data-slot="radio-group"]');
      if (slug === null || options === null) {
        throw new Error('The form draws no slug or no list of options');
      }
      const rows = Array.from(options.querySelectorAll('label')).map((row) =>
        row.getBoundingClientRect()
      );

      return {
        slug: getComputedStyle(slug).fontFamily,
        rowHeights: Array.from(
          new Set(rows.map((row) => Math.round(row.height)))
        ),
        pitch: Array.from(
          new Set(
            rows
              .slice(1)
              .map((row, index) => Math.round(row.y - (rows[index]?.y ?? 0)))
          )
        ),
      };
    });

    // A slug is a value that is code, so it is set in Geist Mono like every
    // other one.
    expect(measured.slug).toContain('Geist Mono');

    // ci lists a select field's options as rows of its own text height, 8 px
    // apart, so the pitch of the list is 28 px.
    expect(measured.rowHeights).toEqual([20]);
    expect(measured.pitch).toEqual([28]);
  });
});

test.describe('A menu and a dialog', () => {
  test('take ci’s corners, border and shadow, and open 8 px below the button', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const help = mainWindow.getByRole('button', { name: 'Help' });
    await help.click();
    await expect(mainWindow.getByRole('menu')).toBeVisible();
    await opened(mainWindow, '[data-slot="dropdown-menu-content"]');

    const measured = await mainWindow.evaluate(() => {
      const menu = document.querySelector(
        '[data-slot="dropdown-menu-content"]'
      );
      const trigger = document.querySelector(
        '[data-slot="dropdown-menu-trigger"]'
      );
      const addOns = Array.from(
        document.querySelectorAll('[data-slot="dropdown-menu-add-on"]')
      );
      const version = addOns[addOns.length - 1]?.closest(
        '[data-slot="dropdown-menu-item"]'
      );
      if (
        menu === null ||
        trigger === null ||
        version === null ||
        version === undefined
      ) {
        throw new Error('Help opens no menu');
      }
      const style = getComputedStyle(menu);
      const versionStyle = getComputedStyle(version);
      const addOnElement = version.querySelector(
        '[data-slot="dropdown-menu-add-on"]'
      );
      if (addOnElement === null) {
        throw new Error('A version row names no version');
      }
      const addOn = getComputedStyle(addOnElement);

      return {
        radius: style.borderTopLeftRadius,
        borderWidth: Math.round(parseFloat(style.borderTopWidth)),
        border: style.borderTopColor,
        shadow: style.boxShadow,
        // ci's own overlay shadow, read off the token the brand package sets,
        // so the expectation is the package's rather than written out here.
        overlay: getComputedStyle(document.documentElement).getPropertyValue(
          '--shadow-overlay'
        ),
        trigger: Math.round(trigger.getBoundingClientRect().height),
        offset: Math.round(
          menu.getBoundingClientRect().y -
            trigger.getBoundingClientRect().bottom
        ),
        versionRow: Math.round(version.getBoundingClientRect().height),
        versionSize: versionStyle.fontSize,
        versionFont: addOn.fontFamily,
      };
    });

    // 8 px corners, a hairline border and the overlay shadow, which is what
    // ci gives every menu and dialog, 8 px below the button that opens it.
    expect(measured.radius).toBe('8px');
    expect(measured.borderWidth).toBe(1);
    expect(shadowLayers(measured.shadow)).toEqual(
      shadowLayers(measured.overlay)
    );
    expect(measured.offset).toBe(8);

    // Help itself is a control of ci's own height, like back and forward
    // beside it, rather than one of its small ones.
    expect(measured.trigger).toBe(CONTROL);

    // Help's versions are 24 px rows in the small role, each version in
    // Geist Mono.
    expect(measured.versionRow).toBe(24);
    expect(measured.versionSize).toBe('12px');
    expect(measured.versionFont).toContain('Geist Mono');
  });

  test('draws a dialog with ci’s head, footer and type, and no close button of its own', async ({
    mainWindow,
  }, testInfo) => {
    await anEntryOfEveryControl(mainWindow, testInfo);

    await mainWindow.getByRole('button', { name: /^Choose Authors/ }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Authors' });
    await expect(picker).toBeVisible();
    await opened(mainWindow, '[data-slot="dialog-content"]');

    const measured = await mainWindow.evaluate(() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      const head = document.querySelector('[data-slot="dialog-header"]');
      const title = document.querySelector('[data-slot="dialog-title"]');
      const describes = document.querySelector(
        '[data-slot="dialog-description"]'
      );
      const footer = document.querySelector('[data-slot="dialog-footer"]');
      const rows = Array.from(
        document.querySelectorAll('[data-slot="dialog-body"] label')
      );
      const row = rows[0] ?? null;
      if (
        dialog === null ||
        head === null ||
        title === null ||
        describes === null ||
        footer === null ||
        row === null
      ) {
        throw new Error('The picker draws no dialog');
      }
      const style = getComputedStyle(dialog);
      const titleStyle = getComputedStyle(title);

      return {
        radius: style.borderTopLeftRadius,
        borderWidth: Math.round(parseFloat(style.borderTopWidth)),
        shadow: style.boxShadow,
        overlay: getComputedStyle(document.documentElement).getPropertyValue(
          '--shadow-overlay'
        ),
        head: getComputedStyle(head).padding,
        headRule: getComputedStyle(head).borderBottomWidth,
        title: {
          size: titleStyle.fontSize,
          line: titleStyle.lineHeight,
          weight: titleStyle.fontWeight,
        },
        describes: getComputedStyle(describes).fontSize,
        footer: getComputedStyle(footer).padding,
        closeButtons: dialog.querySelectorAll(
          '[data-slot="dialog-close"][data-slot="button"], [data-slot="dialog-content"] > [data-slot="dialog-close"]'
        ).length,
        // A chosen row is marked by its control alone, so the row itself
        // takes no border and no surface of its own.
        rowBorder: getComputedStyle(row).borderLeftWidth,
        rowRadius: getComputedStyle(row).borderTopLeftRadius,
        rowHeight: Math.round(row.getBoundingClientRect().height),
        rowWidth: Math.round(row.getBoundingClientRect().width),
        // The rule below each row, which the last one drops so it does not
        // stand against the footer's.
        rowRules: rows.map(
          (listed) => getComputedStyle(listed).borderBottomWidth
        ),
        bodyWidth: Math.round(
          (
            document.querySelector('[data-slot="dialog-body"]') ?? row
          ).getBoundingClientRect().width
        ),
      };
    });

    expect(measured.radius).toBe('8px');
    expect(measured.borderWidth).toBe(1);
    expect(shadowLayers(measured.shadow)).toEqual(
      shadowLayers(measured.overlay)
    );

    // ci's dialog head is 20 px in with 4 px below its description and no rule
    // under it, and its buttons sit on 12 by 20 px.
    expect(measured.head).toBe('20px 20px 4px');
    expect(measured.headRule).toBe('0px');
    expect(measured.footer).toBe('12px 20px');

    // The title is ci's h4 and the line below it the small role.
    expect(measured.title).toEqual({
      size: '20px',
      line: '28px',
      weight: '600',
    });
    expect(measured.describes).toBe('12px');

    // No close button: every dialog says what its buttons do, and Cancel is
    // one of them.
    expect(measured.closeButtons).toBe(0);
    expect(measured.rowBorder).toBe('0px');
    expect(measured.rowRadius).toBe('0px');

    // ci lists the Entries a field allows like the list of Entries: a row of
    // 10 by 16 px with a rule below it, 59 px high, from edge to edge of the
    // dialog rather than inset as a card.
    expect(measured.rowHeight).toBe(59);
    expect(measured.rowWidth).toBe(measured.bodyWidth);

    // Every row keeps that rule but the last, which ci leaves to the footer.
    expect(measured.rowRules).toEqual(['1px', '0px']);
  });

  test('draws the Asset picker as ci’s four columns', async ({
    mainWindow,
  }, testInfo) => {
    // Five Assets, so the grid holds a full row and a second one. The rule
    // between two rows is the one the last row must not repeat against the
    // footer.
    await anEntryOfEveryControl(mainWindow, testInfo, { assets: 5 });

    await mainWindow.getByRole('button', { name: /^Replace Cover/ }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Replace Cover' });
    await expect(picker).toBeVisible();
    await opened(mainWindow, '[data-slot="dialog-content"]');
    await expect(picker.getByRole('radio')).toHaveCount(5);

    const measured = await mainWindow.evaluate(() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      const grid = document.querySelector('[data-slot="dialog-body"] [role]');
      const preview = document.querySelector(
        '[data-slot="dialog-body"] label img, [data-slot="dialog-body"] label [data-slot="skeleton"]'
      );
      if (dialog === null || grid === null) {
        throw new Error('The picker draws no grid');
      }
      const style = getComputedStyle(grid);
      // A column of the grid is 213.5 px wide, so a box is read to the tenth
      // rather than rounded to a pixel it does not sit on.
      const tenth = (value: number): number => Math.round(value * 10) / 10;
      const cards = Array.from(grid.querySelectorAll('label')).map((card) => {
        const cardStyle = getComputedStyle(card);
        return {
          width: tenth(card.getBoundingClientRect().width),
          top: cardStyle.borderTopWidth,
          bottom: cardStyle.borderBottomWidth,
        };
      });
      return {
        width: Math.round(dialog.getBoundingClientRect().width),
        tracks: style.gridTemplateColumns.split(' '),
        gaps: { column: style.columnGap, row: style.rowGap },
        cards,
        // The box the preview is drawn in, which fills the card between its
        // 24 px of padding.
        preview:
          preview === null || preview.parentElement === null
            ? null
            : {
                w: tenth(preview.parentElement.getBoundingClientRect().width),
                h: tenth(preview.parentElement.getBoundingClientRect().height),
              },
      };
    });

    // 856 px wide with four columns, whatever the window does, which is the
    // grid ci draws and the width that keeps each name beside its control.
    expect(measured.width).toBe(856);
    expect(measured.tracks).toHaveLength(4);
    expect(Array.from(new Set(measured.tracks))).toHaveLength(1);

    // ci's cards stand on each other, their rule drawn by the card itself, so
    // the grid keeps no gap where a radio group would bring the registry's.
    expect(measured.gaps).toEqual({ column: '0px', row: '0px' });

    // The rule between two rows is the lower row's own top border, and the
    // last row draws none, so no rule stands against the footer's.
    expect(measured.cards).toHaveLength(5);
    expect(measured.cards.slice(0, 4).map((card) => card.top)).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
    expect(measured.cards[4]?.top).toBe('1px');
    expect(
      Array.from(new Set(measured.cards.map((card) => card.bottom)))
    ).toEqual(['0px']);

    // ci's preview is a 112 px box filling the first card between its 24 px of
    // padding, which is 165.5 px of ci's own 213.5 px column.
    expect(measured.preview?.h).toBe(112);
    expect(measured.preview?.w).toBe(
      Math.round(((measured.cards[0]?.width ?? 0) - 48) * 10) / 10
    );
  });
});

test.describe('The header', () => {
  test('stands back and forward apart and the user on ci’s row', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await expect(
      mainWindow.getByRole('button', { name: 'Go back' })
    ).toBeVisible();

    const measured = await mainWindow.evaluate(() => {
      const named = (label: string): ProbedElement => {
        const found = Array.from(
          document.querySelectorAll('[data-slot="button"]')
        ).find((button) => button.textContent?.trim() === label);
        if (found === undefined) {
          throw new Error(`The header draws no ${label}`);
        }
        return found;
      };
      const box = (
        element: ProbedElement
      ): { x: number; y: number; w: number; h: number } => {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      };

      const back = named('Go back');
      const forward = named('Go forward');
      // The user's own trigger rather than Help's, which is the one holding an
      // avatar.
      const avatar = document.querySelector('[data-slot="avatar"]');
      const user = avatar?.closest('[data-slot="dropdown-menu-trigger"]');
      const chevron = user?.querySelector(':scope > svg');
      if (
        avatar === null ||
        user === null ||
        user === undefined ||
        chevron === null ||
        chevron === undefined
      ) {
        throw new Error('The header draws no user');
      }

      return {
        back: box(back),
        forward: box(forward),
        // Two separate controls, where they used to be one joined group.
        joined: back.closest('[data-slot="button-group"]') !== null,
        user: Math.round(user.getBoundingClientRect().height),
        avatar: box(avatar),
        chevron: box(chevron),
      };
    });

    // Back and forward are two controls of ci's own height standing flush,
    // rather than one group of two halves.
    expect(measured.joined).toBe(false);
    expect({ w: measured.back.w, h: measured.back.h }).toEqual({
      w: CONTROL,
      h: CONTROL,
    });
    expect({ w: measured.forward.w, h: measured.forward.h }).toEqual({
      w: CONTROL,
      h: CONTROL,
    });
    expect(measured.forward.x - measured.back.x).toBe(CONTROL);
    expect(measured.forward.y).toBe(measured.back.y);

    // Without elek.io Cloud the user button is one line of ci's own height,
    // where it used to be two lines of 40 px, with a 24 px avatar and a 12 px
    // chevron.
    expect(measured.user).toBe(CONTROL);
    expect(measured.avatar).toMatchObject({ w: 24, h: 24 });
    expect(measured.chevron).toMatchObject({ w: 12, h: 12 });
  });
});

test.describe('The trail', () => {
  test('names only what opens, and cuts the page rather than wrapping', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    // A title the header has no room for at the smallest window the app
    // supports, which is the size ci's trail is ruled at.
    const title =
      'Spring opening hours at the showroom in Ebersfelde, every weekday until 7 pm and on Saturdays until 4 pm';
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: title }) },
    });
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await navigate(
      mainWindow,
      `#/projects/${project.id}/collections/${collection.id}/${entry.id}/update`
    );
    await expect(
      mainPanel(mainWindow).getByRole('heading', { name: title })
    ).toBeVisible();

    // The crumb measures its own box, so it says it is cut once the header has
    // been laid out rather than on the frame the trail first renders in.
    await expect
      .poll(async () =>
        mainWindow.evaluate(() =>
          document
            .querySelector('[data-slot="breadcrumb-page"]')
            ?.getAttribute('tabindex')
        )
      )
      .toBe('0');

    const trail = await mainWindow.evaluate(() => {
      const list = document.querySelector('[data-slot="breadcrumb-list"]');
      const page = document.querySelector('[data-slot="breadcrumb-page"]');
      const separator = document.querySelector(
        '[data-slot="breadcrumb-separator"] svg'
      );
      if (list === null || page === null || separator === null) {
        throw new Error('The header draws no trail');
      }

      return {
        crumbs: Array.from(list.querySelectorAll('li')).map(
          (item) => item.textContent?.trim() ?? ''
        ),
        wrap: getComputedStyle(list).flexWrap,
        gap: getComputedStyle(list).columnGap,
        separator: Math.round(separator.getBoundingClientRect().width),
        page: {
          weight: getComputedStyle(page).fontWeight,
          color: getComputedStyle(page).color,
          isCut: page.scrollWidth > page.clientWidth,
          text: page.textContent,
          hover: page.getAttribute('title'),
          focusable: page.getAttribute('tabindex'),
        },
        height: Math.round(list.getBoundingClientRect().height),
      };
    });

    // Only what opens: the Project, the Collection and the Entry, without the
    // Collections and the Update step, neither of which has a page.
    expect(trail.crumbs.filter((crumb) => crumb !== '')).toEqual([
      'Projects',
      project.name,
      'Articles',
      title,
    ]);

    // The trail never wraps. The last crumb is the page, in the text color at
    // weight 500, and it is the one that gives way.
    expect(trail.wrap).toBe('nowrap');
    expect(trail.height).toBeLessThanOrEqual(20);
    expect(trail.gap).toBe('6px');
    expect(trail.separator).toBe(12);
    expect(trail.page.weight).toBe('500');

    // Cut on screen, whole in the element, so a screen reader reads the full
    // name, with that name on hover too and the keyboard able to reach it.
    expect(trail.page.isCut).toBe(true);
    expect(trail.page.text).toBe(title);
    expect(trail.page.hover).toBe(title);
    expect(trail.page.focusable).toBe('0');
    const page = mainWindow.locator('[data-slot="breadcrumb-page"]');
    await page.focus();
    await expect(page).toBeFocused();
  });

  test('drops a step that opens nothing of its own', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    // `#/user` settles on the Profile and opens no page of its own, so the
    // trail holds no step for it: ci's trail holds only what opens. It still
    // starts on Projects, as every trail does, which the layout under the user
    // is what names.
    await navigate(mainWindow, '#/user/profile');
    await expect(
      mainWindow.getByRole('heading', { name: 'Profile' })
    ).toBeVisible();

    const trail = await mainWindow.evaluate(() => {
      const list = document.querySelector('[data-slot="breadcrumb-list"]');
      if (list === null) {
        throw new Error('The header draws no trail');
      }
      return {
        crumbs: Array.from(list.querySelectorAll('li'))
          .map((item) => item.textContent?.trim() ?? '')
          .filter((crumb) => crumb !== ''),
        links: Array.from(list.querySelectorAll('a')).length,
      };
    });

    expect(trail.crumbs).toEqual(['Projects', 'Profile']);
    expect(trail.links).toBe(1);
  });
});

test.describe('The sidebar', () => {
  test('stands its rows and its Collections label on ci’s spacing', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
    await expect(
      mainWindow.locator('[data-slot="sidebar-menu-button"]').first()
    ).toBeVisible();

    const measured = await mainWindow.evaluate(() => {
      const content = document.querySelector('[data-slot="sidebar-content"]');
      const label = content?.querySelector('[data-slot="sidebar-group-label"]');
      const search = document.querySelector(
        '[data-slot="sidebar"] [data-slot="button"]'
      );
      if (
        content === null ||
        label === null ||
        label === undefined ||
        search === null
      ) {
        throw new Error('The sidebar has no navigation');
      }
      const rows = Array.from(
        content.querySelectorAll('[data-slot="sidebar-menu-button"]')
      ).map((row) => row.getBoundingClientRect());
      const labelStyle = getComputedStyle(label);
      const labelText = label.querySelector('span')?.getBoundingClientRect();

      return {
        // The pitch of the rows above the Collections label, which are the
        // Project's own pages and sit in one group.
        pitch: Array.from(
          new Set(
            rows
              .slice(0, 3)
              .map((row, index) =>
                index === 0 ? 0 : Math.round(row.y - (rows[index - 1]?.y ?? 0))
              )
              .slice(1)
          )
        ),
        rowHeights: Array.from(
          new Set(rows.map((row) => Math.round(row.height)))
        ),
        labelWeight: labelStyle.fontWeight,
        labelSize: labelStyle.fontSize,
        labelColor: labelStyle.color,
        // What the label's own box keeps above and below its words.
        above:
          labelText === undefined
            ? null
            : Math.round(labelText.y - label.getBoundingClientRect().y),
        below:
          labelText === undefined
            ? null
            : Math.round(
                label.getBoundingClientRect().bottom - labelText.bottom
              ),
        search: Math.round(search.getBoundingClientRect().height),
        searchWeight: getComputedStyle(search).fontWeight,
      };
    });

    // A row is 32 px, and the rows of one group stand 2 px apart, so the open
    // row and the row under the pointer never read as one.
    expect(measured.rowHeights).toEqual([32]);
    expect(measured.pitch).toEqual([34]);

    // The Collections label is the small role in the muted color, 12 px below
    // the row above it and 4 px above the first Collection.
    expect(measured.labelSize).toBe('12px');
    expect(measured.labelWeight).toBe('400');
    expect(measured.above).toBe(12);
    expect(measured.below).toBe(4);

    // The search is a control like every other, and its words are not a label.
    expect(measured.search).toBe(CONTROL);
    expect(measured.searchWeight).toBe('400');
  });
});

import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  dynamicFieldDefinition,
  markdownFieldDefinition,
  navigateToCollectionSettings,
  referenceFieldDefinition,
  selectFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import { parseColor, toBytes } from '../helpers/color.js';
import { createComponentViaIpc } from '../helpers/component.js';
import {
  assetReferencesValue,
  componentValue,
  createEntryViaIpc,
  entryReferencesValue,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import {
  createProjectViaIpc,
  navigateToProjectSettings,
} from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';

// Every list of rows somebody can remove leaves the focus inside itself: on the
// row that takes the removed one's place, else the one before it, else the
// control that adds one, else the list. Each list is driven from the keyboard
// here, since that is who loses their place when the focus falls to the page.
//
// See contributing/renderer/forms.md#keeping-focus-after-a-row-is-removed.

/** Press one control the way somebody without a pointer does. */
async function pressFromTheKeyboard(
  page: Page,
  control: Locator
): Promise<void> {
  await control.focus();
  await page.keyboard.press('Enter');
}

/** The row of one field, which is the one control over the field it shows. */
function fieldRow(page: Page, label: string): Locator {
  return page.getByRole('button', { name: `Settings of the ${label} field` });
}

/**
 * Remove one field of a Collection the way an editor does from the keyboard:
 * open its settings, open the More menu of that pane and press Remove field.
 */
async function removeFieldFromTheKeyboard(
  page: Page,
  label: string
): Promise<void> {
  await pressFromTheKeyboard(page, fieldRow(page, label));
  const pane = page.getByRole('complementary', { name: `The ${label} field` });
  await expect(pane).toBeVisible();

  await pressFromTheKeyboard(
    page,
    pane.getByRole('button', { name: `More for ${label}` })
  );
  const remove = page.getByRole('menuitem', { name: 'Remove field' });
  await expect(remove).toBeVisible();
  await remove.press('Enter');
  await expect(pane).toBeHidden();
}

/**
 * What the focused element is: its name, whether it is the element expected,
 * and the ring it draws, measured against the ring token of the theme on
 * screen.
 */
async function focusedRing(page: Page): Promise<{
  name: string | null;
  width: string;
  style: string;
  isTheRingColor: boolean;
}> {
  const measured = await page.evaluate(() => {
    const focused = document.activeElement;

    if (focused === null) {
      throw new Error('Nothing holds the focus');
    }
    const style = getComputedStyle(focused);

    return {
      name: focused.getAttribute('aria-label'),
      width: style.outlineWidth,
      style: style.outlineStyle,
      color: style.outlineColor,
      ring: style.getPropertyValue('--color-ring'),
    };
  });

  return {
    name: measured.name,
    width: measured.width,
    style: measured.style,
    isTheRingColor:
      toBytes(parseColor(measured.color)).join() ===
      toBytes(parseColor(measured.ring)).join(),
  };
}

test.describe('keeping focus after a row is removed', () => {
  test('leaves it in the list of fields of a Collection', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'title', label: { en: 'Title' } }),
        textFieldDefinition({ slug: 'subtitle', label: { en: 'Subtitle' } }),
        textFieldDefinition({ slug: 'teaser', label: { en: 'Teaser' } }),
        textFieldDefinition({ slug: 'body', label: { en: 'Body' } }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(fieldRow(mainWindow, 'Title')).toBeVisible();
    // The list is named by the heading above it, which is what a screen
    // reader says for it where it takes the focus itself.
    await expect(
      mainWindow.getByRole('group', { name: "Define this Collection's fields" })
    ).toBeVisible();

    // The first field: the focus goes to the field that takes its place.
    await removeFieldFromTheKeyboard(mainWindow, 'Title');
    await expect(fieldRow(mainWindow, 'Title')).toHaveCount(0);
    await expect(fieldRow(mainWindow, 'Subtitle')).toBeFocused();

    // One in the middle: the same, rather than to the one above it.
    await removeFieldFromTheKeyboard(mainWindow, 'Teaser');
    await expect(fieldRow(mainWindow, 'Body')).toBeFocused();

    // The last one: nothing takes its place, so the field before it has it.
    await removeFieldFromTheKeyboard(mainWindow, 'Body');
    await expect(fieldRow(mainWindow, 'Subtitle')).toBeFocused();

    // And with no field left, Add field, the one thing left to press.
    await removeFieldFromTheKeyboard(mainWindow, 'Subtitle');
    await expect(fieldRow(mainWindow, 'Subtitle')).toHaveCount(0);
    await expect(
      mainWindow.getByRole('main').getByRole('button', { name: 'Add field' })
    ).toBeFocused();
  });

  test("leaves it in the options of a select's settings", async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        selectFieldDefinition({
          options: [
            { value: 'one', label: { en: 'One' } },
            { value: 'two', label: { en: 'Two' } },
            { value: 'three', label: { en: 'Three' } },
            { value: 'four', label: { en: 'Four' } },
          ],
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await pressFromTheKeyboard(mainWindow, fieldRow(mainWindow, 'Style'));
    const pane = mainWindow.getByRole('complementary', {
      name: 'The Style field',
    });
    await expect(pane).toBeVisible();

    // An option's row is a group of its own, since the row the focus lands on
    // holds the label, the value and Remove rather than one control.
    const option = (position: number, total: number): Locator =>
      pane.getByRole('group', { name: `Option ${position} of ${total}` });

    // The first option: the focus goes to the option that takes its place.
    await pressFromTheKeyboard(
      mainWindow,
      pane.getByRole('button', { name: 'Remove option 1' })
    );
    await expect(option(1, 3)).toBeFocused();
    await expect(
      pane.getByLabel('Option 1 label', { exact: true })
    ).toHaveValue('Two');

    // One in the middle: the same again.
    await pressFromTheKeyboard(
      mainWindow,
      pane.getByRole('button', { name: 'Remove option 2' })
    );
    await expect(option(2, 2)).toBeFocused();
    await expect(
      pane.getByLabel('Option 2 label', { exact: true })
    ).toHaveValue('Four');

    // The last one: the option before it has the focus, and its own Remove is
    // off, because Core takes no select without an option. That is why the row
    // takes the focus rather than that Remove.
    await pressFromTheKeyboard(
      mainWindow,
      pane.getByRole('button', { name: 'Remove option 2' })
    );
    await expect(option(1, 1)).toBeFocused();
    await expect(
      pane.getByRole('button', { name: 'Remove option 1' })
    ).toBeDisabled();
  });

  test('leaves it in a list of what a field allows', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // The blocks a markdown field allows, which is the one list a field's
    // settings draw for every one of them: the Collections an Entry field
    // allows, the Components a dynamic field allows, a markdown field's blocks
    // and marks, the fields a slug is made from and the file types an Asset
    // field takes all go through `DefinitionChoiceRows`. The blocks are the
    // one that needs nothing else in the Project to be offered.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({
          features: {
            ...markdownFieldDefinition().features,
            blockquotes: true,
            // Core refuses task lists without lists, so this list is also the
            // one whose Remove takes a second row with it.
            lists: true,
            taskListItems: true,
            codeBlocks: true,
            thematicBreak: true,
            tables: true,
          },
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await pressFromTheKeyboard(mainWindow, fieldRow(mainWindow, 'Body'));
    const pane = mainWindow.getByRole('complementary', {
      name: 'The Body field',
    });
    await expect(pane).toBeVisible();

    // A row of this list is one line with its own Remove, so that Remove is
    // what the focus lands on, saying what it takes out of what.
    const remove = (title: string): Locator =>
      pane.getByRole('button', { name: `Remove ${title} from Blocks` });

    // The first row: the focus goes to the row that takes its place.
    await pressFromTheKeyboard(mainWindow, remove('Quotes'));
    await expect(remove('Quotes')).toHaveCount(0);
    await expect(remove('Lists')).toBeFocused();

    // One in the middle: the same again.
    await pressFromTheKeyboard(mainWindow, remove('Dividers'));
    await expect(remove('Tables')).toBeFocused();

    // The last one: nothing takes its place, so the row before it has it.
    await pressFromTheKeyboard(mainWindow, remove('Tables'));
    await expect(remove('Code blocks')).toBeFocused();

    // Removing Lists takes Task lists with it, since Core refuses the one
    // without the other. So the row that took their place is what the focus
    // lands on, rather than a row that went with them.
    await expect(remove('Task lists')).toBeVisible();
    await pressFromTheKeyboard(mainWindow, remove('Lists'));
    await expect(remove('Task lists')).toHaveCount(0);
    await expect(remove('Code blocks')).toBeFocused();

    // With no row left, Add block takes it, since there is something to add
    // again.
    await pressFromTheKeyboard(mainWindow, remove('Code blocks'));
    await expect(
      pane.getByText('Editors write paragraphs only.')
    ).toBeVisible();
    await expect(pane.getByRole('button', { name: 'Add block' })).toBeFocused();
  });

  test('leaves it on the list itself where there is nothing to add', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // The file types a field allows are the types the Project holds Assets of,
    // so one Asset means one type to offer and the row the field holds is that
    // one type. Removing it is what offers it again, so at the moment the
    // focus is placed there is no Add file type to take it.
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({
          slug: 'cover',
          label: { en: 'Cover' },
          ofAssetMimeTypes: ['image/png'],
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await pressFromTheKeyboard(mainWindow, fieldRow(mainWindow, 'Cover'));
    const pane = mainWindow.getByRole('complementary', {
      name: 'The Cover field',
    });
    await expect(
      pane.getByRole('button', { name: 'Add file type' })
    ).toHaveCount(0);

    await pressFromTheKeyboard(
      mainWindow,
      pane.getByRole('button', { name: 'Remove image/png from File types' })
    );
    await expect(pane.getByText('Every file type is allowed.')).toBeVisible();
    await expect(pane.getByRole('group', { name: 'File types' })).toBeFocused();
  });

  test('leaves it on the list itself where the control that adds one is off', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const hero = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [
        textFieldDefinition({ slug: 'headline', label: { en: 'Headline' } }),
      ],
    });
    // A field that holds one section at most. It is the one list whose control
    // to add a row is drawn and disabled rather than absent, since the removal
    // is what frees it, so it is the one that says a disabled control takes no
    // focus.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({
          ofComponents: [hero.id],
          label: { en: 'Sections' },
          max: 1,
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Service' }),
        sections: componentValue([
          {
            componentId: hero.id,
            values: { headline: stringValue({ en: 'First' }) },
          },
        ]),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const sections = mainWindow.locator('[data-slot="section"]');
    await expect(sections).toHaveCount(1);
    await expect(
      mainWindow.getByRole('button', { name: 'Add section' })
    ).toBeDisabled();

    // Removing the only row leaves the focus on the list, which says what it
    // is, rather than on a control nobody could press when the row went.
    await pressFromTheKeyboard(
      mainWindow,
      mainWindow.getByRole('button', { name: 'Remove the Hero section' })
    );
    await expect(sections).toHaveCount(0);
    await expect(
      mainWindow.getByRole('group', { name: 'Sections' })
    ).toBeFocused();
  });

  test('leaves it in the Assets a reference field holds', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const assets = [];
    for (const name of ['One', 'Two', 'Three', 'Four']) {
      assets.push(
        await createAssetViaIpc(mainWindow, {
          projectId: project.id,
          name,
          filePath: makeTempFile(
            testInfo,
            `${name.toLowerCase()}.png`,
            pngBytes
          ),
        })
      );
    }
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({
          slug: 'gallery',
          label: { en: 'Gallery' },
          isRequired: false,
          min: null,
          max: 5,
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Service' }),
        gallery: assetReferencesValue(assets.map((asset) => asset.id)),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const remove = (name: string): Locator =>
      mainWindow.getByRole('button', { name: `Remove ${name} from Gallery` });
    await expect(remove('One')).toBeVisible();

    await pressFromTheKeyboard(mainWindow, remove('One'));
    await expect(remove('One')).toHaveCount(0);
    await expect(remove('Two')).toBeFocused();

    await pressFromTheKeyboard(mainWindow, remove('Three'));
    await expect(remove('Four')).toBeFocused();

    await pressFromTheKeyboard(mainWindow, remove('Four'));
    await expect(remove('Two')).toBeFocused();

    // With nothing chosen the field says so, and Choose is where the focus
    // goes, since the field allows another Asset.
    await pressFromTheKeyboard(mainWindow, remove('Two'));
    await expect(mainWindow.getByText('No Asset chosen')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Choose Gallery' })
    ).toBeFocused();
  });

  test('leaves it in the Entries a reference field holds', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const team = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Member' }, plural: { en: 'Team' } },
      slug: { singular: 'member', plural: 'team' },
    });
    const members = [];
    for (const title of ['Mara', 'Jonas', 'Lena', 'Pia']) {
      members.push(
        await createEntryViaIpc(mainWindow, {
          projectId: project.id,
          collectionId: team.id,
          values: { title: stringValue({ en: title }) },
        })
      );
    }
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition({
          slug: 'authors',
          label: { en: 'Authors' },
          ofCollections: [team.id],
          max: 5,
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Service' }),
        authors: entryReferencesValue(
          team.id,
          members.map((member) => member.id)
        ),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const remove = (title: string): Locator =>
      mainWindow.getByRole('button', { name: `Remove ${title} from Authors` });
    await expect(remove('Mara')).toBeVisible();

    await pressFromTheKeyboard(mainWindow, remove('Mara'));
    await expect(remove('Mara')).toHaveCount(0);
    await expect(remove('Jonas')).toBeFocused();

    await pressFromTheKeyboard(mainWindow, remove('Lena'));
    await expect(remove('Pia')).toBeFocused();

    await pressFromTheKeyboard(mainWindow, remove('Pia'));
    await expect(remove('Jonas')).toBeFocused();

    await pressFromTheKeyboard(mainWindow, remove('Jonas'));
    await expect(mainWindow.getByText('No Entry chosen')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Choose Authors' })
    ).toBeFocused();
  });

  test("leaves it in the Project's languages", async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: {
        language: { default: 'en', supported: ['en', 'de', 'fr', 'es', 'it'] },
      },
    });

    await navigateToProjectSettings(mainWindow, project.id);
    const remove = (language: string): Locator =>
      mainWindow.getByRole('button', { name: `Remove ${language}` });
    await expect(remove('de')).toBeVisible();

    // A language goes only after the dialog that says what it costs, and that
    // dialog returns the focus once it has closed. The chip it was opened from
    // goes with the language, so it returns it to the list.
    const confirm = async (language: string): Promise<void> => {
      await pressFromTheKeyboard(mainWindow, remove(language));
      await expect(
        mainWindow.getByText(`Remove ${language} from this Project?`)
      ).toBeVisible();
      await pressFromTheKeyboard(
        mainWindow,
        mainWindow.getByRole('button', { name: 'Remove language' })
      );
      await expect(remove(language)).toHaveCount(0);
    };

    // Cancelling removes nothing, and the focus goes back to the chip the
    // dialog was opened from, since that chip is still there.
    await pressFromTheKeyboard(mainWindow, remove('de'));
    await pressFromTheKeyboard(
      mainWindow,
      mainWindow.getByRole('button', { name: 'Cancel' })
    );
    await expect(remove('de')).toBeFocused();

    // The first language that can go, since the default language stays.
    await confirm('de');
    await expect(remove('fr')).toBeFocused();

    await confirm('es');
    await expect(remove('it')).toBeFocused();

    await confirm('it');
    await expect(remove('fr')).toBeFocused();
  });

  test('shows the ring and says what has the focus, in both modes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'title', label: { en: 'Title' } }),
        selectFieldDefinition({
          options: [
            { value: 'one', label: { en: 'One' } },
            { value: 'two', label: { en: 'Two' } },
          ],
        }),
      ],
    });

    // Both modes in one window, since the theme is what each of them is read
    // from and nothing of the Project changes with it.
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await navigateToCollectionSettings(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
      });

      // A row that is a group of its own: the option that takes a removed
      // option's place. It says what it is, and the ring is the one every
      // control takes, 2 px in the ring color of the theme on screen.
      await pressFromTheKeyboard(mainWindow, fieldRow(mainWindow, 'Style'));
      const pane = mainWindow.getByRole('complementary', {
        name: 'The Style field',
      });
      await pressFromTheKeyboard(
        mainWindow,
        pane.getByRole('button', { name: 'Remove option 1' })
      );
      expect(await focusedRing(mainWindow), theme).toEqual({
        name: 'Option 1 of 1',
        width: '2px',
        style: 'solid',
        isTheRingColor: true,
      });

      // And a row that is one control: the field that takes a removed field's
      // place, which says what it opens.
      await removeFieldFromTheKeyboard(mainWindow, 'Title');
      expect(await focusedRing(mainWindow), theme).toEqual({
        name: 'Settings of the Style field',
        width: '2px',
        style: 'solid',
        isTheRingColor: true,
      });
    }
  });
});

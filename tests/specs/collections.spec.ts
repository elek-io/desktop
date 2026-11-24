import { expect } from '@playwright/test';

import { flattenFieldDefinitions, type FieldType } from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import {
  addFieldDefinition,
  chooseFieldDefinition,
  createCollection,
  createCollectionViaIpc,
  fillCollectionForm,
  navigateToCollection,
  navigateToCollectionCreate,
  navigateToCollectionSettings,
  openFieldTypes,
  readCollectionViaIpc,
  referenceFieldDefinition,
  switchSettingsLanguage,
  textFieldDefinition,
  toggleFieldDefinition,
} from '../helpers/collection.js';
import { dismissDialog } from '../helpers/dialog.js';
import {
  createEntryViaIpc,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import { errorScreenTitle } from '../helpers/error.js';
import { stubCoreReject } from '../helpers/ipc.js';
import { mainPanel, reloadWindow } from '../helpers/navigation.js';
import {
  addProjectLanguageViaIpc,
  createProjectViaIpc,
  navigateToHistory,
} from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/** The settings of a Collection, so a test reaches its page head and its form. */
const settingsOf = {
  namePlural: 'Articles',
  nameSingular: 'Article',
  description: 'The articles of this blog',
  slugPlural: 'articles',
  slugSingular: 'article',
};

test.describe('Collections', () => {
  test('creates a Collection on the same page, empty, and lists it in the sidebar', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigateToCollectionCreate(mainWindow, project.id);
    // The same page, titled by what it is about and empty of fields.
    await expect(
      mainWindow.getByRole('heading', { name: 'Create Collection' })
    ).toBeVisible();
    await expect(
      mainWindow
        .getByRole('main')
        .getByLabel('Collection name', { exact: true })
    ).toHaveValue('');
    await expect(
      mainWindow.getByRole('button', { name: /^Settings of the/ })
    ).toHaveCount(0);

    await createCollection(mainWindow, {
      ...settingsOf,
      field: { label: 'Title', description: 'The title of the article' },
    });

    // Reaching the Collection's own route means Core accepted the create.
    // Scoped to the sidebar, a complementary landmark, so the matching crumb on
    // the detail page does not make the link ambiguous. The row carries how
    // many Entries the Collection holds, so its name starts with the
    // Collection's own name rather than being it.
    await expect(
      mainWindow
        .getByRole('complementary')
        .getByRole('link', { name: /^Articles/ })
    ).toBeVisible();
  });

  test('opens the settings from the head of the list of Entries', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow
      .getByRole('link', { name: 'Settings of the Articles Collection' })
      .click();

    await expect(
      mainWindow.getByRole('heading', {
        name: 'Settings of the Articles Collection',
      })
    ).toBeVisible();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update`)
    );
  });

  test('saves the names, the slugs and the description from one page with one Save', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');

    // One Save, and nothing edited yet, so it is blocked.
    const save = mainWindow.getByRole('button', { name: 'Save' });
    await expect(save).toHaveCount(1);
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    await settings
      .getByLabel('Collection name', { exact: true })
      .fill('Guides');
    await settings.getByLabel('Entry name', { exact: true }).fill('Guide');
    await settings
      .getByLabel('Description', { exact: true })
      .fill('Guides created by the E2E tests');
    await settings
      .getByLabel('Collection slug', { exact: true })
      .fill('guides');
    await settings.getByLabel('Entry slug', { exact: true }).fill('guide');

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await save.click();

    // Redirecting to the Collection is how Core's success surfaces.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // Read back from Core, so this is what was written rather than what the
    // cache held.
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(saved.name.plural.en).toBe('Guides');
    expect(saved.name.singular.en).toBe('Guide');
    expect(saved.description.en).toBe('Guides created by the E2E tests');
    expect(saved.slug.plural).toBe('guides');
    expect(saved.slug.singular).toBe('guide');
  });

  test('keeps the title and Save in view while the page scrolls', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // Enough fields that the page has to scroll at the smallest window.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: Array.from({ length: 12 }, (_, index) =>
        textFieldDefinition({
          slug: `field-${String(index)}`,
          label: { en: `Field ${String(index)}` },
        })
      ),
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await waitForLayout(mainWindow);

    const title = mainWindow.getByRole('heading', {
      name: 'Settings of the Articles Collection',
    });
    const save = mainWindow.getByRole('button', { name: 'Save' });
    const before = await title.boundingBox();

    // Scroll the fields, which is what the head has to survive.
    await mainWindow
      .getByLabel('Field 11', { exact: true })
      .scrollIntoViewIfNeeded();
    await waitForLayout(mainWindow);

    await expect(title).toBeInViewport();
    await expect(save).toBeInViewport();
    // In the same place, so the head is not what scrolled.
    expect(await title.boundingBox()).toEqual(before);
  });

  test('holds Delete Collection in the More menu, and asks before it deletes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    // Nothing on the screen deletes until the More menu is opened, so Delete is
    // never a press away from Save.
    await expect(
      mainWindow.getByRole('button', { name: 'Delete Collection' })
    ).toHaveCount(0);

    await mainWindow.getByRole('button', { name: 'More for Articles' }).click();
    await mainWindow
      .getByRole('menuitem', { name: 'Delete Collection' })
      .click();

    // The dialog names what goes and who it reaches, and Cancel changes
    // nothing.
    const confirm = mainWindow.getByRole('alertdialog', {
      name: 'Delete Articles?',
    });
    await expect(confirm).toBeVisible();
    await expect(
      confirm.getByText(
        'Every Entry of this Collection goes with it, in every language, and for everyone on this Project once you sync.'
      )
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update`)
    );

    // The red button names what goes, and only then is it gone.
    await mainWindow.getByRole('button', { name: 'More for Articles' }).click();
    await mainWindow
      .getByRole('menuitem', { name: 'Delete Collection' })
      .click();
    await mainWindow
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete Collection' })
      .click();

    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/collections$/);
    await expect(
      mainWindow
        .getByRole('complementary')
        .getByRole('link', { name: /^Articles/ })
    ).toHaveCount(0);
  });

  test('says why a Collection other Entries point into cannot be deleted', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const target = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const other = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Link' }, plural: { en: 'Links' } },
      slug: { singular: 'link', plural: 'links' },
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });
    const pointedAt = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
      values: { title: stringValue({ en: 'Launch day' }) },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: other.id,
      values: {
        title: stringValue({ en: 'A link' }),
        related: {
          objectType: 'value',
          valueType: 'reference',
          content: {
            en: [
              {
                id: pointedAt.id,
                objectType: 'entry',
                collectionId: target.id,
              },
            ],
          },
        },
      },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
    });
    await mainWindow.getByRole('button', { name: 'More for Articles' }).click();
    await mainWindow
      .getByRole('menuitem', { name: 'Delete Collection' })
      .click();
    await mainWindow
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete Collection' })
      .click();

    // Answered in place rather than on the error screen, and in words that say
    // what to do next.
    await expect(
      mainWindow.getByText('Could not delete this Collection')
    ).toBeVisible();
    await expect(
      mainWindow.getByText(
        "Entries in other Collections still point at Entries in this one, so it can't be deleted. Take those references out first, then try again."
      )
    ).toBeVisible();
    await dismissDialog(mainWindow);
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${target.id}/update`)
    );
  });

  test('offers every field type in its group, and adding one opens its settings', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);

    const types = await openFieldTypes(mainWindow);
    // ci's six groups, with the 18 types Core defines between them.
    for (const group of [
      'Text',
      'Numbers',
      'Choices',
      'Dates and times',
      'Contact and web',
      'Links',
    ]) {
      await expect(
        types.getByRole('heading', { name: group, exact: true })
      ).toBeVisible();
    }
    await expect(types.getByText('18 types')).toBeVisible();
    await expect(types.getByRole('button')).toHaveCount(
      // The 18 types, plus the pane's own close button.
      19
    );

    // Choosing a type adds the field and opens its settings at once, so there
    // is nothing to confirm and no sheet left.
    await types.getByRole('button', { name: 'textarea', exact: true }).click();
    const pane = mainWindow.getByRole('complementary', {
      name: /^Settings of the/,
    });
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('combobox', { name: 'Type' })).toHaveText(
      'textarea'
    );
    await expect(mainWindow.getByRole('dialog')).toHaveCount(0);

    await pane.getByLabel('Label', { exact: true }).fill('Teaser');
    // The field is already part of the page, so the preview carries its label
    // the moment it is written.
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Teaser field' })
    ).toBeVisible();
  });

  test("fills a field's settings with what is stored", async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'teaser',
          label: { en: 'Teaser' },
          description: { en: 'Shown in lists and search results' },
          inputWidth: '6',
          defaultValue: 'Read on',
          min: 2,
          max: 200,
          isRequired: true,
          isUnique: false,
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Teaser');

    await expect(pane.getByLabel('Label', { exact: true })).toHaveValue(
      'Teaser'
    );
    await expect(pane.getByLabel('Slug', { exact: true })).toHaveValue(
      'teaser'
    );
    await expect(pane.getByLabel('Description', { exact: true })).toHaveValue(
      'Shown in lists and search results'
    );
    await expect(pane.getByLabel('Minimum', { exact: true })).toHaveValue('2');
    await expect(pane.getByLabel('Maximum', { exact: true })).toHaveValue(
      '200'
    );
    await expect(pane.getByLabel('Default Value', { exact: true })).toHaveValue(
      'Read on'
    );
    // The type it holds, and the width it was saved at, as the one segment that
    // reads as pressed.
    await expect(pane.getByRole('combobox', { name: 'Type' })).toHaveText(
      /textarea|text/
    );
    await expect(
      pane.getByRole('button', { name: '1/2', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      pane.getByRole('checkbox', { name: 'Required' })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      pane.getByRole('checkbox', { name: 'Unique' })
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('moves a field up, moves it down and removes it, without dragging', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({ slug: 'teaser', label: { en: 'Teaser' } }),
        textFieldDefinition({ slug: 'body', label: { en: 'Body' } }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const rows = (): Promise<string[]> =>
      mainWindow
        .getByRole('button', { name: /^Settings of the/ })
        .evaluateAll((found) =>
          found.map((row) => row.getAttribute('aria-label') ?? '')
        );
    expect(await rows()).toEqual([
      'Settings of the Title field',
      'Settings of the Teaser field',
      'Settings of the Body field',
    ]);

    await chooseFieldDefinition(mainWindow, 'Body');
    await mainWindow.getByRole('button', { name: 'More for Body' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Move up' }).click();
    expect(await rows()).toEqual([
      'Settings of the Title field',
      'Settings of the Body field',
      'Settings of the Teaser field',
    ]);

    await mainWindow.getByRole('button', { name: 'More for Body' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Move down' }).click();
    expect(await rows()).toEqual([
      'Settings of the Title field',
      'Settings of the Teaser field',
      'Settings of the Body field',
    ]);

    await mainWindow.getByRole('button', { name: 'More for Body' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Remove field' }).click();
    expect(await rows()).toEqual([
      'Settings of the Title field',
      'Settings of the Teaser field',
    ]);
    // The field it was open on is gone, so the pane closes with it.
    await expect(
      mainWindow.getByRole('complementary', { name: /^Settings of the/ })
    ).toHaveCount(0);

    // The order reaches Core, which is what the save is for.
    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(
      flattenFieldDefinitions(saved.fieldDefinitions).map((found) => found.slug)
    ).toEqual(['title', 'teaser']);
  });

  test('follows each edit in the preview and keeps the field its id', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ min: null, max: 80, inputWidth: '12' }),
      ],
    });
    const stored = collection.fieldDefinitions[0];
    if (stored === undefined) {
      throw new Error('The Collection was created without a field');
    }

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Title');
    // What the field says about itself before the edit, read off its preview.
    await expect(
      mainWindow.getByRole('main').getByText('Required, up to 80 characters')
    ).toBeVisible();

    await pane.getByLabel('Label', { exact: true }).fill('Headline');
    await pane.getByLabel('Maximum', { exact: true }).fill('120');
    await pane.getByRole('checkbox', { name: 'Required' }).click();

    // The preview follows every one of them, without a save.
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Headline field' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('main').getByText('Up to 120 characters')
    ).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const after = saved.fieldDefinitions[0];
    expect(after?.id).toBe(stored.id);
    expect(after?.label.en).toBe('Headline');
  });

  test('saves a renamed slug and a looser rule, and the Values reach every Entry', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition({ max: 80 })],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Launch day' }) },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Title');
    await pane.getByLabel('Label', { exact: true }).fill('Headline');
    await pane.getByLabel('Slug', { exact: true }).fill('headline');
    await pane.getByLabel('Maximum', { exact: true }).fill('400');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    // Core carries all three out on its own, so the save goes through.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // The Value moved to the new slug rather than being dropped, which is what
    // keeping the field's id buys.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Headline')).toHaveValue('Launch day');
  });

  test('changes a field to another type the stored Values pass', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    const stored = collection.fieldDefinitions[0];
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Launch day' }) },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Title');
    await pane.getByRole('combobox', { name: 'Type' }).click();
    await mainWindow
      .getByRole('option', { name: 'textarea', exact: true })
      .click();

    // The field keeps its label and its slug across the type change, so the
    // pane is still about the same field.
    await expect(pane.getByLabel('Label', { exact: true })).toHaveValue(
      'Title'
    );
    await expect(pane.getByLabel('Slug', { exact: true })).toHaveValue('title');

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const changed = flattenFieldDefinitions(saved.fieldDefinitions)[0];
    expect(changed?.fieldType).toBe('textarea');
    // The same field, with the Value it held.
    expect(changed?.id).toBe(stored?.id);
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Title')).toHaveValue('Launch day');
  });

  test('says that a change Core refuses changed nothing', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          isRequired: false,
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        subtitle: stringValue({ en: 'What ships today' }),
      },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await chooseFieldDefinition(mainWindow, 'Subtitle');
    await mainWindow.getByRole('button', { name: 'More for Subtitle' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Remove field' }).click();
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    // Answered in place rather than on the error screen, and it says that
    // nothing was saved, which is Core's own guarantee.
    await expect(
      mainWindow.getByText('Could not save this Collection')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('dialog').locator('[data-slot="dialog-description"]')
    ).toHaveText(
      'Nothing was saved, and this Collection is exactly as it was. Your field changes reach Entries that already exist, and each one has to be settled before the change can go in, which elek.io Desktop cannot do yet. Put the field changes back for now.'
    );
    await dismissDialog(mainWindow);
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update$`)
    );

    // The Project got no commit for the refused update. Both are looked for in
    // the main panel, because the Project's sidebar carries a Create Collection
    // link of its own.
    await navigateToHistory(mainWindow, project.id);
    await expect(
      mainPanel(mainWindow).getByRole('link', { name: /create collection/i })
    ).toBeVisible();
    await expect(
      mainPanel(mainWindow).getByRole('link', { name: /update collection/i })
    ).toHaveCount(0);

    // Routing there reloaded the renderer, so the Entry form re-reads from
    // Core: the field is still there and still holds its Value.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Subtitle')).toHaveValue(
      'What ships today'
    );
  });

  test('saves removing a field from a Collection with no Entries', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          isRequired: false,
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await chooseFieldDefinition(mainWindow, 'Subtitle');
    await mainWindow.getByRole('button', { name: 'More for Subtitle' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Remove field' }).click();
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    await expect(
      mainWindow.getByText('Could not save this Collection')
    ).toBeHidden();
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(
      flattenFieldDefinitions(saved.fieldDefinitions).map((found) => found.slug)
    ).toEqual(['title']);
  });

  test('switches every name, label and description with one switch', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await addProjectLanguageViaIpc(mainWindow, project, 'de');
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Artikel' },
        plural: { en: 'Articles', de: 'Artikel' },
      },
      description: { en: 'The articles', de: 'Die Artikel' },
      fieldDefinitions: [
        textFieldDefinition({
          label: { en: 'Title', de: 'Titel' },
          description: { en: 'Its title', de: 'Sein Titel' },
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');
    // The line below the switch says what it switches and what it does not.
    await expect(
      mainWindow.getByText(
        'Switches names, labels and descriptions. Slugs and fields are the same in every language.'
      )
    ).toBeVisible();

    const pane = await chooseFieldDefinition(mainWindow, 'Title');
    await switchSettingsLanguage(mainWindow, 'de');

    // Every name, the description and the chosen field's own texts follow the
    // one switch.
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Artikel');
    await expect(
      settings.getByLabel('Description', { exact: true })
    ).toHaveValue('Die Artikel');
    await expect(pane.getByLabel('Label', { exact: true })).toHaveValue(
      'Titel'
    );
    await expect(pane.getByLabel('Description', { exact: true })).toHaveValue(
      'Sein Titel'
    );
    // A slug is the same in every language, so it does not follow.
    await expect(
      settings.getByLabel('Collection slug', { exact: true })
    ).toHaveValue('articles');
  });

  test('blocks Save while a language misses a text and says which misses how many', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition({ label: { en: 'Title' } })],
    });
    // Adding a language touches only the Project file, so the Collection keeps
    // its English-only texts, which is exactly the state an editor lands in.
    await addProjectLanguageViaIpc(mainWindow, project, 'de');

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');

    // Both names, the description and the field's label are missing in German.
    const save = mainWindow.getByRole('button', { name: 'Save' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(
      mainWindow.getByText('German is missing 4 translations')
    ).toBeVisible();
    // It points at the reason, so a screen reader reads it with the button,
    // and it keeps its place in the tab order rather than being taken out of
    // it, which a native `disabled` would do.
    await expect(save).toHaveAttribute('aria-describedby', /.+/);
    await expect(save).not.toHaveAttribute('disabled', /.*/);
    await save.focus();
    await expect(save).toBeFocused();

    // The switch marks the language that is missing something.
    await expect(
      mainWindow.getByRole('button', { name: /^DE, missing 4 translations/ })
    ).toBeVisible();

    // Filling German settles each of them, one at a time.
    await switchSettingsLanguage(mainWindow, 'de');
    await settings
      .getByLabel('Collection name', { exact: true })
      .fill('Artikel');
    await expect(
      mainWindow.getByText('German is missing 3 translations')
    ).toBeVisible();
    await settings.getByLabel('Entry name', { exact: true }).fill('Artikel');
    await settings
      .getByLabel('Description', { exact: true })
      .fill('Die Artikel');
    const pane = await chooseFieldDefinition(mainWindow, 'Title');
    await expect(
      mainWindow.getByText('German is missing 1 translation')
    ).toBeVisible();
    await pane.getByLabel('Label', { exact: true }).fill('Titel');

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await save.click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
  });

  test('asks before leaving the settings with changes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');
    await settings
      .getByLabel('Collection name', { exact: true })
      .fill('Guides');

    // Leaving through the sidebar, which is one click away from the form.
    await mainWindow
      .getByRole('complementary')
      .getByRole('link', { name: /^Articles/ })
      .click();

    const asked = mainWindow.getByRole('alertdialog', {
      name: 'Discard your changes to Settings of the Articles Collection?',
    });
    await expect(asked).toBeVisible();
    await asked.getByRole('button', { name: 'Keep editing' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update`)
    );
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Guides');

    await mainWindow
      .getByRole('complementary')
      .getByRole('link', { name: /^Articles/ })
      .click();
    await mainWindow
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
  });

  test("says Core's refusals of a field definition in an editor's words", async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, settingsOf);
    const create = mainWindow
      .getByRole('main')
      .getByRole('button', { name: 'Create Collection' });

    // A minimum above the maximum, which Core refines onto the minimum.
    const pane = await addFieldDefinition(mainWindow, {
      label: 'Teaser',
      fieldType: 'textarea',
      min: 10,
      max: 5,
    });
    await create.click();
    await expect(
      pane.getByText("The minimum can't be above the maximum.")
    ).toBeVisible();
    // None of Core's own English reaches the field.
    await expect(mainWindow.getByText('min must be less')).toHaveCount(0);
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/create/
    );

    // A Default Value outside those bounds, on the same field.
    await pane.getByLabel('Minimum', { exact: true }).fill('2');
    await pane.getByLabel('Maximum', { exact: true }).fill('5');
    await pane
      .getByLabel('Default Value', { exact: true })
      .fill('Far too long');
    await create.click();
    await expect(
      pane.getByText(
        "The Default Value doesn't fit between the minimum and the maximum."
      )
    ).toBeVisible();
    await expect(mainWindow.getByText('within the min and max')).toHaveCount(0);

    // A slug Core keeps for itself.
    await pane.getByLabel('Default Value', { exact: true }).fill('');
    await pane.getByLabel('Slug', { exact: true }).fill('settings');
    await create.click();
    await expect(
      pane.getByText('This word is kept for elek.io. Choose another slug.')
    ).toBeVisible();
    await expect(mainWindow.getByText('is reserved and cannot')).toHaveCount(0);

    // A slug another field of the same Collection already holds.
    await pane.getByLabel('Slug', { exact: true }).fill('teaser');
    const second = await addFieldDefinition(mainWindow, {
      label: 'Lead',
      fieldType: 'textarea',
    });
    await second.getByLabel('Slug', { exact: true }).fill('teaser');
    await create.click();
    await expect(
      second.getByText(
        'Another field already uses this slug. Choose another one.'
      )
    ).toBeVisible();
    await expect(mainWindow.getByText('Slug already in use')).toHaveCount(0);

    // And with each of them settled, the same page saves.
    await second.getByLabel('Slug', { exact: true }).fill('lead');
    await create.click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  test('refuses a unique field that carries a Default Value, in its own words', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, settingsOf);

    const pane = await addFieldDefinition(mainWindow, {
      label: 'Title',
      isUnique: true,
      defaultValue: 'Untitled',
    });
    await mainWindow
      .getByRole('main')
      .getByRole('button', { name: 'Create Collection' })
      .click();
    await expect(
      pane.getByText(
        'A unique field takes no Default Value, since every Entry would start with the same one.'
      )
    ).toBeVisible();

    // Clearing the Default Value leaves a valid unique field, so the same page
    // saves.
    await pane.getByLabel('Default Value', { exact: true }).fill('');
    await mainWindow
      .getByRole('main')
      .getByRole('button', { name: 'Create Collection' })
      .click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  test('adds a field of every type Core defines', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A Component, so a dynamic field has one to allow.
    await mainWindow.evaluate(
      async (projectId) =>
        window.ipc.core.components.create({
          projectId,
          name: { en: 'Hero' },
          slug: 'hero',
          description: null,
          fieldDefinitions: [],
        }),
      project.id
    );
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, settingsOf);

    // Every type Core defines, each with the one setting it cannot save
    // without. Range carries its own bounds, so they are filled where it needs
    // them.
    const types: FieldType[] = [
      'text',
      'textarea',
      'markdown',
      'slug',
      'number',
      'range',
      'toggle',
      'select',
      'date',
      'time',
      'datetime',
      'email',
      'url',
      'telephone',
      'ipv4',
      'entry',
      'asset',
      'dynamic',
    ];
    for (const fieldType of types) {
      const pane = await addFieldDefinition(mainWindow, {
        label: `A ${fieldType} field`,
        fieldType,
      });
      await expect(
        pane.getByRole('combobox', { name: 'Type' }),
        `${fieldType} does not say what it is`
      ).toHaveText(fieldType);
    }

    await mainWindow
      .getByRole('main')
      .getByRole('button', { name: 'Create Collection' })
      .click();
    // Reaching the Collection's own route means Core accepted all 18.
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
    await reloadWindow(mainWindow);
    await expect(
      mainWindow
        .getByRole('complementary')
        .getByRole('link', { name: /^Articles/ })
    ).toBeVisible();
  });

  test("shows a select's options as rows with Add and Remove", async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, settingsOf);

    const pane = await addFieldDefinition(mainWindow, {
      label: 'Style',
      fieldType: 'select',
    });
    await pane.getByLabel('Option 1 label', { exact: true }).fill('Primary');
    // The value follows the label while nobody has written one.
    await expect(
      pane.getByLabel('Option 1 value', { exact: true })
    ).toHaveValue('primary');

    await pane.getByRole('button', { name: 'Add option' }).click();
    await pane.getByLabel('Option 2 label', { exact: true }).fill('Outline');
    await expect(
      pane.getByLabel('Option 2 value', { exact: true })
    ).toHaveValue('outline');

    // Remove takes the row out again, so the list is what the field holds.
    await pane.getByRole('button', { name: 'Remove option 2' }).click();
    await expect(
      pane.getByLabel('Option 2 label', { exact: true })
    ).toHaveCount(0);

    await mainWindow
      .getByRole('main')
      .getByRole('button', { name: 'Create Collection' })
      .click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  test('routes an unexpected Collection save failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');

    await settings
      .getByLabel('Collection name', { exact: true })
      .fill('Guides');
    await stubCoreReject(electronApp, 'core:collections:update');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    await expect(errorScreenTitle(mainWindow)).toBeVisible();
    await expect(
      mainWindow.getByText('Could not save this Collection')
    ).toBeHidden();
  });

  // Core pins Required or Unique for some field types, so the control shows a
  // fixed fact instead of offering a choice that would only fail on save, and
  // says why. Every type Core pins is listed, because a locked control with no
  // reason leaves an editor with something to press and no answer.
  const pinned: {
    fieldType: FieldType;
    control: 'Required' | 'Unique';
    reason: string;
  }[] = [
    { fieldType: 'slug', control: 'Unique', reason: 'A slug is always unique' },
    {
      fieldType: 'toggle',
      control: 'Unique',
      reason: "A toggle can't be unique",
    },
    {
      fieldType: 'toggle',
      control: 'Required',
      reason: 'A toggle is always required',
    },
    {
      fieldType: 'number',
      control: 'Unique',
      reason: "A number field can't be unique.",
    },
    {
      fieldType: 'range',
      control: 'Unique',
      reason: "A number field can't be unique.",
    },
    {
      fieldType: 'range',
      control: 'Required',
      reason: 'A range is always required',
    },
    {
      fieldType: 'asset',
      control: 'Unique',
      reason: "A reference field can't be unique.",
    },
    {
      fieldType: 'entry',
      control: 'Unique',
      reason: "A reference field can't be unique.",
    },
    {
      fieldType: 'markdown',
      control: 'Unique',
      reason: "A markdown field can't be unique.",
    },
    {
      fieldType: 'dynamic',
      control: 'Unique',
      reason: "A dynamic field can't be unique.",
    },
  ];

  test('locks Required and Unique where Core pins them, and says why', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);

    for (const { fieldType, control, reason } of pinned) {
      const pane = await addFieldDefinition(mainWindow, {
        label: `A ${fieldType} field`,
        fieldType,
      });
      await expect(
        pane.getByRole('checkbox', { name: control }),
        `${fieldType} offers ${control} as a choice`
      ).toBeDisabled();
      await expect(
        pane.getByText(reason),
        `${fieldType} locks ${control} without saying why`
      ).toBeVisible();
    }

    // The lock is not blanket: a text field's uniqueness is a real choice,
    // offered with nothing to explain.
    const text = await addFieldDefinition(mainWindow, {
      label: 'A text field',
      fieldType: 'text',
    });
    await expect(text.getByRole('checkbox', { name: 'Unique' })).toBeEnabled();
    await expect(text.getByText("can't be unique")).toHaveCount(0);

    // A select's options are either text or numbers, and only the numeric
    // variant is pinned, so the one type carries both answers.
    const select = await addFieldDefinition(mainWindow, {
      label: 'A select field',
      fieldType: 'select',
    });
    await expect(
      select.getByRole('checkbox', { name: 'Unique' })
    ).toBeEnabled();
    await select.getByRole('combobox', { name: 'Type of options' }).click();
    await mainWindow.getByRole('option', { name: 'Number' }).click();
    await expect(
      select.getByRole('checkbox', { name: 'Unique' })
    ).toBeDisabled();
    await expect(
      select.getByText("A number field can't be unique.")
    ).toBeVisible();
  });

  test('draws the controls of a field as they were saved', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ isRequired: false, isUnique: true }),
        toggleFieldDefinition({
          slug: 'featured',
          label: { en: 'Featured' },
          defaultValue: true,
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    const title = await chooseFieldDefinition(mainWindow, 'Title');
    await expect(
      title.getByRole('checkbox', { name: 'Required' })
    ).toHaveAttribute('aria-checked', 'false');
    await expect(
      title.getByRole('checkbox', { name: 'Unique' })
    ).toHaveAttribute('aria-checked', 'true');

    const featured = await chooseFieldDefinition(mainWindow, 'Featured');
    // A toggle's Default Value is the switch the field itself draws, and it
    // opens on the state that was saved.
    await expect(
      featured.getByRole('switch', { name: 'Default Value' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('fits the smallest window the app supports, in light and in dark mode', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({
          slug: 'teaser',
          label: { en: 'Teaser' },
          inputWidth: '6',
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    // With the pane of a chosen field open, which is the widest the screen gets.
    await chooseFieldDefinition(mainWindow, 'Teaser');
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await waitForLayout(mainWindow);

      const measured = await mainWindow.evaluate(() => {
        const panel = document.querySelector('[data-slot="panel"]');
        const panes = Array.from(
          document.querySelectorAll('[data-slot="pane"]')
        );
        if (panel === null || panes.length < 2) {
          throw new Error('The settings did not draw their panes');
        }
        const [form, side] = panes.map((pane) => pane.getBoundingClientRect());
        return {
          // Nothing reaches past the panel it sits in, in either direction.
          clipped: panes.some((pane) => pane.scrollWidth > pane.clientWidth),
          fitsTheWindow:
            panel.getBoundingClientRect().right <= window.innerWidth &&
            panel.getBoundingClientRect().bottom <= window.innerHeight,
          // The two panes stand beside each other rather than over each other.
          collides:
            form === undefined || side === undefined
              ? true
              : form.right > side.left + 1,
          sidePaneWidth:
            side === undefined ? 0 : Math.round(side.right - side.left),
        };
      });

      expect(measured.clipped, `${theme} mode clips a pane`).toBe(false);
      expect(measured.fitsTheWindow, `${theme} mode overflows`).toBe(true);
      expect(measured.collides, `${theme} mode makes the panes overlap`).toBe(
        false
      );
      // ci's pane of 296 px, whatever the window does.
      expect(measured.sidePaneWidth).toBe(296);
    }
  });
});

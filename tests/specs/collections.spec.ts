import { expect, type Page } from '@playwright/test';

import {
  flattenFieldDefinitions,
  type Collection,
  type Entry,
  type FieldType,
  type Project,
} from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  addFieldDefinition,
  assetFieldDefinition,
  chooseFieldDefinition,
  dynamicFieldDefinition,
  createCollection,
  createCollectionViaIpc,
  fillCollectionForm,
  navigateToCollection,
  navigateToCollectionCreate,
  navigateToCollectionSettings,
  openFieldTypes,
  readCollectionViaIpc,
  referenceFieldDefinition,
  slugFieldDefinition,
  textFieldDefinition,
  toggleFieldDefinition,
} from '../helpers/collection.js';
import { createComponentViaIpc } from '../helpers/component.js';
import { dismissDialog } from '../helpers/dialog.js';
import {
  chooseLanguage,
  componentValue,
  createEntryViaIpc,
  navigateToEntryUpdate,
  readEntryViaIpc,
  stringValue,
} from '../helpers/entry.js';
import { errorScreenTitle } from '../helpers/error.js';
import { stubCoreReject } from '../helpers/ipc.js';
import {
  mainPanel,
  projectSidebar,
  reloadWindow,
} from '../helpers/navigation.js';
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
      name: /^The .*field$/,
    });
    await expect(pane).toBeVisible();
    await expect(
      pane
        .getByRole('combobox', { name: 'Type', exact: true })
        .locator('[data-slot="select-value"]')
    ).toHaveText('textarea');
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
    await expect(
      pane
        .getByRole('combobox', { name: 'Type', exact: true })
        .locator('[data-slot="select-value"]')
    ).toHaveText('text');
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
    // The settings draw nothing at all until the Project is read, which runs
    // Git one command at a time, so the rows are read once a field the read
    // brought stands. A one-shot read before then sees an empty page.
    await expect(
      mainWindow.getByRole('main').getByLabel('Collection name', {
        exact: true,
      })
    ).toHaveValue('Articles');
    const rows = async (): Promise<string[]> =>
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

    const body = await chooseFieldDefinition(mainWindow, 'Body');
    // The chosen field keeps the grip, for whoever would rather drag it, and
    // no other row carries one.
    await expect(
      mainWindow.getByRole('button', { name: 'Drag to reorder' })
    ).toHaveCount(1);
    await expect(body).toBeVisible();
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
      mainWindow.getByRole('complementary', { name: /^The .*field$/ })
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

  /**
   * A Collection whose Entry holds a Value in a field that is about to go, with
   * the settings open and that field removed from the form, which is the state
   * Save is refused in.
   */
  async function removeSubtitleOf(mainWindow: Page): Promise<{
    project: Project;
    collection: Collection;
    entry: Entry;
  }> {
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

    return { project, collection, entry };
  }

  test('names what removing a field would delete, by Entry title, and applies it once confirmed', async ({
    mainWindow,
  }) => {
    const { project, collection, entry } = await removeSubtitleOf(mainWindow);

    await mainWindow.getByRole('button', { name: 'Save' }).click();

    // One dialog, answered in place rather than on the error screen: the
    // question names the Collection, the sentence what the change does.
    const dialog = mainWindow.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Save the changes to the Articles Collection?',
      })
    ).toBeVisible();
    await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(
      'Removing Subtitle deletes its Value from 1 Entry.'
    );

    // What would be lost, by the Entry's own title with a link to it, never by
    // its id, with the Value struck through and said in words beside the line.
    const lost = dialog.getByRole('listitem').filter({ hasText: 'Subtitle' });
    await expect(lost.getByRole('link', { name: 'Launch day' })).toBeVisible();
    await expect(lost).not.toContainText(entry.id);
    // Read out with the Value, so what the line through it means is said in
    // words too. An `sr-only` element keeps a box of its own, which is what
    // tells it from one that is hidden from everybody.
    await expect(lost.getByText('Would be lost:')).toBeVisible();
    await expect(lost.locator('s')).toHaveText('What ships today');

    // Nothing is written until the red button that names the loss is pressed.
    const stillStored = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(stillStored.values['subtitle']).toBeDefined();

    await dialog
      .getByRole('button', { name: 'Remove Subtitle from 1 Entry' })
      .click();

    // The change went in, so the page leaves for the Collection, the stored
    // Collection no longer declares the field and the Entry no longer holds it.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(
      flattenFieldDefinitions(saved.fieldDefinitions).map((found) => found.slug)
    ).toEqual(['title']);
    const storedEntry = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(storedEntry.values['subtitle']).toBeUndefined();
  });

  test('changes nothing when the dialog of a refused change is cancelled', async ({
    mainWindow,
  }) => {
    const { project, collection, entry } = await removeSubtitleOf(mainWindow);

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // The dialog is gone and the settings are still open, so nothing was
    // saved and nothing was lost of what was typed.
    await expect(dialog).toHaveCount(0);
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update$`)
    );
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Subtitle field' })
    ).toHaveCount(0);

    // Leaving any other way asks first, since the change is still unsaved.
    await projectSidebar(mainWindow)
      .getByRole('link', { name: 'Dashboard' })
      .click();
    const discard = mainWindow.locator('[data-slot="discard-changes-dialog"]');
    await expect(
      discard.getByRole('heading', {
        name: 'Discard your changes to Settings of the Articles Collection?',
      })
    ).toBeVisible();
    await discard.getByRole('button', { name: 'Keep editing' }).click();

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

  test('keeps the unsaved settings while an Entry the dialog names is opened', async ({
    mainWindow,
  }) => {
    const { collection } = await removeSubtitleOf(mainWindow);

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await dialog.getByRole('link', { name: 'Launch day' }).click();

    // The link leads straight to the Entry, without asking about the changes:
    // they are kept rather than lost.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/[^/]+/update`)
    );
    await expect(mainWindow.getByRole('alertdialog')).toHaveCount(0);
    await expect(mainWindow.getByLabel('Subtitle')).toHaveValue(
      'What ships today'
    );

    // Coming back through the app, which is how the person gets back: the way
    // the suite arranges a route boots the window, and nothing of what was
    // typed survives a boot, which is what the question before closing the
    // window is for.
    await mainWindow
      .getByRole('link', { name: 'Settings of the Articles Collection' })
      .click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update`)
    );

    // The settings stand as they were left, with the field still removed and
    // Save there to press.
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Title field' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Subtitle field' })
    ).toHaveCount(0);
    await expect(
      mainWindow.getByRole('button', { name: 'Save' })
    ).toBeEnabled();

    // And pressing it asks again, since the same change is still refused.
    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(
      dialog.getByRole('button', { name: 'Remove Subtitle from 1 Entry' })
    ).toBeVisible();
  });

  test('keeps the buttons of a refused change in view at the smallest window, in light and in dark mode', async ({
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
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          isRequired: false,
        }),
      ],
    });
    // Enough Entries for the list of what would go to be longer than the
    // dialog at the smallest window, which is what the body has to scroll.
    for (let number = 1; number <= 20; number++) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: {
          title: stringValue({ en: `Opening hours ${String(number)}` }),
          subtitle: stringValue({ en: 'What ships today' }),
        },
      });
    }

    for (const theme of ['light', 'dark'] as const) {
      // The theme is put on first, since it is applied through the app's own
      // provider and reloads the renderer, which closes the dialog again.
      await setTheme(mainWindow, theme);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await navigateToCollectionSettings(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
      });
      await chooseFieldDefinition(mainWindow, 'Subtitle');
      await mainWindow
        .getByRole('button', { name: 'More for Subtitle' })
        .click();
      await mainWindow.getByRole('menuitem', { name: 'Remove field' }).click();
      const save = mainWindow.getByRole('button', { name: 'Save' });
      await save.click();

      const dialog = mainWindow.getByRole('dialog');
      await expect(
        dialog.getByRole('button', { name: 'Remove Subtitle from 20 Entries' })
      ).toBeVisible();
      await waitForLayout(mainWindow);

      const measured = await mainWindow.evaluate(() => {
        const content = document.querySelector('[data-slot="dialog-content"]');
        const body = document.querySelector(
          '[data-slot="dialog-body"] [data-slot="scroll-area-viewport"]'
        );
        const footer = document.querySelector('[data-slot="dialog-footer"]');
        if (content === null || body === null || footer === null) {
          throw new Error('The dialog did not draw its body and its buttons');
        }

        return {
          window: window.innerHeight,
          dialog: content.getBoundingClientRect().bottom,
          footer: footer.getBoundingClientRect().bottom,
          scrolls: body.scrollHeight > body.clientHeight,
        };
      });

      // The body is what scrolls, so the buttons stand inside the window
      // rather than below its edge.
      expect(measured.scrolls, theme).toBe(true);
      expect(measured.footer, theme).toBeLessThanOrEqual(measured.window);
      expect(measured.dialog, theme).toBeLessThanOrEqual(measured.window);

      // Focus went into the dialog, and Cancel hands it back to the button it
      // was opened from.
      expect(
        await mainWindow.evaluate(
          () =>
            document.activeElement?.closest('[data-slot="dialog-content"]') !==
            null
        ),
        theme
      ).toBe(true);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(save).toBeFocused();
    }
  });

  test('names what narrowing a field would strip, and applies it once confirmed', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const teaser = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    const quote = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Quote' },
      slug: 'quote',
      fieldDefinitions: [
        textFieldDefinition({ slug: 'line', label: { en: 'Line' } }),
      ],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [teaser.id, quote.id] }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        sections: componentValue([
          {
            componentId: quote.id,
            values: { line: stringValue({ en: 'Ship it' }) },
          },
        ]),
      },
    });

    // Taking the Quote out of what the field allows strips the section built
    // from it, which only Core knows about, so the row reads what it says.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const sections = await chooseFieldDefinition(mainWindow, 'Sections');
    await sections
      .getByRole('button', { name: 'Remove Quote from Allowed Components' })
      .click();
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    const dialog = mainWindow.getByRole('dialog');
    const lost = dialog.getByRole('listitem').filter({ hasText: 'Sections' });
    await expect(lost.getByRole('link', { name: 'Launch day' })).toBeVisible();
    await expect(lost.locator('s')).toHaveText('1 section');

    await dialog
      .getByRole('button', { name: 'Delete 1 Value from 1 Entry' })
      .click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const storedEntry = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(storedEntry.values['sections']?.content).toEqual([]);
  });

  test('fills in the Value an Entry needs in the dialog, and saves once it is filled', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Launch day' }) },
    });

    // A field that is required and has no default cannot be filled in by Core,
    // so it asks for a Value per Entry.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await addFieldDefinition(mainWindow, { label: 'Author' });
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(
      'Author needs a Value in 1 Entry.'
    );
    // Nothing would be lost, so the button is the primary Save, and it waits
    // until the Value is there, with the field saying so.
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await expect(
      dialog.getByText("Missing, so the changes can't be saved yet")
    ).toBeVisible();
    // Said in words with the warning icon beside them, so neither the color
    // nor the icon carries it alone.
    await expect(
      dialog.locator('[data-slot="field-warning"] svg').first()
    ).toBeVisible();
    await expect(dialog.getByText('English is missing 1 Value')).toBeVisible();

    // The field stands under the Entry it belongs to, named by its title with
    // a link to it, and is filled in right there.
    const field = dialog.getByLabel('Author in Launch day', { exact: true });
    await expect(
      dialog.getByRole('link', { name: 'Launch day' })
    ).toBeVisible();
    await field.fill('Mara Klein');
    await expect(save).toBeEnabled();
    await save.click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const storedEntry = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(storedEntry.values['author']?.content).toEqual({
      en: 'Mara Klein',
    });
  });

  test('waits for the Value a save that also deletes one needs, and applies both at once', async ({
    mainWindow,
  }) => {
    const { project, collection, entry } = await removeSubtitleOf(mainWindow);

    // One save with both halves at once: Subtitle goes, and an Author that is
    // required and has no default leaves the same Entry without a Value.
    await addFieldDefinition(mainWindow, { label: 'Author' });
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveText(
      'Removing Subtitle deletes its Value from 1 Entry. Author needs a Value in 1 Entry.'
    );

    // The red button names the loss and, like Save, waits until the Value the
    // same change needs is filled in.
    const apply = dialog.getByRole('button', {
      name: 'Remove Subtitle from 1 Entry',
    });
    await expect(apply).toBeDisabled();
    await expect(dialog.getByText('English is missing 1 Value')).toBeVisible();

    // It still takes a click, since it is `aria-disabled` rather than
    // `disabled`, and the press writes nothing.
    await apply.click({ force: true });
    await expect(dialog).toBeVisible();
    const untouched = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(untouched.values['subtitle']).toBeDefined();

    // Once the Value is there, one press carries the loss and the Value.
    await dialog
      .getByLabel('Author in Launch day', { exact: true })
      .fill('Mara Klein');
    await expect(apply).toBeEnabled();
    await apply.click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const applied = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(applied.values['subtitle']).toBeUndefined();
    expect(applied.values['author']?.content).toEqual({ en: 'Mara Klein' });
  });

  test('asks for the Value a refused change needs in every language of the Project', async ({
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
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day', de: 'Starttag' }),
      },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await addFieldDefinition(mainWindow, { label: 'Author' });
    // A label in every language of the Project, so what blocks the save is
    // the Value the change needs rather than a label it is missing.
    await chooseLanguage(mainWindow, 'de');
    await pane.getByLabel('Label', { exact: true }).fill('Autor');
    await chooseLanguage(mainWindow, 'en');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    // Core takes the change only once every language of the Project holds the
    // Value, so one language filled in is not enough and the switch above the
    // rows is what the other is filled in through.
    const dialog = mainWindow.getByRole('dialog');
    const save = dialog.getByRole('button', { name: 'Save' });
    // The row is named in the language the app is read in, as every label is,
    // and holds the Value of the language the switch below the head shows.
    const field = dialog.getByLabel('Author in Launch day', { exact: true });
    await field.fill('Mara Klein');
    await expect(dialog.getByText('German is missing 1 Value')).toBeVisible();
    await expect(save).toBeDisabled();

    // The page behind the dialog carries a switch of its own, so this one is
    // addressed inside the dialog.
    await dialog
      .locator('[data-slot="language-switch"]')
      .getByRole('button', { name: /^DE\b/ })
      .click();
    await expect(field).toHaveValue('');
    await field.fill('Mara Kleinowski');
    await expect(save).toBeEnabled();
    await save.click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const storedEntry = await readEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    expect(storedEntry.values['author']?.content).toEqual({
      en: 'Mara Klein',
      de: 'Mara Kleinowski',
    });
  });

  test('saves a field change Core does not refuse with no dialog', async ({
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
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        subtitle: stringValue({ en: 'What ships today' }),
      },
    });

    // A renamed label and a looser rule reach every Entry without deleting
    // anything, so Core carries them out itself.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Subtitle');
    await pane.getByLabel('Label', { exact: true }).fill('Standfirst');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    await expect(mainWindow.getByRole('dialog')).toHaveCount(0);
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(
      flattenFieldDefinitions(saved.fieldDefinitions).map(
        (found) => found.label.en
      )
    ).toEqual(['Title', 'Standfirst']);
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
    // Nothing is deleted, so Core carries the change out itself and no dialog
    // asks about it.
    await expect(mainWindow.getByRole('dialog')).toHaveCount(0);
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    expect(
      flattenFieldDefinitions(saved.fieldDefinitions).map((found) => found.slug)
    ).toEqual(['title']);
  });

  test('saves removing a field whose Value is empty in every Entry', async ({
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
    // An Entry that holds nothing in the field, which is no loss to Core, so
    // the same removal that is refused for a filled field goes through.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        subtitle: stringValue({ en: null }),
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

    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // Nothing is deleted, so Core carries the change out itself and no dialog
    // asks about it.
    await expect(mainWindow.getByRole('dialog')).toHaveCount(0);
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
    await chooseLanguage(mainWindow, 'de');

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
      mainWindow.getByRole('button', { name: /DE.*missing 4 translations/ })
    ).toBeVisible();

    // Filling German settles each of them, one at a time.
    await chooseLanguage(mainWindow, 'de');
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
        pane
          .getByRole('combobox', { name: 'Type', exact: true })
          .locator('[data-slot="select-value"]'),
        `${fieldType} does not say what it is`
      ).toHaveText(fieldType);
      // A select starts with one option and Core takes none that holds
      // nothing, so the option it is saved with is written here.
      if (fieldType === 'select') {
        await pane.getByLabel('Option 1 label', { exact: true }).fill('High');
      }
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

  test('saves the file types an Asset field takes, as rows with Add and Remove', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // Add offers the file types the Project holds Assets of, rather than every
    // type there is, so the Project needs one.
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({ slug: 'cover', label: { en: 'Cover' } }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Cover');
    // An empty list allows every type, which is what stands in place of rows.
    await expect(pane.getByText('Every file type is allowed.')).toBeVisible();

    await pane.getByRole('button', { name: 'Add file type' }).click();
    await mainWindow.getByRole('menuitem', { name: 'image/png' }).click();
    const remove = pane.getByRole('button', {
      name: 'Remove image/png from File types',
    });
    await expect(remove).toBeVisible();

    // Remove takes the row out again, so the rows are what the field holds.
    await remove.click();
    await expect(pane.getByText('Every file type is allowed.')).toBeVisible();
    await pane.getByRole('button', { name: 'Add file type' }).click();
    await mainWindow.getByRole('menuitem', { name: 'image/png' }).click();
    await expect(remove).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // The row reaches Core as the file type itself, which is what a field
    // restricted to it is saved with.
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const cover = flattenFieldDefinitions(saved.fieldDefinitions).find(
      (found) => found.slug === 'cover'
    );
    expect(
      cover !== undefined && 'ofAssetMimeTypes' in cover
        ? cover.ofAssetMimeTypes
        : null
    ).toEqual(['image/png']);
  });

  test('writes a slug from a field beside it, and never from itself', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const title = textFieldDefinition();
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [title, slugFieldDefinition()],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const pane = await chooseFieldDefinition(mainWindow, 'Handle');
    await expect(
      pane.getByText('Editors write the slug themselves while this is empty.')
    ).toBeVisible();

    await pane.getByRole('button', { name: 'Add a field' }).click();
    // It offers the text field beside it. A slug written from itself is one
    // Core refuses, so it is never offered.
    await expect(
      mainWindow.getByRole('menuitem', { name: 'Handle' })
    ).toHaveCount(0);
    await mainWindow.getByRole('menuitem', { name: 'Title' }).click();
    await expect(
      pane.getByRole('button', { name: 'Remove Title from Made from' })
    ).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // The source reaches Core as the field's own id, which is what Core
    // matches a definition by.
    const saved = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const handle = flattenFieldDefinitions(saved.fieldDefinitions).find(
      (found) => found.slug === 'handle'
    );
    expect(
      handle !== undefined && 'ofFieldDefinitions' in handle
        ? handle.ofFieldDefinitions
        : null
    ).toEqual([title.id]);
  });

  test('says a slug another Collection already uses below the Collection slug', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // The Collection that already holds the slug this one is given.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, settingsOf);
    await addFieldDefinition(mainWindow, { label: 'Title' });
    const settings = mainWindow.getByRole('main');
    const create = settings.getByRole('button', { name: 'Create Collection' });
    await create.click();

    // Core answers a taken slug as a Conflict, which arrives after the submit
    // rather than from the resolver, and it belongs below the field it is
    // about rather than on the error screen.
    await expect(
      mainWindow.getByText(
        'Another Collection in this Project already uses this slug. Choose another one.'
      )
    ).toBeVisible();
    await expect(
      settings.getByLabel('Collection slug', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(errorScreenTitle(mainWindow)).toHaveCount(0);
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/create/
    );

    // Another slug leaves nothing in the way, so the same page saves.
    await settings
      .getByLabel('Collection slug', { exact: true })
      .fill('guides');
    await settings.getByLabel('Entry slug', { exact: true }).fill('guide');
    await create.click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  test('says a slug another Collection already uses when the settings are saved', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Guide' }, plural: { en: 'Guides' } },
      slug: { singular: 'guide', plural: 'guides' },
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
      .getByLabel('Collection slug', { exact: true })
      .fill('guides');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    // Core answers this save and a field change it cannot carry out alone with
    // the same Conflict, and the cause it attaches is what tells them apart.
    // A taken slug stands below its own field, never in the dialog the other
    // arm opens.
    await expect(
      mainWindow.getByText(
        'Another Collection in this Project already uses this slug. Choose another one.'
      )
    ).toBeVisible();
    await expect(
      settings.getByLabel('Collection slug', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(mainWindow.getByRole('dialog')).toHaveCount(0);
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/update`)
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
    // The failure was not swallowed by the dialog built for the one refusal
    // this form answers in place.
    await expect(
      mainWindow.getByText('Save the changes to the Articles Collection?')
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

    for (const theme of ['light', 'dark'] as const) {
      // The theme is put on first, since it is applied through the app's own
      // provider and reloads the renderer, which closes the pane again.
      await setTheme(mainWindow, theme);
      await navigateToCollectionSettings(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
      });
      // With the pane of a chosen field open, which is the widest the screen
      // gets.
      await chooseFieldDefinition(mainWindow, 'Teaser');
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await waitForLayout(mainWindow);

      const measured = await mainWindow.evaluate(() => {
        const panel = document.querySelector('[data-slot="panel"]');
        // The panes of this screen, not the one the Project's layout draws
        // around whatever is open.
        const panes = Array.from(
          document.querySelectorAll('[data-slot="panes"] > [data-slot="pane"]')
        );
        if (panel === null || panes.length < 2) {
          throw new Error('The settings did not draw their panes');
        }
        const [form, side] = panes.map((pane) => pane.getBoundingClientRect());
        // ci puts the Collection slug beside the Entry slug and stacks a pair
        // only below the room its own measure names, which is the room the
        // editor has rather than the width of the window.
        const slugs = Array.from(
          panes[0]?.querySelectorAll('[data-slot="field"]') ?? []
        )
          .filter((field) =>
            ['Collection slug', 'Entry slug'].includes(
              field
                .querySelector('[data-slot="field-label"]')
                ?.textContent?.trim() ?? ''
            )
          )
          .map((field) => field.getBoundingClientRect());
        const [collectionSlug, entrySlug] = slugs;
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
          slugsSideBySide:
            collectionSlug !== undefined &&
            entrySlug !== undefined &&
            Math.round(collectionSlug.y) === Math.round(entrySlug.y) &&
            Math.round(collectionSlug.x) !== Math.round(entrySlug.x),
        };
      });

      expect(measured.clipped, `${theme} mode clips a pane`).toBe(false);
      expect(measured.fitsTheWindow, `${theme} mode overflows`).toBe(true);
      expect(measured.collides, `${theme} mode makes the panes overlap`).toBe(
        false
      );
      // ci's pane of 296 px, whatever the window does.
      expect(measured.sidePaneWidth).toBe(296);
      expect(
        measured.slugsSideBySide,
        `${theme} mode stacks the two slugs where ci puts them side by side`
      ).toBe(true);
    }
  });
});

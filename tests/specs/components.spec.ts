import { expect } from '@playwright/test';

import { uuid } from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import {
  addFieldDefinition,
  createCollectionViaIpc,
  dynamicFieldDefinition,
  openAddFieldSheet,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createComponentViaIpc,
  navigateToComponent,
  navigateToComponentCreate,
  navigateToComponents,
  readComponentViaIpc,
  updateComponentViaIpc,
} from '../helpers/component.js';
import { confirmDialog, dismissDialog } from '../helpers/dialog.js';
import {
  componentValue,
  createEntryViaIpc,
  listEntriesViaIpc,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import { stubCoreRejectWithType } from '../helpers/ipc.js';
import { createProjectViaIpc, navigateToHistory } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

/** The route of one Component's configure page, by its uuid segment. */
const componentRoute = /#\/projects\/[^/]+\/components\/[0-9a-f-]{36}$/;

test.describe('Components', () => {
  test('creates a Component with a field through the form and lists it by name', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigateToComponentCreate(mainWindow, project.id);
    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Teaser');
    await mainWindow
      .getByLabel('Component slug', { exact: true })
      .fill('teaser');
    await addFieldDefinition(mainWindow, {
      label: 'Headline',
      description: 'The headline of the teaser',
      owner: 'component',
    });

    await mainWindow.getByRole('button', { name: 'Create Component' }).click();
    // A uuid detail route (never 'create') means Core accepted the Component
    // with its field definition. Core owns file and commit correctness.
    await expect(mainWindow).toHaveURL(componentRoute);

    // The list names it by the name somebody gave it, not by its id.
    await navigateToComponents(mainWindow, project.id);
    await expect(
      mainWindow.getByRole('link', { name: /Teaser/ })
    ).toBeVisible();
  });

  test('says on the Component screens what they cannot do yet, and offers no slug field or uniqueness', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToComponentCreate(mainWindow, project.id);

    // An editor has to learn before building a Component that a field cannot be
    // revised afterwards, so it stands on the screen rather than being found by
    // trying. See contributing/not-yet-implemented.md.
    await expect(
      mainWindow.getByText(
        'Changing a field after it was added is not possible yet, so check its Label and Slug first.'
      )
    ).toBeVisible();

    // Core forbids a slug field and uniqueness inside a Component, so neither is
    // offered and then refused on save.
    const sheet = await openAddFieldSheet(mainWindow, 'text', 'component');
    await expect(sheet.getByRole('switch', { name: 'Unique' })).toBeDisabled();
    await expect(
      sheet.getByText(
        'Fields of a Component cannot be unique, since the same Component is used in more than one place.'
      )
    ).toBeVisible();

    await sheet.getByRole('combobox').first().click();
    await expect(
      mainWindow.getByRole('option', { name: 'slug', exact: true })
    ).toBeDisabled();
  });

  test('says a slug another Component already uses below the Slug field', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createComponentViaIpc(mainWindow, { projectId: project.id });

    await navigateToComponentCreate(mainWindow, project.id);
    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Another teaser');
    const slugField = mainWindow.getByLabel('Component slug', { exact: true });
    await slugField.fill('teaser');
    await addFieldDefinition(mainWindow, {
      label: 'Headline',
      description: 'The headline of the teaser',
      owner: 'component',
    });

    await mainWindow.getByRole('button', { name: 'Create Component' }).click();

    // Core only answers a taken slug as a Conflict, so it arrives after the
    // submit rather than from the resolver. It belongs below the field it is
    // about, as ci's Desktop rules require of a field that is wrong.
    await expect(
      mainWindow.getByText(
        'Another Component in this Project already uses this slug. Choose another one.'
      )
    ).toBeVisible();
    await expect(slugField).toHaveAttribute('aria-invalid', 'true');
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/components\/create$/
    );
  });

  test('saves a renamed Component and says what the save reaches', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        sections: componentValue([]),
      },
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');

    // Which Collections and how many Entries the save reaches is said before it
    // is pressed, because Core rewrites them in the same commit.
    await expect(
      mainWindow.getByText('Saving reaches 1 Collection and 1 Entry.')
    ).toBeVisible();
    await expect(mainWindow.getByText('Articles, 1 Entry')).toBeVisible();

    // Nothing edited yet, so Save is gated
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Promo');
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // Redirecting to the list is how Core's success surfaces, and a reload
    // re-reads from Core rather than an optimistic cache entry.
    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/components$/);
    await navigateToComponents(mainWindow, project.id);
    await expect(mainWindow.getByRole('link', { name: /Promo/ })).toBeVisible();
  });

  test('deletes a Component nothing uses and removes it from the list', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await mainWindow.getByRole('button', { name: 'Delete Component' }).click();
    await confirmDialog(mainWindow, 'Yes, delete this Component');

    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/components$/);
    await expect(mainWindow.getByText('No Components yet')).toBeVisible();
  });

  test('refuses deleting a Component a Collection still uses, in place', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await mainWindow.getByRole('button', { name: 'Delete Component' }).click();
    await confirmDialog(mainWindow, 'Yes, delete this Component');

    // The Conflict is surfaced in place rather than through the root error
    // boundary (the fixture's console check backs this up: an error reaching the
    // boundary would log and fail the run). The description reflects the
    // preserved CoreError type, not Core's raw message.
    await expect(
      mainWindow.getByText('Could not delete this Component')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('still uses this Component')
    ).toBeVisible();
    await dismissDialog(mainWindow);
    await expect(mainWindow).toHaveURL(componentRoute);
  });

  test('refuses a Component that would use itself, in place', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');

    // The allowed Components picker carries each Component's name as its
    // accessible name, so toggling "Teaser" on the Teaser Component's own
    // dynamic field stores its real id and makes the reference circular.
    const sheet = await openAddFieldSheet(mainWindow, 'dynamic', 'component');
    await sheet.getByLabel('Label', { exact: true }).fill('Sections');
    const allowed = sheet.getByRole('switch', { name: 'Teaser', exact: true });
    await allowed.click();
    await expect(allowed).toBeChecked();
    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    await expect(sheet).toBeHidden();

    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // Core answers a circular reference with BadRequest, which has no field to
    // land on, so it is said in place rather than reaching the boundary.
    await expect(
      mainWindow.getByText('Could not save this Component')
    ).toBeVisible();
    await expect(
      mainWindow.getByText(
        'A Component cannot use itself, not directly and not through another Component. Change which Components its dynamic Field allows and try again.'
      )
    ).toBeVisible();
    await dismissDialog(mainWindow);
    await expect(mainWindow).toHaveURL(componentRoute);
  });

  test('fills, reorders and removes the sections of a page', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'headline', label: { en: 'Headline' } }),
      ],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow.getByLabel('Title', { exact: true }).fill('Home');

    // No section yet, so the field says so instead of looking broken.
    await expect(
      mainWindow.getByText('No sections yet. Add one to start building')
    ).toBeVisible();

    // A section is added from the Components the field allows, each named by its
    // own name in the menu.
    const addSection = mainWindow.getByRole('button', { name: 'Add section' });
    await addSection.click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(mainWindow.getByText('Section 1 of 1')).toBeVisible();
    await mainWindow.getByLabel('Headline', { exact: true }).fill('First');

    await addSection.click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(mainWindow.getByText('Section 2 of 2')).toBeVisible();
    await mainWindow
      .getByLabel('Headline', { exact: true })
      .nth(1)
      .fill('Second');

    // Reordering works without dragging, as WCAG 2.1.1 asks. Moving the second
    // section up swaps the two headlines.
    await mainWindow
      .getByRole('button', { name: 'Move the Teaser section up' })
      .nth(1)
      .click();
    await expect(
      mainWindow.getByLabel('Headline', { exact: true }).first()
    ).toHaveValue('Second');

    // A third section is added and removed again, so the remove path is driven
    // too and the Entry is saved with the two that are left.
    await addSection.click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(mainWindow.getByText('Section 3 of 3')).toBeVisible();
    await mainWindow
      .getByRole('button', { name: 'Remove the Teaser section' })
      .nth(2)
      .click();
    await expect(mainWindow.getByText('Section 2 of 2')).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // Reading the Entry back through its own form proves what Core stored: the
    // two sections that are left, in the order the move put them in.
    const entries = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const created = entries[0];
    if (created === undefined) {
      throw new Error('Expected the created Entry to be listed');
    }
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: created.id,
    });
    const headlines = mainWindow.getByLabel('Headline', { exact: true });
    await expect(headlines).toHaveCount(2);
    await expect(headlines.first()).toHaveValue('Second');
    await expect(headlines.nth(1)).toHaveValue('First');
  });

  test('opens an Entry whose Collection holds a dynamic field, and shows its sections', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'headline', label: { en: 'Headline' } }),
      ],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Home' }),
        sections: componentValue([
          {
            componentId: component.id,
            values: { headline: stringValue({ en: 'Welcome' }) },
          },
        ]),
      },
    });

    // Seeding a default Value for a dynamic field used to throw while the form
    // was initialized, which took the whole screen to the root error boundary.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(mainWindow.getByText('Teaser', { exact: true })).toBeVisible();
    await expect(
      mainWindow.getByLabel('Headline', { exact: true })
    ).toHaveValue('Welcome');
  });

  test('keeps an Entry section Value when the Component is saved again, and when a field slug is renamed', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const headline = textFieldDefinition({
      id: uuid(),
      slug: 'headline',
      label: { en: 'Headline' },
    });
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [headline],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Home' }),
        sections: componentValue([
          {
            componentId: component.id,
            values: { headline: stringValue({ en: 'Welcome' }) },
          },
        ]),
      },
    });

    // Saving the Component again sends its stored field definitions back with
    // their ids. A new id would read as a removal plus an addition, which Core
    // refuses as a content loss, so a successful save is what proves the id
    // round-tripped through the form.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    // Optional, so Core can carry the addition into the Entry on its own. A
    // required field with no default is what it refuses, which the next test
    // drives on purpose.
    await addFieldDefinition(mainWindow, {
      label: 'Subline',
      description: 'The subline of the teaser',
      isRequired: false,
      owner: 'component',
    });
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/components$/);

    const saved = await readComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: component.id,
    });
    expect(saved.fieldDefinitions[0]?.id).toBe(headline.id);

    // Renaming the slug while keeping the id moves the Value to the new slug,
    // which the Entry's own form is where an editor sees it survive.
    await updateComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: component.id,
      name: saved.name,
      slug: saved.slug,
      description: saved.description,
      fieldDefinitions: saved.fieldDefinitions.map((definition) =>
        definition.id === headline.id
          ? { ...definition, slug: 'title-line' }
          : definition
      ),
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(
      mainWindow.getByLabel('Headline', { exact: true })
    ).toHaveValue('Welcome');
  });

  test('names the Entry to fix when a Field change cannot be carried out, and writes no commit', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'headline', label: { en: 'Headline' } }),
        textFieldDefinition({
          slug: 'subline',
          label: { en: 'Subline' },
          isRequired: false,
        }),
      ],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Home' }),
        sections: componentValue([
          {
            componentId: component.id,
            values: {
              headline: stringValue({ en: 'Welcome' }),
              subline: stringValue({ en: 'What ships today' }),
            },
          },
        ]),
      },
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    await mainWindow
      .getByRole('button', { name: 'Remove the Subline field' })
      .click();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // Core's Conflict carries the Entries it could not carry the change into,
    // which now crosses the IPC boundary, so the screen names the Entry to fix
    // rather than only that something conflicts.
    await expect(
      mainWindow.getByText('Could not save this Component')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('dialog').getByText(entry.id)
    ).toBeVisible();
    await expect(
      mainWindow
        .getByRole('dialog')
        .getByText('would lose what it holds in this Field')
    ).toBeVisible();
    await dismissDialog(mainWindow);
    await expect(mainWindow).toHaveURL(componentRoute);

    // The Project got no commit for the refused update: the History lists the
    // three creates that arranged this test and no Component update.
    await navigateToHistory(mainWindow, project.id);
    await expect(
      mainWindow.getByRole('link', { name: /create component/i })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: /update component/i })
    ).toHaveCount(0);

    // Re-reading the Component from Core shows the old model, with the Field
    // still on it, and the Entry still holds its Value.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByRole('button', { name: 'Remove the Subline field' })
    ).toBeVisible();
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Subline')).toHaveValue(
      'What ships today'
    );
  });

  test('shows a Component change in the History by the name somebody gave it', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Pull quote' },
      slug: 'pull-quote',
    });

    await navigateToHistory(mainWindow, project.id);
    await mainWindow
      .getByRole('link', { name: /create component/i })
      .first()
      .click();

    // The change is drawn with the editor's own form, read-only, so the
    // Component appears by its name and never as a bare id.
    await expect(mainWindow.getByText('Created')).toBeVisible();
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Pull quote');
  });

  // The save-blocked dialog handles Conflict and BadRequest in place, so every
  // other failure must reach the root error boundary. This also proves the
  // error's message survives an encoding that now carries a cause: Core set
  // none here, and the boundary still shows the message rather than nothing.
  test('routes an unexpected Component save failure to the root error boundary with its message', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Promo');

    await stubCoreRejectWithType(
      electronApp,
      'core:components:update',
      'Internal'
    );
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('E2E injected Internal failure')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Could not save this Component')
    ).toBeHidden();
  });
});

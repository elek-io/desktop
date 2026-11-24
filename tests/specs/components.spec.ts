import { expect } from '@playwright/test';

import {
  uuid,
  type DynamicFieldDefinition,
  type FieldDefinition,
  type FieldDefinitionGroup,
} from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import {
  addFieldDefinition,
  createCollectionViaIpc,
  dynamicFieldDefinition,
  navigateToCollectionSettings,
  chooseFieldDefinition,
  openFieldTypes,
  readCollectionViaIpc,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  chooseComponent,
  componentListPane,
  componentRow,
  createComponentViaIpc,
  fillComponentForm,
  listComponentsViaIpc,
  navigateToComponent,
  navigateToComponentCreate,
  navigateToComponents,
  openDeleteComponent,
  readComponentViaIpc,
  saveComponent,
  updateComponentViaIpc,
} from '../helpers/component.js';
import { dismissDialog } from '../helpers/dialog.js';
import {
  chooseLanguage,
  componentValue,
  createEntryViaIpc,
  listEntriesViaIpc,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import { errorScreenTitle } from '../helpers/error.js';
import {
  recordCoreCallProps,
  recordedCoreCallProps,
  stubCoreRejectWithType,
  stubCoreResolve,
} from '../helpers/ipc.js';
import { recordedLogs, recordLogsViaIpc } from '../helpers/log.js';
import { mainPanel, navigate, projectSidebar } from '../helpers/navigation.js';
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

/** The route of one Component's configure page, by its uuid segment. */
const componentRoute = /#\/projects\/[^/]+\/components\/[0-9a-f-]{36}$/;

/**
 * The one dynamic Field of a stored Collection or Component, read back to
 * assert which Components it allows and that it kept its id. A group holds no
 * Field the editor can edit, so only the top level is searched.
 */
function dynamicFieldOf(
  fieldDefinitions: readonly (FieldDefinition | FieldDefinitionGroup)[]
): DynamicFieldDefinition {
  const found = fieldDefinitions.find(
    (definition): definition is DynamicFieldDefinition =>
      'isGroup' in definition === false && definition.fieldType === 'dynamic'
  );
  if (found === undefined) {
    throw new Error('Expected a dynamic Field definition to be stored');
  }
  return found;
}

test.describe('Components', () => {
  test('creates a Component with a field through the form and lists it by name', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigateToComponentCreate(mainWindow, project.id);

    // The sidebar's Components row carries Core's number, so it stands at zero
    // while the Project has none.
    await expect(
      projectSidebar(mainWindow).getByRole('link', {
        name: /^Components\s*0$/,
      })
    ).toBeVisible();

    // The same page as a Component that exists, titled by what it is about and
    // empty of fields.
    await expect(
      mainWindow.getByRole('heading', { name: 'Create Component' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('main').getByLabel('Component name', { exact: true })
    ).toHaveValue('');
    await expect(
      mainWindow.getByRole('button', { name: /^Settings of the/ })
    ).toHaveCount(0);

    await fillComponentForm(mainWindow, { name: 'Teaser', slug: 'teaser' });
    await addFieldDefinition(mainWindow, {
      label: 'Headline',
      description: 'The headline of the teaser',
    });

    await mainWindow.getByRole('button', { name: 'Create Component' }).click();
    // A uuid detail route (never 'create') means Core accepted the Component
    // with its field definition. Core owns file and commit correctness.
    await expect(mainWindow).toHaveURL(componentRoute);

    // The row follows the create without the Project being opened again.
    await expect(
      projectSidebar(mainWindow).getByRole('link', {
        name: /^Components\s*1$/,
      })
    ).toBeVisible();

    // The list beside it names it by the name somebody gave it, not by its id,
    // and the row it opened is the one marked current, to a screen reader as
    // well as by its surface.
    await expect(componentRow(mainWindow, 'Teaser')).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(componentRow(mainWindow, 'Teaser')).toHaveAttribute(
      'data-active',
      'true'
    );
    await navigateToComponents(mainWindow, project.id);
    await expect(componentRow(mainWindow, 'Teaser')).toBeVisible();
  });

  test('offers no slug field inside a Component, and locks uniqueness there', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToComponentCreate(mainWindow, project.id);

    // Core forbids a slug field and uniqueness inside a Component, so neither
    // is offered and then refused on save.
    const types = await openFieldTypes(mainWindow);
    await expect(
      types.getByRole('button', { name: 'slug', exact: true })
    ).toHaveCount(0);
    await expect(
      types.getByRole('button', { name: 'text', exact: true })
    ).toBeVisible();

    const pane = await addFieldDefinition(mainWindow, { label: 'Headline' });
    await expect(pane.getByRole('checkbox', { name: 'Unique' })).toBeDisabled();
    await expect(
      pane.getByText(
        "A Component's fields can't be unique, since one Component is used in more than one place."
      )
    ).toBeVisible();
    // And the Type picker never offers it either, so a field cannot be taken
    // there after it exists.
    await pane.getByRole('combobox', { name: 'Type' }).click();
    await expect(
      mainWindow.getByRole('option', { name: 'slug', exact: true })
    ).toHaveCount(0);
  });

  test('says a slug another Component already uses below the Slug field', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createComponentViaIpc(mainWindow, { projectId: project.id });

    await navigateToComponentCreate(mainWindow, project.id);
    await fillComponentForm(mainWindow, {
      name: 'Another teaser',
      slug: 'teaser',
    });
    const slugField = mainWindow
      .getByRole('main')
      .getByLabel('Component slug', { exact: true });
    await addFieldDefinition(mainWindow, {
      label: 'Headline',
      description: 'The headline of the teaser',
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

  // ci's Components screen: a list of 296 px with each Component, how many
  // Entries use it and how many fields it has, next to the chosen Component,
  // laid out like a Collection's settings with a field's settings on the right.
  test('lists every Component with how many Entries use it and how many fields it has', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const used = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({ slug: 'subline', label: { en: 'Subline' } }),
      ],
    });
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Gallery' },
      slug: 'gallery',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [used.id] }),
      ],
    });
    // One Entry holds a section built from the Component and one holds none,
    // so the row says how many Entries use it rather than how many Entries the
    // Collection has.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        sections: componentValue([
          {
            componentId: used.id,
            values: {
              title: stringValue({ en: 'A section' }),
              subline: stringValue({ en: 'Its subline' }),
            },
          },
        ]),
      },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'No sections here' }),
        sections: componentValue([]),
      },
    });

    await navigateToComponents(mainWindow, project.id);

    // The head says how many there are, and each row what it is used in.
    await expect(
      componentListPane(mainWindow).getByRole('heading', {
        name: /^Components\s*2$/,
      })
    ).toBeVisible();
    await expect(componentRow(mainWindow, 'Teaser')).toContainText(
      '1 Entry uses it, 2 fields'
    );
    await expect(componentRow(mainWindow, 'Gallery')).toContainText(
      'Not used yet, 1 field'
    );

    // Nothing is open beside the list until a Component is chosen.
    await expect(mainWindow.getByText('No Component chosen')).toBeVisible();

    await chooseComponent(mainWindow, 'Teaser');
    await expect(
      mainWindow.getByRole('heading', {
        name: 'Settings of the Teaser Component',
      })
    ).toBeVisible();
    // Laid out like a Collection's settings: its own fields, then the fields
    // it defines, with the chosen field's settings in the pane on the right.
    await expect(
      mainWindow.getByRole('main').getByLabel('Component slug', { exact: true })
    ).toHaveValue('teaser');
    await expect(
      mainWindow.getByRole('heading', {
        name: "Define this Component's fields",
      })
    ).toBeVisible();
    const pane = await chooseFieldDefinition(mainWindow, 'Subline');
    await expect(pane.getByLabel('Label', { exact: true })).toHaveValue(
      'Subline'
    );
  });

  // ci's list stands in the order of the names it shows. Core answers in the
  // order the uuid folders sit on disk, which nobody set and which differs
  // from Project to Project, so the list is handed the Components in the worst
  // order there is here: their names backwards.
  test('lists the Components by name, whatever order Core answers in', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const made = new Map<string, string>();
    // Two of them carry the same name, which Core allows, since only the slug
    // has to be unique. The name alone leaves their order open, so the slug is
    // what settles it.
    for (const { name, slug } of [
      { name: 'Hero', slug: 'hero' },
      { name: 'Call to action', slug: 'call-to-action' },
      { name: 'Hero', slug: 'hero-wide' },
      { name: 'Opening hours', slug: 'opening-hours' },
      { name: 'Gallery', slug: 'gallery' },
    ]) {
      const component = await createComponentViaIpc(mainWindow, {
        projectId: project.id,
        name: { en: name },
        slug,
      });
      made.set(slug, component.id);
    }

    // Handed to the list in the worst order there is: by name and slug
    // backwards.
    const listed = await listComponentsViaIpc(mainWindow, project.id);
    await stubCoreResolve(electronApp, 'core:components:list', {
      ...listed,
      list: [...listed.list]
        .sort((one, other) =>
          `${one.name.en ?? ''}|${one.slug}`.localeCompare(
            `${other.name.en ?? ''}|${other.slug}`
          )
        )
        .reverse(),
    });
    await navigateToComponents(mainWindow, project.id);

    await expect(componentRow(mainWindow, 'Gallery')).toBeVisible();
    const names = await componentListPane(mainWindow)
      .locator('[data-slot="component-name"]')
      .allTextContents();
    expect(names).toEqual([
      'Call to action',
      'Gallery',
      'Hero',
      'Hero',
      'Opening hours',
    ]);

    // Which of the two Hero rows stands first, read off what each row opens,
    // since their names cannot tell them apart.
    const opens = await componentListPane(mainWindow)
      .locator('[data-slot="component-row"]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));
    expect(opens[2]).toContain(made.get('hero'));
    expect(opens[3]).toContain(made.get('hero-wide'));
  });

  // How many Entries use each Component is the one read this list makes of its
  // own. The Components were read when it fails, so the list stays a list and
  // each row says what it cannot tell rather than the pane saying the
  // Components could not be read.
  test('names every Component and opens it while how many Entries use them cannot be read', async ({
    electronApp,
    mainWindow,
  }) => {
    test.setTimeout(120000);

    await recordLogsViaIpc(electronApp);
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const used = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Gallery' },
      slug: 'gallery',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [used.id] }),
      ],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        sections: componentValue([
          {
            componentId: used.id,
            values: { title: stringValue({ en: 'A section' }) },
          },
        ]),
      },
    });

    await stubCoreRejectWithType(electronApp, 'core:entries:list', 'Internal');
    await navigateToComponents(mainWindow, project.id);

    // Every Component is named, with how many fields it has, which is read off
    // the Component itself. It takes the retries of the Entries' own query to
    // get there, which is why the first row waits.
    await expect(componentRow(mainWindow, 'Teaser')).toContainText(
      "Can't read how many Entries use it, 1 field",
      { timeout: 25000 }
    );
    // And no row says a count it does not have, in either direction: what
    // stands in place of the count is the whole of what each row says below
    // its name.
    expect(
      await componentListPane(mainWindow)
        .locator('[data-slot="component-use"]')
        .allTextContents()
    ).toEqual([
      "Can't read how many Entries use it, 1 field",
      "Can't read how many Entries use it, 1 field",
    ]);
    await expect(
      componentListPane(mainWindow).getByRole('heading', {
        name: /^Components\s*2$/,
      })
    ).toBeVisible();

    // The pane says neither that the Components could not be read nor takes
    // the window to the error screen.
    await expect(
      mainWindow.getByText("Desktop can't read the Components of this Project.")
    ).toBeHidden();
    await expect(errorScreenTitle(mainWindow)).toBeHidden();

    // And a row still opens the Component it names.
    await chooseComponent(mainWindow, 'Teaser');
    await expect(mainWindow).toHaveURL(componentRoute);
    await expect(
      mainWindow.getByRole('heading', {
        name: 'Settings of the Teaser Component',
      })
    ).toBeVisible();

    // The failure is in the log file with its type, the way a pane's boundary
    // writes one, so a read the list answered itself is never only on screen.
    const logged = (await recordedLogs(electronApp)).filter((record) =>
      record.message.startsWith('Component usage error:')
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(logged[0]?.level).toBe('error');
    expect(logged[0]?.meta['error.type']).toBe('Internal');
  });

  // Only a Collection whose fields embed a Component at all can hold a section
  // built from one, so the Entries of every other Collection are never read
  // for the counts. What the list hands Core is recorded while Core keeps
  // answering, so the counts the rows show are the real ones.
  test('reads the Entries of the Collection that embeds a Component, and of no other', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    const holder = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    // One Collection that embeds nothing, so no Entry of it can hold a
    // section.
    const plain = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Note' }, plural: { en: 'Notes' } },
      slug: { singular: 'note', plural: 'notes' },
      fieldDefinitions: [textFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: holder.id,
      values: {
        title: stringValue({ en: 'Launch day' }),
        sections: componentValue([
          {
            componentId: component.id,
            values: { title: stringValue({ en: 'A section' }) },
          },
        ]),
      },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: plain.id,
      values: { title: stringValue({ en: 'Just a note' }) },
    });

    await recordCoreCallProps(electronApp, 'core:entries:list');
    await navigateToComponents(mainWindow, project.id);
    await expect(componentRow(mainWindow, 'Teaser')).toContainText(
      '1 Entry uses it'
    );

    const read = (await recordedCoreCallProps(electronApp)).map((props) =>
      typeof props === 'object' && props !== null && 'collectionId' in props
        ? props.collectionId
        : null
    );
    expect(read).toContain(holder.id);
    expect(read).not.toContain(plain.id);
  });

  test('saves a renamed Component from its one Save and keeps it chosen', async ({
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
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');

    // One Save, and nothing edited yet, so it is blocked.
    const save = mainWindow.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toHaveCount(1);
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    await settings.getByLabel('Component name', { exact: true }).fill('Promo');
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await saveComponent(mainWindow, 'Promo');

    // The Component stays chosen beside its list, with nothing left unsaved.
    await expect(mainWindow).toHaveURL(componentRoute);
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(componentRow(mainWindow, 'Promo')).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(componentRow(mainWindow, 'Promo')).toHaveAttribute(
      'data-active',
      'true'
    );

    // Read back from Core, so this is what was written rather than what the
    // cache held.
    const saved = await readComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: component.id,
    });
    expect(saved.name.en).toBe('Promo');
  });

  test('holds Delete Component in the More menu, and asks before it deletes', async ({
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
      projectSidebar(mainWindow).getByRole('link', {
        name: /^Components\s*1$/,
      })
    ).toBeVisible();
    // Nothing on the screen deletes until the More menu is opened, so Delete
    // is never a press away from Save.
    await expect(
      mainWindow.getByRole('button', { name: 'Delete Component' })
    ).toHaveCount(0);

    // The dialog names what goes and who it reaches, and Cancel changes
    // nothing.
    let confirm = await openDeleteComponent(mainWindow, 'Teaser');
    await expect(
      confirm.getByText(
        'It goes for everyone on this Project once you sync, in every language.'
      )
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(mainWindow).toHaveURL(componentRoute);
    expect(
      await readComponentViaIpc(mainWindow, {
        projectId: project.id,
        id: component.id,
      })
    ).toBeDefined();

    // The red button names what goes, and only then is it gone.
    confirm = await openDeleteComponent(mainWindow, 'Teaser');
    await confirm
      .getByRole('button', { name: 'Delete Component', exact: true })
      .click();

    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/components$/);
    await expect(mainWindow.getByText('No Components yet')).toBeVisible();

    // And the sidebar's row follows the delete too.
    await expect(
      projectSidebar(mainWindow).getByRole('link', {
        name: /^Components\s*0$/,
      })
    ).toBeVisible();
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
    const confirm = await openDeleteComponent(mainWindow, 'Teaser');
    await confirm
      .getByRole('button', { name: 'Delete Component', exact: true })
      .click();

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

  test('blocks Save while a language misses a text and says which misses how many', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition({ label: { en: 'Headline' } })],
    });
    // Adding a language touches only the Project file, so the Component keeps
    // its English-only texts, which is exactly the state an editor lands in.
    await addProjectLanguageViaIpc(mainWindow, project, 'de');

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');

    // The name and the field's label are missing in German.
    const save = mainWindow.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(
      mainWindow.getByText('German is missing 2 translations')
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
      mainWindow.getByRole('button', { name: /DE.*missing 2 translations/ })
    ).toBeVisible();

    // Filling German settles each of them, one at a time.
    await chooseLanguage(mainWindow, 'de');
    await settings
      .getByLabel('Component name', { exact: true })
      .fill('Anreisser');
    await expect(
      mainWindow.getByText('German is missing 1 translation')
    ).toBeVisible();
    const pane = await chooseFieldDefinition(mainWindow, 'Headline');
    await pane.getByLabel('Label', { exact: true }).fill('Überschrift');

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    // The toast names the Component in the language the app is read in, which
    // is English, so it is the English name that stands in it.
    await saveComponent(mainWindow, 'Teaser');
  });

  test('asks before the next Component in the list takes what nobody saved', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Gallery' },
      slug: 'gallery',
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    const settings = mainWindow.getByRole('main');
    await expect(
      settings.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    await settings.getByLabel('Component name', { exact: true }).fill('Promo');

    // The list beside the settings puts the next Component one click away, so
    // that click must not lose what was typed.
    await chooseComponent(mainWindow, 'Gallery');
    const asked = mainWindow.getByRole('alertdialog', {
      name: 'Discard your changes to Settings of the Teaser Component?',
    });
    await expect(asked).toBeVisible();
    await asked.getByRole('button', { name: 'Keep editing' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/components/${component.id}`)
    );
    await expect(
      settings.getByLabel('Component name', { exact: true })
    ).toHaveValue('Promo');

    await chooseComponent(mainWindow, 'Gallery');
    await mainWindow
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(
      mainWindow.getByRole('heading', {
        name: 'Settings of the Gallery Component',
      })
    ).toBeVisible();
  });

  test('marks the chosen Component current and fits the smallest window, in light and in dark mode', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        textFieldDefinition({ slug: 'subline', label: { en: 'Subline' } }),
      ],
    });
    // A second Component, so the chosen row's own surface can be measured
    // against a row nobody chose.
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Gallery' },
      slug: 'gallery',
    });

    for (const theme of ['light', 'dark'] as const) {
      // The theme is put on first, since it is applied through the app's own
      // provider and reloads the renderer, which closes the pane again.
      await setTheme(mainWindow, theme);
      await navigateToComponent(mainWindow, {
        projectId: project.id,
        componentId: component.id,
      });
      // With the pane of a chosen field open, which is the widest the screen
      // gets: the list, the settings and the field beside them.
      await chooseFieldDefinition(mainWindow, 'Subline');
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await waitForLayout(mainWindow);

      // The row the address names is the one marked current, which is what
      // says where in the list the open settings belong, to a screen reader
      // and by the surface and the bar a sighted editor reads.
      await expect(
        componentRow(mainWindow, 'Teaser'),
        `${theme} mode leaves the chosen row unmarked`
      ).toHaveAttribute('aria-current', 'page');
      await expect(
        componentRow(mainWindow, 'Teaser'),
        `${theme} mode leaves the chosen row unmarked`
      ).toHaveAttribute('data-active', 'true');

      const marks = await mainWindow.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll('[data-slot="component-row"]')
        );
        const chosen = rows.find(
          (row) => row.getAttribute('data-active') !== null
        );
        const unchosen = rows.find(
          (row) => row.getAttribute('data-active') === null
        );
        if (chosen === undefined || unchosen === undefined) {
          throw new Error(
            `The list drew ${String(rows.length)} rows, one chosen and one not`
          );
        }
        const read = (row: ProbedElement): { surface: string; bar: string } => {
          const style = getComputedStyle(row);
          return { surface: style.backgroundColor, bar: style.boxShadow };
        };
        return { chosen: read(chosen), unchosen: read(unchosen) };
      });

      // The surface and the bar are what a sighted editor reads it by, so the
      // chosen row is measured against the row beside it rather than only by
      // the attribute its own CSS hooks on.
      expect(
        marks.chosen.surface,
        `${theme} mode draws the chosen row on the same surface as the rest`
      ).not.toBe(marks.unchosen.surface);
      expect(
        marks.chosen.bar,
        `${theme} mode leaves the chosen row without its bar`
      ).not.toBe('none');
      expect(marks.unchosen.bar).toBe('none');

      const measured = await mainWindow.evaluate(() => {
        const panel = document.querySelector('[data-slot="panel"]');
        // The three panes of this screen, in the order they stand in: the
        // panes of the settings are children of the form that saves them, so
        // this walks every pane of the panel rather than one row of them.
        const panes = Array.from(
          document.querySelectorAll('[data-slot="panes"] [data-slot="pane"]')
        );
        if (panel === null || panes.length !== 3) {
          throw new Error(
            `The screen drew ${String(panes.length)} panes instead of three`
          );
        }
        const [list, form, side] = panes.map((pane) =>
          pane.getBoundingClientRect()
        );
        if (list === undefined || form === undefined || side === undefined) {
          throw new Error('A pane of the screen has no box');
        }
        const inside = panel.getBoundingClientRect();
        return {
          // Nothing reaches past the panel it sits in: no pane over its own
          // content, and no pane past the panel's own edges, which three panes
          // beside each other are what risks.
          clipped:
            panes.some((pane) => pane.scrollWidth > pane.clientWidth) ||
            panes.some(
              (pane) =>
                pane.getBoundingClientRect().right > inside.right + 1 ||
                pane.getBoundingClientRect().bottom > inside.bottom + 1
            ),
          fitsTheWindow:
            panel.getBoundingClientRect().right <= window.innerWidth &&
            panel.getBoundingClientRect().bottom <= window.innerHeight,
          // Each pane stands beside the next rather than over it.
          collides: list.right > form.left + 1 || form.right > side.left + 1,
          listWidth: Math.round(list.right - list.left),
          sidePaneWidth: Math.round(side.right - side.left),
        };
      });

      expect(measured.clipped, `${theme} mode clips a pane`).toBe(false);
      expect(measured.fitsTheWindow, `${theme} mode overflows`).toBe(true);
      expect(measured.collides, `${theme} mode makes the panes overlap`).toBe(
        false
      );
      // ci's two panes of 296 px, whatever the window does.
      expect(measured.listWidth).toBe(296);
      expect(measured.sidePaneWidth).toBe(296);
    }
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

    // The list of allowed Components names each Component, so allowing
    // "Teaser" on the Teaser Component's own dynamic field stores its real id
    // and makes the reference circular.
    const pane = await addFieldDefinition(mainWindow, {
      label: 'Sections',
      fieldType: 'dynamic',
    });
    await pane.getByRole('button', { name: 'Add Component' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Teaser' })
    ).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();

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
    await expect(mainWindow.getByText('No sections yet.')).toBeVisible();

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

  test('moves a section twice from the keyboard without re-finding its button', async ({
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

    const addSection = mainWindow.getByRole('button', { name: 'Add section' });
    for (const headline of ['First', 'Second', 'Third']) {
      await addSection.click();
      await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
      await mainWindow
        .getByLabel('Headline', { exact: true })
        .last()
        .fill(headline);
    }
    await expect(mainWindow.getByText('Section 3 of 3')).toBeVisible();

    // The button is focused once and then pressed twice with the keyboard
    // alone, so nothing re-finds it in between. A section has to travel with
    // its own chrome for that to work: if the button stayed with the position
    // instead, the second press would belong to the section that was swapped
    // in and would undo the first move.
    await mainWindow
      .getByRole('button', { name: 'Move the Teaser section down' })
      .first()
      .focus();
    await mainWindow.keyboard.press('Enter');
    await expect(
      mainWindow.getByLabel('Headline', { exact: true }).first()
    ).toHaveValue('Second');
    await mainWindow.keyboard.press('Enter');

    const headlines = mainWindow.getByLabel('Headline', { exact: true });
    await expect(headlines.nth(0)).toHaveValue('Second');
    await expect(headlines.nth(1)).toHaveValue('Third');
    await expect(headlines.nth(2)).toHaveValue('First');

    // And the order the two presses produced is what Core stores.
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
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
    const stored = mainWindow.getByLabel('Headline', { exact: true });
    await expect(stored).toHaveCount(3);
    await expect(stored.nth(0)).toHaveValue('Second');
    await expect(stored.nth(2)).toHaveValue('First');
  });

  test('says why an Entry whose last section was removed could not be saved', async ({
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
        dynamicFieldDefinition({
          ofComponents: [component.id],
          isRequired: true,
        }),
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
            values: { headline: stringValue({ en: 'Only one' }) },
          },
        ]),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await mainWindow
      .getByRole('button', { name: 'Remove the Teaser section' })
      .click();
    await expect(mainWindow.getByText('No sections yet.')).toBeVisible();

    // The field is required, so an empty list cannot be saved. On the update
    // route that is said before Save is pressed, since the Entry is missing a
    // required Value and Save is blocked with the reason below it, see
    // contributing/renderer/forms.md#saves-block.
    const addSection = mainWindow.getByRole('button', { name: 'Add section' });
    const save = mainWindow.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await expect(
      mainWindow.locator('[data-slot="form-blocked-reason"]')
    ).toHaveText('English is missing 1 Value');
    await save.click({ force: true });
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/[^/]+/${entry.id}/update$`)
    );

    // Nothing was written, so the Entry still holds the section it had.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(
      mainWindow.getByLabel('Headline', { exact: true })
    ).toHaveValue('Only one');

    // The same field on create, where a section has been added and removed
    // again. A new Entry is missing the same required Value, so Save is
    // blocked there too rather than being pressed and refused.
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const create = mainWindow.getByRole('button', { name: 'Create Article' });
    await mainWindow.getByLabel('Title', { exact: true }).fill('Another');
    await addSection.click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(mainWindow.getByText('Section 1 of 1')).toBeVisible();
    await mainWindow
      .getByRole('button', { name: 'Remove the Teaser section' })
      .click();

    await expect(create).toBeDisabled();
    await expect(
      mainWindow.locator('[data-slot="form-blocked-reason"]')
    ).toHaveText('English is missing 1 Value');
    await create.click({ force: true });

    // Nothing was created, and the field was never marked, which is what tells
    // a blocked form from one that is checked when Save is pressed.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create`)
    );
    await expect(addSection).toHaveAttribute('aria-invalid', 'false');
  });

  test('adds a dynamic field to a Collection and bounds its sections', async ({
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
      fieldDefinitions: [textFieldDefinition()],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // The dynamic type is offered on a Collection, and the Components it
    // allows are rows that name each Component rather than showing an id.
    const pane = await addFieldDefinition(mainWindow, {
      label: 'Sections',
      fieldType: 'dynamic',
      max: 2,
    });
    await pane.getByRole('button', { name: 'Add Component' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Teaser' })
    ).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Save' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // What the rows and the count stored is read back off Core, so a broken
    // definition cannot pass as a working one.
    const stored = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const dynamicDefinition = stored.fieldDefinitions.find(
      (definition) =>
        'fieldType' in definition && definition.fieldType === 'dynamic'
    );
    expect(dynamicDefinition).toMatchObject({
      slug: 'sections',
      ofComponents: [component.id],
      max: 2,
    });

    // And the Maximum it stored is what the Entry form holds an editor to.
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow.getByLabel('Title', { exact: true }).fill('Bounded');
    const addSection = mainWindow.getByRole('button', { name: 'Add section' });
    for (const count of ['Section 1 of 1', 'Section 2 of 2']) {
      await addSection.click();
      await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
      await expect(mainWindow.getByText(count)).toBeVisible();
    }
    await expect(addSection).toBeDisabled();
    await expect(
      mainWindow.getByText(
        'This field holds at most 2 sections. Remove one to add another.'
      )
    ).toBeVisible();
  });

  test('reorders a Component field from the keyboard and stores the new order', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'alpha', label: { en: 'Alpha' } }),
        textFieldDefinition({ slug: 'beta', label: { en: 'Beta' } }),
      ],
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });

    // Move down, from the keyboard alone, as WCAG 2.1.1 and 2.5.7 ask of a
    // reorder that is also possible by dragging.
    await mainWindow
      .getByRole('button', { name: 'Settings of the Alpha field' })
      .focus();
    await mainWindow.keyboard.press('Enter');
    await mainWindow.getByRole('button', { name: 'More for Alpha' }).focus();
    await mainWindow.keyboard.press('Enter');
    await mainWindow.getByRole('menuitem', { name: 'Move down' }).click();
    await saveComponent(mainWindow, 'Teaser');
    await expect(mainWindow).toHaveURL(componentRoute);
    expect(
      (
        await readComponentViaIpc(mainWindow, {
          projectId: project.id,
          id: component.id,
        })
      ).fieldDefinitions.map((definition) => definition.slug)
    ).toEqual(['beta', 'alpha']);

    // Move up takes it back, so both ways are driven and neither is a one-way
    // street.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await chooseFieldDefinition(mainWindow, 'Alpha');
    await mainWindow.getByRole('button', { name: 'More for Alpha' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Move up' }).click();
    await saveComponent(mainWindow, 'Teaser');
    await expect(mainWindow).toHaveURL(componentRoute);
    expect(
      (
        await readComponentViaIpc(mainWindow, {
          projectId: project.id,
          id: component.id,
        })
      ).fieldDefinitions.map((definition) => definition.slug)
    ).toEqual(['alpha', 'beta']);
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
    await expect(errorScreenTitle(mainWindow)).toBeHidden();
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
    });
    await saveComponent(mainWindow, 'Teaser');
    await expect(mainWindow).toHaveURL(componentRoute);

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

  test("names the Entry a Component's refused Field change reaches, by title, and applies the loss", async ({
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
          {
            componentId: component.id,
            values: {
              headline: stringValue({ en: 'Also' }),
              subline: stringValue({ en: 'And this' }),
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
    await chooseFieldDefinition(mainWindow, 'Subline');
    await mainWindow.getByRole('button', { name: 'More for Subline' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Remove field' }).click();
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();

    // One dialog, answered in place rather than on the error screen. Each
    // Entry is named by its own title with a link to it, never by the id Core
    // names it with, and the two sections of the same Entry are told apart by
    // where each one sits.
    const dialog = mainWindow.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Save the changes to the Teaser Component?',
      })
    ).toBeVisible();
    const rows = dialog.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(
      rows.first().getByRole('link', { name: 'Home' })
    ).toBeVisible();
    await expect(dialog).not.toContainText(entry.id);
    await expect(rows.first()).toContainText('Section 1 of 2');
    await expect(rows.last()).toContainText('Section 2 of 2');
    await expect(rows.first().locator('s')).toHaveText('What ships today');
    await expect(rows.last().locator('s')).toHaveText('And this');

    await dialog
      .getByRole('button', { name: 'Remove Subline from 1 Entry' })
      .click();

    // The change went in, so the settings stay open with the Component chosen,
    // the stored Component no longer declares the Field and neither section
    // holds it.
    await expect(mainWindow.getByText('Component Teaser saved')).toBeVisible();
    await expect(mainWindow).toHaveURL(componentRoute);
    const saved = await readComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: component.id,
    });
    expect(saved.fieldDefinitions.map((found) => found.slug)).toEqual([
      'headline',
    ]);
    const storedEntries = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const sections = storedEntries[0]?.values['sections']?.content;
    expect(
      Array.isArray(sections)
        ? sections.map((item) => Object.keys(item.values))
        : []
    ).toEqual([['headline'], ['headline']]);
  });

  test("leads to each Entry a Component's change leaves without a Value, and waits for it", async ({
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

    // A Field that is required and has no default leaves every section of
    // every Entry without a Value, and Core takes a Value for a Component's
    // item nowhere but in the Entry itself, so the dialog leads there.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    await addFieldDefinition(mainWindow, { label: 'Subline' });
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();

    const dialog = mainWindow.getByRole('dialog');
    const row = dialog.getByRole('listitem').first();
    await expect(row.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(dialog).not.toContainText(entry.id);
    // The row says where the Value is missing, and the line above the rows
    // what there is to do, since such a Value is written nowhere yet: the
    // Entry draws the fields the stored Component holds, and this change is
    // the one that would add the field asking for it.
    await expect(row).toContainText('Subline');
    await expect(row).toContainText('Articles');
    await expect(
      dialog.getByText(
        "A Value for a section can't be filled in yet, here or in the Entry. To save this change, change the field so the sections below are allowed as they are, or open an Entry and remove the section, which deletes what it holds."
      )
    ).toBeVisible();
    // Nothing here can answer it, so the button says so and takes no press.
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await expect(
      dialog.getByText('Each Entry below needs a Value first')
    ).toBeVisible();
    // The control still takes a click, since it is not `disabled`, and the
    // dialog stays where it is.
    await save.click({ force: true });
    await expect(dialog).toBeVisible();

    // The Project got no commit for the refused update.
    await navigateToHistory(mainWindow, project.id);
    await expect(
      mainWindow.getByRole('link', { name: /update component/i })
    ).toHaveCount(0);
  });

  test('keeps the unsaved Component settings while an Entry the dialog names is opened', async ({
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
    await createEntryViaIpc(mainWindow, {
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

    // Two unsaved changes to the settings: a new name and a field that is
    // required and has no default, which is what Core refuses the save for.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    const componentName = mainWindow.getByLabel('Component name', {
      exact: true,
    });
    await expect(componentName).toHaveValue('Teaser');
    await componentName.fill('Teaser block');
    await addFieldDefinition(mainWindow, { label: 'Subline' });
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();

    // Following the dialog's link leads straight to the Entry, without asking
    // about the changes: they are kept rather than lost. It matters more here
    // than for a Collection, because nothing in the dialog can answer a
    // Component's rows, so coming back to the settings is the way through.
    const dialog = mainWindow.getByRole('dialog');
    await dialog.getByRole('link', { name: 'Home' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/[^/]+/update`)
    );
    await expect(mainWindow.getByRole('alertdialog')).toHaveCount(0);

    // Coming back through the app, which is how the person gets back: the
    // Components of the Project, then this one, which the list still names as
    // it is stored.
    await projectSidebar(mainWindow)
      .getByRole('link', { name: 'Components' })
      .click();
    await mainPanel(mainWindow).getByRole('link', { name: 'Teaser' }).click();
    await expect(mainWindow).toHaveURL(componentRoute);

    // The settings stand as they were left, with Save there to press, while
    // nothing of them was written.
    await expect(componentName).toHaveValue('Teaser block');
    await expect(
      mainWindow.getByRole('button', { name: 'Settings of the Subline field' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Save', exact: true })
    ).toBeEnabled();
    const stored = await readComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: component.id,
    });
    expect(stored.name).toEqual({ en: 'Teaser' });
    expect(stored.fieldDefinitions.map((found) => found.slug)).toEqual([
      'headline',
    ]);

    // And pressing Save again asks the same question, since the same change
    // is still refused.
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('link', { name: 'Home' })).toBeVisible();
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

    // The change is read at the commit and drawn without a form, so the
    // Component appears by its name and never as a bare id.
    await expect(mainWindow.getByText('Created')).toBeVisible();
    await expect(
      mainWindow.getByText('Pull quote', { exact: true })
    ).toBeVisible();
  });

  // ci fixes Desktop's smallest window at 1168 by 560 px at 100% zoom, the size
  // at which no screen may collide or clip, and fixes it in CSS pixels. A zoom
  // step scales device pixels, so a screen is laid out at that minimum at a
  // step only in a window grown by the step's factor, and Electron's View menu
  // zooms in steps of half a level: 109.5%, 120%, 131.4% and on. Each step is
  // therefore measured as the same CSS size in a window scaled by its factor. A
  // document wider than the window is what a collision looks like from here,
  // and the vertical scroll below the title is what ci expects at that height.
  //
  // Only the steps this display has room for are measured, which is the rule ci
  // gives Desktop for offering a step at all. Two things are left out on
  // purpose. Desktop sets no minimum window size, so nothing stops a window
  // from dropping below the minimum in CSS pixels, at a zoom step or by
  // dragging, and closing that gap belongs with the design these screens do not
  // have yet. And a clipped label is measured against that design rather than
  // here, for the same reason.
  test('holds the Component screens at the smallest window and its zoom steps', async ({
    mainWindow,
    electronApp,
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

    // 100% zoom and the first two steps the View menu offers.
    const zoomLevels = [0, 0.5, 1];
    const measuredLevels = new Set<number>();

    /**
     * Zoom to `level` and size the window so the layout still gets the minimum
     * in CSS pixels. Set after each navigation, because the reload a
     * navigation does resets the zoom.
     */
    const zoomToMinimum = async (level: number): Promise<void> => {
      await electronApp.evaluate(
        ({ BrowserWindow }, target) => {
          const window = BrowserWindow.getAllWindows()[0];
          window?.webContents.setZoomLevel(target.level);
          window?.setContentSize(
            Math.ceil(1168 * Math.pow(1.2, target.level)),
            Math.ceil(560 * Math.pow(1.2, target.level))
          );
        },
        { level }
      );
    };

    /** The viewport in CSS pixels, once the renderer has laid out at it. */
    const measure = async (): Promise<{
      width: number;
      height: number;
      overflow: number;
    }> =>
      mainWindow.evaluate(async () => {
        // Two frames, so the resize and the zoom the main process applied have
        // been laid out before anything is read off the document.
        const frame = async (): Promise<void> =>
          new Promise((resolve) => {
            window.requestAnimationFrame(() => {
              resolve();
            });
          });
        await frame();
        await frame();
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          overflow: document.body.scrollWidth - window.innerWidth,
        };
      });

    const screens = [
      `#/projects/${project.id}/components`,
      `#/projects/${project.id}/components/create`,
      `#/projects/${project.id}/components/${component.id}`,
      `#/projects/${project.id}/collections/${collection.id}/create`,
    ];

    for (const screen of screens) {
      await navigate(mainWindow, screen);

      for (const level of zoomLevels) {
        await zoomToMinimum(level);
        const size = await measure();
        const at = `${screen} at zoom level ${String(level)}`;

        // A display with no room for the window this step asks for is one
        // Desktop does not offer the step on, which is ci's own rule, so the
        // step is left out rather than failed. 100% asks for the minimum
        // itself, and the assertion below is what fails if even that has no
        // room.
        if (level > 0 && (size.width < 1168 || size.height < 560)) {
          continue;
        }
        measuredLevels.add(level);

        // Bounded on both sides, so neither a resize nor a zoom that did not
        // take can make the overflow check vacuous. Rounding a device pixel
        // back into a CSS pixel can leave one over, so the upper bound is the
        // minimum plus one.
        expect(size.width, at).toBeGreaterThanOrEqual(1168);
        expect(size.width, at).toBeLessThanOrEqual(1169);
        expect(size.height, at).toBeGreaterThanOrEqual(560);
        expect(size.height, at).toBeLessThanOrEqual(561);
        expect(size.overflow, `${at} overflows its window`).toBeLessThanOrEqual(
          0
        );
      }
    }

    // The sections editor is only on the screen once a section is there, and
    // the loop above left the window on the Entry create route, so it is
    // measured again with one.
    await zoomToMinimum(0);
    await mainWindow.getByRole('button', { name: 'Add section' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await expect(mainWindow.getByText('Section 1 of 1')).toBeVisible();
    for (const level of measuredLevels) {
      await zoomToMinimum(level);
      const size = await measure();
      expect(
        size.overflow,
        `the sections editor overflows at zoom level ${String(level)}`
      ).toBeLessThanOrEqual(0);
    }

    expect(measuredLevels.has(0)).toBe(true);
    await zoomToMinimum(0);
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
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(errorScreenTitle(mainWindow)).toBeVisible();
    // The failure was not swallowed by the dialog built for the one refusal
    // this form answers in place.
    await expect(
      mainWindow.getByText('Could not save this Component')
    ).toBeHidden();
    // What Core raised is behind Details, which the screen keeps closed until
    // somebody opens it, see tests/specs/error-boundary.spec.ts.
    await mainWindow.locator('[data-slot="error-details-summary"]').click();
    await expect(
      mainWindow.locator('[data-slot="error-details-text"]')
    ).toContainText('E2E injected Internal failure');
  });

  // Every page's sections name their Components one by one, so a page gains a
  // new kind of section only by allowing another Component on the Field that
  // already holds its sections. Growing is safe where narrowing is not: Core
  // strips nothing, so the sections an Entry holds survive untouched.
  test('allows another Component on a Collection Field and keeps the sections its Entries hold', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const quote = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Quote', de: 'Zitat' },
      slug: 'quote',
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'headline',
          label: { en: 'Headline', de: 'Schlagzeile' },
        }),
      ],
    });
    const hero = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'tagline',
          label: { en: 'Tagline', de: 'Slogan' },
          isRequired: false,
        }),
      ],
    });
    const sections = dynamicFieldDefinition({
      label: { en: 'Sections', de: 'Abschnitte' },
      ofComponents: [quote.id],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Artikel' },
        plural: { en: 'Articles', de: 'Artikel' },
      },
      description: { en: 'Articles', de: 'Artikel' },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
        sections,
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Launch day', de: 'Starttag' }),
        sections: componentValue([
          {
            componentId: quote.id,
            values: {
              headline: stringValue({ en: 'We are live', de: 'Wir sind live' }),
            },
          },
        ]),
      },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow
        .getByRole('main')
        .getByLabel('Collection name', { exact: true })
    ).toHaveValue('Articles');

    // The field's own settings open from its row, and the Components it allows
    // are rows that name each of them.
    const pane = await chooseFieldDefinition(mainWindow, 'Sections');
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Quote' })
    ).toBeVisible();

    // Add offers what the field does not allow yet, and nothing else.
    await pane.getByRole('button', { name: 'Add Component' }).click();
    await expect(
      mainWindow.getByRole('menuitem', { name: 'Hero' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('menuitem', { name: 'Quote' })
    ).toHaveCount(0);
    await mainWindow.getByRole('menuitem', { name: 'Hero' }).click();
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Hero' })
    ).toBeVisible();

    // The edit dirties the page, and the save is Core's own update.
    const save = mainWindow.getByRole('button', { name: 'Save' });
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await save.click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // One commit, as every other change to a Collection lands.
    await navigateToHistory(mainWindow, project.id);
    await expect(
      mainWindow.getByRole('link', { name: /update collection/i })
    ).toHaveCount(1);

    // The Field kept its id, which is what Core matches on, and its allowed
    // Components only grew.
    const stored = await readCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    const storedSections = dynamicFieldOf(stored.fieldDefinitions);
    expect(storedSections.id).toBe(sections.id);
    expect(storedSections.ofComponents).toEqual([quote.id, hero.id]);

    // And the section the Entry holds came through the save untouched, in both
    // languages.
    const storedEntries = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(storedEntries).toHaveLength(1);
    expect(storedEntries[0]?.values['sections']).toEqual(
      entry.values['sections']
    );

    // Reading the Entry back through its own form shows the same, and the
    // second language is reached through the switch above its fields.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const headline = mainWindow.getByLabel('Headline', { exact: true });
    await expect(headline).toHaveValue('We are live');
    await chooseLanguage(mainWindow, 'de');
    await expect(headline).toHaveValue('Wir sind live');
    await chooseLanguage(mainWindow, 'en');

    // The Entry can now gain a section of the Component that was just allowed.
    await mainWindow.getByRole('button', { name: 'Add section' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Hero' }).click();
    await expect(mainWindow.getByText('Section 2 of 2')).toBeVisible();
    // An optional Field's label carries an " - optional" suffix, so it is
    // matched by prefix.
    await mainWindow.getByLabel('Tagline').fill('Content without a server');
    await mainWindow.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(
      mainWindow.getByLabel('Headline', { exact: true })
    ).toHaveValue('We are live');
    await expect(mainWindow.getByLabel('Tagline')).toHaveValue(
      'Content without a server'
    );
  });

  // The editor exists once, so a Component's own dynamic Field grows the same
  // way, and what that save reaches is said before it is pressed.
  test('allows another Component on a Component Field and says what the save reaches', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const quote = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Quote', de: 'Zitat' },
      slug: 'quote',
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'headline',
          label: { en: 'Headline', de: 'Schlagzeile' },
        }),
      ],
    });
    const hero = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'tagline',
          label: { en: 'Tagline', de: 'Slogan' },
          isRequired: false,
        }),
      ],
    });
    const blocks = dynamicFieldDefinition({
      slug: 'blocks',
      label: { en: 'Blocks', de: 'Bausteine' },
      ofComponents: [quote.id],
    });
    const container = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Container', de: 'Container' },
      slug: 'container',
      fieldDefinitions: [blocks],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Artikel' },
        plural: { en: 'Articles', de: 'Artikel' },
      },
      description: { en: 'Articles', de: 'Artikel' },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
        dynamicFieldDefinition({
          label: { en: 'Sections', de: 'Abschnitte' },
          ofComponents: [container.id],
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Home', de: 'Start' }),
        sections: componentValue([
          {
            componentId: container.id,
            values: {
              blocks: componentValue([
                {
                  componentId: quote.id,
                  values: {
                    headline: stringValue({ en: 'We are live', de: 'Live' }),
                  },
                },
              ]),
            },
          },
        ]),
      },
    });

    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: container.id,
    });
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Container');

    // Growing a Component's Field reaches the Entries that hold a section built
    // from it, which the list says of each Component before one is opened.
    await expect(componentRow(mainWindow, 'Container')).toContainText(
      '1 Entry uses it'
    );

    const pane = await chooseFieldDefinition(mainWindow, 'Blocks');
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Quote' })
    ).toBeVisible();
    await pane.getByRole('button', { name: 'Add Component' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Hero' }).click();
    await expect(
      pane.getByRole('listitem').filter({ hasText: 'Hero' })
    ).toBeVisible();

    await saveComponent(mainWindow, 'Container');

    // One commit again, and the Field grew without losing its id.
    await navigateToHistory(mainWindow, project.id);
    await expect(
      mainWindow.getByRole('link', { name: /update component/i })
    ).toHaveCount(1);

    const stored = await readComponentViaIpc(mainWindow, {
      projectId: project.id,
      id: container.id,
    });
    const storedBlocks = dynamicFieldOf(stored.fieldDefinitions);
    expect(storedBlocks.id).toBe(blocks.id);
    expect(storedBlocks.ofComponents).toEqual([quote.id, hero.id]);

    // The section inside the section survived the cascade with its Values.
    const storedEntries = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(storedEntries[0]?.values['sections']).toEqual(
      entry.values['sections']
    );
  });

  // An empty ofComponents allows every Component of the Project, so switching
  // one on would narrow the Field to that one, which Core refuses as a loss and
  // no screen can answer yet. Such a Field therefore offers nothing to add, and
  // neither does one that names every Component there is.
  test('says that a field naming no Component allows every one of them', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const teaser = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition(),
        dynamicFieldDefinition({
          slug: 'blocks',
          label: { en: 'Blocks' },
          ofComponents: [teaser.id],
        }),
      ],
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow.getByRole('main').getByLabel('Collection name', {
        exact: true,
      })
    ).toHaveValue('Articles');

    // The field that names no Component allows every one of them, the ones
    // added later included, which is Core's own rule, so its list says that
    // rather than standing empty.
    const sections = await chooseFieldDefinition(mainWindow, 'Sections');
    await expect(
      sections.getByText('Every Component is allowed.')
    ).toBeVisible();

    // The field that names the only Component there is holds it as a row, and
    // has nothing left to add.
    const blocks = await chooseFieldDefinition(mainWindow, 'Blocks');
    await expect(
      blocks.getByRole('listitem').filter({ hasText: 'Teaser' })
    ).toBeVisible();
    await expect(
      blocks.getByRole('button', { name: 'Add Component' })
    ).toHaveCount(0);
    // Taking it away is offered, since Core is the one that decides whether
    // the sections built from it may go, see contributing/not-yet-implemented.md.
    await blocks
      .getByRole('button', { name: 'Remove Teaser from Allowed Components' })
      .click();
    await expect(
      blocks.getByRole('listitem').filter({ hasText: 'Teaser' })
    ).toHaveCount(0);
    // With nothing named it allows every Component again, and Add offers the
    // one there is.
    await expect(blocks.getByText('Every Component is allowed.')).toBeVisible();
    await expect(
      blocks.getByRole('button', { name: 'Add Component' })
    ).toBeVisible();
  });
});

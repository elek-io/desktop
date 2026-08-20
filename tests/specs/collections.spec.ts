import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  addFieldDefinition,
  createCollection,
  createCollectionViaIpc,
  fillCollectionForm,
  navigateToCollectionCreate,
  navigateToCollectionSettings,
  referenceFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import { confirmDialog, dismissDialog } from '../helpers/dialog.js';
import {
  createEntryViaIpc,
  referenceValue,
  stringValue,
} from '../helpers/entry.js';
import { reloadWindow } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Collections', () => {
  test('creates a collection with a field definition and shows it in the sidebar', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigateToCollectionCreate(mainWindow, project.id);
    await createCollection(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
      field: { label: 'Title', description: 'The title of the article' },
    });

    // Reaching the Collection detail (asserted inside createCollection) means
    // Core accepted the create with its field definition without throwing. Core
    // owns and separately tests file and commit correctness, so this spec
    // verifies only the desktop app's part: the create reached Core, and the UI
    // reflects the result by listing the new Collection in the sidebar. Scope to
    // the sidebar (a complementary landmark) so the matching breadcrumb crumb on
    // the detail page does not make the link locator ambiguous.
    await expect(
      mainWindow
        .getByRole('complementary')
        .getByRole('link', { name: 'Articles' })
    ).toBeVisible();
  });

  test('updates a collection through the form, gated on a dirty change', async ({
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

    // Wait for the form to reset from the loaded Collection. Until it settles,
    // the dirty gate cannot be trusted, so key off the plural name showing.
    await expect(
      mainWindow.getByLabel('Collection name (Plural)', { exact: true })
    ).toHaveValue('Articles');

    // Nothing edited yet, so Save is gated
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    // Rename the plural name and edit the description. Leave the slugs untouched,
    // a slug change is the schema-cascade flow and out of scope here.
    await mainWindow
      .getByLabel('Collection name (Plural)', { exact: true })
      .fill('Guides');
    await mainWindow
      .getByLabel('Description', { exact: true })
      .fill('Guides created by the E2E tests');

    // The edit dirties the form, so Save enables
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // Redirecting to the Collection detail is how Core's success surfaces (the
    // update did not throw). Core owns file and commit correctness.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // Reload so the sidebar re-reads from Core rather than an optimistic cache
    // entry, proving the rename persisted, then see the new plural name listed.
    // Scope to the sidebar (a complementary landmark) so the matching breadcrumb
    // crumb on the detail page does not make the link locator ambiguous.
    await reloadWindow(mainWindow);
    await expect(
      mainWindow
        .getByRole('complementary')
        .getByRole('link', { name: 'Guides' })
    ).toBeVisible();
  });

  test('deletes a collection and removes it from the UI', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Doomed entry' }) },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    await mainWindow.getByRole('button', { name: 'Delete Collection' }).click();

    // The destructive confirm warns that the cascade deletes the seeded Entry
    // too, rather than a bare "Are you sure?". Assert the copy so a regression to
    // the weaker, warning-less dialog is caught.
    await expect(
      mainWindow.getByText(
        'Deleting this Collection also permanently deletes every Entry inside it. This cannot be undone.'
      )
    ).toBeVisible();

    await confirmDialog(mainWindow, 'Yes, delete this Collection');

    // The delete redirecting to the Collections list is how Core's success
    // surfaces (it did not throw). The UI reflects the removal: the Collection
    // is gone from the sidebar and the empty state shows. Its seeded Entry went
    // with it (Core's cascade, which Core tests), so there is no Collection left
    // to view Entries under.
    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/collections$/);
    await expect(
      mainWindow.getByRole('link', { name: 'Articles' })
    ).toBeHidden();
    await expect(mainWindow.getByText('No Collections found')).toBeVisible();
  });

  test('surfaces a blocked delete in place when another Collection references in', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Collection A holds the referenced Entry. Collection B holds an Entry that
    // references into A. Deleting A while B survives would leave B's reference
    // dangling, so Core blocks the delete with a Conflict listing the referrer.
    const collectionA = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const target = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collectionA.id,
      values: { title: stringValue({ en: 'Referenced target' }) },
    });
    // A distinct name and slug, since a Collection defaults to "Articles" and a
    // duplicate slug is itself rejected before the reference is even set up.
    const collectionB = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Reference' }, plural: { en: 'References' } },
      slug: { singular: 'reference', plural: 'references' },
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collectionB.id,
      values: {
        title: stringValue({ en: 'Points into A' }),
        related: referenceValue(target.id, collectionA.id),
      },
    });

    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collectionA.id,
    });

    await mainWindow.getByRole('button', { name: 'Delete Collection' }).click();
    await confirmDialog(mainWindow, 'Yes, delete this Collection');

    // The Conflict is surfaced in place through the error dialog rather than the
    // root error boundary (the fixture's console check backs this up: an error
    // reaching the boundary would log and fail the run). The description reflects
    // the preserved CoreError type, not Core's raw message.
    await expect(
      mainWindow.getByText('Could not delete this Collection')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('still reference Entries in this one')
    ).toBeVisible();
    await dismissDialog(mainWindow);

    // The Collection was not deleted: we stay on its settings page.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collectionA.id}/update$`)
    );
  });

  test('flags an invalid Collection-Slug on submit and accepts a valid one', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);

    // Fill an otherwise-valid form plus one field, so only the Collection-Slug
    // varies. Everything else stays valid across the whole test.
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });
    await addFieldDefinition(mainWindow, {
      label: 'Title',
      description: 'The title of the article',
    });

    const slugField = mainWindow.getByLabel('Collection-Slug', { exact: true });
    const createButton = mainWindow.getByRole('button', {
      name: 'Create Collection',
    });

    // Core's slug schema (reserved blocklist for 'index', the lowercase
    // single-hyphen regex for the others) runs client-side via zodResolver. The
    // desktop responsibility is that the form flags the field and blocks the
    // submit, so assert that rejected state, not Core's message text. Staying on
    // the create route proves the submit did not go through.
    for (const invalidSlug of ['index', 'Uppercase', 'double--hyphen']) {
      await slugField.fill(invalidSlug);
      await createButton.click();
      await expect(slugField).toHaveAttribute('aria-invalid', 'true');
      await expect(mainWindow).toHaveURL(
        /#\/projects\/[^/]+\/collections\/create$/
      );
    }

    // A valid slug clears the block, so the create reaches Core and redirects to
    // the new Collection's detail route (a uuid segment, never 'create').
    await slugField.fill('blog-posts');
    await createButton.click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  test('rejects a duplicate field-definition slug before appending it', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    // The first "Title" appends, its slug auto-derives to "title". The appended
    // definition renders a preview whose label associates with a real (disabled)
    // input, so it is addressable by getByLabel.
    await addFieldDefinition(mainWindow, {
      label: 'Title',
      description: 'The title of the article',
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveCount(
      1
    );

    // A second "Title" derives the same "title" slug. The sheet's own duplicate
    // check rejects it before appending, so the sheet stays open (expectRejected)
    // and its Slug field is flagged. Assert that rejected state, not Core's
    // message text.
    await addFieldDefinition(mainWindow, {
      label: 'Title',
      description: 'A duplicate title',
      expectRejected: true,
    });
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet.getByLabel('Slug', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    // Closing the sheet leaves exactly one "title" definition appended.
    await mainWindow.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveCount(
      1
    );
  });

  // Field-definition bounds refinement (min>max)
  test('rejects a text field whose minimum exceeds its maximum at the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    // min>max is refined inside the text field's own schema, so the add is
    // rejected at the sheet: it stays open (expectRejected, proving the
    // definition was not appended) and the Minimum control is flagged. This
    // pins the desktop responsibility (the sheet surfaces the error and blocks
    // the add); whether a given field-definition combination is valid is Core's
    // own test, so no other refinement is re-verified here.
    await addFieldDefinition(mainWindow, {
      label: 'Body',
      description: 'The body of the article',
      min: 10,
      max: 5,
      expectRejected: true,
    });
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet.getByLabel('Minimum')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  // A select is one Core fieldType backed by two schemas (string / number), with
  // an options field array. Reaching the Collection detail proves Core accepted
  // the string-option select definition.
  test('adds a text-option select field definition through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    // Switch the Input type from the default 'text' to 'select'. The picker is
    // the first combobox in the sheet (its header); the options render in a Radix
    // portal, so locate them on the page, not inside the dialog.
    await sheet.getByRole('combobox').first().click();
    await mainWindow
      .getByRole('option', { name: 'select', exact: true })
      .click();

    // The select authoring form mounts with its 'Type of options' picker
    // (defaulting to Text), proving the registry served the select entry.
    await expect(sheet.getByText('Type of options')).toBeVisible();

    await sheet.getByLabel('Label', { exact: true }).fill('Priority');
    await sheet.getByLabel('Description').fill('How urgent this is');

    // Fill the first option's label; its value auto-derives to a slug. The
    // sr-only per-option labels are what make this addressable by role/name; they
    // carry an "- optional" suffix like the bounds labels, so match by prefix.
    await sheet.getByLabel('Option 1 label').fill('High');

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the select was added.
    await expect(sheet).toBeHidden();
    await expect(
      mainWindow.getByText('Priority', { exact: true })
    ).toBeVisible();

    // Creating the Collection reaches Core with the select definition. A uuid
    // detail route (never 'create') means Core accepted it.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // A Field's Description is optional in Core (nullable), so a Field added
  // without one must save. The authoring form leaves every language of the
  // Description empty by default and normalizes that to Core's null, rather than
  // sending an empty string Core rejects. Reaching the Collection detail proves
  // Core accepted a Field whose description is null.
  test('adds a field definition with no description', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    // Fill only the Label (the slug auto-derives). Deliberately leave the
    // Description empty, the case that used to block the add.
    await sheet.getByLabel('Label', { exact: true }).fill('Title');

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves an empty-description Field was accepted.
    await expect(sheet).toBeHidden();
    await expect(mainWindow.getByText('Title', { exact: true })).toBeVisible();

    // Creating the Collection reaches Core with a null-description Field. A uuid
    // detail route (never 'create') means Core accepted it.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // Range is the odd scalar: it is always required and its default, minimum and
  // maximum are mandatory numbers, so it uses a distinct required bounds Extras
  // rather than the optional MinMaxRow the other scalars share. Reaching the
  // Collection detail proves Core accepted the range definition.
  test('adds a range field definition through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    // Switch the Input type from the default 'text' to 'range'. The picker is the
    // first combobox in the sheet (its header); the options render in a Radix
    // portal, so locate them on the page, not inside the dialog.
    await sheet.getByRole('combobox').first().click();
    await mainWindow
      .getByRole('option', { name: 'range', exact: true })
      .click();

    await sheet.getByLabel('Label', { exact: true }).fill('Rating');
    await sheet.getByLabel('Description').fill('How good the article is');

    // Range's default, minimum and maximum are required numbers, so their labels
    // carry no "- optional" suffix and match exactly, unlike the text field's
    // optional bounds. Filling all three before submit keeps the final state
    // valid (1 <= 5 <= 10) regardless of intermediate values.
    await sheet.getByLabel('Default value', { exact: true }).fill('5');
    await sheet.getByLabel('Minimum', { exact: true }).fill('1');
    await sheet.getByLabel('Maximum', { exact: true }).fill('10');

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the range field was added.
    await expect(sheet).toBeHidden();
    await expect(mainWindow.getByText('Rating', { exact: true })).toBeVisible();

    // Creating the Collection reaches Core with the range definition. A uuid
    // detail route (never 'create') means Core accepted it.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // Date (and datetime) render their default value through a bespoke picker, not
  // the shared DefaultValueInputField. The default is optional, so this drives
  // the spec's wiring (fieldType, defaults, routing) without touching the date
  // picker widget. Reaching the Collection detail proves Core accepted it.
  test('adds a date field definition through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    // Switch the Input type from the default 'text' to 'date'. The picker is the
    // first combobox in the sheet (its header); the options render in a Radix
    // portal, so locate them on the page, not inside the dialog.
    await sheet.getByRole('combobox').first().click();
    await mainWindow.getByRole('option', { name: 'date', exact: true }).click();

    await sheet.getByLabel('Label', { exact: true }).fill('Published');
    await sheet.getByLabel('Description').fill('When the article went live');

    // The date default value is optional, so leave it empty and add the field.
    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the date field was added.
    await expect(sheet).toBeHidden();
    await expect(
      mainWindow.getByText('Published', { exact: true })
    ).toBeVisible();

    // Creating the Collection reaches Core with the date definition. A uuid
    // detail route (never 'create') means Core accepted it.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // A slug field derives its value from a sibling field, storing that sibling's
  // real id in ofFieldDefinitions. Core's slugSourceReferences refinement rejects
  // the Collection on save if that id does not resolve to a sibling definition,
  // so reaching the detail route is what proves the real id was stored.
  test('creates a Collection whose slug field derives from a sibling, using the real field id', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    // Add the text field the slug will derive from.
    await addFieldDefinition(mainWindow, {
      label: 'Title',
      description: 'The title of the article',
    });
    await expect(mainWindow.getByText('Title', { exact: true })).toHaveCount(1);

    // Add a slug field and pick the text field as its source. The source picker
    // reads the sibling definitions threaded through DefinitionExtrasProps.
    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('combobox').first().click();
    await mainWindow.getByRole('option', { name: 'slug', exact: true }).click();

    await sheet.getByLabel('Label', { exact: true }).fill('Permalink');
    await sheet.getByLabel('Description').fill('The permalink of the article');

    // The source switch carries its sibling field's label as its accessible
    // name, so it is addressable by role/name. Toggling it stores the text
    // field's real id in ofFieldDefinitions.
    await sheet.getByRole('switch', { name: 'Title' }).click();

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    await expect(sheet).toBeHidden();
    await expect(
      mainWindow.getByText('Permalink', { exact: true })
    ).toBeVisible();

    // Create the Collection. A uuid detail route (never 'create') means Core
    // accepted the slug source's real id.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // Asset is the simplest reference type: a never-unique reference whose only
  // controls are the
  // min/max Asset count. It also carries ofAssetMimeTypes as a hidden empty
  // default (no control today) that Core requires, so reaching the Collection
  // detail proves the whole definition, including that default, validated.
  test('adds an asset field definition through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    // Switch the Input type from the default 'text' to 'asset'. The picker is the
    // first combobox in the sheet (its header); the options render in a Radix
    // portal, so locate them on the page, not inside the dialog.
    await sheet.getByRole('combobox').first().click();
    await mainWindow
      .getByRole('option', { name: 'asset', exact: true })
      .click();

    await sheet.getByLabel('Label', { exact: true }).fill('Cover');
    await sheet
      .getByLabel('Description')
      .fill('The cover image of the article');

    // The min/max Asset counts are optional, so leave them empty and add.
    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the asset field was added.
    await expect(sheet).toBeHidden();
    await expect(mainWindow.getByText('Cover', { exact: true })).toBeVisible();

    // Creating the Collection reaches Core with the asset definition. A uuid
    // detail route (never 'create') means Core accepted it, hidden mime-type
    // default and all.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // The ofCollections picker is backed by a TanStack Query for the Collections
  // list. A Collection is arranged first (via IPC)
  // so the picker has something to restrict to, then a second Collection is
  // authored with an entry field restricted to it. Reaching the detail route
  // proves Core accepted the restriction's real Collection id.
  test('adds an entry field definition restricted to a Collection through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // The Collection the entry field will reference. Its plural name "Articles"
    // is the ofCollections toggle's accessible name in the sheet.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Reviews',
      nameSingular: 'Review',
      description: 'Reviews of the articles',
      slugPlural: 'reviews',
      slugSingular: 'review',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('combobox').first().click();
    await mainWindow
      .getByRole('option', { name: 'entry', exact: true })
      .click();

    await sheet.getByLabel('Label', { exact: true }).fill('Article');
    await sheet.getByLabel('Description').fill('The reviewed article');

    // The Collections query resolves into a toggle per Collection, each carrying
    // its plural name as its accessible name. Toggling
    // "Articles" stores its real id in ofCollections. Its checked state is bound
    // to that stored id, so asserting it is on proves the toggle reached form
    // state, not just the DOM.
    const restriction = sheet.getByRole('switch', {
      name: 'Articles',
      exact: true,
    });
    await restriction.click();
    await expect(restriction).toBeChecked();

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the entry field was added.
    await expect(sheet).toBeHidden();
    await expect(
      mainWindow.getByText('Article', { exact: true })
    ).toBeVisible();

    // Creating the Collection reaches Core with the entry definition. A uuid
    // detail route (never 'create') means Core accepted the restriction id.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // Markdown carries block/inline feature toggles plus the one resolver cast
  // its input/output divergence needs. Toggling a couple of features and reaching
  // the detail route proves the cast-backed spec validated and Core accepted it.
  test('adds a markdown field definition through the Add Field sheet', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToCollectionCreate(mainWindow, project.id);
    await fillCollectionForm(mainWindow, {
      namePlural: 'Articles',
      nameSingular: 'Article',
      description: 'The articles of this blog',
      slugPlural: 'articles',
      slugSingular: 'article',
    });

    await mainWindow.getByRole('button', { name: 'Add Field' }).click();
    const sheet = mainWindow.getByRole('dialog', {
      name: 'Add a Field to this Collection',
    });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('combobox').first().click();
    await mainWindow
      .getByRole('option', { name: 'markdown', exact: true })
      .click();

    await sheet.getByLabel('Label', { exact: true }).fill('Body');
    await sheet.getByLabel('Description').fill('The body of the article');

    // The feature toggles carry their label as their accessible name, one block
    // feature and one inline feature here. Task list
    // items are gated on lists, so they start disabled; enabling "Lists" must
    // flip that switch to enabled, which proves the toggle reached form state and
    // the watch-driven dependency re-rendered, not just the DOM.
    const taskListItems = sheet.getByRole('switch', {
      name: 'Task list items',
      exact: true,
    });
    await expect(taskListItems).toBeDisabled();
    await sheet.getByRole('switch', { name: 'Lists', exact: true }).click();
    await expect(taskListItems).toBeEnabled();
    await sheet.getByRole('switch', { name: 'Emphasis', exact: true }).click();

    await mainWindow.getByRole('button', { name: 'Add definition' }).click();
    // The sheet closes only after the definition is appended, so a hidden sheet
    // proves the markdown field was added.
    await expect(sheet).toBeHidden();
    await expect(mainWindow.getByText('Body', { exact: true })).toBeVisible();

    // Creating the Collection reaches Core with the markdown definition. A uuid
    // detail route (never 'create') means Core accepted the feature config.
    await mainWindow.getByRole('button', { name: 'Create Collection' }).click();
    await expect(mainWindow).toHaveURL(
      /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
    );
  });

  // Guards that a definition-only edit flips the form's dirty state. Adding a
  // field definition goes through the Controller-bound value's onChange, which
  // must mark the form dirty so the update form's "Save changes" gate opens with
  // no other field touched.
  test('enables Save on the update form after only adding a field definition', async ({
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

    // Wait for the form to hydrate from the loaded Collection before trusting
    // the gate, keying off the plural name showing.
    await expect(
      mainWindow.getByLabel('Collection name (Plural)', { exact: true })
    ).toHaveValue('Articles');

    // Nothing edited yet, so Save is gated.
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    // Add a field definition and change nothing else. The seeded Collection
    // already has a "title" field, so "Body" is a fresh, non-duplicate slug.
    await addFieldDefinition(mainWindow, {
      label: 'Body',
      description: 'The body of the article',
    });

    // The definition-only edit dirties the form through the Controller value, so
    // Save enables.
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
  });
});

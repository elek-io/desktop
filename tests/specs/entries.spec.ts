import { expect, type Page } from '@playwright/test';

import type { Collection } from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import {
  createAssetViaIpc,
  deleteAssetViaIpc,
  jpegBytes,
  makeTempFile,
  pngBytes,
} from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  dateFieldDefinition,
  datetimeFieldDefinition,
  dynamicFieldDefinition,
  emailFieldDefinition,
  navigateToCollection,
  numberFieldDefinition,
  rangeFieldDefinition,
  referenceFieldDefinition,
  selectFieldDefinition,
  textFieldDefinition,
  timeFieldDefinition,
  updateCollectionViaIpc,
} from '../helpers/collection.js';
import {
  createComponentViaIpc,
  updateComponentViaIpc,
} from '../helpers/component.js';
import {
  assetReferenceValue,
  componentValue,
  createEntryViaIpc,
  fillEntryForm,
  listEntriesViaIpc,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
  temporalValue,
} from '../helpers/entry.js';
import { stubCoreReject, stubCoreRejectWithType } from '../helpers/ipc.js';
import { reloadWindow } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  windowSize,
} from '../helpers/window.js';

/**
 * The message one field shows below itself, or `null` where it shows none.
 *
 * Read through the control the field's label points at, so what is asserted is
 * the message that field names rather than any text on the page.
 */
async function errorOf(page: Page, labelText: string): Promise<string | null> {
  return page.evaluate((text) => {
    const label = Array.from(
      document.querySelectorAll('label[data-slot="field-label"]')
    ).find((candidate) => (candidate.textContent ?? '').trim() === text);
    if (label === undefined) {
      throw new Error(`No field is labelled "${text}"`);
    }
    const control = document.getElementById(label.getAttribute('for') ?? '');
    const errors = (control?.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((part) => part?.getAttribute('data-slot') === 'field-error');
    return errors.length === 0 ? null : (errors[0]?.textContent ?? '').trim();
  }, labelText);
}

/**
 * The same message, asserted while the save is still in flight.
 *
 * `errorOf` is one read of the DOM, so asserting it straight after the click
 * races the round trip through Core. Every assertion of a message that is on
 * its way goes through this, which re-reads until it matches. A message that
 * should not be there is read once instead, after a sibling field's message
 * has settled the submit.
 */
function expectErrorOf(
  page: Page,
  labelText: string
): ReturnType<typeof expect.poll<string | null>> {
  return expect.poll(async () => errorOf(page, labelText));
}

/**
 * Create a Collection whose translatable name, description and Title field carry
 * both 'en' and 'de'. Core requires every project-supported language to be
 * present at create time, so a Collection for a two-language Project cannot use
 * the en-only `createCollectionViaIpc` defaults. The 'en' values match those
 * defaults, so the "Create Article" action and the "Title" field label read the
 * same as in the single-language specs.
 */
async function createBilingualCollectionViaIpc(
  page: Page,
  projectId: string
): Promise<Collection> {
  return createCollectionViaIpc(page, {
    projectId,
    name: {
      singular: { en: 'Article', de: 'Artikel' },
      plural: { en: 'Articles', de: 'Artikel' },
    },
    description: {
      en: 'Articles created by the E2E tests',
      de: 'Von den E2E-Tests erstellte Artikel',
    },
    fieldDefinitions: [
      textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
    ],
  });
}

test.describe('Entries', () => {
  test('creates an entry through the form and shows it in the table', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    await fillEntryForm(mainWindow, { Title: 'Hello World' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // Redirecting to the Collection detail is how Core's success surfaces (the
    // create did not throw). Core owns file and commit correctness, so this spec
    // verifies only the desktop app's part: the form mapped to the right IPC
    // call, and the UI reflects the result by rendering the Entry's row with the
    // value that was entered.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    await expect(
      mainWindow.getByRole('cell', { name: 'Hello World' })
    ).toBeVisible();
  });

  test('conveys required with aria-required, not native constraint attributes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A required text field with a min/max character length, a required number
    // field with a min/max bound, an optional text field, and a range field. The
    // text and number definitions carry constraints the browser would enforce
    // natively (`minLength`/`maxLength` and `min`/`max`); the render registry must
    // emit none of them.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ min: 2, max: 60 }),
        numberFieldDefinition(),
        textFieldDefinition({
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          isRequired: false,
        }),
        rangeFieldDefinition(),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // zod (through react-hook-form) is the single validator and the form is
    // noValidate, so the registry emits no native constraint attribute. A native
    // constraint would let the browser block submit before handleSubmit runs.
    // aria-invalid, not these, surfaces invalidity.
    // Required-ness is instead conveyed through aria-required, an ARIA state that
    // never blocks submit, so the signal survives for assistive tech.
    for (const label of ['Title', 'Rating']) {
      const input = mainWindow.getByLabel(label, { exact: true });
      await expect(input).toBeVisible();
      for (const attribute of [
        'required',
        'min',
        'max',
        'minlength',
        'maxlength',
      ]) {
        await expect(input).not.toHaveAttribute(attribute);
      }
      await expect(input).toHaveAttribute('aria-required', 'true');
    }

    // The optional field carries no required signal at all (the "mark optional"
    // convention): no native `required` and no `aria-required`.
    const optional = mainWindow.getByLabel(/^Subtitle/);
    await expect(optional).toBeVisible();
    await expect(optional).not.toHaveAttribute('required');
    await expect(optional).not.toHaveAttribute('aria-required');

    // The range field's Slider min/max are its functional value domain, carried
    // by the range input that owns the slider role. They clamp the value rather
    // than block a submit, so they are the one exception to the rule above.
    // aria-required is not a valid attribute on a slider, so the required range
    // field must not carry it.
    const slider = mainWindow.getByRole('slider');
    await expect(slider).toHaveAttribute('min', '0');
    await expect(slider).toHaveAttribute('max', '10');
    await expect(slider).not.toHaveAttribute('aria-required');
  });

  test('updates an entry through the form, gated on a dirty change', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Original title' }) },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    // Wait for the form to reset from the loaded Entry. Until it settles, the
    // dirty gate cannot be trusted, so key off the Title field showing its value.
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'Original title'
    );

    // Nothing edited yet, so Update is gated
    await expect(
      mainWindow.getByRole('button', { name: 'Update Article' })
    ).toBeDisabled();

    // Editing the Title dirties the form, so Update enables
    await fillEntryForm(mainWindow, { Title: 'Edited title' });
    await expect(
      mainWindow.getByRole('button', { name: 'Update Article' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();

    // Redirecting to the Collection detail is how Core's success surfaces (the
    // update did not throw). The UI reflects the result: the Entry's row now
    // shows the edited value and the original is gone.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    await expect(
      mainWindow.getByRole('cell', { name: 'Edited title' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('cell', { name: 'Original title' })
    ).toBeHidden();
  });

  test('saves an entry reference selected through the picker', async ({
    mainWindow,
  }) => {
    // Core's valueContentReferenceToEntrySchema requires `collectionId`
    // alongside `id` and `objectType` (an asset reference does not), and
    // refines it against the definition's `ofCollections`. The picker builds
    // the reference, so a missing collectionId makes every entry-reference
    // field unsaveable. Every other reference spec seeds values over IPC with
    // the correct shape, which is why this has to drive the real picker.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The Collection being referenced, holding one Entry to point at.
    const target = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Author' }, plural: { en: 'Authors' } },
      description: { en: 'Authors created by the E2E tests' },
      slug: { singular: 'author', plural: 'authors' },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
      values: { title: stringValue({ en: 'Ada Lovelace' }) },
    });

    // The referring Collection: a Title plus an optional single entry reference.
    const referring = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: referring.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Referring article' });

    // Drive the real picker rather than seeding the value. Choose names the
    // field it fills, as every button of a reference field does, and the
    // dialog it opens is called the same.
    await mainWindow.getByRole('button', { name: 'Choose Related' }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Related' });
    await expect(picker).toBeVisible();
    // One Entry, so each row carries a radio button, and the choice reaches
    // the field when Choose is pressed.
    await picker.getByRole('radio', { name: 'Ada Lovelace' }).click();
    await picker.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(picker).toBeHidden();

    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // Redirecting to the Collection detail is how Core's success surfaces: the
    // reference validated and was written. A reference missing collectionId
    // fails the generated schema, so the form would never submit and the URL
    // would stay on the create route.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${referring.id}$`)
    );
    await expect(
      mainWindow.getByRole('cell', { name: 'Referring article' })
    ).toBeVisible();
  });

  test('validates required and format fields, respecting the dirty gate', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A required Email field drives both the required and format paths; an
    // optional Note field exists only to dirty the form past the create gate
    // while leaving Email empty. Single language, so per-language validation
    // stays out of the way.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        emailFieldDefinition(),
        textFieldDefinition({
          slug: 'note',
          label: { en: 'Note' },
          isRequired: false,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // On open, the create is dirty-gated (disabled) and no field is flagged.
    // A pristine empty form cannot be submitted by design, so a "required"
    // error is only reachable after dirtying the form via another field.
    await expect(
      mainWindow.getByRole('button', { name: 'Create Article' })
    ).toBeDisabled();
    await expect(
      mainWindow.getByLabel('Email', { exact: true })
    ).toHaveAttribute('aria-invalid', 'false');

    // Required path: filling the optional Note dirties the form (Email still
    // empty), the button enables, and submitting flags Email as invalid while
    // the URL stays on the create route (nothing was created). Optional field
    // labels carry an "- optional" suffix, so match Note without exactness
    // rather than through the exact-label fillEntryForm helper.
    await mainWindow.getByLabel('Note').fill('Just a note');
    await expect(
      mainWindow.getByRole('button', { name: 'Create Article' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(
      mainWindow.getByLabel('Email', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );

    // Format path: a syntactically invalid value is still flagged and blocked.
    await fillEntryForm(mainWindow, { Email: 'notanemail' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(
      mainWindow.getByLabel('Email', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );

    // Valid path: a well-formed email passes validation and the create goes
    // through, shown by the redirect to the Collection detail.
    await fillEntryForm(mainWindow, { Email: 'valid@example.com' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
  });

  test('lists entries with the expected table chrome', async ({
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
      values: { title: stringValue({ en: 'First' }) },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Second' }) },
    });

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // Both known values render as table cells and the empty state is absent.
    // Asserting the values beats a row count, which would include the header.
    await expect(mainWindow.getByRole('cell', { name: 'First' })).toBeVisible();
    await expect(
      mainWindow.getByRole('cell', { name: 'Second' })
    ).toBeVisible();
    await expect(mainWindow.getByText('No results.')).toBeHidden();

    // The column-visibility dropdown and the singular-labelled create action.
    await expect(
      mainWindow.getByRole('button', { name: 'Visible Values' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Create Article' })
    ).toBeVisible();
  });

  test('renders a persisted entry after a renderer reload', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    // Land on the (empty) Entry list first, then seed over IPC, which does not
    // touch the renderer's query cache. The reload is what surfaces the Entry,
    // proving the renderer reads Core's persisted state on a fresh load rather
    // than an optimistic cache entry.
    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Persisted entry' }) },
    });
    await reloadWindow(mainWindow);

    await expect(
      mainWindow.getByRole('cell', { name: 'Persisted entry' })
    ).toBeVisible();
  });

  test('creates and persists a multi-language translatable entry across both languages', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const collection = await createBilingualCollectionViaIpc(
      mainWindow,
      project.id
    );

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // A Project with more than one supported language renders the translatable
    // widget: the default-language input plus a translations dialog. The trigger
    // (named by the Phase 0 sr-only label) is what distinguishes the multi
    // language field from a single-language plain input.
    await expect(
      mainWindow.getByRole('button', { name: 'Edit translations for Title' })
    ).toBeVisible();

    // Fill both languages through the dialog, then create.
    await fillEntryForm(mainWindow, { Title: { en: 'Hello', de: 'Hallo' } });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // The create did not throw, shown by the redirect to the Collection detail.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // Persistence: open the new Entry's update form (the table cell shows the
    // project-default 'en' value), reload to force a fresh read from Core, then
    // open the translations dialog and confirm both languages persisted.
    await mainWindow.getByRole('cell', { name: 'Hello' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/[^/]+/update$`)
    );
    await reloadWindow(mainWindow);

    const updateTrigger = mainWindow.getByRole('button', {
      name: 'Edit translations for Title',
    });
    await expect(updateTrigger).toBeVisible();
    await updateTrigger.click();

    const dialog = mainWindow.getByRole('dialog', { name: 'Title' });
    await expect(dialog.getByLabel('en', { exact: true })).toHaveValue('Hello');
    await expect(dialog.getByLabel('de', { exact: true })).toHaveValue('Hallo');
  });

  test('flags a required translatable field invalid when a language is left empty', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const collection = await createBilingualCollectionViaIpc(
      mainWindow,
      project.id
    );

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // On open the translations trigger is not flagged (no validation has run).
    const translationsTrigger = mainWindow.getByRole('button', {
      name: 'Edit translations for Title',
    });
    await expect(translationsTrigger).toHaveAttribute('aria-invalid', 'false');

    // Fill only 'en' through the dialog, leaving the required 'de' empty. Filling
    // one language dirties the form, so the create button leaves the dirty gate.
    await fillEntryForm(mainWindow, { Title: { en: 'Only English' } });
    const createButton = mainWindow.getByRole('button', {
      name: 'Create Article',
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Per-language required validation blocks the submit: nothing is created
    // (still on the create route) and the translations trigger flips to invalid
    // (its aria-invalid tracks errors in the other, non-default languages).
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );
    await expect(translationsTrigger).toHaveAttribute('aria-invalid', 'true');
  });

  test('formats temporal fields and relative columns per the user language', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow, { language: 'de' });
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dateFieldDefinition(),
        datetimeFieldDefinition(),
        timeFieldDefinition(),
      ],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Temporal entry' }),
        published: temporalValue({ en: '2026-01-15' }),
        'event-at': temporalValue({ en: '2026-01-15T09:30:00.000Z' }),
        'opens-at': temporalValue({ en: '14:30:00' }),
      },
    });

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // The temporal columns render (their header is present) and the Entry's row
    // is the stable anchor by its title cell.
    await expect(
      mainWindow.getByRole('columnheader', { name: 'Published' })
    ).toBeVisible();
    const row = mainWindow.getByRole('row', { name: /Temporal entry/ });

    // Wait until the on-demand `date-fns/locale/de` import resolves and the
    // relative Created/Updated column re-renders in German ("vor" is the German
    // "ago" prefix; the en-US fallback would read "... ago"). The fixture's
    // console assertion independently proves the dynamic import did not fail.
    await expect(row).toContainText('vor');
    const deRow = await row.innerText();

    // Switch the User to English and reload, so the renderer re-reads the User
    // and reformats the same Entry for 'en'.
    await setUserViaIpc(mainWindow, { language: 'en' });
    await reloadWindow(mainWindow);

    const enRowLocator = mainWindow.getByRole('row', {
      name: /Temporal entry/,
    });
    await expect(enRowLocator).toContainText('ago');
    const enRow = await enRowLocator.innerText();

    // Language drives formatting: the same Entry renders differently in the two
    // languages (German words and date/time formats vs English), which is a
    // stronger and less brittle assertion than pinning an exact format string.
    expect(deRow).not.toEqual(enRow);
    expect(deRow).toContain('vor');
    expect(enRow).toContain('ago');
  });

  test('back-fills a newly added field default on entry update without losing existing values', async ({
    mainWindow,
  }) => {
    // Field A is the default required "title"; seed an Entry holding only
    // A, then add field B (an optional text field with a default) to the
    // Collection after the Entry exists.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'x' }) },
    });

    // updateCollectionViaIpc takes the full UpdateCollectionProps, so spread the
    // Collection plus projectId (as the update form does) with B appended.
    await updateCollectionViaIpc(mainWindow, {
      ...collection,
      projectId: project.id,
      fieldDefinitions: [
        ...collection.fieldDefinitions,
        textFieldDefinition({
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          isRequired: false,
          defaultValue: 'Default subtitle',
        }),
      ],
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    // The update form back-fills B's default while preserving A's stored value.
    // A is exact "Title"; B is optional, so its label carries an "- optional"
    // suffix and is matched without exactness.
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'x'
    );
    await expect(mainWindow.getByLabel('Subtitle')).toHaveValue(
      'Default subtitle'
    );

    // Back-filling alone does not dirty the form (opening an Entry after a
    // schema change is not a user edit), so the update stays dirty-gated.
    const updateButton = mainWindow.getByRole('button', {
      name: 'Update Article',
    });
    await expect(updateButton).toBeDisabled();

    // Editing the new field (B, leaving A untouched) dirties the form and
    // enables the save, so a successful save proves A was not lost.
    await mainWindow.getByLabel('Subtitle').fill('Custom subtitle');
    await expect(updateButton).toBeEnabled();
    await updateButton.click();

    // The update did not throw, shown by the redirect to the Collection detail.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // A fresh read reflects both values: A preserved and B round-tripped.
    await reloadWindow(mainWindow);
    await expect(
      mainWindow.getByRole('cell', { name: 'x', exact: true })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('cell', { name: 'Custom subtitle' })
    ).toBeVisible();
  });

  test('marks a Value another Entry already uses on the field that holds it', async ({
    mainWindow,
  }) => {
    // A unique Title field: a second Entry reusing a Value collides, and Core
    // rejects the create with a Conflict naming the field and the language
    // (see Core's fields docs). The form shows it below that field, which is
    // where ci's Messages table puts a field that is wrong.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ isUnique: true }),
        textFieldDefinition({
          slug: 'note',
          label: { en: 'Note' },
          isRequired: false,
        }),
      ],
    });
    // Seed the first Entry over IPC holding the Value the form will collide
    // with. Core asks for a Value per field definition, so the optional one is
    // seeded empty.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Taken title' }),
        note: stringValue({ en: null }),
      },
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // Re-entering the taken Value and submitting collides. The desktop app
    // owns only its part: putting the Conflict on its own field. Core's
    // uniqueness enforcement is Core's own test.
    await fillEntryForm(mainWindow, { Title: 'Taken title' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // The sentence stands below the Title field, that field is marked invalid,
    // and no dialog and no error screen takes over. The fixture's
    // console-clean assertion backs the no-boundary claim (a boundary would
    // log and fail the run).
    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expectErrorOf(mainWindow, 'Title').toBe(
      'Another Entry already uses this Value. Change it to save.'
    );
    expect(await errorOf(mainWindow, 'Note')).toBeNull();
    await expect(
      mainWindow.getByRole('dialog', { name: 'Could not save this Entry' })
    ).toBeHidden();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
  });

  test('sends a refusal that names no field of this form to the error screen', async ({
    electronApp,
    mainWindow,
  }) => {
    // The same `Conflict` type Core raises for a taken Value also stands for
    // refusals that name no field, and a `BadRequest` does too. One of those
    // has no field to land on, so it has to reach the root error boundary
    // rather than being swallowed by the map that places the others.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Anything' });

    await stubCoreRejectWithType(
      electronApp,
      'core:entries:create',
      'Conflict'
    );
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
  });

  test('marks a reference whose Asset is gone on the field that holds it', async ({
    mainWindow,
  }, testInfo) => {
    // An Asset chosen in the form and deleted before the save, which is the
    // race between two windows. Core refuses the write with a BadRequest
    // naming the field and the language of each reference it could not
    // resolve.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({
          slug: 'cover',
          label: { en: 'Cover' },
          isRequired: false,
          min: null,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    // Choose names the field it fills, and the Asset in the picker is named
    // after the file it was added from.
    await mainWindow.getByRole('button', { name: 'Choose Cover' }).click();
    const picker = mainWindow.getByRole('dialog');
    await expect(
      picker.getByRole('heading', { name: 'Choose Cover' })
    ).toBeVisible();
    await picker.getByRole('radio', { name: /showroom/ }).click();
    await picker.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(picker).toBeHidden();

    // Somebody else removes the Asset while this Entry is still being written.
    await deleteAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
      extension: asset.extension,
    });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    await expectErrorOf(mainWindow, 'Cover').toBe(
      'An Asset this field points at no longer exists. Choose another one.'
    );
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );
  });

  test('marks an Asset of a type a field no longer takes inside its own section', async ({
    mainWindow,
  }, testInfo) => {
    // A section's Asset field that is narrowed to images of one type after the
    // Entry was written. Core refuses the next save and names the section the
    // field sits in, so the message has to land on that field rather than on
    // the dynamic field around it.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.jpg', jpegBytes),
      name: 'Showroom',
    });
    // Both definitions are held here, so the update below keeps their ids,
    // which is what Core matches a definition by.
    const headlineDefinition = textFieldDefinition({
      slug: 'headline',
      label: { en: 'Headline' },
    });
    const coverDefinition = assetFieldDefinition({
      slug: 'cover',
      label: { en: 'Cover' },
      isRequired: false,
      min: null,
    });
    const hero = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [headlineDefinition, coverDefinition],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [hero.id] }),
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
            values: {
              headline: stringValue({ en: 'Service you can book online' }),
              cover: assetReferenceValue(asset.id),
            },
          },
        ]),
      },
    });

    // The Component's Asset field is narrowed to PNG, which the JPEG the
    // section holds is not. Core keeps the restriction off its schemas, since
    // a reference carries no type, so nothing refuses it until the next save.
    await updateComponentViaIpc(mainWindow, {
      ...hero,
      projectId: project.id,
      fieldDefinitions: [
        headlineDefinition,
        { ...coverDefinition, ofAssetMimeTypes: ['image/png'] },
      ],
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'Service'
    );
    await fillEntryForm(mainWindow, { Title: 'Service and repairs' });
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();

    // The section's own field carries the message, and the dynamic field it
    // sits in is not marked at all.
    await expectErrorOf(mainWindow, 'Cover').toBe(
      'This field does not take an Asset of that type. Choose another one.'
    );
    expect(await errorOf(mainWindow, 'Sections')).toBeNull();
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
  });

  test('keeps the decimals of a number Value', async ({ mainWindow }) => {
    // A price of 19.99, which Core's number Value and its bounds take. Reading
    // the input with parseInt saved 19 instead, and silently, since 19 is a
    // number Core takes as well.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        numberFieldDefinition({
          slug: 'price',
          label: { en: 'Price' },
          min: 0,
          max: 100,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, {
      Title: 'Spring service',
      Price: '19.99',
    });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // What was saved, read back from Core rather than off the form.
    const entries = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const price = entries[0]?.values['price'];
    expect(price?.valueType === 'number' ? price.content['en'] : null).toBe(
      19.99
    );
  });

  test('marks only the field a nested error belongs to', async ({
    mainWindow,
  }) => {
    // A required field inside a section, left empty. The message belongs to
    // that field, and the dynamic field around it must not claim it: an editor
    // would be pointed at the list of sections rather than at the field inside
    // it.
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
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [hero.id] }),
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
            values: { headline: stringValue({ en: 'Book online' }) },
          },
        ]),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const headline = mainWindow.getByLabel('Headline', { exact: true });
    await expect(headline).toHaveValue('Book online');
    await headline.fill('');
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();

    // The inner field says what is wrong and is marked invalid, while the
    // field holding the sections says nothing and is not.
    await expect(headline).toHaveAttribute('aria-invalid', 'true');
    await expectErrorOf(mainWindow, 'Headline').not.toBeNull();
    expect(await errorOf(mainWindow, 'Sections')).toBeNull();
    await expect(
      mainWindow.getByRole('button', { name: 'Add section' })
    ).toHaveAttribute('aria-invalid', 'false');
    // The form's own backstop stays quiet, since the field shows the message.
    await expect(
      mainWindow.getByText("This form can't be saved", { exact: false })
    ).toBeHidden();
  });

  test('routes an unexpected create failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }) => {
    // The create answers only the refusals that belong on a field in place;
    // every other failure must reach the root error boundary. This guards the useAppMutation
    // predicate against a regression back to a blanket throwOnError: false, which
    // would swallow an unexpected failure into the in-place dialog and drop it
    // from the logs entirely (see error-handling.md and the projects delete
    // spec for the full rationale).
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // Fill the required Title first, so the dirty-gated Create button enables.
    await fillEntryForm(mainWindow, { Title: 'Anything' });

    // Make the create reject with a non-Conflict error (a plain Error carries no
    // CoreError type), which the form does not handle in place.
    await stubCoreReject(electronApp, 'core:entries:create');
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // The failure propagates: the root error boundary replaces the view.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
  });

  test('paginates and filters the entry table client side', async ({
    mainWindow,
  }) => {
    // Seed 11 Entries, one past the page size of 10, so a second page
    // exists. Titles are zero-padded so an exact cell locator is unambiguous.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    for (let i = 1; i <= 11; i++) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: {
          title: stringValue({ en: `Entry ${String(i).padStart(2, '0')}` }),
        },
      });
    }

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // The route loads the whole Collection (limit 0) and the table paginates it
    // client side at a page size of 10. Wait for the real table (its "Title"
    // header, not the skeleton), then the first page shows 10 data rows plus the
    // header row.
    await expect(
      mainWindow.getByRole('columnheader', { name: 'Title' })
    ).toBeVisible();
    await expect(mainWindow.getByRole('row')).toHaveCount(11);

    // The pagination controls are hrefless anchors (a generic role, so their
    // disabled state is only exposed through aria-disabled, not a native
    // disabled property) named by their aria-label. On the first page Previous
    // is disabled and Next is enabled (11 over a page size of 10 is two pages).
    const previous = mainWindow.getByLabel('Go to previous page');
    const next = mainWindow.getByLabel('Go to next page');
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toHaveAttribute('aria-disabled', 'false');

    // Advancing pages the rows: the second page holds the 11th Entry, so one data
    // row plus the header remain, and the control state flips.
    await next.click();
    await expect(mainWindow.getByRole('row')).toHaveCount(2);
    await expect(previous).toHaveAttribute('aria-disabled', 'false');
    await expect(next).toHaveAttribute('aria-disabled', 'true');

    // Going back restores the full first page.
    await previous.click();
    await expect(mainWindow.getByRole('row')).toHaveCount(11);
    await expect(previous).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toHaveAttribute('aria-disabled', 'false');

    // The filter narrows the rows client side across every page. 'Entry 11'
    // started on the second page, so a match proves the filter also resets to
    // the first page (one data row plus the header).
    const filter = mainWindow.getByRole('textbox', {
      name: 'Filter Articles',
    });
    await filter.fill('Entry 11');
    await expect(mainWindow.getByRole('row')).toHaveCount(2);
    await expect(
      mainWindow.getByRole('cell', { name: 'Entry 11', exact: true })
    ).toBeVisible();

    // The summary counts the match against the whole Collection, not just the
    // filtered rows: "1 of 11 total". A regression to getRowCount() (the filtered
    // count) would read "1 of 1 total".
    await expect(mainWindow.getByText('Showing 1 of 11 total')).toBeVisible();

    // A substring matches every title that contains it: 'Entry 1' matches
    // 'Entry 10' and 'Entry 11' (two data rows plus the header).
    await filter.fill('Entry 1');
    await expect(mainWindow.getByRole('row')).toHaveCount(3);

    // A no-match filter collapses to the "No results." row.
    await filter.fill('zzzzz');
    await expect(mainWindow.getByText('No results.')).toBeVisible();

    // Clearing the filter restores the full first page.
    await filter.fill('');
    await expect(mainWindow.getByRole('row')).toHaveCount(11);
  });

  test('chooses one Asset from the keyboard and names every button after its field', async ({
    mainWindow,
  }, testInfo) => {
    // A required Asset field that takes one Asset, which is the shape ci draws
    // with Replace on its row.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // Core keeps an Asset's name as a slug, so the names the field and the
    // picker show are read back from what it wrote.
    const showroom = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const serviceTeam = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'service-team.jpg', jpegBytes),
      name: 'Service team',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({ slug: 'cover', label: { en: 'Cover' } }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    // Nothing chosen yet, so the field says so and offers Choose, whose name
    // carries its field's label and the word the role of a button cannot.
    await expect(mainWindow.getByText('No Asset chosen')).toBeVisible();
    const choose = mainWindow.getByRole('button', {
      name: 'Choose Cover, Required',
      exact: true,
    });
    await choose.focus();
    await mainWindow.keyboard.press('Enter');

    // One Asset, so each card carries a radio button, and the choice reaches
    // the field only once Choose is pressed.
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Cover' });
    await expect(picker).toBeVisible();
    // shadcn's dialog and radio group on Base UI, not markup of our own.
    await expect(picker).toHaveAttribute('data-slot', 'dialog-content');
    await expect(
      picker.getByRole('radiogroup', { name: 'Choose Cover' })
    ).toHaveAttribute('data-slot', 'radio-group');
    // Named by the Asset and what it is, with its preview out of the way.
    const radio = picker.getByRole('radio', {
      name: `${showroom.name} PNG, 70 Bytes`,
      exact: true,
    });
    await expect(radio).toHaveAttribute('data-slot', 'radio-group-item');
    await radio.focus();
    await mainWindow.keyboard.press('Space');
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    const confirm = picker.getByRole('button', { name: 'Choose', exact: true });
    await confirm.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(picker).toBeHidden();

    // The row ci draws: the Asset's name, its type and its size, with Replace
    // and Remove named after the field.
    await expect(
      mainWindow.getByText(showroom.name, { exact: true })
    ).toBeVisible();
    await expect(mainWindow.getByText('PNG, 70 Bytes')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: 'Replace Cover, Required',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: `Remove ${showroom.name} from Cover`,
        exact: true,
      })
    ).toBeVisible();
    // The field holds one Asset and takes one, so Choose is gone.
    await expect(choose).toBeHidden();

    // Replace opens the picker on the Asset it would replace, and swaps it.
    const replace = mainWindow.getByRole('button', {
      name: 'Replace Cover, Required',
      exact: true,
    });
    await replace.focus();
    await mainWindow.keyboard.press('Enter');
    const replacePicker = mainWindow.getByRole('dialog', {
      name: 'Replace Cover',
    });
    await expect(
      replacePicker.getByText(`The one you choose replaces ${showroom.name}.`)
    ).toBeVisible();
    await expect(
      replacePicker.getByRole('radio', { name: showroom.name })
    ).toHaveAttribute('aria-checked', 'true');
    const other = replacePicker.getByRole('radio', {
      name: serviceTeam.name,
    });
    await other.focus();
    await mainWindow.keyboard.press('Space');
    await replacePicker
      .getByRole('button', { name: 'Choose', exact: true })
      .click();
    await expect(replacePicker).toBeHidden();
    await expect(
      mainWindow.getByRole('button', {
        name: `Remove ${serviceTeam.name} from Cover`,
        exact: true,
      })
    ).toBeVisible();

    // What the field holds is what Core stores: one reference to the Asset
    // that was chosen last.
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const [entry] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(entry?.values['cover']?.content).toEqual({
      en: [{ id: expect.any(String), objectType: 'asset' }],
    });
  });

  test('chooses several Entries from the keyboard and holds the field at its maximum', async ({
    mainWindow,
  }) => {
    // An Entry field that takes up to two Entries out of three, which is the
    // shape ci draws with a checkbox per row.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const team = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Author' }, plural: { en: 'Team' } },
      description: { en: 'Authors created by the E2E tests' },
      slug: { singular: 'author', plural: 'team' },
    });
    for (const name of ['Mara Klein', 'Jonas Brandt', 'Lena Vogt']) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: team.id,
        values: { title: stringValue({ en: name }) },
      });
    }
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition({
          slug: 'authors',
          label: { en: 'Authors' },
          ofCollections: [team.id],
          max: 2,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    await expect(mainWindow.getByText('No Entry chosen')).toBeVisible();
    const choose = mainWindow.getByRole('button', {
      name: 'Choose Authors',
      exact: true,
    });
    await choose.focus();
    await mainWindow.keyboard.press('Enter');

    // Several Entries, so each row carries a checkbox, and its filter is named
    // after the one Collection the field allows.
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Authors' });
    await expect(
      picker.getByRole('textbox', { name: 'Filter Team' })
    ).toBeVisible();
    const mara = picker.getByRole('checkbox', { name: 'Mara Klein' });
    const jonas = picker.getByRole('checkbox', { name: 'Jonas Brandt' });
    const lena = picker.getByRole('checkbox', { name: 'Lena Vogt' });
    // shadcn's checkbox on Base UI, not markup of our own.
    await expect(mara).toHaveAttribute('data-slot', 'checkbox');
    await mara.focus();
    await mainWindow.keyboard.press('Space');
    await jonas.focus();
    await mainWindow.keyboard.press('Space');
    await expect(mara).toHaveAttribute('aria-checked', 'true');
    await expect(jonas).toHaveAttribute('aria-checked', 'true');

    // The maximum holds in the picker: the third Entry cannot be ticked while
    // two are, so the field can never come back holding more than it takes.
    await expect(lena).toBeDisabled();
    await lena.focus();
    await mainWindow.keyboard.press('Space');
    await expect(lena).toHaveAttribute('aria-checked', 'false');

    await picker.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(picker).toBeHidden();

    // A row per chosen Entry, each with its Collection's name and a Remove
    // named after the Entry and the field, and Choose is gone at the maximum.
    await expect(
      mainWindow.getByRole('button', {
        name: 'Remove Mara Klein from Authors',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: 'Remove Jonas Brandt from Authors',
        exact: true,
      })
    ).toBeVisible();
    await expect(mainWindow.getByText('Author').first()).toBeVisible();
    await expect(choose).toBeHidden();

    // Removing one brings Choose back, since the field allows another again.
    await mainWindow
      .getByRole('button', { name: 'Remove Jonas Brandt from Authors' })
      .click();
    await expect(choose).toBeVisible();

    // Core wants a Collection beside each Entry reference, so a save that goes
    // through is what proves the picker built them.
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const [entry] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(entry?.values['authors']?.content).toEqual({
      en: [
        {
          id: expect.any(String),
          objectType: 'entry',
          collectionId: team.id,
        },
      ],
    });
  });

  test('shows a select field as radio buttons led by None, and saves the option it stored before', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), selectFieldDefinition()],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    // The options stand on screen as radio buttons rather than behind a menu,
    // in one group named after the field, and None leads them because the
    // Value of an optional field may stay empty.
    const group = mainWindow.getByRole('radiogroup', { name: 'Style' });
    await expect(group).toBeVisible();
    // shadcn's radio group on Base UI, not markup of our own.
    await expect(group).toHaveAttribute('data-slot', 'radio-group');
    await expect(group.getByRole('radio').first()).toHaveAttribute(
      'data-slot',
      'radio-group-item'
    );
    await expect(group.getByRole('radio')).toHaveCount(3);
    // Each radio button is named by the label beside it, and None leads them.
    await expect(group.locator('label[data-slot="label"]')).toHaveText([
      'None',
      'Primary',
      'Outline',
    ]);
    await expect(group.getByRole('radio', { name: 'None' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    const primary = group.getByRole('radio', { name: 'Primary' });
    await primary.focus();
    await mainWindow.keyboard.press('Space');
    await expect(primary).toHaveAttribute('aria-checked', 'true');

    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    // The option's own value, which is what the menu stored before it became a
    // list of radio buttons.
    const [entry] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(entry?.values['style']?.content).toEqual({ en: 'primary' });
  });

  test('shows a select field with more options than fit as a dropdown with a filter', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // Seven options still read as a list, so eight is the first that does not.
    const many = Array.from({ length: 8 }, (_, index) => ({
      value: `option-${String(index + 1)}`,
      label: { en: `Option ${String(index + 1)}` },
    }));
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        selectFieldDefinition({ isRequired: true, options: many }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    // No list of radio buttons at this length, but the one control whose role
    // carries both the field's name and that it has to be filled.
    await expect(
      mainWindow.getByRole('radiogroup', { name: 'Style' })
    ).toBeHidden();
    const trigger = mainWindow.getByRole('combobox', { name: 'Style' });
    // shadcn's combobox on Base UI, not markup of our own.
    await expect(trigger).toHaveAttribute('data-slot', 'combobox-trigger');
    await expect(trigger).toHaveAttribute('aria-required', 'true');
    await trigger.focus();
    await mainWindow.keyboard.press('Enter');

    // The filter inside the popup narrows the options, and a required field
    // offers no None at all.
    const filter = mainWindow.getByRole('combobox', { name: 'Filter options' });
    await expect(filter).toBeVisible();
    await expect(mainWindow.getByRole('option', { name: 'None' })).toBeHidden();
    await filter.fill('Option 7');
    await expect(mainWindow.getByRole('option')).toHaveCount(1);
    await mainWindow.getByRole('option', { name: 'Option 7' }).click();

    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const [entry] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(entry?.values['style']?.content).toEqual({ en: 'option-7' });
  });

  test("keeps a picker's body scrolling and its buttons in view at the smallest window", async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    // Enough Assets that the grid is taller than the window, which is what a
    // dialog with no scrolling body would push its buttons out of.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    for (let index = 1; index <= 12; index++) {
      await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath: makeTempFile(
          testInfo,
          `asset-${String(index)}.png`,
          pngBytes
        ),
        name: `Asset ${String(index)}`,
      });
    }
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({
          slug: 'cover',
          label: { en: 'Cover' },
          isRequired: false,
          min: null,
          max: null,
        }),
      ],
    });

    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow.getByRole('button', { name: 'Choose Cover' }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Cover' });
    await expect(picker).toBeVisible();

    // The body is what scrolls, so the dialog itself fits the window and both
    // buttons stay inside it.
    const measured = await mainWindow.evaluate(() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]');
      // The body is a scroll area, so what scrolls is its viewport rather
      // than the element the dialog lays out.
      const body = document.querySelector(
        '[data-slot="dialog-body"] [data-slot="scroll-area-viewport"]'
      );
      const footer = document.querySelector('[data-slot="dialog-footer"]');
      if (dialog === null || body === null || footer === null) {
        throw new Error('The picker draws no dialog with a body and a footer');
      }
      return {
        viewport: window.innerHeight,
        dialogBottom: dialog.getBoundingClientRect().bottom,
        dialogTop: dialog.getBoundingClientRect().y,
        footerBottom: footer.getBoundingClientRect().bottom,
        bodyScrolls: body.scrollHeight > body.clientHeight,
      };
    });
    expect(measured.bodyScrolls).toBe(true);
    expect(measured.dialogTop).toBeGreaterThanOrEqual(0);
    expect(measured.dialogBottom).toBeLessThanOrEqual(measured.viewport);
    expect(measured.footerBottom).toBeLessThanOrEqual(measured.viewport);
    await expect(
      picker.getByRole('button', { name: 'Choose', exact: true })
    ).toBeInViewport();
    await expect(
      picker.getByRole('button', { name: 'Cancel' })
    ).toBeInViewport();
    expect(await windowSize(electronApp)).toEqual(MINIMUM_WINDOW_SIZE);
  });
});

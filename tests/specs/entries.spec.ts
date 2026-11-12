import { expect, type Page } from '@playwright/test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  supportedLanguageSchema,
  type Collection,
  type MdAstRoot,
} from '@elek-io/core';

import { closeApp, test, testDataDirs } from '../fixtures/electronApp.js';
import { relaunchApp } from '../helpers/app.js';
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
  ipv4FieldDefinition,
  markdownFieldDefinition,
  navigateToCollection,
  numberFieldDefinition,
  rangeFieldDefinition,
  referenceFieldDefinition,
  selectFieldDefinition,
  slugFieldDefinition,
  telephoneFieldDefinition,
  textFieldDefinition,
  timeFieldDefinition,
  updateCollectionViaIpc,
  urlFieldDefinition,
} from '../helpers/collection.js';
import {
  createComponentViaIpc,
  updateComponentViaIpc,
} from '../helpers/component.js';
import {
  assetReferenceValue,
  chooseLanguage,
  componentValue,
  createEntryViaIpc,
  entryRow,
  fillEntryForm,
  languageSwitch,
  listEntriesViaIpc,
  markdownEditorSurface,
  markdownValue,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  referenceValue,
  stringValue,
  temporalValue,
  updateEntryViaIpc,
} from '../helpers/entry.js';
import { stubCoreReject, stubCoreRejectWithType } from '../helpers/ipc.js';
import { bootOnHash, mainPanel, reloadWindow } from '../helpers/navigation.js';
import {
  addProjectLanguageViaIpc,
  createProjectViaIpc,
} from '../helpers/project.js';
import { createReleaseViaIpc } from '../helpers/release.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
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
  test('creates an entry through the form and shows it in the list', async ({
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

    // One language is nothing to switch between, so the editor carries no
    // switch at all.
    await expect(languageSwitch(mainWindow)).toHaveCount(0);

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
    await expect(entryRow(mainWindow, 'Hello World')).toBeVisible();
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

    // The toast is how Core's success surfaces (the update did not throw). The
    // Entry stays open beside its list, which is what ci's three panes are
    // for, and the list reflects the result: the row now shows the edited
    // value and the original is gone.
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/${entry.id}/update`)
    );
    await expect(entryRow(mainWindow, 'Edited title')).toBeVisible();
    await expect(entryRow(mainWindow, 'Original title')).toBeHidden();
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
    await expect(entryRow(mainWindow, 'Referring article')).toBeVisible();
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
    await expect(
      mainWindow.getByRole('button', { name: 'Create Article' })
    ).toBeDisabled();
    await expect(
      mainWindow.getByLabel('Email', { exact: true })
    ).toHaveAttribute('aria-invalid', 'false');

    // Required path: filling the optional Note dirties the form while the
    // required Email stays empty, which blocks Save with its reason rather
    // than refusing the Value on submit, since Core would refuse the Entry
    // either way. Optional field labels carry an "- optional" suffix, so
    // match Note without exactness rather than through the exact-label
    // fillEntryForm helper.
    await mainWindow.getByLabel('Note').fill('Just a note');
    await expect(
      mainWindow.getByText('English is missing 1 Value')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Create Article' })
    ).toBeDisabled();

    // Format path: a syntactically invalid value is no missing Value, so Save
    // is pressable again and the submit refuses it at its field.
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

  test("says in an editor's words what each field needs", async ({
    mainWindow,
  }) => {
    // One field per refusal an Entry's fields can produce by typing: a length
    // from both ends, a number from both ends, each format a field type asks
    // for, a Value left out and a list left empty. Everything is refused in
    // one submit, so what every field says is read from one form.
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
        textFieldDefinition({ min: 3, max: 200 }),
        textFieldDefinition({
          slug: 'subtitle',
          label: { en: 'Subtitle' },
          max: 10,
        }),
        numberFieldDefinition({ min: 2, max: 200 }),
        numberFieldDefinition({
          slug: 'score',
          label: { en: 'Score' },
          min: null,
          max: 8,
        }),
        emailFieldDefinition(),
        urlFieldDefinition(),
        ipv4FieldDefinition(),
        telephoneFieldDefinition(),
        assetFieldDefinition({ isRequired: false }),
        dynamicFieldDefinition({ ofComponents: [component.id], min: 2 }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, {
      Title: 'Ab',
      Subtitle: 'Far too long for ten',
      Rating: '1',
      Score: '99',
      Email: 'nobody',
      Homepage: 'nowhere',
      Server: 'nowhere',
      Hotline: 'nobody',
    });
    // One section where the field asks for two, which is the one count an
    // editor can be short of: a picker holds a field at its maximum, so no
    // field can hold more than it takes.
    await mainWindow.getByRole('button', { name: 'Add section' }).click();
    await mainWindow.getByRole('menuitem', { name: 'Teaser' }).click();
    await fillEntryForm(mainWindow, { Headline: 'One of two' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    await expectErrorOf(mainWindow, 'Title').toBe('Use at least 3 characters.');
    expect(await errorOf(mainWindow, 'Subtitle')).toBe(
      'Use up to 10 characters.'
    );
    expect(await errorOf(mainWindow, 'Rating')).toBe('Use 2 or more.');
    expect(await errorOf(mainWindow, 'Score')).toBe('Use 8 or less.');
    expect(await errorOf(mainWindow, 'Email')).toBe(
      'Enter an email address, such as name@example.com.'
    );
    expect(await errorOf(mainWindow, 'Homepage')).toBe(
      'Enter a web address, such as https://elek.io.'
    );
    expect(await errorOf(mainWindow, 'Server')).toBe(
      'Enter an IPv4 address, such as 192.168.0.1.'
    );
    expect(await errorOf(mainWindow, 'Hotline')).toBe(
      'Enter a phone number with its country code, such as +4930123456.'
    );
    // A list that is short of the count it asks for, which is the one count an
    // editor can be short of. A Value nobody filled in is answered before the
    // submit instead, by Save's own block, see the specs of a missing Value.
    expect(await errorOf(mainWindow, 'Sections')).toBe(
      'This field needs at least 2.'
    );

    // And nothing zod wrote is anywhere on the screen, which is what every
    // one of these fields showed before.
    const shown = await mainWindow.locator('body').innerText();
    for (const word of ['expected', 'Too small', 'Too big', '>=', '<=']) {
      expect(shown).not.toContain(word);
    }
  });

  test('says what a slug field needs rather than what Core wrote', async ({
    mainWindow,
  }) => {
    // The two refusals Core words itself that land on a slug field. Submitted
    // with Enter rather than with Save, because the control puts a slug in
    // form when the field is left, so clicking Save would fix the Value on the
    // way out and nothing would be refused.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), slugFieldDefinition()],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const handle = mainWindow.getByLabel('Handle', { exact: true });
    await fillEntryForm(mainWindow, { Title: 'Spring service' });

    // Text that is a slug once it is in form says which form, worked out with
    // Core's own helper rather than read out of Core's message.
    await handle.fill('Not A Slug');
    await handle.press('Enter');
    await expectErrorOf(mainWindow, 'Handle').toBe(
      'This field needs "not-a-slug" instead.'
    );

    // And text that holds nothing a slug can be made of says what to use.
    await handle.fill('???');
    await handle.press('Enter');
    await expectErrorOf(mainWindow, 'Handle').toBe(
      'Use letters or numbers, so this can be part of a web address.'
    );

    // Neither of Core's two sentences reached the screen.
    const shown = await mainWindow.locator('body').innerText();
    expect(shown).not.toContain('URL-safe');
    expect(shown).not.toContain('canonical');
  });

  test('says how many blocks a markdown field is short of or over', async ({
    mainWindow,
  }) => {
    // Core counts a markdown field's blocks on the tree inside the Value, so
    // both of these refusals land below the path the field binds. They are the
    // two an editor reaches by writing, and one submit refuses both.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({ isRequired: true, min: 2 }),
        markdownFieldDefinition({
          slug: 'teaser',
          label: { en: 'Teaser' },
          isRequired: true,
          max: 1,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring service' });
    const editors = markdownEditorSurface(mainWindow);
    await editors.first().click();
    await mainWindow.keyboard.type('One block, where the field asks for two');
    await editors.last().click();
    await mainWindow.keyboard.type('First block');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.type('Second block, where the field takes one');
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // Both fields say what they need and mark their editor, rather than the
    // press doing nothing at all.
    await expectErrorOf(mainWindow, 'Body').toBe(
      'This field needs at least 2.'
    );
    expect(await errorOf(mainWindow, 'Teaser')).toBe(
      'This field takes up to 1.'
    );
    await expect(editors.first()).toHaveAttribute('aria-invalid', 'true');
    await expect(editors.last()).toHaveAttribute('aria-invalid', 'true');
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/create$`)
    );
  });

  test("says what an Entry's fields need for a refusal Core worded itself", async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    // A reference to an Entry of a Collection the field does not allow, on an
    // Entry field and inside a markdown tree. Core refuses to write either, so
    // both are put into the Project's file and the app restarted, which is how
    // a Project a pull or another client changed arrives. The restart is also
    // what clears Core's file cache, which a write from outside cannot.
    //
    // Slow on purpose: two app launches, and the editor parses the tree it is
    // given before the form can be submitted.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // The one Collection both fields allow, and the Entry below belongs to
    // another one, so its reference to itself is one they do not take.
    const allowed = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Note' }, plural: { en: 'Notes' } },
      slug: { singular: 'note', plural: 'notes' },
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition({ ofCollections: [allowed.id] }),
        markdownFieldDefinition({
          ofCollections: [allowed.id],
          features: {
            ...markdownFieldDefinition().features,
            entryReferences: true,
          },
        }),
        markdownFieldDefinition({
          slug: 'notes',
          label: { en: 'Notes' },
          features: {
            ...markdownFieldDefinition().features,
            blockquotes: true,
          },
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring service' }),
        related: referenceValue(),
        body: markdownValue({ en: null }),
        notes: markdownValue({ en: null }),
      },
    });

    const file = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id,
      'collections',
      collection.id,
      `${entry.id}.json`
    );
    const stored = JSON.parse(readFileSync(file, 'utf8')) as {
      values: Record<string, Record<string, unknown>>;
    };
    const tree: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'See ' },
            {
              type: 'entryReference',
              collectionId: collection.id,
              entryId: entry.id,
              children: [{ type: 'text', value: 'this' }],
            },
          ],
        },
      ],
    };
    stored.values['related'] = {
      ...stored.values['related'],
      content: {
        en: [
          { objectType: 'entry', id: entry.id, collectionId: collection.id },
        ],
      },
    };
    stored.values['body'] = {
      ...stored.values['body'],
      content: { en: tree },
    };
    // And a tree nested deeper than Core walks, which is the other refusal Core
    // words itself on a markdown field.
    let deepest: MdAstRoot['children'][number] = {
      type: 'paragraph',
      children: [{ type: 'text', value: 'Deep' }],
    };
    for (let level = 0; level < 110; level += 1) {
      deepest = { type: 'blockquote', children: [deepest] };
    }
    stored.values['notes'] = {
      ...stored.values['notes'],
      content: { en: { type: 'root', children: [deepest] } },
    };
    writeFileSync(file, JSON.stringify(stored, null, 2));

    const { app, window } = await relaunchApp(testInfo, electronApp);
    try {
      await navigateToEntryUpdate(window, {
        projectId: project.id,
        collectionId: collection.id,
        entryId: entry.id,
      });
      await window
        .getByLabel('Title', { exact: true })
        .fill('Spring service, edited');
      await window.getByRole('button', { name: 'Update Article' }).click();

      // Each field says it in its own type's words, which is the one thing the
      // error map cannot do: Core's message arrives with the issue and outranks
      // every map.
      await expectErrorOf(window, 'Related').toBe(
        "One Entry here is from a Collection this field doesn't take. Choose another one."
      );
      await expectErrorOf(window, 'Body').toBe(
        "One Entry in this text is from a Collection this field doesn't take. Point it somewhere else."
      );
      await expectErrorOf(window, 'Notes').toBe(
        'This text has too many levels inside it. Take some out to save.'
      );

      // And Core's own English is nowhere on the page.
      const shown = await window.locator('body').innerText();
      expect(shown).not.toContain('must belong to one of the allowed');
      expect(shown).not.toContain('maximum nesting depth');
    } finally {
      // The relaunched app is not covered by the fixture teardown, so close it.
      await closeApp(app);
    }
  });

  test('lists every Entry beside the editor, with its two ways on', async ({
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

    // Both Entries have a row of their own, by the title each is named by.
    await expect(entryRow(mainWindow, 'First')).toBeVisible();
    await expect(entryRow(mainWindow, 'Second')).toBeVisible();
    await expect(mainWindow.getByText('No results.')).toBeHidden();

    // The head says what the list holds and how many, and holds the two ways
    // on ci draws there: the Collection's settings and a new Entry, each named
    // after the Collection.
    await expect(
      mainWindow.getByRole('heading', { name: 'Articles 2' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', {
        name: 'Settings of the Articles Collection',
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: 'Create Article' })
    ).toBeVisible();

    // Nothing is open, so the pane beside the list says so rather than
    // repeating either way on.
    await expect(mainWindow.getByText('No Entry chosen')).toBeVisible();
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

    await expect(entryRow(mainWindow, 'Persisted entry')).toBeVisible();
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

    // A Project with more than one language gets one switch above the fields,
    // and no field of its own opens a dialog for its translations.
    await expect(languageSwitch(mainWindow)).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: /Edit translations/ })
    ).toHaveCount(0);

    // Fill both languages through that one switch, then create.
    await fillEntryForm(mainWindow, { Title: { en: 'Hello', de: 'Hallo' } });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();

    // The create did not throw, shown by the redirect to the Collection.
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );

    // Persistence: open the new Entry (the list names it by its Value in the
    // Project's default language), reload to force a fresh read from Core,
    // then read each language through the switch.
    await entryRow(mainWindow, 'Hello').click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}/[^/]+/update`)
    );
    await reloadWindow(mainWindow);

    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('Hello');
    await chooseLanguage(mainWindow, 'de');
    await expect(title).toHaveValue('Hallo');
    // The language stays in the address, so coming back opens the one that was
    // left open rather than the Project's default.
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.includes('language=de')
    );
    await reloadWindow(mainWindow);
    await expect(title).toHaveValue('Hallo');
    // Saving keeps the Values of the language that is not on screen.
    await title.fill('Hallo Welt');
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();
    await chooseLanguage(mainWindow, 'en');
    await expect(title).toHaveValue('Hello');

    // An address naming a language the Project does not hold, and one Core
    // does not know at all, each open the Project's default language rather
    // than failing the route.
    const [opened] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const address = `#/projects/${project.id}/collections/${collection.id}/${opened?.id ?? ''}/update`;
    const openWith = async (named: string, settled: string): Promise<void> => {
      await bootOnHash(mainWindow, `${address}?language=${named}`, settled);
      await expect(title).toHaveValue('Hello');
    };
    // A language the Project does not hold, which stays in the address, and
    // one Core does not know at all, which is dropped from it.
    await openWith('fr', `${address}?language=fr`);
    await openWith('not-a-language', address);
  });

  test('marks the language that misses a Value, in the switch and at the field', async ({
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

    // Fill 'en' only, leaving the required 'de' empty. Core refuses an Entry
    // until every language of the Project holds each required Value, so Save
    // says which language misses how many rather than offering a save that
    // fails.
    await fillEntryForm(mainWindow, { Title: { en: 'Only English' } });
    await chooseLanguage(mainWindow, 'en');
    const createButton = mainWindow.getByRole('button', {
      name: 'Create Article',
    });
    await expect(
      mainWindow.getByText('German is missing 1 Value')
    ).toBeVisible();
    await expect(createButton).toBeDisabled();

    // The switch marks that language, in words a screen reader hears as well
    // as by the warning mark beside its code.
    await expect(
      languageSwitch(mainWindow).getByRole('button', {
        name: 'DE German, missing 1 Value',
      })
    ).toBeVisible();

    // Choosing it marks the field that misses the Value, and the Value to
    // translate from stands below it.
    await chooseLanguage(mainWindow, 'de');
    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('');
    await expect(mainWindow.getByText('Missing in German')).toBeVisible();
    await expect(
      mainWindow.getByText('In English: Only English')
    ).toBeVisible();

    // Filling it clears all three at once.
    await title.fill('Nur Deutsch');
    await expect(mainWindow.getByText('Missing in German')).toBeHidden();
    await expect(
      mainWindow.getByText('German is missing 1 Value')
    ).toBeHidden();
    await expect(createButton).toBeEnabled();
  });

  test('formats a Value and a date per the language the app is read in', async ({
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

    // The Entry's row says when it last changed, in the words of the language
    // the app is read in.
    const row = entryRow(mainWindow, 'Temporal entry');

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

    const enRowLocator = entryRow(mainWindow, 'Temporal entry');
    await expect(enRowLocator).toContainText('ago');
    const enRow = await enRowLocator.innerText();

    // Language drives formatting: the same Entry reads differently in the two
    // languages, which is a stronger and less brittle assertion than pinning
    // an exact format string.
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

    // The update did not throw, shown by the toast it answers with.
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();

    // A fresh read reflects both values: A preserved and B round-tripped.
    await reloadWindow(mainWindow);
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'x'
    );
    await expect(mainWindow.getByLabel('Subtitle')).toHaveValue(
      'Custom subtitle'
    );
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

  test('says that an Asset a field points at is gone and takes the reference out', async ({
    mainWindow,
  }, testInfo) => {
    // What a synchronize can leave behind: one side removed the Asset while
    // the other pointed an Entry at it. Core blocks a delete that would do
    // that, so the Asset's own files are what goes here, which is the state a
    // rebase integrates and Core then refuses to push.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const showroom = await createAssetViaIpc(mainWindow, {
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
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        cover: assetReferenceValue(showroom.id),
      },
    });
    const projectDir = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    rmSync(join(projectDir, 'assets', `${showroom.id}.json`));
    rmSync(join(projectDir, 'lfs', `${showroom.id}.${showroom.extension}`));

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'Spring opening hours'
    );

    // The field says what it holds rather than reading as empty, which is what
    // left this Value with nothing on screen to repair it.
    await expect(
      mainWindow.getByText('This Asset no longer exists')
    ).toBeVisible();
    await expect(mainWindow.getByText('No Asset chosen')).toBeHidden();
    // The row counts against the field's one place like any other, so Choose
    // comes back once the reference is out.
    const choose = mainWindow.getByRole('button', {
      name: 'Choose Cover',
      exact: true,
    });
    await expect(choose).toBeHidden();
    const remove = mainWindow.getByRole('button', {
      name: 'Remove the missing Asset from Cover',
      exact: true,
    });
    await remove.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(mainWindow.getByText('No Asset chosen')).toBeVisible();
    await expect(choose).toBeVisible();

    // The Entry saves again, which is the repair the message after a refused
    // synchronize asks for.
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();
    const [saved] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(saved?.values['cover']?.content).toEqual({ en: [] });
  });

  test('says that an Entry a field points at is gone and takes the reference out', async ({
    mainWindow,
  }, testInfo) => {
    // The same from the other side, and the same kind of state: the Entry is
    // gone while another Entry still points at it. Core blocks a delete that
    // would do that, and refuses the reference at the next save, so the row
    // has to be there to take out.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const team = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Author' }, plural: { en: 'Team' } },
      description: { en: 'Authors created by the E2E tests' },
      slug: { singular: 'author', plural: 'team' },
    });
    const mara = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: team.id,
      values: { title: stringValue({ en: 'Mara Klein' }) },
    });
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
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        authors: referenceValue(mara.id, team.id),
      },
    });
    rmSync(
      join(
        testDataDirs(testInfo).dataDir,
        'projects',
        project.id,
        'collections',
        team.id,
        `${mara.id}.json`
      )
    );

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'Spring opening hours'
    );

    await expect(
      mainWindow.getByText('This Entry is no longer available')
    ).toBeVisible();
    await expect(mainWindow.getByText('No Entry chosen')).toBeHidden();
    // The field takes two, so the one row leaves a place and Choose stands
    // beside it, while the row itself is the one to take out.
    const choose = mainWindow.getByRole('button', {
      name: 'Choose Authors',
      exact: true,
    });
    await expect(choose).toBeVisible();

    // The dialog counts what it can hand back rather than the reference it
    // cannot show, so nothing reads as chosen in there.
    await choose.click();
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Authors' });
    await expect(picker.locator('[data-slot="dialog-description"]')).toHaveText(
      'Up to 2 Entries.'
    );
    await picker.getByRole('button', { name: 'Cancel' }).click();
    await expect(picker).toBeHidden();

    const remove = mainWindow.getByRole('button', {
      name: 'Remove the missing Entry from Authors',
      exact: true,
    });
    await remove.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(mainWindow.getByText('No Entry chosen')).toBeVisible();

    await mainWindow.getByRole('button', { name: 'Update Article' }).click();
    await expect(mainWindow.getByText('Entry saved')).toBeVisible();
    const [saved] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(saved?.values['authors']?.content).toEqual({ en: [] });
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
        textFieldDefinition({
          slug: 'headline',
          label: { en: 'Headline' },
          min: 3,
        }),
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
    // Too short rather than empty, so the Value reaches the validator instead
    // of blocking Save as a Value that is missing.
    await headline.fill('Ab');
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();

    // The inner field says what is wrong and is marked invalid, while the
    // field holding the sections says nothing and is not.
    await expect(headline).toHaveAttribute('aria-invalid', 'true');
    await expectErrorOf(mainWindow, 'Headline').toBe(
      'Use at least 3 characters.'
    );
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

  test('lists every Entry of the Collection and narrows them with the filter', async ({
    mainWindow,
  }) => {
    // Eleven Entries, which is more than the list the table used to page at,
    // since ci's list of 296 px scrolls rather than paging. Titles are
    // zero-padded so each one is found exactly.
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

    // The route reads the whole Collection, and every Entry has a row, so
    // nothing is paged out of reach.
    const rows = mainWindow.locator('[data-slot="entry-row"]');
    await expect(rows).toHaveCount(11);
    await expect(entryRow(mainWindow, 'Entry 11')).toBeVisible();
    await expect(
      mainWindow.getByRole('heading', { name: 'Articles 11' })
    ).toBeVisible();

    // The filter narrows the rows by the title each Entry is named by.
    const filter = mainWindow.getByRole('textbox', {
      name: 'Filter Articles',
    });
    await filter.fill('Entry 11');
    await expect(rows).toHaveCount(1);
    await expect(entryRow(mainWindow, 'Entry 11')).toBeVisible();

    // A substring matches every title that holds it, which 'Entry 10' and
    // 'Entry 11' both do.
    await filter.fill('Entry 1');
    await expect(rows).toHaveCount(2);

    // A filter without matches says so in plain text, since the Collection
    // itself is not empty.
    await filter.fill('zzzzz');
    await expect(rows).toHaveCount(0);
    await expect(mainWindow.getByText('No results.')).toBeVisible();

    // Clearing it brings every row back.
    await filter.fill('');
    await expect(rows).toHaveCount(11);
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
    // Named by the Asset's file and what it is, with its preview out of the
    // way. The card is the Assets grid's own, so it names the file the Asset
    // is stored as.
    const radio = picker.getByRole('radio', {
      name: `${showroom.name}.${showroom.extension} PNG, 70 Bytes`,
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
    const chosenRow = mainWindow
      .getByRole('button', {
        name: `Remove ${showroom.name} from Cover`,
        exact: true,
      })
      .locator('..');
    await expect(chosenRow).toBeVisible();
    // The preview ci draws first in the row, which is the Asset's own file
    // rather than a stand-in for it.
    await expect(chosenRow.locator('img')).toHaveAttribute(
      'src',
      new RegExp(showroom.id)
    );
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

  test('chooses several Assets from the keyboard and holds the field at its maximum', async ({
    mainWindow,
  }, testInfo) => {
    // An Asset field that takes up to two images out of three, which is the
    // shape ci draws with a checkbox per card.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const showroom = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const serviceTeam = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'service-team.png', pngBytes),
      name: 'Service team',
    });
    const charging = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'charging-station.png', pngBytes),
      name: 'Charging station',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({
          slug: 'gallery',
          label: { en: 'Gallery' },
          isRequired: false,
          min: null,
          max: 2,
          ofAssetMimeTypes: ['image/png'],
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });

    const choose = mainWindow.getByRole('button', {
      name: 'Choose Gallery',
      exact: true,
    });
    await choose.focus();
    await mainWindow.keyboard.press('Enter');

    // The dialog says which Assets the field takes in a word rather than in
    // MIME types, and how many of them, which is what explains a card that
    // cannot be ticked further down.
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Gallery' });
    const says = picker.locator('[data-slot="dialog-description"]');
    await expect(says).toHaveText('Images only. Up to 2 Assets.');

    // Several Assets, so each card carries a checkbox rather than a radio
    // button, and the count follows what is ticked.
    const first = picker.getByRole('checkbox', {
      name: `${showroom.name}.${showroom.extension} PNG, 70 Bytes`,
      exact: true,
    });
    const second = picker.getByRole('checkbox', {
      name: `${serviceTeam.name}.${serviceTeam.extension} PNG, 70 Bytes`,
      exact: true,
    });
    const third = picker.getByRole('checkbox', {
      name: `${charging.name}.${charging.extension} PNG, 70 Bytes`,
      exact: true,
    });
    // shadcn's checkbox on Base UI, not markup of our own.
    await expect(first).toHaveAttribute('data-slot', 'checkbox');
    await first.focus();
    await mainWindow.keyboard.press('Space');
    await expect(says).toHaveText('Images only. Up to 2 Assets. 1 chosen.');
    await second.focus();
    await mainWindow.keyboard.press('Space');
    await expect(says).toHaveText('Images only. Up to 2 Assets. 2 chosen.');

    // The maximum holds in the picker: the third Asset cannot be ticked while
    // two are, so the field can never come back holding more than it takes.
    await expect(third).toBeDisabled();
    await third.focus();
    await mainWindow.keyboard.press('Space');
    await expect(third).toHaveAttribute('aria-checked', 'false');

    const confirm = picker.getByRole('button', { name: 'Choose', exact: true });
    await confirm.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(picker).toBeHidden();

    // A row per chosen Asset, and ci names Replace and Remove after the Asset
    // where the field holds several, so no two rows of one field read alike.
    await expect(
      mainWindow.getByRole('button', {
        name: `Replace ${showroom.name} in Gallery`,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: `Remove ${serviceTeam.name} from Gallery`,
        exact: true,
      })
    ).toBeVisible();
    // The field holds as many as it takes, so Choose is gone.
    await expect(choose).toBeHidden();

    // Replacing one Asset with one the field already holds leaves one row
    // rather than two of the same, and Choose comes back with the free place.
    await mainWindow
      .getByRole('button', { name: `Replace ${showroom.name} in Gallery` })
      .click();
    // The dialog is named after the field and its one line names the Asset
    // the choice replaces, which is how ci draws it.
    const replacePicker = mainWindow.getByRole('dialog', {
      name: 'Replace Gallery',
    });
    await expect(
      replacePicker.locator('[data-slot="dialog-description"]')
    ).toHaveText(`Images only. The one you choose replaces ${showroom.name}.`);
    await replacePicker
      .getByRole('radio', {
        name: `${serviceTeam.name}.${serviceTeam.extension} PNG, 70 Bytes`,
      })
      .click();
    await replacePicker
      .getByRole('button', { name: 'Choose', exact: true })
      .click();
    await expect(replacePicker).toBeHidden();
    await expect(
      mainWindow.getByRole('button', {
        name: `Remove ${serviceTeam.name} from Gallery`,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: `Remove ${showroom.name} from Gallery`,
      })
    ).toBeHidden();
    await expect(choose).toBeVisible();

    // The picker opens on what the field holds, counted against the maximum,
    // so the free place is the only one left to fill.
    await choose.click();
    await expect(says).toHaveText('Images only. Up to 2 Assets. 1 chosen.');
    await picker
      .getByRole('checkbox', {
        name: `${charging.name}.${charging.extension} PNG, 70 Bytes`,
      })
      .click();
    await picker.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(picker).toBeHidden();
    // Two rows again, which is what the field takes, so Choose is gone.
    await expect(choose).toBeHidden();

    // What the field holds is what Core stores: a reference per row. Which
    // order they come back in is the order the picker listed them, which is
    // Core's own and not this field's, so the rows above are what pins how
    // many there are.
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const [entryWithTwo] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(entryWithTwo?.values['gallery']?.content).toEqual({
      en: expect.arrayContaining([
        { id: charging.id, objectType: 'asset' },
        { id: serviceTeam.id, objectType: 'asset' },
      ]),
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
          isRequired: true,
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
    // The field is required and a button's role takes no `aria-required`, so
    // Choose says the word itself.
    const choose = mainWindow.getByRole('button', {
      name: 'Choose Authors, Required',
      exact: true,
    });
    await choose.focus();
    await mainWindow.keyboard.press('Enter');

    // Several Entries, so each row carries a checkbox, and its filter is named
    // after the one Collection the field allows. How many it takes stands
    // below the title, and the count follows what is ticked.
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Authors' });
    await expect(
      picker.getByRole('textbox', { name: 'Filter Team' })
    ).toBeVisible();
    const says = picker.locator('[data-slot="dialog-description"]');
    await expect(says).toHaveText('Up to 2 Entries.');
    const mara = picker.getByRole('checkbox', { name: 'Mara Klein' });
    const jonas = picker.getByRole('checkbox', { name: 'Jonas Brandt' });
    const lena = picker.getByRole('checkbox', { name: 'Lena Vogt' });
    // shadcn's checkbox on Base UI, not markup of our own.
    await expect(mara).toHaveAttribute('data-slot', 'checkbox');
    await mara.focus();
    await mainWindow.keyboard.press('Space');
    await expect(says).toHaveText('Up to 2 Entries. 1 chosen.');
    await jonas.focus();
    await mainWindow.keyboard.press('Space');
    await expect(mara).toHaveAttribute('aria-checked', 'true');
    await expect(jonas).toHaveAttribute('aria-checked', 'true');
    await expect(says).toHaveText('Up to 2 Entries. 2 chosen.');

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
    // Each row names the Collection its Entry belongs to, by that Collection's
    // own plural, which is how every list of the app names a Collection and
    // which is not the field's label beside it. Scoped to the panel, because
    // the sidebar lists the same Collection.
    await expect(
      mainPanel(mainWindow).getByText('Team', { exact: true })
    ).toHaveCount(2);
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

  test('chooses one Entry from the keyboard and names it after its Collection', async ({
    mainWindow,
  }) => {
    // An Entry field that takes one Entry out of two, which is the shape ci
    // draws with a radio button per row.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const team = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Author' }, plural: { en: 'Team' } },
      description: { en: 'Authors created by the E2E tests' },
      slug: { singular: 'author', plural: 'team' },
    });
    for (const name of ['Mara Klein', 'Jonas Brandt']) {
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
          slug: 'lead',
          label: { en: 'Lead author' },
          ofCollections: [team.id],
          max: 1,
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
      name: 'Choose Lead author',
      exact: true,
    });
    await choose.focus();
    await mainWindow.keyboard.press('Enter');

    // One Entry, so the rows carry radio buttons in one group named after the
    // field, and the dialog says nothing about a maximum, since the group
    // already says only one of them holds.
    const picker = mainWindow.getByRole('dialog', {
      name: 'Choose Lead author',
    });
    await expect(picker.locator('[data-slot="dialog-description"]')).toHaveText(
      'The Entries this field allows.'
    );
    await expect(
      picker.getByRole('radiogroup', { name: 'Choose Lead author' })
    ).toHaveAttribute('data-slot', 'radio-group');
    const mara = picker.getByRole('radio', { name: 'Mara Klein' });
    const jonas = picker.getByRole('radio', { name: 'Jonas Brandt' });
    // shadcn's radio group on Base UI, not markup of our own.
    await expect(mara).toHaveAttribute('data-slot', 'radio-group-item');
    await mara.focus();
    await mainWindow.keyboard.press('Space');
    await expect(mara).toHaveAttribute('aria-checked', 'true');
    await expect(jonas).toHaveAttribute('aria-checked', 'false');
    const confirm = picker.getByRole('button', { name: 'Choose', exact: true });
    await confirm.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(picker).toBeHidden();

    // The row ci draws: the Entry's title, the Collection it belongs to by
    // that Collection's own plural, and Remove named after both. Scoped to the
    // panel, because the sidebar lists the same Collection.
    await expect(
      mainWindow.getByText('Mara Klein', { exact: true })
    ).toBeVisible();
    await expect(
      mainPanel(mainWindow).getByText('Team', { exact: true })
    ).toHaveCount(1);
    await expect(
      mainWindow.getByRole('button', {
        name: 'Remove Mara Klein from Lead author',
        exact: true,
      })
    ).toBeVisible();
    // The field holds one Entry and takes one, so Choose is gone.
    await expect(choose).toBeHidden();

    // Core wants the Collection beside the reference, so a save that goes
    // through is what proves the dialog's one choice built it.
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const [saved] = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(saved?.values['lead']?.content).toEqual({
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

/**
 * The Entry as ci draws it: its Collection's Entries beside the editor and the
 * Entry's own History, one switch above the fields for the whole Entry, and
 * what each of the three panes says about a Value that is missing.
 */
test.describe('An Entry in three panes', () => {
  /** A bilingual Project with one Collection whose only field is a Title. */
  async function bilingualEntry(page: Page): Promise<{
    projectId: string;
    collectionId: string;
    entryId: string;
  }> {
    await setUserViaIpc(page);
    const project = await createProjectViaIpc(page, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const collection = await createBilingualCollectionViaIpc(page, project.id);
    const entry = await createEntryViaIpc(page, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours', de: 'Frühling' }),
      },
    });

    return {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    };
  }

  test('stands between its Collection and its History, which closes and opens again', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await bilingualEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await waitForLayout(mainWindow);

    // Three panes: the list of the Collection's Entries, the editor, and the
    // History of this Entry.
    await expect(entryRow(mainWindow, 'Spring opening hours')).toBeVisible();
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'Spring opening hours'
    );
    // The panes of the screen sit inside the one pane the Project's layout
    // draws, so the innermost match is the pane meant here.
    const history = mainWindow
      .locator('[data-slot="pane"]', {
        has: mainWindow.getByRole('button', { name: 'Close the History' }),
      })
      .last();
    await expect(history).toBeVisible();

    // The editor takes the History's room once it is closed, and the button in
    // its head opens it again.
    const editorWidth = async (): Promise<number> => {
      const box = await mainWindow
        .locator('[data-slot="pane"]', {
          has: mainWindow.getByLabel('Title', { exact: true }),
        })
        .last()
        .boundingBox();
      return box?.width ?? 0;
    };
    const withHistory = await editorWidth();
    const open = mainWindow.getByRole('button', {
      name: 'Show the History of this Entry',
    });
    await expect(open).toBeHidden();

    await mainWindow.getByRole('button', { name: 'Close the History' }).click();
    await expect(history).toBeHidden();
    await expect(open).toBeVisible();
    await waitForLayout(mainWindow);
    expect(await editorWidth()).toBeGreaterThan(withHistory);

    await open.click();
    await expect(history).toBeVisible();
    await expect(open).toBeHidden();

    // Nothing of the three panes is cut off at the smallest window the app
    // supports: every pane stands inside the panel and each one has room.
    const measured = await mainWindow.evaluate(() => {
      const panel = document.querySelector('[data-slot="panel"]');
      const panes = Array.from(
        document.querySelectorAll('[data-slot="panel"] [data-slot="pane"]')
      );
      if (panel === null || panes.length === 0) {
        throw new Error('The panel draws no panes');
      }
      const box = panel.getBoundingClientRect();
      return {
        panel: { left: box.left, right: box.right },
        panes: panes.map((pane) => {
          const rect = pane.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        }),
      };
    });
    for (const pane of measured.panes) {
      // Every pane has room of its own and none of them reaches past the
      // panel it sits in, which is what a collision or a clip would show as.
      expect(pane.width).toBeGreaterThan(0);
      expect(pane.left).toBeGreaterThanOrEqual(measured.panel.left);
      expect(pane.right).toBeLessThanOrEqual(measured.panel.right);
    }
  });

  test('names the Release each change of the Entry first went out in', async ({
    mainWindow,
  }) => {
    const ids = await bilingualEntry(mainWindow);
    // One Release, so the change that created the Entry is published and the
    // change after it is not.
    await createReleaseViaIpc(mainWindow, { projectId: ids.projectId });
    await updateEntryViaIpc(mainWindow, {
      projectId: ids.projectId,
      collectionId: ids.collectionId,
      id: ids.entryId,
      values: {
        title: stringValue({ en: 'Spring opening hours', de: 'Frühjahr' }),
      },
    });

    await navigateToEntryUpdate(mainWindow, ids);

    // Every change of this Entry has a row of its own, newest first, and the
    // Release stands above the changes it included.
    const changes = mainWindow.locator('[data-slot="entry-change"]');
    await expect(changes).toHaveCount(3);
    await expect(changes.nth(0)).toContainText('You changed an Entry');
    await expect(changes.nth(1)).toContainText('In Release 0.1.0');
    await expect(changes.nth(2)).toContainText('You added an Entry');
  });

  test('marks an Entry that misses a required Value in its row', async ({
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
      values: { title: stringValue({ en: 'Only English' }) },
    });
    // Core refuses an Entry until every language of the Project holds each
    // required Value, so an Entry that misses one is an Entry whose Project
    // gained a language after it was written, which is the case the badge
    // exists for.
    await addProjectLanguageViaIpc(mainWindow, project, 'de');

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // One badge rather than a badge per language, and what is missing is said
    // in words rather than by its color.
    const row = entryRow(mainWindow, 'Only English');
    await expect(row.getByText('Missing')).toBeVisible();
    await expect(row).toContainText('German is missing 1 Value');

    // An Entry that holds every Value carries no badge.
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: { title: stringValue({ en: 'Only English', de: 'Nur Deutsch' }) },
    });
    await reloadWindow(mainWindow);
    await expect(
      entryRow(mainWindow, 'Only English').getByText('Missing')
    ).toBeHidden();
  });

  test('offers every language of the Project as one dropdown where a row of them would not fit', async ({
    electronApp,
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
      values: { title: stringValue({ en: 'Only English' }) },
    });
    // Every language Core supports, which is what the switch has to answer for
    // at the smallest window the app supports. They are added after the Entry
    // was written, since Core refuses one that misses a required Value.
    let grown = project;
    for (const language of supportedLanguageSchema.options) {
      if (language !== 'en') {
        grown = await addProjectLanguageViaIpc(mainWindow, grown, language);
      }
    }

    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await waitForLayout(mainWindow);

    // The languages do not fit side by side, so the switch is one dropdown
    // that keeps each language's mark.
    const switcher = languageSwitch(mainWindow);
    const picker = switcher.getByRole('combobox');
    await expect(picker).toBeVisible();
    await expect(switcher.getByRole('button', { name: /^EN/ })).toHaveCount(0);

    await chooseLanguage(mainWindow, 'de');
    await expect(mainWindow.getByText('Missing in German')).toBeVisible();
    await expect(
      mainWindow.getByText('In English: Only English')
    ).toBeVisible();
  });

  test('keeps the focus in the list of sections after one is removed', async ({
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
            values: { headline: stringValue({ en: 'First' }) },
          },
          {
            componentId: hero.id,
            values: { headline: stringValue({ en: 'Second' }) },
          },
        ]),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    // Each section is a group of its own, headed by its Component and its
    // place in the list.
    const sections = mainWindow.locator('[data-slot="section"]');
    await expect(sections).toHaveCount(2);
    await expect(sections.first()).toContainText('Hero');
    await expect(sections.first()).toContainText('Section 1 of 2');

    // Removing the first one leaves the focus on the section that takes its
    // place rather than on the page.
    await mainWindow
      .getByRole('button', { name: 'Remove the Hero section' })
      .first()
      .click();
    await expect(sections).toHaveCount(1);
    await expect(sections.first()).toBeFocused();
    await expect(
      mainWindow.getByLabel('Headline', { exact: true })
    ).toHaveValue('Second');

    // And the last one leaves it on Add section, the one thing left to press.
    await mainWindow
      .getByRole('button', { name: 'Remove the Hero section' })
      .click();
    await expect(sections).toHaveCount(0);
    await expect(
      mainWindow.getByRole('button', { name: 'Add section' })
    ).toBeFocused();
    await expect(mainWindow.getByText('No sections yet.')).toBeVisible();
  });

  test('counts a required Value a section misses, in the language it misses it', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const hero = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [
        textFieldDefinition({
          slug: 'headline',
          label: { en: 'Headline', de: 'Überschrift' },
        }),
      ],
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Artikel' },
        plural: { en: 'Articles', de: 'Artikel' },
      },
      description: { en: 'Pages', de: 'Seiten' },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
        dynamicFieldDefinition({
          ofComponents: [hero.id],
          label: { en: 'Sections', de: 'Abschnitte' },
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Service', de: 'Service' }),
        sections: componentValue([
          {
            componentId: hero.id,
            values: {
              headline: stringValue({ en: 'Book online', de: 'Jetzt buchen' }),
            },
          },
        ]),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    // Emptying a Value inside a section blocks Save the same way one of the
    // Entry's own fields does, because Core refuses the Entry for either.
    await chooseLanguage(mainWindow, 'de');
    await mainWindow.getByLabel('Headline', { exact: true }).fill('');
    await expect(
      mainWindow.getByText('German is missing 1 Value')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Update Article' })
    ).toBeDisabled();

    // And the field inside the section says so where it stands.
    await expect(mainWindow.getByText('Missing in German')).toBeVisible();
    await expect(mainWindow.getByText('In English: Book online')).toBeVisible();
  });
});

import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  emailFieldDefinition,
  markdownFieldDefinition,
  navigateToCollection,
  navigateToCollectionSettings,
  referenceFieldDefinition,
  textFieldDefinition,
  toggleFieldDefinition,
} from '../helpers/collection.js';
import {
  createEntryViaIpc,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
  updateEntryViaIpc,
} from '../helpers/entry.js';
import { stubCoreHang } from '../helpers/ipc.js';
import {
  createProjectViaIpc,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { setupRemote } from '../helpers/remote.js';
import { navigateToUserProfile, setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  windowSize,
} from '../helpers/window.js';

/**
 * What every field of a screen looks like: the shell it sits in, the control
 * its label names, and the parts its `aria-describedby` points at.
 */
async function fieldsOf(page: Page): Promise<
  {
    label: string;
    hasShell: boolean;
    namesItsControl: boolean;
    describedBy: string[];
  }[]
> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('label[data-slot="field-label"]')).map(
      (label) => {
        const controlId = label.getAttribute('for') ?? '';
        const control = document.getElementById(controlId);
        const describedBy = (
          control?.getAttribute('aria-describedby') ?? ''
        ).split(' ');
        return {
          label: (label.textContent ?? '').trim(),
          hasShell: label.closest('[data-slot="field"]') !== null,
          namesItsControl: control !== null,
          // The ids that point at nothing, which is what a shell naming a part
          // it does not show would leave behind.
          describedBy: describedBy.filter(
            (id) => id !== '' && document.getElementById(id) === null
          ),
        };
      }
    )
  );
}

/**
 * One field's described parts, in the order its control names them, and where
 * each sits relative to the control. What `aria-describedby` lists is what a
 * screen reader reads out after the control, so its order is the shell's order.
 */
async function describedPartsOf(
  page: Page,
  labelText: string
): Promise<{
  labelLeadsControl: boolean;
  parts: { slot: string | null; followsControl: boolean; text: string }[];
}> {
  return page.evaluate((text) => {
    const label = Array.from(
      document.querySelectorAll('label[data-slot="field-label"]')
    ).find((candidate) =>
      (candidate.textContent ?? '').trim().startsWith(text)
    );
    if (label === undefined) {
      throw new Error(`No field is labelled "${text}"`);
    }
    const control = document.getElementById(label.getAttribute('for') ?? '');
    if (control === null) {
      throw new Error(`The label "${text}" points at no control`);
    }
    // Node.DOCUMENT_POSITION_FOLLOWING, named here because the specs
    // type-check under a tsconfig with no DOM lib.
    const following = 4;
    const follows = (node: ProbedElement): boolean =>
      (control.compareDocumentPosition(node) & following) !== 0;
    return {
      labelLeadsControl: follows(label) === false,
      parts: (control.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter((id) => id !== '')
        .map((id) => {
          const node = document.getElementById(id);
          if (node === null) {
            throw new Error(`"${text}" is described by the missing id ${id}`);
          }
          return {
            slot: node.getAttribute('data-slot'),
            followsControl: follows(node),
            text: (node.textContent ?? '').trim(),
          };
        }),
    };
  }, labelText);
}

/**
 * The rules one field shows beside its label, or `null` where it shows none.
 *
 * Read off the field's own head rather than off the control, so what is
 * asserted is what somebody sees at the top right of the label.
 */
async function rulesOf(page: Page, labelText: string): Promise<string | null> {
  return page.evaluate((text) => {
    const label = Array.from(
      document.querySelectorAll('label[data-slot="field-label"]')
    ).find((candidate) => (candidate.textContent ?? '').trim() === text);
    if (label === undefined) {
      throw new Error(`No field is labelled "${text}"`);
    }
    const head = label.closest('[data-slot="field-header"]');
    const rules = head?.querySelector('[data-slot="field-rules"]');
    return rules === null || rules === undefined
      ? null
      : (rules.textContent ?? '').trim();
  }, labelText);
}

/** Where one field sits and how wide it is, in the window's own pixels. */
async function boxOf(
  page: Page,
  labelText: string
): Promise<{ x: number; y: number; width: number }> {
  return page.evaluate((text) => {
    const label = Array.from(
      document.querySelectorAll('label[data-slot="field-label"]')
    ).find((candidate) => (candidate.textContent ?? '').trim() === text);
    const field = label?.closest('[data-slot="field"]');
    if (field === null || field === undefined) {
      throw new Error(`No field is labelled "${text}"`);
    }
    const { x, y, width } = field.getBoundingClientRect();
    return { x, y, width };
  }, labelText);
}

/** The slots the form primitives this layer replaced used to draw. */
async function oldPrimitives(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.querySelectorAll(
        '[data-slot="form-item"], [data-slot="form-label"], [data-slot="form-description"]'
      ).length
  );
}

test.describe('A form filled from its query', () => {
  test('keeps a Value the editor typed when the query answers with another one', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // An origin the Project starts out level with, so the writes below leave it
    // something to push and a synchronize succeeds. A synchronize is the one
    // thing an editor does that reads every query of the Project again,
    // including the one an open form is filled from.
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });

    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), emailFieldDefinition()],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'The stored title' }),
        email: stringValue({ en: 'stored@elek.io' }),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    const title = mainWindow.getByLabel('Title', { exact: true });
    const email = mainWindow.getByLabel('Email', { exact: true });
    await expect(title).toHaveValue('The stored title');
    await expect(email).toHaveValue('stored@elek.io');

    // One field is being written and not saved yet.
    await title.fill('A title nobody saved yet');

    // The Entry changes behind the open form, the way it does when a
    // collaborator's change arrives. This writes through Core rather than
    // through the renderer, so the open form learns of it only by reading its
    // query again.
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: {
        title: stringValue({ en: 'A title from somewhere else' }),
        email: stringValue({ en: 'elsewhere@elek.io' }),
      },
    });

    // The sidebar's Synchronize is on every Project route, this one included.
    const synchronize = mainWindow.getByRole('button', {
      name: 'Synchronize',
    });
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect(mainWindow.getByText('Changes synced')).toBeVisible();

    // The field nobody touched takes what the query answered with, and the one
    // being written keeps what was typed into it.
    await expect(email).toHaveValue('elsewhere@elek.io');
    await expect(title).toHaveValue('A title nobody saved yet');
  });

  test('draws every field in the one shell, and names only the parts it shows', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({
          description: { en: 'What the Entry is called' },
        }),
        emailFieldDefinition(),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'The stored title' }),
        email: stringValue({ en: 'stored@elek.io' }),
      },
    });

    // The generated fields of an Entry.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toHaveValue(
      'The stored title'
    );

    const entryFields = await fieldsOf(mainWindow);
    expect(entryFields.length).toBeGreaterThan(0);
    expect(entryFields.filter((field) => field.hasShell === false)).toEqual([]);
    expect(
      entryFields.filter((field) => field.namesItsControl === false)
    ).toEqual([]);
    expect(entryFields.filter((field) => field.describedBy.length > 0)).toEqual(
      []
    );
    expect(await oldPrimitives(mainWindow)).toBe(0);

    // A field with a description points at it, and the one without points at
    // no description at all rather than at an element that is not there.
    const described = await mainWindow.evaluate(() => {
      const read = (label: string): string | null => {
        const element = Array.from(
          document.querySelectorAll('label[data-slot="field-label"]')
        ).find((candidate) => (candidate.textContent ?? '').trim() === label);
        const control = document.getElementById(
          element?.getAttribute('for') ?? ''
        );
        const ids = (control?.getAttribute('aria-describedby') ?? '').split(
          ' '
        );
        const descriptions = ids
          .map((id) => document.getElementById(id))
          .filter(
            (part) => part?.getAttribute('data-slot') === 'field-description'
          );
        return descriptions.length === 0
          ? null
          : (descriptions[0]?.textContent ?? null);
      };
      return { title: read('Title'), email: read('Email') };
    });
    expect(described.title).toBe('What the Entry is called');
    expect(described.email).toBeNull();

    // The hand-written fields and the previews of a Collection's settings,
    // where a preview draws the same shell with no form behind it.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow.getByLabel('Collection-Slug', { exact: true })
    ).toBeVisible();

    // A Collection's settings say what each field needs the same way an Entry
    // does: its hand-written fields off Core's Collection schema, which caps a
    // slug at 128 characters, and the preview of each field definition off
    // that definition.
    expect(await rulesOf(mainWindow, 'Collection-Slug')).toBe(
      'Required, up to 128 characters'
    );
    expect(await rulesOf(mainWindow, 'Title')).toBe('Required');

    const settingsFields = await fieldsOf(mainWindow);
    expect(settingsFields.length).toBeGreaterThan(0);
    expect(settingsFields.filter((field) => field.hasShell === false)).toEqual(
      []
    );
    expect(
      settingsFields.filter((field) => field.namesItsControl === false)
    ).toEqual([]);
    expect(
      settingsFields.filter((field) => field.describedBy.length > 0)
    ).toEqual([]);
    expect(await oldPrimitives(mainWindow)).toBe(0);
  });

  test('names its rules, its description and then its error, in that order', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A described required field to refuse, and an optional one that dirties
    // the form past the create gate without filling the required one.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({
          description: { en: 'What the Entry is called' },
        }),
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

    // Before a submit the field names its rules and its description, and
    // nothing else.
    await expect(mainWindow.getByLabel('Title', { exact: true })).toBeVisible();
    const clean = await describedPartsOf(mainWindow, 'Title');
    expect(clean.labelLeadsControl).toBe(true);
    expect(clean.parts).toEqual([
      {
        slot: 'field-rules',
        followsControl: false,
        text: 'Required',
      },
      {
        slot: 'field-description',
        followsControl: true,
        text: 'What the Entry is called',
      },
    ]);

    // A refused submit, which is the only way an error is on screen.
    await mainWindow.getByLabel('Note').fill('Just a note');
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toHaveAttribute('aria-invalid', 'true');

    // The label with its rules, then the control, the description and the
    // error: the order ci draws a field in. The control names the rules first,
    // which sit beside the label above it, and then the two parts below it, so
    // what a screen reader reads follows what is on screen.
    const refused = await describedPartsOf(mainWindow, 'Title');
    expect(refused.labelLeadsControl).toBe(true);
    expect(refused.parts.map((part) => part.slot)).toEqual([
      'field-rules',
      'field-description',
      'field-error',
    ]);
    expect(refused.parts.map((part) => part.followsControl)).toEqual([
      false,
      true,
      true,
    ]);
    expect(refused.parts[0]?.text).toBe('Required');
    expect(refused.parts[1]?.text).toBe('What the Entry is called');
    expect(refused.parts[2]?.text).not.toBe('');
  });

  test('shows its fields disabled and holds Save while its query is still reading', async ({
    electronApp,
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
      values: { title: stringValue({ en: 'The stored title' }) },
    });

    // The Entry's own read never settles, so the window the form fills in is
    // stable to assert instead of racing the answer.
    await stubCoreHang(electronApp, 'core:entries:read');
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });

    // The form is on screen with its fields, rather than nothing being there,
    // and none of them can be written into.
    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeDisabled();
    // Save is held by the same fact, so the defaults cannot be written over
    // what is stored.
    await expect(
      mainWindow.getByRole('button', { name: 'Update Article' })
    ).toBeDisabled();
  });

  test('shows what each generated field asks for, beside its label', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // One field per shape of rule: a bounded required one, an optional one
    // with a bound of its own, a unique one, an Asset field that takes images
    // only, and a toggle, which can never be empty.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ min: 2, max: 80 }),
        textFieldDefinition({
          slug: 'note',
          label: { en: 'Note' },
          isRequired: false,
          max: 200,
        }),
        textFieldDefinition({
          slug: 'key',
          label: { en: 'Key' },
          isUnique: true,
        }),
        assetFieldDefinition({
          label: { en: 'Cover' },
          slug: 'cover',
          ofAssetMimeTypes: ['image/png', 'image/jpeg'],
        }),
        toggleFieldDefinition(),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toBeVisible();

    // Each rule comes off the field definition, in the words an editor reads,
    // and the leading one is capitalized wherever it comes from.
    expect(await rulesOf(mainWindow, 'Title')).toBe(
      'Required, 2 to 80 characters'
    );
    expect(await rulesOf(mainWindow, 'Note')).toBe('Up to 200 characters');
    expect(await rulesOf(mainWindow, 'Key')).toBe('Required, unique');
    expect(await rulesOf(mainWindow, 'Cover')).toBe('Required, images only');
    // A toggle always holds a Value, so it names no rule at all.
    expect(await rulesOf(mainWindow, 'Featured')).toBeNull();

    // The label is still the control's whole accessible name, and required
    // reaches assistive tech as the state rather than as part of that name.
    const title = mainWindow.getByLabel('Title', { exact: true });
    await expect(title).toHaveAttribute('aria-required', 'true');
    await expect(
      mainWindow.getByLabel('Note', { exact: true })
    ).not.toHaveAttribute('aria-required');

    // The rules are named by the control, so they are read out with it rather
    // than left to somebody who can see them.
    const described = await describedPartsOf(mainWindow, 'Title');
    expect(described.parts[0]?.slot).toBe('field-rules');
    expect(described.parts[0]?.text).toBe('Required, 2 to 80 characters');
    expect(described.parts[0]?.followsControl).toBe(false);
  });

  test('shows what Core asks of a hand-written field, without repeating it', async ({
    mainWindow,
  }) => {
    // The Profile is hand written and checks against Core's own User schema,
    // which caps a name at 256 characters and an email at 254. Neither number
    // is written down in this app, so a field that shows one read it off that
    // schema.
    await setUserViaIpc(mainWindow);
    await navigateToUserProfile(mainWindow);
    await expect(
      mainWindow.getByRole('heading', { name: 'User profile' })
    ).toBeVisible();

    expect(await rulesOf(mainWindow, 'Full name')).toBe(
      'Required, up to 256 characters'
    );
    expect(await rulesOf(mainWindow, 'Email')).toBe(
      'Required, up to 254 characters'
    );
    // A switch always holds a Value, so Core asking for the key is no rule
    // anybody could break, and the field says nothing.
    expect(await rulesOf(mainWindow, 'Enabled')).toBeNull();

    // Required reaches assistive tech on every form, not only on a generated
    // field, which is what the hand-written ones were silent about.
    await expect(
      mainWindow.getByLabel('Full name', { exact: true })
    ).toHaveAttribute('aria-required', 'true');
    await expect(
      mainWindow.getByLabel('Email', { exact: true })
    ).toHaveAttribute('aria-required', 'true');
  });

  test('stacks a field the area it sits in is too narrow for', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // Two half-width fields, which ci puts side by side while each gets at
    // least 160 px and stacks below each other when they do not.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ inputWidth: '6' }),
        textFieldDefinition({
          slug: 'note',
          label: { en: 'Note' },
          isRequired: false,
          inputWidth: '6',
        }),
      ],
    });

    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(mainWindow.getByLabel('Title', { exact: true })).toBeVisible();

    // At the smallest window the editor still holds both, so they stay side by
    // side: the same row, each half the width.
    const wide = {
      title: await boxOf(mainWindow, 'Title'),
      note: await boxOf(mainWindow, 'Note'),
    };
    expect(wide.note.y).toBe(wide.title.y);
    expect(wide.note.x).toBeGreaterThan(wide.title.x);
    expect(wide.title.width).toBeGreaterThanOrEqual(160);

    // The editor the Entry is laid out in, narrowed to what it gets beside two
    // other panes, with the window left at its minimum. What decides is the
    // area the fields sit in rather than the window, so narrowing it alone has
    // to stack them.
    await mainWindow.evaluate(() => {
      const grid = document.querySelector('[data-slot="field"]')?.parentElement;
      if (grid === null || grid === undefined) {
        throw new Error('The Entry form draws no grid of fields');
      }
      grid.style.width = '280px';
    });

    const narrow = {
      title: await boxOf(mainWindow, 'Title'),
      note: await boxOf(mainWindow, 'Note'),
    };
    expect(narrow.note.y).toBeGreaterThan(narrow.title.y);
    expect(narrow.note.x).toBe(narrow.title.x);
    expect(await windowSize(electronApp)).toEqual(MINIMUM_WINDOW_SIZE);
  });

  test('names an Entry the same way in its list, its pickers and the breadcrumb', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const target = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Author' }, plural: { en: 'Authors' } },
      slug: { singular: 'author', plural: 'authors' },
      fieldDefinitions: [textFieldDefinition()],
    });
    const author = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
      values: { title: stringValue({ en: 'Ada Lovelace' }) },
    });

    // The list of Entries shows the Value its field holds.
    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
    });
    await expect(
      mainWindow.getByRole('cell', { name: 'Ada Lovelace' })
    ).toBeVisible();

    // The breadcrumb of that Entry names it the same way.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: target.id,
      entryId: author.id,
    });
    await expect(
      mainWindow
        .getByRole('navigation', { name: 'breadcrumb' })
        .getByText('Ada Lovelace')
    ).toBeVisible();

    // And so do both pickers that offer an Entry: the one an entry field opens
    // and the one the markdown editor opens to reference an Entry in the text.
    const markdownDefaults = markdownFieldDefinition();
    const article = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition({ ofCollections: [target.id] }),
        markdownFieldDefinition({
          features: { ...markdownDefaults.features, entryReferences: true },
          ofCollections: [target.id],
        }),
      ],
    });
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: article.id,
    });
    // The trigger carries its field's label as its accessible name, which is
    // what the shell's label points at.
    await mainWindow.getByRole('button', { name: 'Related' }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Select Entries' });
    await expect(picker.getByText('Ada Lovelace')).toBeVisible();
    await picker.getByRole('button', { name: 'Done' }).click();
    await expect(picker).toBeHidden();

    // The markdown editor's own picker, reached from the toolbar of a markdown
    // field that allows entry references.
    await mainWindow
      .getByRole('button', { name: 'Reference an Entry' })
      .click();
    const markdownPicker = mainWindow.getByRole('dialog', {
      name: 'Reference an Entry',
    });
    await expect(
      markdownPicker.getByRole('button', { name: 'Ada Lovelace' })
    ).toBeVisible();
  });
});

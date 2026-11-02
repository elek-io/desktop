import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  emailFieldDefinition,
  navigateToCollection,
  navigateToCollectionSettings,
  referenceFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createEntryViaIpc,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
  updateEntryViaIpc,
} from '../helpers/entry.js';
import {
  createProjectViaIpc,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { setupRemote } from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

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
    // nothing rather than at an element that is not there.
    const described = await mainWindow.evaluate(() => {
      const read = (label: string): string | null => {
        const element = Array.from(
          document.querySelectorAll('label[data-slot="field-label"]')
        ).find((candidate) => (candidate.textContent ?? '').trim() === label);
        const control = document.getElementById(
          element?.getAttribute('for') ?? ''
        );
        const ids = control?.getAttribute('aria-describedby') ?? null;
        if (ids === null) {
          return null;
        }
        return (
          document.getElementById(ids.split(' ')[0] ?? '')?.textContent ?? null
        );
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

  test('names an Entry the same way in its list, in a picker and in the breadcrumb', async ({
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

    // And so does the picker of a field that references it.
    const article = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition({ ofCollections: [target.id] }),
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
  });
});

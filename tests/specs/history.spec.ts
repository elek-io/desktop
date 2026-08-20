import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  markdownFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createEntryViaIpc,
  markdownEditorSurface,
  markdownValue,
  mdAstParagraph,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToHistory,
  navigateToProjectDashboard,
} from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('History', () => {
  test('lists commits and renders the diff view per object type', async ({
    mainWindow,
  }) => {
    // Arrange a Project, Collection and Entry over IPC, one commit each.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'First article' }) },
    });

    await navigateToHistory(mainWindow, project.id);

    // The sidebar lists a commit per object type. Each commit renders as a Link
    // whose label starts with "<method> <objectType>", so it is addressable by
    // that text. Newest-first ordering is Core's, so this only asserts presence.
    await expect(
      mainWindow.getByRole('link', { name: /create project/i })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: /create collection/i })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: /create entry/i })
    ).toBeVisible();

    // The collection commit renders with the CollectionDiff. Its page title is
    // "<method> <objectType>" and a distinguishing Collection form field proves
    // the CollectionDiff (not another diff) rendered.
    await mainWindow.getByRole('link', { name: /create collection/i }).click();
    await expect(
      mainWindow.getByRole('heading', { name: 'create collection' })
    ).toBeVisible();
    await expect(
      mainWindow.getByLabel('Collection name (Plural)', { exact: true })
    ).toBeVisible();

    // The entry commit renders with the EntryDiff. The "Title" field is unique
    // to the entry form on this page.
    await mainWindow.getByRole('link', { name: /create entry/i }).click();
    await expect(
      mainWindow.getByRole('heading', { name: 'create entry' })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Title', { exact: true })).toBeVisible();

    // The project-create commit renders with the ProjectDiff.
    await mainWindow.getByRole('link', { name: /create project/i }).click();
    await expect(
      mainWindow.getByRole('heading', { name: 'create project' })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Project name')).toBeVisible();
  });

  test('dashboard shows latest changes and links to full history', async ({
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
      values: { title: stringValue({ en: 'First article' }) },
    });

    await navigateToProjectDashboard(mainWindow, project.id);

    // "Latest changes" renders the seeded commits (the panel slices to the
    // latest 5, but three commits are well under that cap).
    await expect(
      mainWindow.getByRole('link', { name: /create project/i })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: /create collection/i })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('link', { name: /create entry/i })
    ).toBeVisible();

    // The "Current Project" debug panel is present.
    await expect(mainWindow.getByText('Current Project')).toBeVisible();

    // "Full History" navigates to the project's history route.
    await mainWindow.getByRole('button', { name: 'Full History' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/history`
    );
  });

  // The CollectionDiff hydrates the Controller-bound fieldDefinitions read-only
  // through reset(). The reused CollectionForm renders the definitions as
  // previews, so a distinctively labelled field proves they came through the
  // value rather than being dropped.
  test('renders a Collection’s field definitions in the history diff', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Headline' }, slug: 'headline' }),
      ],
    });

    await navigateToHistory(mainWindow, project.id);

    // Open the collection-create commit's diff.
    await mainWindow.getByRole('link', { name: /create collection/i }).click();
    await expect(
      mainWindow.getByRole('heading', { name: 'create collection' })
    ).toBeVisible();

    // The field definition renders in the diff, labelled by its definition.
    await expect(
      mainWindow.getByText('Headline', { exact: true })
    ).toBeVisible();
  });

  // A diff renders the same EntryForm in view mode, which turns the form
  // read-only through a disabled fieldset. A fieldset only disables native form
  // controls, so the markdown field (a Milkdown contenteditable) stayed typable
  // in history until AppForm's mode reached the render registry. See
  // contributing/renderer/forms.md#view-only-forms-and-diffs.
  test('renders a markdown field read-only in the history diff', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), markdownFieldDefinition()],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'First article' }),
        body: markdownValue({ en: mdAstParagraph('Written once') }),
      },
    });

    // The editable baseline: on the Entry update form the same field is typable,
    // so the assertion below is about view mode and not about the editor failing
    // to mount.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    await expect(markdownEditorSurface(mainWindow)).toHaveAttribute(
      'contenteditable',
      'true'
    );

    await navigateToHistory(mainWindow, project.id);
    await mainWindow.getByRole('link', { name: /create entry/i }).click();
    await expect(
      mainWindow.getByRole('heading', { name: 'create entry' })
    ).toBeVisible();

    // Same component, view mode: the editor holds the stored content but cannot
    // be typed into.
    await expect(markdownEditorSurface(mainWindow)).toHaveAttribute(
      'contenteditable',
      'false'
    );
    await expect(mainWindow.getByText('Written once')).toBeVisible();
  });
});

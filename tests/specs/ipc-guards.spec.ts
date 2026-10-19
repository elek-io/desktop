import { expect } from '@playwright/test';

import { uuid } from '@elek-io/core';

import { test } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  navigateToCollection,
  referenceFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createEntryViaIpc,
  deleteEntryViaIpc,
  referenceValue,
  stringValue,
} from '../helpers/entry.js';
import { expectRejects } from '../helpers/ipc.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

/**
 * These guards have no UI path, so the doctrine sanctions observing them as a
 * bare IPC throw / no-throw (see testing.md). Each `ViaIpc` helper awaits its
 * `window.ipc` call inside `page.evaluate`, so a rejected call rejects the
 * helper's promise (observed with `expectRejects`) without surfacing on the
 * renderer console. Core owns the error's type, cause and on-disk result, so
 * only throw / no-throw is asserted here.
 */
test.describe('IPC guards', () => {
  test('entry delete is blocked while another entry references it, then succeeds', async ({
    mainWindow,
  }) => {
    // P1-09: no UI control deletes an Entry (the EntryTable actions column is
    // commented out), so this reference guard is only reachable over IPC.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });
    // E1 holds no reference; E2 references E1 (E2 -> E1). An optional reference
    // field still needs its value wrapper present at create time, so E1 carries
    // an empty referenceValue().
    const e1 = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'E1' }), related: referenceValue() },
    });
    const e2 = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'E2' }),
        related: referenceValue(e1.id, collection.id),
      },
    });

    // Deleting E1 is blocked while E2 still references it.
    await expectRejects(
      deleteEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        id: e1.id,
      })
    );

    // Removing the referrer, then E1, both resolve (no throw).
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: e2.id,
    });
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: e1.id,
    });
  });

  test('entry create rejects a reference to a non-existent target', async ({
    mainWindow,
  }) => {
    // P1-10: the entry form's reference picker only offers existing targets, so
    // a broken reference id cannot be submitted through the UI. Observed as a
    // bare IPC throw.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });

    await expectRejects(
      createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: {
          title: stringValue({ en: 'Broken' }),
          related: referenceValue(uuid(), collection.id),
        },
      })
    );

    // Nothing was created: the Entry table shows its empty state.
    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(mainWindow.getByText('No results.')).toBeVisible();
  });

  test('project create is rejected when no user is set', async ({
    mainWindow,
  }) => {
    // P2-03 (IPC-level): with no User, Core rejects the write. The UI-driven
    // form-submit version stays deferred to the error-UX track (it would reach
    // the root error boundary); this observes the guard over IPC instead.
    await expectRejects(createProjectViaIpc(mainWindow));

    // Nothing was created. Without a User the app shows the First start, not
    // the Projects list, so this asks Core directly.
    expect(
      await mainWindow.evaluate(async () => window.ipc.core.projects.count())
    ).toBe(0);
  });
});

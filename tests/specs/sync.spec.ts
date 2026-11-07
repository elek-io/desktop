import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { format } from 'date-fns';
import { join } from 'node:path';

import { uuid } from '@elek-io/core';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  dynamicFieldDefinition,
  referenceFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import { createComponentViaIpc } from '../helpers/component.js';
import { dismissAlertDialog } from '../helpers/dialog.js';
import {
  componentValue,
  createEntryViaIpc,
  referenceValue,
  stringValue,
} from '../helpers/entry.js';
import {
  stubCoreHang,
  stubCoreReject,
  stubCoreRejectWithType,
  stubCoreRejectWithTypeOnce,
} from '../helpers/ipc.js';
import { recordLogsViaIpc, recordedLogs } from '../helpers/log.js';
import {
  projectCard,
  projectSidebar,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import {
  expectReleaseCreated,
  listReleasesViaIpc,
  navigateToReleases,
  openReleaseDialog,
} from '../helpers/release.js';
import {
  commitFileOnRemote,
  commitUnrelatedFileOnRemote,
  deleteEntryOnRemote,
  localDraftSha,
  remoteBranches,
  remoteDraftSha,
  setupRemote,
} from '../helpers/remote.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/**
 * The dialog that answers a failed sync.
 *
 * It carries `role="alertdialog"`, since it answers something the editor just
 * started and is waiting for, so it is addressed by that role rather than by
 * its title, which the card's own state line repeats.
 */
function syncDialog(page: Page): Locator {
  return page.getByRole('alertdialog');
}

/**
 * A Project pointed at a reachable bare origin with one local commit on top,
 * opened on its Dashboard, and the Sync that is therefore enabled.
 *
 * The arrangement every injected refusal below starts from, so each test says
 * what it injects rather than repeating the mirror, the origin and the commit.
 */
async function arrangeSyncableProject(
  page: Page,
  testInfo: TestInfo,
  projectId: string
): Promise<Locator> {
  const projectPath = join(
    testDataDirs(testInfo).dataDir,
    'projects',
    projectId
  );
  const remote = setupRemote(testInfo, { mirror: projectPath });
  await setRemoteOriginUrlViaIpc(page, { id: projectId, url: remote.url });
  await createCollectionViaIpc(page, { projectId });

  await navigateToProjectDashboard(page, projectId);
  const synchronize = page.getByRole('button', { name: 'Sync' });
  await expect(synchronize).toBeEnabled();

  return synchronize;
}

test.describe('Sync', () => {
  test('round-trips a local change to the remote and clears the ahead count', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Mirror the Project's draft branch into a bare origin, so it starts
    // level with the remote. clone --bare copies the refs without a working tree
    // or an LFS push, which a plain bare remote cannot serve.
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

    // One real local write moves draft ahead of the remote by one commit, so
    // there is something to push.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    // The sidebar's Sync lives on Project routes and enables only when there is
    // something to sync (ahead 1 here).
    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(synchronize).toBeEnabled();

    // The commit the push should land on the remote. A pull that rebases onto an
    // ancestor is a no-op, so the local draft SHA does not move during the sync.
    const expectedSha = localDraftSha(projectPath);

    await synchronize.click();

    // Corroborate the round-trip on the runner: the remote's draft ref reaches the
    // local commit, proving the push landed, without inspecting file contents.
    // Poll until it arrives, since the sync (fetch, rebase, push) is in flight.
    await expect
      .poll(() => remoteDraftSha(remote.path), { timeout: 30000 })
      .toBe(expectedSha);

    // Sync resolved, so ahead/behind are back to zero and the button returns to
    // disabled. The button lives in the sidebar, so its still being there (rather
    // than gone with the whole view) also shows the sync did not hit the root
    // error boundary, and the fixture's console check backs that up.
    await expect(synchronize).toBeDisabled();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/${project.id}/dashboard`)
    );
  });

  test('makes the first push to an empty remote with main and draft', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // An empty bare repository, as a Git host creates one without a README.
    // Since Core 0.25 synchronize() makes the first push there itself.
    const remote = setupRemote(testInfo);
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });

    // Before the first push every local commit counts as ahead, so the
    // control is enabled without a further write
    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // The remote now holds both branches, draft at the local commit. Which
    // refs land is Core's, so only the branch names and the draft ref are
    // observed, not their contents.
    await expect
      .poll(() => remoteBranches(remote.path), { timeout: 30000 })
      .toEqual(['draft', 'main']);
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    expect(remoteDraftSha(remote.path)).toBe(localDraftSha(projectPath));
    await expect(synchronize).toBeDisabled();
  });

  test('surfaces a repository holding something else in place', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A repository a Git host created with a README holds refs that share no
    // history with the Project, which Core refuses rather than merging.
    const remote = setupRemote(testInfo);
    commitUnrelatedFileOnRemote(testInfo, remote.path, {
      relPath: 'README.md',
      content: '# Created by the Git host\n',
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });

    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // Core refuses with PreconditionFailed, which the card answers in the sync
    // dialog, not the root error boundary (the fixture's console check confirms
    // no error escaped). The description names what Core raises that type for,
    // rather than an unreachable repository, which is an Internal error, and
    // the dialog says once that nothing was synced.
    const dialog = syncDialog(mainWindow);
    await expect(
      dialog.getByRole('heading', { name: 'Sync failed' })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        'The Git repository may hold something besides this Project, it may not be able to store the Assets, or the same text may have been changed here and somewhere else. Ask whoever set up this Project.'
      )
    ).toBeVisible();
    await expect(
      dialog.getByText(
        'Nothing was synced, and your changes stay on this computer.'
      )
    ).toBeVisible();

    // Nothing was pushed: the remote still holds only the branch it came with.
    expect(remoteBranches(remote.path)).toEqual(['main']);

    // Dismissing the dialog leaves the app usable, as the Project is untouched,
    // and the card keeps one line about the failure with the way back into the
    // dialog.
    await dismissAlertDialog(mainWindow);
    await expect(synchronize).toBeEnabled();
    const card = projectCard(mainWindow);
    await expect(card.getByText('Sync failed')).toBeVisible();
    await card.getByRole('button', { name: 'Show why' }).click();
    await expect(dialog).toBeVisible();
  });

  test('stops a sync that would orphan a reference and pushes nothing', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A Collection whose Entries can point at one another (an optional single
    // entry reference alongside the required title).
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), referenceFieldDefinition()],
    });

    // E2 references E1. Both are valid writes, so Core's write-time gate passes.
    // Core requires a value for the optional reference field even when it holds
    // no target, so E1 carries an empty reference.
    const target = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Target' }),
        related: referenceValue(),
      },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Source' }),
        related: referenceValue(target.id, collection.id),
      },
    });

    // Mirror the current draft (with both Entries and the reference) into a bare
    // origin, then point the Project at it.
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

    // Delete the reference target on the remote, out of band. This bypasses
    // Core's delete gate, so the remote's draft tree now holds a dangling
    // reference (the Source Entry still points at the deleted Target).
    deleteEntryOnRemote(
      testInfo,
      remote.path,
      `collections/${collection.id}/${target.id}.json`
    );

    // A local commit so the histories diverge: now local is ahead by this Entry
    // and behind by the remote's delete commit.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Local only' }),
        related: referenceValue(),
      },
    });

    const beforeSha = remoteDraftSha(remote.path);

    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // The pull rebases the local Entry onto the remote (Target deleted), then the
    // pre-push integrity scan finds the dangling reference and rejects with a
    // Conflict without pushing. The desktop app answers that in the sync
    // dialog, not the root error boundary (the fixture's console check confirms
    // no error escaped).
    const dialog = syncDialog(mainWindow);
    await expect(
      dialog.getByRole('heading', { name: 'Sync failed' })
    ).toBeVisible();
    // The description reflects the preserved CoreError type: the integrity gate
    // rejects with a Conflict, so the dialog names the reference whose target is
    // gone rather than falling back to the generic sentence.
    await expect(
      dialog.getByText(
        'Each field below points at an Entry or an Asset that no longer exists, because it was deleted here or on another computer. Open each Entry, choose something else or empty the field, then sync again.'
      )
    ).toBeVisible();

    // Core names the Entry that holds the broken reference and the field it
    // sits in, which the dialog lists as a link by the Entry's own title and
    // the field's own label, never by the ids Core sent. Following the link
    // opens that Entry.
    const row = dialog.getByRole('listitem');
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('link', { name: 'Source' })).toBeVisible();
    await expect(row.getByText('Related')).toBeVisible();
    await expect(dialog.getByText(target.id)).toBeHidden();
    await expect(dialog.getByText('Conflict', { exact: true })).toBeHidden();

    // Nothing was pushed: the remote's draft ref is exactly where it was, so the
    // local-only Entry never reached the shared remote.
    expect(remoteDraftSha(remote.path)).toBe(beforeSha);

    const source = await dialog
      .getByRole('link', { name: 'Source' })
      .getAttribute('href');
    expect(source).toContain(`/collections/${collection.id}/`);

    // Dismissing the dialog leaves the app usable (not crashed or mid-rebase):
    // the dashboard and its sidebar still render.
    await dismissAlertDialog(mainWindow);
    await expect(synchronize).toBeVisible();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/${project.id}/dashboard`)
    );
  });

  test('pulls a remote commit so the behind count drives to zero', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Mirror the Project's draft into a bare origin (starts level), point
    // the Project at it, then advance the remote by one commit out of band. Now
    // local is behind the remote by that commit with nothing ahead.
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
    // A Core-shaped commit (its trailers mark it an "update project"), so
    // getChanges counts it as behind. A plain out-of-band commit would be
    // invisible to getChanges (it filters to Core commits), so the sidebar
    // would never see the behind change. This mirrors a collaborator's push.
    commitFileOnRemote(
      testInfo,
      remote.path,
      { relPath: 'note.txt', content: 'from the remote' },
      { method: 'update', reference: { objectType: 'project', id: project.id } }
    );

    // Local is behind: its draft ref differs from the (now advanced) remote's.
    // This runner-side ref check corroborates the arrangement without inspecting
    // file contents, the mirror image of the ahead-path round-trip above.
    const remoteSha = remoteDraftSha(remote.path);
    expect(localDraftSha(projectPath)).not.toBe(remoteSha);

    // The sidebar detected the behind change (ahead is 0 here, so an enabled
    // Synchronize can only mean behind > 0). Exact counts are Core's, so the
    // button state, not the number, is what proves the desktop reflected it.
    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // The pull brings the remote commit into the local draft: the local draft ref
    // reaches the remote's (a pure fast-forward, so the remote does not move).
    // Poll while the sync (fetch, rebase, push) is in flight.
    await expect
      .poll(() => localDraftSha(projectPath), { timeout: 30000 })
      .toBe(remoteSha);

    // Sync resolved, so ahead/behind are back to zero and the button returns to
    // disabled, still in the sidebar (so the view was not replaced by the root
    // error boundary, backed by the fixture's console check).
    await expect(synchronize).toBeDisabled();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/${project.id}/dashboard`)
    );
  });

  test('routes a sync failure that carries no type to the root error boundary', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // Make the sync reject with an error that carries no CoreError type at all.
    // The sync mutation answers four types in the sync dialog, so everything
    // else must reach the root error boundary. Guards the throwOnError
    // predicate against a regression to a blanket throwOnError: false (see the
    // projects delete spec for the full rationale).
    await stubCoreReject(electronApp, 'core:projects:synchronize');

    await synchronize.click();

    // The failure propagates: the root error boundary replaces the view and the
    // sync dialog never opens.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(syncDialog(mainWindow)).toBeHidden();
  });

  test('routes a sync failure of an unhandled type to the root error boundary, and logs it', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    await recordLogsViaIpc(electronApp);
    // A type that does carry a CoreError type and is still not one of the four
    // the dialog answers, which is the other leg of the predicate: the dialog's
    // set is read off one list, so a type outside it reaches the error screen.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:synchronize',
      'NotFound'
    );

    await synchronize.click();

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(syncDialog(mainWindow)).toBeHidden();

    // It is logged with its type, which is what the suppression of a handled
    // type must not reach.
    const logged = (await recordedLogs(electronApp)).filter(
      (record) =>
        record.level === 'error' &&
        record.meta['error.type'] === 'NotFound' &&
        record.meta['elek.method'] === 'synchronize'
    );
    expect(logged.length).toBeGreaterThan(0);
  });

  test('answers a refusal in a toast with Retry once focus has moved on', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // The refusal is held back long enough to move focus away from Sync while
    // the sync is in flight, which is the state ci answers with a toast rather
    // than a dialog: a dialog would take the keyboard from whatever the editor
    // moved to.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:synchronize',
      'Unauthorized',
      { delayMs: 1500 }
    );

    await synchronize.click();
    await expect(synchronize).toBeFocused();
    await projectSidebar(mainWindow)
      .getByRole('link', { name: 'Dashboard' })
      .focus();

    // The toast says what did not happen and offers the way back, and no dialog
    // opens over whatever the editor moved to.
    const toast = mainWindow.getByText('Sync failed').first();
    await expect(toast).toBeVisible({ timeout: 20000 });
    await expect(
      mainWindow.getByRole('button', { name: 'Retry' })
    ).toBeVisible();
    await expect(syncDialog(mainWindow)).toBeHidden();

    // The card keeps the failure as a lasting state, and Show why opens the
    // dialog the toast did not, with the sentence for the type Core raised.
    const card = projectCard(mainWindow);
    await expect(card.getByText('Sync failed')).toBeVisible();
    await card.getByRole('button', { name: 'Show why' }).click();
    await expect(
      syncDialog(mainWindow).getByText(
        'The Git repository refused access, so ask whoever set up this Project.'
      )
    ).toBeVisible();
  });

  test('syncs again when Retry in the toast is pressed', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    // Two synchronizations, one of them a real push, and the invalidation each
    // one awaits.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // The first sync is refused late enough to move focus off Sync, which is
    // what answers in a toast, and every sync after it reaches Core, so Retry
    // has something that can go through.
    await stubCoreRejectWithTypeOnce(
      electronApp,
      'core:projects:synchronize',
      'Unauthorized',
      { delayMs: 1500 }
    );

    await synchronize.click();
    await expect(synchronize).toBeFocused();
    await projectSidebar(mainWindow)
      .getByRole('link', { name: 'Dashboard' })
      .focus();

    const retry = mainWindow.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 20000 });

    await retry.click();

    // Retry starts the synchronization again rather than only closing the
    // toast: this one goes through, so the Project ends up level with its Git
    // repository and the card holds no failure any more. The failure goes last,
    // because the card clears it only once the reads the sync invalidated have
    // come back.
    const card = projectCard(mainWindow);
    await expect(card.getByText('Everything synced')).toBeVisible({
      timeout: 20000,
    });
    await expect(synchronize).toBeDisabled();
    await expect(card.getByText('Sync failed')).toBeHidden({ timeout: 20000 });
  });

  test('keeps the Sync failed line with Show why until a sync goes through', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    // Two synchronizations, one of them a real push, and the invalidation each
    // one awaits.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // One refusal and then a Core that answers as usual, so the line the card
    // holds can be watched across a sync that goes through.
    await stubCoreRejectWithTypeOnce(
      electronApp,
      'core:projects:synchronize',
      'Unauthorized'
    );

    await synchronize.click();
    await expect(
      syncDialog(mainWindow).getByRole('heading', { name: 'Sync failed' })
    ).toBeVisible();
    await dismissAlertDialog(mainWindow);

    // The dialog is gone and the card still says what happened, with the way
    // back into it.
    const card = projectCard(mainWindow);
    const failed = card.getByText('Sync failed');
    const showWhy = card.getByRole('button', { name: 'Show why' });
    await expect(failed).toBeVisible();
    await expect(showWhy).toBeVisible();

    // The line is announced, since it arrives while the editor may be looking
    // somewhere else, and it is told by its word and its icon rather than by
    // its color.
    const told = await mainWindow.evaluate(() => {
      const line = Array.from(
        document.querySelectorAll('[data-slot="project-card"] [role="status"]')
      ).find(
        (candidate) => candidate.textContent?.includes('Sync failed') === true
      );
      if (line === undefined) {
        throw new Error('The card says nothing about the failed sync');
      }
      return {
        role: line.getAttribute('role'),
        icons: line.querySelectorAll('svg').length,
      };
    });
    expect(told.role).toBe('status');
    expect(told.icons).toBe(1);

    // A sync that goes through ends it: neither the line nor Show why outlives
    // the failure it is about.
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect(failed).toBeHidden({ timeout: 20000 });
    await expect(showWhy).toHaveCount(0);
  });

  test('names each field Core named once, by its own label inside a Component item and by its slug where the field is gone', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // A Component whose own reference field carries the slug the Collection
    // uses too, which is what tells the two labels apart: a field inside a
    // Component item is defined by the Component, not by the Collection.
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Hero' },
      slug: 'hero',
      fieldDefinitions: [
        referenceFieldDefinition({ label: { en: 'Hero image' } }),
      ],
    });
    // Its own slug, since the arrangement below adds a Collection of its own
    // and Core refuses a second one under the same slug.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Blog post' }, plural: { en: 'Blog posts' } },
      slug: { singular: 'blog-post', plural: 'blog-posts' },
      fieldDefinitions: [
        textFieldDefinition(),
        referenceFieldDefinition(),
        dynamicFieldDefinition({ ofComponents: [component.id] }),
      ],
    });
    const section = uuid();
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        related: referenceValue(),
        sections: componentValue([
          {
            id: section,
            componentId: component.id,
            values: { related: referenceValue() },
          },
        ]),
      },
    });
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // The set of references Core can name that no local repository can be
    // arranged into: the same field reached through both carriers it stores a
    // reference in, one inside a Component item, which Core names with the
    // chain of hops down to it, and one in a field the Collection no longer
    // has, which is what a field removed between the write and the sync
    // leaves.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:synchronize',
      'Conflict',
      {
        cause: [
          {
            collectionId: collection.id,
            entryId: entry.id,
            fieldSlug: 'related',
            via: 'reference',
            componentPath: [],
            targetKind: 'entry',
            targetId: entry.id,
            targetCollectionId: collection.id,
          },
          {
            collectionId: collection.id,
            entryId: entry.id,
            fieldSlug: 'related',
            via: 'mdast',
            componentPath: [],
            targetKind: 'entry',
            targetId: entry.id,
            targetCollectionId: collection.id,
          },
          {
            collectionId: collection.id,
            entryId: entry.id,
            fieldSlug: 'related',
            via: 'reference',
            componentPath: [
              {
                fieldSlug: 'sections',
                itemId: section,
                componentId: component.id,
              },
            ],
            targetKind: 'entry',
            targetId: entry.id,
            targetCollectionId: collection.id,
          },
          {
            collectionId: collection.id,
            entryId: entry.id,
            fieldSlug: 'a-field-that-went',
            via: 'reference',
            componentPath: [],
            targetKind: 'asset',
            targetId: entry.id,
            targetCollectionId: null,
          },
        ],
      }
    );

    await synchronize.click();

    // One row per field rather than one per broken id, so the dialog offers one
    // way into each field.
    const dialog = syncDialog(mainWindow);
    const rows = dialog.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(
      rows.filter({ hasText: 'Related' }).getByRole('link')
    ).toHaveText('Spring opening hours');

    // The field inside the Component item keeps a row of its own, named by the
    // label that Component gave it rather than by the Collection's label for
    // the same slug, or by the slug itself.
    const nested = rows.filter({ hasText: 'Hero image' });
    await expect(nested).toHaveCount(1);
    await expect(nested.getByRole('link')).toHaveText('Spring opening hours');

    // A field no longer defined at all is named by the slug a site reads its
    // Value under, since there is no label left to read.
    await expect(rows.filter({ hasText: 'a-field-that-went' })).toHaveCount(1);
  });

  test('answers a refusal in the dialog while focus is still on Sync, and gives focus back', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    // The fourth type the dialog answers, which no local bare repository can
    // produce: a git command that failed at all, most often a repository
    // nothing can reach.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:synchronize',
      'Internal'
    );

    await synchronize.click();

    const dialog = syncDialog(mainWindow);
    await expect(
      dialog.getByText(
        'The Git repository could not be reached, so check your connection and try again.'
      )
    ).toBeVisible();

    // Nothing of the refusal but the app's own sentence: no type, and no list
    // where Core named nothing.
    await expect(dialog.getByText('Internal')).toBeHidden();
    await expect(dialog.getByRole('listitem')).toHaveCount(0);

    // The dialog took focus, and gives it back to Sync when it closes. While
    // it is open the rest of the window is inert, so where focus is is read
    // off the document rather than through a role outside the dialog. Polled,
    // because the dialog moves focus a frame after it is on screen.
    await expect
      .poll(async () =>
        mainWindow.evaluate(
          () => document.activeElement?.closest('[role="alertdialog"]') !== null
        )
      )
      .toBe(true);
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).toBeHidden();
    await expect(synchronize).toBeFocused();
  });
});

/**
 * What the Project card says the Project's state is, and what it offers for
 * it.
 *
 * ci draws one card per state, so each state is driven here through the
 * arrangement Core answers it from: a repository the Project is level with, one
 * it is ahead and behind of, no repository at all, one that cannot be reached
 * and one that refuses access.
 */
test.describe('The Project card', () => {
  test('says what is not synced, what is incoming and when it last checked', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
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

    // One local write, so the Project is ahead by one, and two Core-shaped
    // commits on the remote, so it is behind by two. Each count is Core's, from
    // the one check the card runs.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    for (const note of ['first.txt', 'second.txt']) {
      commitFileOnRemote(
        testInfo,
        remote.path,
        { relPath: note, content: 'from another computer' },
        {
          method: 'update',
          reference: { objectType: 'project', id: project.id },
        }
      );
    }

    await navigateToProjectDashboard(mainWindow, project.id);
    const card = projectCard(mainWindow);

    // What is not synced and what is incoming, each on a line of its own and
    // each in words rather than as a bare number.
    await expect(card.getByText('1 change not synced')).toBeVisible();
    await expect(card.getByText('2 incoming changes')).toBeVisible();

    // Sync takes the card's full width, which is the 206 px ci measured for it,
    // and no second button stands beside it: a Release is cut from the Releases
    // screen, which the sidebar's own row leads to.
    const sync = card.getByRole('button', { name: 'Sync' });
    await expect(sync).toBeEnabled();
    const measured = await mainWindow.evaluate(() => {
      const element = document.querySelector('[data-slot="project-card"]');
      if (element === null) {
        throw new Error('The sidebar has no Project card');
      }
      const state = element.querySelector(':scope > div:last-of-type');
      const button = element.querySelector('button[data-slot="button"]');
      if (state === null || button === null) {
        throw new Error('The card has no state block or no Sync');
      }
      return {
        buttonWidth: Math.round(button.getBoundingClientRect().width),
        stateWidth: Math.round(
          state.getBoundingClientRect().width -
            parseFloat(getComputedStyle(state).paddingLeft) -
            parseFloat(getComputedStyle(state).paddingRight)
        ),
      };
    });
    expect(measured.buttonWidth).toBe(measured.stateWidth);
    expect(measured.buttonWidth).toBe(206);
    await expect(card.getByRole('button', { name: /Release/ })).toHaveCount(0);

    // The card says when it last checked, and Check now checks at once: the
    // remote gains one more commit out of band, which only another check can
    // find, and it does without the three minutes the card waits on its own.
    await expect(card.getByText(/^Checked /)).toBeVisible();
    commitFileOnRemote(
      testInfo,
      remote.path,
      { relPath: 'third.txt', content: 'from another computer' },
      { method: 'update', reference: { objectType: 'project', id: project.id } }
    );
    await card.getByRole('button', { name: 'Check now' }).click();
    await expect(card.getByText('3 incoming changes')).toBeVisible({
      timeout: 20000,
    });
  });

  test('checks the Git repository again on its own, with nothing pressed', async ({
    mainWindow,
  }, testInfo) => {
    // The card keeps checking on a clock of its own, which is driven here by
    // taking the window's clock over: three minutes of it pass in one step
    // rather than in real time. It is installed before the Project is opened,
    // so the app loads with it in place and time keeps flowing until the jump,
    // which is what keeps the window from getting stuck while it loads.
    await mainWindow.clock.install();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
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

    await navigateToProjectDashboard(mainWindow, project.id);
    const card = projectCard(mainWindow);
    await expect(card.getByText('Everything synced')).toBeVisible();

    // One Core-shaped commit on the remote, which nothing but another check
    // can find.
    commitFileOnRemote(
      testInfo,
      remote.path,
      { relPath: 'note.txt', content: 'from another computer' },
      { method: 'update', reference: { objectType: 'project', id: project.id } }
    );

    // Nobody presses Sync or Check now: the three minutes the card waits on
    // its own are all that passes.
    await mainWindow.clock.fastForward('03:10');

    await expect(card.getByText('1 incoming change')).toBeVisible({
      timeout: 20000,
    });
  });

  test('says a Project with no Git repository is on this computer only', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigateToProjectDashboard(mainWindow, project.id);
    const card = projectCard(mainWindow);

    // Nothing can be synced or checked without a repository, so neither is
    // offered, and the one way to change that is linked.
    await expect(card.getByText('This computer only')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Sync' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Check now' })).toHaveCount(
      0
    );
    const link = card.getByRole('link', { name: 'Set up sync in Settings' });
    await expect(link).toBeVisible();
    await link.click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/settings/version-control`
    );
  });

  test('names the last Release with its date', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A Release of a Project without a remote, which Core makes locally, so the
    // card's own line is what this measures rather than a push. One Collection
    // first, since a Project with nothing changed has nothing to release.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    await mainWindow
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Release' })
      .click();
    await expectReleaseCreated(mainWindow, '0.1.0');

    const card = projectCard(mainWindow);
    await expect(card.getByText('Release 0.1.0')).toBeVisible();

    // The day it went out, in the User's own locale rather than as the stored
    // ISO string. The User is in English here, which is the locale date-fns
    // falls back to, so the expected words are the pattern's own.
    const released = (
      await listReleasesViaIpc(mainWindow, { projectId: project.id })
    ).list[0];
    if (released === undefined) {
      throw new Error('The Project holds no Release');
    }
    await expect(
      card.getByText(format(new Date(released.datetime), 'PP'))
    ).toBeVisible();
    await expect(card.getByText(released.datetime)).toHaveCount(0);
  });

  test('says a Git repository it cannot reach, keeps Sync as the retry and logs it', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
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

    await recordLogsViaIpc(electronApp);
    // Core raises Internal when the git command fails at all, which is what a
    // repository nothing can reach leaves behind.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:getChanges',
      'Internal'
    );

    await navigateToProjectDashboard(mainWindow, project.id);
    const card = projectCard(mainWindow);

    // The warning line stands in place of the counts, since Core asks the
    // repository before it counts and so can count nothing then.
    const warning = card.getByText("Can't reach the Git repository");
    await expect(warning).toBeVisible();
    await expect(card.getByText(/not synced/)).toHaveCount(0);
    await expect(card.getByText(/incoming/)).toHaveCount(0);

    // Opening the Project never reaches the error screen, and the rest of the
    // window carries on.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(projectSidebar(mainWindow)).toBeVisible();

    // Sync stays as the retry, rather than being disabled because nothing
    // could be counted.
    await expect(card.getByRole('button', { name: 'Sync' })).toBeEnabled();

    // The line is told by its word and its icon, and it is announced, since it
    // arrives while the editor is looking somewhere else.
    const told = await mainWindow.evaluate(() => {
      const line = Array.from(
        document.querySelectorAll('[data-slot="project-card"] [role="status"]')
      ).find(
        (candidate) =>
          candidate.textContent?.includes('reach the Git repository') === true
      );
      if (line === undefined) {
        throw new Error('The card says nothing about the Git repository');
      }
      return {
        role: line.getAttribute('role'),
        icons: line.querySelectorAll('svg').length,
      };
    });
    expect(told.role).toBe('status');
    expect(told.icons).toBe(1);

    // The failed check is in the log file with its type, message and stack,
    // the way a pane's boundary writes one.
    const logged = (await recordedLogs(electronApp)).filter(
      (record) =>
        record.level === 'error' && record.message.startsWith('Project card')
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(logged[0]?.source).toBe('desktop');
    expect(logged[0]?.meta['error.type']).toBe('Internal');
    expect(Object.keys(logged[0]?.meta ?? {})).toContain(
      'exception.stacktrace'
    );

    // Nothing of Core's own answer reaches the card: not its type, and not the
    // message it wrote.
    await expect(card.getByText('Internal')).toHaveCount(0);
    await expect(card.getByText(/E2E injected/)).toHaveCount(0);
  });

  test('says a Git repository that refused access, rather than one it cannot reach', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
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

    // A repository that answered and refused the credentials, which Core
    // raises as Unauthorized. It is not unreachable, so it gets its own line.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:getChanges',
      'Unauthorized'
    );

    await navigateToProjectDashboard(mainWindow, project.id);
    const card = projectCard(mainWindow);

    await expect(
      card.getByText('The Git repository refused access')
    ).toBeVisible();
    await expect(card.getByText("Can't reach the Git repository")).toHaveCount(
      0
    );
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(card.getByRole('button', { name: 'Sync' })).toBeEnabled();

    // Only a repository that answered and refused gets that line. Every other
    // way this one call can fail leaves nothing counted, so the card says what
    // is true of all of them, and still reaches no error screen.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:getChanges',
      'NotFound'
    );
    await card.getByRole('button', { name: 'Check now' }).click();
    await expect(
      card.getByText("Can't reach the Git repository")
    ).toBeVisible();
    await expect(
      card.getByText('The Git repository refused access')
    ).toHaveCount(0);
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
  });

  test('stands on the sidebar column and fits the smallest window in both themes', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    for (const theme of ['light', 'dark'] as const) {
      await navigateToProjectDashboard(mainWindow, project.id);
      await setTheme(mainWindow, theme);
      await navigateToProjectDashboard(mainWindow, project.id);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await waitForLayout(mainWindow);
      // The filled card, not the skeleton that stands in for it while the
      // Project is still being read: both draw the card's own slot, so waiting
      // on that alone lets the probe below run against a card that has no
      // initials to measure yet. The switcher named after the Project is drawn
      // by the filled card alone, and it is given the slack of a slow read on
      // a slow machine rather than the default.
      await expect(
        projectCard(mainWindow).getByRole('button', { name: project.name })
      ).toBeVisible({ timeout: 20000 });

      const lockup = await mainWindow
        .getByRole('banner')
        .getByRole('link', { name: 'elek.io Desktop, Projects' })
        .boundingBox();
      const measured = await mainWindow.evaluate(() => {
        const sidebar = document.querySelector('[data-slot="sidebar"]');
        const card = document.querySelector('[data-slot="project-card"]');
        const search = sidebar?.querySelector(
          '[data-slot="sidebar-group"] button'
        );
        const initials = card?.querySelector('span[aria-hidden="true"]');
        const row = sidebar?.querySelector('[data-slot="sidebar-menu-button"]');
        if (
          sidebar === null ||
          card === null ||
          search === null ||
          search === undefined ||
          initials === null ||
          initials === undefined ||
          row === null ||
          row === undefined
        ) {
          throw new Error('The sidebar has no card, no search or no rows');
        }
        const box = (element: ProbedElement): number =>
          Math.round(element.getBoundingClientRect().x);

        return {
          cardBox: box(card),
          searchBox: box(search),
          rowBox: box(row),
          cardContent: box(initials),
          // Nothing of the card is cut off or pushed past its own box, which
          // is what a line too long for 206 px would do.
          overflow:
            card.scrollWidth - card.clientWidth > 1 ||
            card.scrollHeight - card.clientHeight > 1,
          fitsTheWindow:
            card.getBoundingClientRect().right <= window.innerWidth &&
            card.getBoundingClientRect().bottom <= window.innerHeight,
        };
      });

      if (lockup === null) {
        throw new Error('The header has no lockup');
      }

      // The card's box stands where the search's and every row's box does, and
      // its content on the one column ci draws the sidebar on, which is the
      // column the header lockup takes.
      expect(measured.cardBox).toBe(measured.searchBox);
      expect(measured.cardBox).toBe(measured.rowBox);
      expect(measured.cardContent).toBe(Math.round(lockup.x));
      expect(measured.overflow).toBe(false);
      expect(measured.fitsTheWindow).toBe(true);
    }
  });

  test('stands its Syncing icon still under reduced motion', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const synchronize = await arrangeSyncableProject(
      mainWindow,
      testInfo,
      project.id
    );

    await mainWindow.emulateMedia({ reducedMotion: 'reduce' });
    // A sync that never settles, so the waiting state is stable to measure
    // instead of racing the answer.
    await stubCoreHang(electronApp, 'core:projects:synchronize');
    await synchronize.click();

    // The button says what it is doing in words, so nothing is told by the
    // movement alone, and the icon stands still.
    const syncing = mainWindow.getByRole('button', { name: 'Syncing' });
    await expect(syncing).toBeVisible();
    const animation = await mainWindow.evaluate(() => {
      const spinner = document.querySelector(
        '[data-slot="project-card"] [data-slot="spinner"]'
      );
      if (spinner === null) {
        throw new Error('Sync shows no spinner while it syncs');
      }
      return getComputedStyle(spinner).animationName;
    });
    expect(animation).toBe('none');
  });
});

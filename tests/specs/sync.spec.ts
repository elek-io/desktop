import { expect } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  referenceFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import { dismissDialog } from '../helpers/dialog.js';
import {
  createEntryViaIpc,
  referenceValue,
  stringValue,
} from '../helpers/entry.js';
import { stubCoreReject } from '../helpers/ipc.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import {
  commitFileOnRemote,
  commitUnrelatedFileOnRemote,
  deleteEntryOnRemote,
  localDraftSha,
  remoteBranches,
  remoteDraftSha,
  setupRemote,
} from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Synchronize', () => {
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

    // The sidebar's Synchronize control lives on Project routes and enables only
    // when there is something to sync (ahead 1 here).
    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
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
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
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
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // Core refuses with PreconditionFailed, which the sidebar handles in place
    // through the same dialog, not the root error boundary (the fixture's
    // console check confirms no error escaped). The description names what
    // Core raises that type for, rather than an unreachable repository, which
    // is an Internal error.
    await expect(
      mainWindow.getByText('Could not synchronize this Project')
    ).toBeVisible();
    await expect(
      mainWindow.getByText(
        'No change reached the Git repository. It may hold something besides this Project, it may not be able to store Assets, or the same text may have been changed here and somewhere else. Your changes on this computer are safe. Ask whoever set up this Project.'
      )
    ).toBeVisible();

    // Nothing was pushed: the remote still holds only the branch it came with.
    expect(remoteBranches(remote.path)).toEqual(['main']);

    // Dismissing the dialog leaves the app usable, as the Project is untouched.
    await dismissDialog(mainWindow);
    await expect(synchronize).toBeEnabled();
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
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
    await expect(synchronize).toBeEnabled();

    await synchronize.click();

    // The pull rebases the local Entry onto the remote (Target deleted), then the
    // pre-push integrity scan finds the dangling reference and rejects with a
    // Conflict without pushing. The desktop app surfaces that in place through the
    // sync-conflict modal, not the root error boundary (the fixture's console
    // check confirms no error escaped).
    await expect(
      mainWindow.getByText('Could not synchronize this Project')
    ).toBeVisible();
    // The description reflects the preserved CoreError type: the integrity gate
    // rejects with a Conflict, so the modal names the reference whose target is
    // gone rather than falling back to the generic sentence.
    await expect(
      mainWindow.getByText(
        'An Entry in this Project points at an Entry or an Asset that no longer exists, so no change reached the Git repository. Open that Entry, point it at something else or clear the field, then synchronize again.'
      )
    ).toBeVisible();

    // Nothing was pushed: the remote's draft ref is exactly where it was, so the
    // local-only Entry never reached the shared remote.
    expect(remoteDraftSha(remote.path)).toBe(beforeSha);

    // Dismissing the modal leaves the app usable (not crashed or mid-rebase): the
    // dashboard and its sidebar still render.
    await dismissDialog(mainWindow);
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
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
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

  test('routes an unexpected sync failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A reachable bare origin plus one local commit, so the Synchronize control
    // enables (ahead 1). Mirrors the round-trip setup above.
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
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToProjectDashboard(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Synchronize' });
    await expect(synchronize).toBeEnabled();

    // Make the sync reject with a non-guard error. The Synchronize mutation
    // handles only Conflict and PreconditionFailed in place (the sync-conflict
    // modal), so every other failure must reach the root error boundary. Guards
    // the throwOnError predicate against a regression to a blanket throwOnError:
    // false (see the projects delete spec for the full rationale).
    await stubCoreReject(electronApp, 'core:projects:synchronize');

    await synchronize.click();

    // The failure propagates: the root error boundary replaces the view and the
    // sync-conflict modal never opens.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Could not synchronize this Project')
    ).toBeHidden();
  });
});

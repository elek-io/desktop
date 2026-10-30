import { expect } from '@playwright/test';
import { renameSync } from 'node:fs';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import {
  createCollectionViaIpc,
  deleteCollectionViaIpc,
} from '../helpers/collection.js';
import { dismissDialog } from '../helpers/dialog.js';
import {
  createEntryViaIpc,
  deleteEntryViaIpc,
  stringValue,
  updateEntryViaIpc,
} from '../helpers/entry.js';
import {
  stubCoreHang,
  stubCoreReject,
  stubCoreRejectWithType,
  stubCoreResolve,
} from '../helpers/ipc.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToHistory,
  navigateToProjectDashboard,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import {
  expectReleaseCreated,
  listReleasesViaIpc,
  navigateToReleases,
  openReleaseDialog,
  tagPreviewRelease,
} from '../helpers/release.js';
import {
  commitFileOnRemote,
  localCurrentBranch,
  localDraftSha,
  localMainSha,
  localTags,
  remoteDraftSha,
  remoteMainSha,
  remoteTags,
  setupRemote,
} from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

/** The version `projects.create` writes, which the first Release moves up from. */
const CREATED_VERSION = '0.0.1';

/** Where a Project's git repository lives under the per-test data directory. */
function projectPath(
  dataDir: string,
  projectId: string
): ReturnType<typeof join> {
  return join(dataDir, 'projects', projectId);
}

test.describe('Releases', () => {
  test('releases a Project through the dialog and shows the version Core wrote', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // One Collection added since the Project was created. Which bump that is
    // belongs to Core (see its releases doc), so the dialog's badge and the
    // version below are what the desktop app has to show of Core's answer.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    // The page is reached from the Project's sidebar.
    await navigateToProjectDashboard(mainWindow, project.id);
    await mainWindow.getByRole('link', { name: 'Releases' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/releases`
    );

    // Nothing has been published yet, so the page shows its empty state and
    // carries the action there rather than in the header.
    await expect(mainWindow.getByText('No Releases yet')).toBeVisible();

    const releaseButton = mainWindow.getByRole('button', {
      name: 'Release',
      exact: true,
    });
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // Opening it moves focus into the dialog.
    await expect(dialog.locator(':focus')).toHaveCount(1);

    // A Release cannot be undone, which the dialog says before it is confirmed,
    // and its one primary button names the act rather than agreeing with it.
    await expect(dialog.getByText('It cannot be undone.')).toBeVisible();

    // The old and the new version, the bump as a badge carrying its word, the
    // reason in one sentence, and the changes in words.
    await expect(
      dialog.getByText(`Version ${CREATED_VERSION} becomes`)
    ).toBeVisible();
    await expect(dialog.getByText('0.1.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Minor', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        'This is a minor Release, because a Collection was added.',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      dialog.getByText('A Collection was added', { exact: true })
    ).toBeVisible();

    // Every control in the dialog has an accessible name, which is also what
    // lets the locators here find them.
    await expectNoAxeViolations(mainWindow, {
      disableRules: ['color-contrast'],
    });

    // Escape closes it from the keyboard and hands focus back to what opened it.
    await dismissDialog(mainWindow);
    await expect(releaseButton).toBeFocused();

    await openReleaseDialog(mainWindow);
    await dialog.getByRole('button', { name: 'Create Release' }).click();

    // The outcome is a toast with nothing to answer, and the dialog closes.
    await expectReleaseCreated(mainWindow, '0.1.0');
    await expect(dialog).toBeHidden();

    // What was published and when, without a reload: the Releases list shows
    // the version Core wrote and the Project carries it in the sidebar.
    await expect(mainWindow.getByText('No Releases yet')).toBeHidden();
    await expect(
      mainWindow
        .getByRole('main')
        .getByRole('listitem')
        .filter({ hasText: '0.1.0' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Test Project 0.1.0' })
    ).toBeVisible();
    const { list, total } = await listReleasesViaIpc(mainWindow, {
      projectId: project.id,
    });
    expect(total).toBe(1);
    expect(list[0]?.version).toBe('0.1.0');
    expect(list[0]?.type).toBe('release');

    // The Project's History shows the Release Core committed.
    await navigateToHistory(mainWindow, project.id);
    await expect(mainWindow.getByText('release project').first()).toBeVisible();
  });

  test('names an added, a removed and a changed object in the diff', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const doomed = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Goes away' }) },
    });
    const kept = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Stays' }) },
    });

    // A first Release, so the second one has a released state to diff against.
    // Everything created and removed inside one draft nets to no change, which
    // is why a removal needs a Release behind it.
    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    await mainWindow
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Release' })
      .click();
    await expectReleaseCreated(mainWindow, '0.1.0');

    // One of each kind since that Release. A Collection's slugs are unique in
    // its Project, so the second one brings its own.
    await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Event' }, plural: { en: 'Events' } },
      slug: { singular: 'event', plural: 'events' },
    });
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: doomed.id,
    });
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: kept.id,
      values: { title: stringValue({ en: 'Stays, with another title' }) },
    });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    await expect(
      dialog.getByText('A Collection was added', { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText('An Entry was removed', { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText('An Entry was changed', { exact: true })
    ).toBeVisible();

    // A removed Entry breaks what a site reads, so the Release is major and the
    // badge says so in words rather than by its color alone.
    await expect(dialog.getByText('Major', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Version 0.1.0 becomes')).toBeVisible();
    await expect(dialog.getByText('1.0.0', { exact: true })).toBeVisible();
  });

  test('shows a Release that changes nothing a site reads as a Patch', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A Collection added and removed again inside one draft. Core compares the
    // released state against the current draft and never the commits between,
    // so this nets to no classified change while draft is still ahead, which
    // is the state Core calls a patch (see its releases doc).
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await deleteCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // The badge carries its word, so a Patch is never read by color alone.
    await expect(
      dialog.getByText(`Version ${CREATED_VERSION} becomes`)
    ).toBeVisible();
    await expect(dialog.getByText('0.0.2', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Patch', { exact: true })).toBeVisible();

    // No change drove the bump, so the sentence says why without naming one,
    // and there is no list of changes to show.
    await expect(
      dialog.getByText(
        'This is a patch Release, because what a site reads is unchanged.',
        { exact: true }
      )
    ).toBeVisible();
    await expect(dialog.getByText('What changed')).toBeHidden();

    // There is still something to publish, so the Release is offered.
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeVisible();
  });

  test('says on the button that it is waiting while the Release runs', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeVisible();

    // Make the Release never settle, so the waiting state is stable to assert
    // instead of racing a fast resolve.
    await stubCoreHang(electronApp, 'core:releases:create');

    await dialog.getByRole('button', { name: 'Create Release' }).click();

    // The button says it is waiting and takes no second press.
    const waiting = dialog.getByRole('button', { name: 'Creating Release' });
    await expect(waiting).toBeVisible();
    await expect(waiting).toBeDisabled();
  });

  test('marks a preview Release rather than listing it as a Release', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A preview tags the editing branch without publishing anything, and
    // elek.io Desktop cannot make one, so this one comes from the runner.
    tagPreviewRelease(
      projectPath(testDataDirs(testInfo).dataDir, project.id),
      '0.0.2-preview.1'
    );

    await navigateToReleases(mainWindow, project.id);
    await expect(
      mainWindow
        .getByRole('main')
        .getByRole('listitem')
        .filter({ hasText: '0.0.2-preview.1' })
        .getByText('Preview', { exact: true })
    ).toBeVisible();
    await expect(mainWindow.getByText('No Releases yet')).toBeHidden();
  });

  test('says there is nothing to release and offers no Create Release', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    // A Project nothing was saved in since it was created: Core puts `draft` on
    // the commit `create` made, so its diff against the released state is empty.
    const project = await createProjectViaIpc(mainWindow);

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    await expect(
      dialog.getByText(
        `Nothing has changed since version ${CREATED_VERSION}, so there is nothing to release.`
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeHidden();
    await expect(dialog.getByText('What changed')).toBeHidden();

    // Closing it leaves the page usable and nothing was published.
    await dismissDialog(mainWindow);
    await expect(mainWindow.getByText('No Releases yet')).toBeVisible();
  });

  test('pushes main, draft and the tag to the remote', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const path = projectPath(testDataDirs(testInfo).dataDir, project.id);

    // A bare origin the Project starts out level with, as the sync specs use.
    const remote = setupRemote(testInfo, { mirror: path });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    expect(remoteTags(remote.path)).toEqual([]);

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    await mainWindow
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Release' })
      .click();
    await expectReleaseCreated(mainWindow, '0.1.0');

    // One atomic push carried all three refs. Which refs land is Core's, so only
    // their presence and position are observed, not their contents.
    await expect
      .poll(() => remoteTags(remote.path).length, { timeout: 30000 })
      .toBe(1);
    expect(remoteMainSha(remote.path)).toBe(localMainSha(path));
    expect(remoteDraftSha(remote.path)).toBe(localDraftSha(path));
  });

  test('refuses to read a Release while the remote holds newer changes', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const path = projectPath(testDataDirs(testInfo).dataDir, project.id);
    const remote = setupRemote(testInfo, { mirror: path });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });

    // The page is opened while the Project is still level with the remote, so
    // the sidebar's count says there is nothing to synchronize and Synchronize
    // is disabled. That count refreshes on its own only every three minutes,
    // which is longer than an editor takes to act on the refusal below. The
    // Refresh changes control is enabled once the first read landed, so this
    // waits for the count rather than for a button that is disabled anyway.
    await navigateToReleases(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', {
      name: 'Synchronize',
    });
    await expect(
      mainWindow.getByRole('button', { name: 'Refresh changes' })
    ).toBeEnabled();
    await expect(synchronize).toBeDisabled();

    // Something to release locally, and a remote that moved on out of band, so
    // the local `draft` lacks a commit the remote's holds.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    commitFileOnRemote(
      testInfo,
      remote.path,
      { relPath: 'note.txt', content: 'from another computer' },
      { method: 'update', reference: { objectType: 'project', id: project.id } }
    );

    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // The read fetches first, so Core refuses it rather than comparing against
    // a stale remote. The dialog says what to do instead of naming a branch or
    // an error type, and offers no Create Release.
    await expect(
      dialog.getByText(
        'Changes were saved or a Release was made on another computer, so synchronize this Project first.'
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeHidden();
    // Reading again cannot change this answer until the Project is
    // synchronized, which happens outside the dialog, so nothing offers to.
    await expect(
      dialog.getByRole('button', { name: 'Try again' })
    ).toBeHidden();

    // Nothing of Core's error reaches the screen: not its type, and not the
    // message it wrote, which names the branch Core refused on.
    await expect(mainWindow.getByText('PreconditionFailed')).toBeHidden();
    await expect(mainWindow.getByText('draft')).toBeHidden();

    // Nothing was published, locally or on the remote.
    expect(localTags(path)).toEqual([]);
    expect(remoteTags(remote.path)).toEqual([]);

    // The one thing the refusal asks for can be done right away. The read
    // fetched, so the count behind Synchronize is the one the dialog just saw
    // and not the stale zero the sidebar held when the page opened.
    await dismissDialog(mainWindow);
    await expect(synchronize).toBeEnabled();
  });

  test('offers to read again when the remote cannot be reached, and reads it', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const path = projectPath(testDataDirs(testInfo).dataDir, project.id);
    const remote = setupRemote(testInfo, { mirror: path });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    // The repository is away before the dialog opens, so the read cannot reach
    // it and refuses rather than comparing against a stale copy.
    const gone = `${remote.path}-gone`;
    renameSync(remote.path, gone);

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');
    await expect(
      dialog.getByText(
        'The Git repository could not be reached, so check your connection and try again.'
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeHidden();

    // This one a second read can clear on its own, so the dialog offers it, and
    // once the repository answers again the Release is there to make.
    const tryAgain = dialog.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeVisible();
    renameSync(gone, remote.path);
    await tryAgain.click();
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeVisible();
  });

  test('says nothing was released when the remote moves on after the diff was read', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const path = projectPath(testDataDirs(testInfo).dataDir, project.id);
    const remote = setupRemote(testInfo, { mirror: path });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    // The diff is read while the remote is still level, so Create Release is
    // offered, and only then does the remote move on.
    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');
    const createRelease = dialog.getByRole('button', {
      name: 'Create Release',
    });
    await expect(createRelease).toBeVisible();

    commitFileOnRemote(
      testInfo,
      remote.path,
      { relPath: 'note.txt', content: 'from another computer' },
      { method: 'update', reference: { objectType: 'project', id: project.id } }
    );
    const remoteDraftBefore = remoteDraftSha(remote.path);
    const localMainBefore = localMainSha(path);

    await createRelease.click();

    // Core fetches inside create(), refuses, and unwinds every step it took, so
    // the dialog stays open and the same button retries. The sentence names the
    // cause the editor met and what to do about it, not every cause the type
    // covers, and it is the read's sentence with that fact in front of it.
    await expect(
      dialog.getByText(
        'Nothing was released, and this Project is exactly as it was. Changes were saved or a Release was made on another computer, so synchronize this Project first.'
      )
    ).toBeVisible();
    await expect(createRelease).toBeEnabled();

    // No tag, no moved branch, and the Project is still on its editing branch.
    expect(localTags(path)).toEqual([]);
    expect(localMainSha(path)).toBe(localMainBefore);
    expect(localCurrentBranch(path)).toBe('draft');
    expect(remoteTags(remote.path)).toEqual([]);
    expect(remoteDraftSha(remote.path)).toBe(remoteDraftBefore);
  });

  test('releases nothing when the remote cannot be reached, and lets the editor retry', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const path = projectPath(testDataDirs(testInfo).dataDir, project.id);
    const remote = setupRemote(testInfo, { mirror: path });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');
    const createRelease = dialog.getByRole('button', {
      name: 'Create Release',
    });
    await expect(createRelease).toBeVisible();

    // The diff was read against a reachable remote, which then goes away. A
    // remote nothing can reach is neither of the two guard types: the git
    // command exits non-zero, which Core raises as an internal failure.
    const localMainBefore = localMainSha(path);
    renameSync(remote.path, `${remote.path}-gone`);

    await createRelease.click();

    await expect(
      dialog.getByText(
        'Nothing was released, and this Project is exactly as it was. The Git repository could not be reached, so check your connection and try again.'
      )
    ).toBeVisible();

    // Nothing of Core's error reaches the screen: not its type, and not the git
    // command and path its message carries, where a remote's address with a
    // password in it would otherwise show up.
    await expect(mainWindow.getByText('Internal')).toBeHidden();
    await expect(mainWindow.getByText('git fetch')).toBeHidden();
    await expect(mainWindow.getByText(remote.path)).toBeHidden();

    // No tag, no moved branch, still on the editing branch, and the button is
    // there to try again.
    expect(localTags(path)).toEqual([]);
    expect(localMainSha(path)).toBe(localMainBefore);
    expect(localCurrentBranch(path)).toBe('draft');
    await expect(createRelease).toBeEnabled();
  });

  test('shows a renamed Component as a major Release', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // What Core reports for a renamed Component slug is Core's (its releases doc
    // lists it as major), so the diff that carries one comes from a stubbed
    // answer rather than from a rename arranged here. Showing it is the desktop
    // app's.
    await stubCoreResolve(electronApp, 'core:releases:prepare', {
      project,
      bump: 'major',
      currentVersion: '1.2.3',
      nextVersion: '2.0.0',
      projectChanges: [],
      collectionChanges: [],
      fieldChanges: [],
      componentChanges: [
        {
          componentId: project.id,
          changeType: 'slugChanged',
          bump: 'major',
        },
      ],
      componentFieldChanges: [],
      assetChanges: [],
      entryChanges: [],
    });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    await expect(dialog.getByText('Version 1.2.3 becomes')).toBeVisible();
    await expect(dialog.getByText('2.0.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Major', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText('A Component was renamed', { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        'This is a major Release, because a Component was renamed.',
        { exact: true }
      )
    ).toBeVisible();
  });

  test('says a repository that refused access cannot be read, and offers nothing to press', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    // A remote that rejects the credentials, which no local repository can be
    // arranged into. Core puts it under Unauthorized (see its git-and-sync
    // error table), which is what a wrong or expired token gives.
    await stubCoreRejectWithType(
      electronApp,
      'core:releases:prepare',
      'Unauthorized'
    );

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    await expect(
      dialog.getByText(
        'The Git repository refused access, so ask whoever set up this Project.'
      )
    ).toBeVisible();

    // Neither button would change the answer: nothing can be released, and a
    // second read refuses the same way until somebody is let into the
    // repository, which happens outside this dialog.
    await expect(
      dialog.getByRole('button', { name: 'Create Release' })
    ).toBeHidden();
    await expect(
      dialog.getByRole('button', { name: 'Try again' })
    ).toBeHidden();

    // The Core error type names itself to nobody.
    await expect(mainWindow.getByText('Unauthorized')).toBeHidden();
  });

  test('releases nothing when the repository refuses access, and lets the editor retry', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');
    const createRelease = dialog.getByRole('button', {
      name: 'Create Release',
    });
    await expect(createRelease).toBeVisible();

    // The push is what the credentials are rejected on, so the read succeeded
    // and only the Release itself refuses.
    await stubCoreRejectWithType(
      electronApp,
      'core:releases:create',
      'Unauthorized'
    );

    await createRelease.click();

    await expect(
      dialog.getByText(
        'Nothing was released, and this Project is exactly as it was. The Git repository refused access, so ask whoever set up this Project.'
      )
    ).toBeVisible();

    // Core leaves nothing half made, so the same press tries again, and the
    // type stays off the screen here too.
    await expect(createRelease).toBeEnabled();
    await expect(mainWindow.getByText('Unauthorized')).toBeHidden();
  });

  test('routes an unexpected Release failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // The Release handles only the three guard types in place, so every other
    // failure has to reach the root error boundary. Guards the throwOnError
    // predicate against a regression to a blanket throwOnError: false. A plain
    // Error carries no type at all, which is the predicate's first leg.
    await stubCoreReject(electronApp, 'core:releases:create');

    await dialog.getByRole('button', { name: 'Create Release' }).click();

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(mainWindow.getByText('Create a Release')).toBeHidden();
  });

  test('routes a Release failure of an unhandled type to the root error boundary', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // The predicate's second leg: a failure that does carry a CoreError type,
    // but one the dialog has no answer for. Conflict stands for the four
    // others the Release does not handle, and the dialog must not swallow it
    // into a refusal line it has no text for.
    await stubCoreRejectWithType(
      electronApp,
      'core:releases:create',
      'Conflict'
    );

    await dialog.getByRole('button', { name: 'Create Release' }).click();

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(mainWindow.getByText('Create a Release')).toBeHidden();
  });
});

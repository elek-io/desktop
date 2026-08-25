import { expect } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { createCollectionViaIpc } from '../helpers/collection.js';
import { confirmDialog, dismissDialog } from '../helpers/dialog.js';
import { stubCoreReject } from '../helpers/ipc.js';
import {
  navigate,
  reloadWindow,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import {
  createProject,
  createProjectViaIpc,
  deleteProjectViaIpc,
  navigateToProjectSettings,
  navigateToVersionControl,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { setupRemote } from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Projects', () => {
  test('creates a project through the form and shows it in the list', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    const name = 'My first Project';
    await createProject(mainWindow, {
      name,
      description: 'Created through the create form',
    });

    // Reaching the dashboard (asserted inside createProject) means Core
    // accepted the create without throwing. Core owns and separately tests
    // file and commit correctness, so this spec verifies only the desktop
    // app's part: the create reached Core, and the UI reflects the result.

    // Back on the Projects list, the new Project is shown
    await mainWindow
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    await expect(mainWindow).toHaveURL(/#\/projects$/);
    await expect(mainWindow.getByText(name)).toBeVisible();
  });

  test('renders a persisted project after a renderer reload', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const name = 'Seeded Project';
    await createProjectViaIpc(mainWindow, { name });

    // The list was fetched empty before the seed, so a reload is what surfaces
    // the persisted project. This proves the renderer reads Core's state on a
    // fresh load rather than showing an optimistic cache entry.
    await reloadWindow(mainWindow);
    await expect(mainWindow).toHaveURL(/#\/projects$/);
    await expect(mainWindow.getByText(name)).toBeVisible();
  });

  test('surfaces create validation on submit without disabling the button', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/create');

    // On open, the create is not submit-gated (validation is surfaced on click,
    // not by disabling the button) and no field is flagged invalid yet.
    await expect(
      mainWindow.getByRole('button', { name: 'Create Project' })
    ).toBeEnabled();
    await expect(mainWindow.getByLabel('Project name')).toHaveAttribute(
      'aria-invalid',
      'false'
    );
    await expect(mainWindow.getByLabel('Project description')).toHaveAttribute(
      'aria-invalid',
      'false'
    );

    // Submitting empty surfaces the errors on both required fields and the URL
    // stays on the create route, so the submit did not go through and nothing
    // was created. Whether the message text is Core's is Core's concern, the
    // desktop app's responsibility is to surface the invalid state and block.
    await mainWindow.getByRole('button', { name: 'Create Project' }).click();
    await expect(mainWindow.getByLabel('Project name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await expect(mainWindow.getByLabel('Project description')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await expect(mainWindow).toHaveURL(/#\/projects\/create$/);
  });

  test('shows the empty state, then a card once a project exists', async ({
    mainWindow,
  }) => {
    // Fresh app with nothing seeded: the empty state shows and no card renders.
    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expect(mainWindow.getByText('No Projects yet')).toBeVisible();

    // Seeding a project (over IPC, which skips the renderer cache) and reloading
    // surfaces its card with both name and description, and the empty state goes.
    await setUserViaIpc(mainWindow);
    await createProjectViaIpc(mainWindow);
    await reloadWindow(mainWindow);

    await expect(mainWindow.getByText('Test Project')).toBeVisible();
    await expect(
      mainWindow.getByText('A Project created by the E2E tests')
    ).toBeVisible();
    await expect(mainWindow.getByText('No Projects yet')).toBeHidden();
  });

  test('updates a project through the form, gated on a dirty change', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Test Project',
    });

    // Land on the settings form fresh, which reads the Project from Core
    await navigateToProjectSettings(mainWindow, project.id);

    // Wait for the form to reset from the loaded Project. Until it settles, the
    // dirty gate cannot be trusted, so key off the name field showing.
    await expect(mainWindow.getByLabel('Project name')).toHaveValue(
      'Test Project'
    );

    // Nothing edited yet, so Save is gated
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    // Editing the name dirties the form, so Save enables
    await mainWindow.getByLabel('Project name').fill('Renamed Project');
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // A successful Project update stays on the settings page, so prove the
    // change persisted through a read surface: boot fresh on the Projects list,
    // which re-reads from Core, and see the renamed card with the old name gone.
    await navigate(mainWindow, '#/projects');
    await expect(mainWindow.getByText('Renamed Project')).toBeVisible();
    await expect(mainWindow.getByText('Test Project')).toBeHidden();
  });

  test('force-deletes a local-only project through the fallback modal', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigate(mainWindow, `#/projects/${project.id}/settings/general`);

    // A local-only Project can't be deleted normally, Core guards against
    // destroying unsynchronized work. The desktop app catches that rejection
    // and offers a force delete instead of crashing to the error boundary.
    await mainWindow.getByRole('button', { name: 'Delete Project' }).click();
    await confirmDialog(mainWindow, 'Delete');

    // The force-delete modal appears (the guard was handled in place) and its
    // description reflects the preserved CoreError type: a local-only Project
    // (PreconditionFailed) explains there is no remote copy.
    await expect(
      mainWindow.getByText('Force delete this Project?')
    ).toBeVisible();
    await expect(
      mainWindow.getByText(
        'This Project only exists on this device (no remote copy). Force delete removes it permanently.'
      )
    ).toBeVisible();
    await confirmDialog(mainWindow, 'Yes, delete');

    // The force delete goes through and the UI reflects the removal
    await expect(mainWindow).toHaveURL(/#\/projects$/);
    await expect(mainWindow.getByText('No Projects yet')).toBeVisible();
  });

  test('routes a project with unpushed commits through the force-delete modal', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Mirror the Project's current work branch into a bare origin, so the
    // Project starts out level with its remote (ahead 0). clone --bare copies
    // the refs without a working tree, sidestepping Core's LFS push path.
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

    // One real local write moves work ahead of the remote, so a guarded delete
    // would now destroy unsynchronized work. This is the state that separates
    // this case from the local-only (no origin) force-delete above.
    await createCollectionViaIpc(mainWindow, { projectId: project.id });

    await navigate(mainWindow, `#/projects/${project.id}/settings/general`);

    // The unpushed-ahead guard is caught in place and offers a force delete,
    // rather than silently destroying the work or crashing to the error boundary.
    await mainWindow.getByRole('button', { name: 'Delete Project' }).click();
    await confirmDialog(mainWindow, 'Delete');

    await expect(
      mainWindow.getByText('Force delete this Project?')
    ).toBeVisible();
    // The description reflects the preserved CoreError type: unpushed local work
    // (Conflict) explains those changes would be discarded, distinct from the
    // local-only reason above.
    await expect(
      mainWindow.getByText(
        'This Project has local changes not yet pushed to its remote. Force delete discards those unpushed changes permanently.'
      )
    ).toBeVisible();
    await confirmDialog(mainWindow, 'Yes, delete');

    // The force delete goes through and the UI reflects the removal
    await expect(mainWindow).toHaveURL(/#\/projects$/);
    await expect(mainWindow.getByText('No Projects yet')).toBeVisible();
  });

  test('blocks removing the default language and persists the supported set', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });

    await navigateToProjectSettings(mainWindow, project.id);

    // Wait for the form to reset from the loaded Project, so both language chips
    // and their (accessibly named) remove buttons are present.
    await expect(
      mainWindow.getByRole('button', { name: 'Remove en' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove de' })
    ).toBeVisible();

    // Removing the default language is blocked in place: the guard dialog opens
    // and 'en' is not removed.
    await mainWindow.getByRole('button', { name: 'Remove en' }).click();
    await expect(
      mainWindow.getByText('Deleting the default language')
    ).toBeVisible();
    await dismissDialog(mainWindow);
    await expect(
      mainWindow.getByRole('button', { name: 'Remove en' })
    ).toBeVisible();

    // Removing a non-default language is confirmed first: Core writes the new
    // settings without checking content, so the removal orphans anything already
    // translated into it. Cancelling keeps the chip.
    await mainWindow.getByRole('button', { name: 'Remove de' }).click();
    await expect(
      mainWindow.getByText('Remove de from this Project?')
    ).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove de' })
    ).toBeVisible();

    // Confirming drops its chip and dirties the form.
    await mainWindow.getByRole('button', { name: 'Remove de' }).click();
    await mainWindow.getByRole('button', { name: 'Remove language' }).click();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove de' })
    ).toBeHidden();

    // Saving persists the narrowed supported set. A reload re-reads from Core and
    // shows only 'en' (de gone, en stayed), guarding the default-remove guard and
    // the supported-set persistence.
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await reloadWindow(mainWindow);
    await expect(
      mainWindow.getByRole('button', { name: 'Remove en' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove de' })
    ).toBeHidden();
  });

  test('sets the remote origin URL and reveals the Synchronize control', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A bare mirror of the Project's current work is a reachable origin, so the
    // sidebar's getChanges succeeds once the origin is set and the console stays
    // clean (clone --bare copies the refs without an LFS push path).
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });

    await navigateToVersionControl(mainWindow, project.id);

    // No origin yet: Save is gated and the sidebar shows no Synchronize control
    // (it renders only when remoteOriginUrl != null).
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();
    await expect(
      mainWindow.getByRole('button', { name: 'Synchronize' })
    ).toBeHidden();

    // Setting the origin dirties the form, so Save enables.
    await mainWindow.getByLabel('Remote URL').fill(remote.url);
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // The origin is set: the Synchronize button appears, and the form reset back
    // to the saved origin re-gates Save (proving the change reached Core).
    await expect(
      mainWindow.getByRole('button', { name: 'Synchronize' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    // The clearing half (empty URL removes the origin) is dropped: an empty
    // submit resolves in Core but leaves a non-null value rather than clearing
    // it, so the origin is not actually cleared.
  });

  test('reload lists multiple projects without duplication or loss', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    // Seed three Projects with distinct names over IPC (skipping the renderer
    // cache), then reload so the list re-reads all of them from Core.
    const names = ['Alpha Project', 'Beta Project', 'Gamma Project'];
    for (const name of names) {
      await createProjectViaIpc(mainWindow, { name });
    }
    await reloadWindow(mainWindow);
    await verifyCurrentRouteHash(mainWindow, '#/projects');

    // Every name renders exactly once: none lost, none duplicated. Each name is
    // its own card title, so an exact-text match counts one element per Project.
    for (const name of names) {
      await expect(mainWindow.getByText(name, { exact: true })).toHaveCount(1);
    }
  });

  test('clones a project from a local bare remote and shows it in the list', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Cloned Project',
    });

    // Mirror the Project into a bare remote (clone --bare copies its refs), then
    // force-delete the local copy. The bare now holds a Project the local data
    // dir does not, which is what the clone flow pulls back down.
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });
    await deleteProjectViaIpc(mainWindow, { id: project.id, force: true });

    // With the local copy gone, a fresh Projects list is empty again.
    await navigate(mainWindow, '#/projects');
    await expect(mainWindow.getByText('No Projects yet')).toBeVisible();

    // Clone it back from the bare remote through the UI, pointing at the bare's
    // plain filesystem path (what setupRemote returns). clone stores that path as
    // the Project's origin, and the list card's RemoteOriginBadge renders it, so
    // this also exercises the badge's fallback for an origin that is not a
    // parseable URL, where new URL(path) would throw.
    await mainWindow.getByRole('button', { name: 'Clone Project' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog.getByText('Clone a Project by URL')).toBeVisible();
    await dialog.getByLabel('URL', { exact: true }).fill(remote.url);
    await dialog.getByRole('button', { name: 'Clone' }).click();

    // The clone reaches Core without throwing: the dialog closes and the Project
    // reappears on the list by its name (the empty state is gone), its card
    // rendered rather than crashing to the error boundary. Core's on-disk clone
    // (files, LFS materialization) is Core's own test, not asserted here. Cloning
    // the same id twice would hit the root error boundary (the clone mutation
    // keeps the global throwOnError), so that duplicate-id Conflict is a deferred
    // UI-negative and is not exercised here.
    await expect(dialog).toBeHidden();
    await expect(mainWindow.getByText('Cloned Project')).toBeVisible();
    await expect(mainWindow.getByText('No Projects yet')).toBeHidden();
  });

  test('rejects a clone with an empty URL client-side', async ({
    mainWindow,
  }) => {
    // cloneProjectSchema.url is a required string and FormInputField normalizes an
    // empty input to null, so a cleared URL is the client-rejectable case: the
    // resolver flags it before any IPC call, rather than sending an empty URL to
    // Core.
    await setUserViaIpc(mainWindow);

    await navigate(mainWindow, '#/projects');
    await mainWindow.getByRole('button', { name: 'Clone Project' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog.getByText('Clone a Project by URL')).toBeVisible();

    // On open the URL field is not flagged (no validation has run).
    const url = dialog.getByLabel('URL', { exact: true });
    await expect(url).toHaveAttribute('aria-invalid', 'false');

    // Type then clear, so the field value normalizes to null, and submit. The
    // resolver flags URL invalid and clones nothing: the dialog stays open and
    // the route stays on the Projects list, proving the reject was client-side.
    await url.fill('placeholder');
    await url.fill('');
    await dialog.getByRole('button', { name: 'Clone' }).click();
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toBeVisible();
    await expect(mainWindow).toHaveURL(/#\/projects$/);
  });

  test('routes an unexpected delete failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    await navigate(mainWindow, `#/projects/${project.id}/settings/general`);

    // Make the delete reject with a non-guard error (a plain Error carries no
    // CoreError type). The delete mutation handles only PreconditionFailed and
    // Conflict in place (the force-delete modal), so every other failure must
    // reach the root error boundary. This guards the throwOnError predicate
    // against a regression back to a blanket throwOnError: false, which would
    // swallow the failure into the force-delete modal and drop it from the
    // logs entirely. The guard-path force-delete specs above cannot catch that,
    // since the modal still opens for the guard reasons either way.
    await stubCoreReject(electronApp, 'core:projects:delete');

    await mainWindow.getByRole('button', { name: 'Delete Project' }).click();
    await confirmDialog(mainWindow, 'Delete');

    // The failure propagates: the root error boundary replaces the view and the
    // force-delete modal never opens.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Force delete this Project?')
    ).toBeHidden();
  });
});

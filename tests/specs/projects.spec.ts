import { expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { createCollectionViaIpc } from '../helpers/collection.js';
import { confirmDialog, dismissDialog } from '../helpers/dialog.js';
import {
  recordedCoreCalls,
  stubCoreHang,
  stubCoreRecord,
  stubCoreReject,
} from '../helpers/ipc.js';
import { recordLogsViaIpc, recordedLogs } from '../helpers/log.js';
import {
  navigate,
  reloadWindow,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import {
  createProject,
  createProjectViaIpc,
  deleteProjectViaIpc,
  downloadProject,
  fillProjectForm,
  navigateToProjectCreate,
  navigateToProjectSettings,
  navigateToVersionControl,
  openDownloadDialog,
  projectCardOf,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { renameBranchesOnRemote, setupRemote } from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

/** What keeps a form from saving, as it stands below Save. */
function blockedReason(page: Page): Locator {
  return page.locator('[data-slot="form-blocked-reason"]');
}

/** The state lines of one Project's card, in the words they say. */
async function stateLinesOf(page: Page, name: string): Promise<string[]> {
  return projectCardOf(page, name)
    .locator('[data-slot="project-state-line"]')
    .allInnerTexts();
}

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
    // Scoped to the page, since the toast that confirmed the create names the
    // Project too and would make a bare text locator ambiguous.
    await expect(mainWindow.getByRole('main').getByText(name)).toBeVisible();
  });

  test('lists what is on this computer as a ruled grid, with its count', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    for (const name of ['Used cars', 'Service app']) {
      await createProjectViaIpc(mainWindow, {
        name,
        description: `The content of ${name}`,
        settings: { language: { default: 'en', supported: ['en', 'de'] } },
      });
    }
    await navigate(mainWindow, '#/projects');

    // The page head: the title, the filter, then the two ways in, the outline
    // one before the primary one.
    await expect(
      mainWindow.getByRole('heading', { name: 'Projects', level: 1 })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Filter Projects')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: 'Download from another Git host',
      })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Create Project' })
    ).toBeVisible();

    // The one section, named and counted, with the cards in a ruled grid of
    // three columns that spans the pane.
    await expect(
      mainWindow.getByRole('heading', { name: 'On this computer', level: 2 })
    ).toBeVisible();
    const grid = await mainWindow.evaluate(() => {
      const head = Array.from(document.querySelectorAll('h2')).find(
        (candidate) => candidate.textContent === 'On this computer'
      );
      const section = head?.parentElement?.nextElementSibling;
      const pane = document.querySelector('[data-slot="pane"]');

      if (section === null || section === undefined || pane === null) {
        throw new Error('The Projects page draws no grid under its section');
      }
      const style = getComputedStyle(section);

      return {
        count: head?.nextElementSibling?.textContent ?? '',
        columns: style.gridTemplateColumns.split(' ').length,
        ruled: style.borderTopWidth,
        spansThePane:
          Math.round(section.getBoundingClientRect().width) ===
          Math.round(pane.getBoundingClientRect().width),
      };
    });
    expect(grid).toEqual({
      count: '2',
      columns: 3,
      ruled: '1px',
      spansThePane: true,
    });

    // Each card carries the Project's name, its description and its languages
    // by their codes, and opens the Project.
    const card = projectCardOf(mainWindow, 'Used cars');
    await expect(card).toHaveAttribute('href', /\/projects\/[^/]+\/dashboard/);
    await expect(card.getByText('The content of Used cars')).toBeVisible();
    await expect(card.getByText('EN', { exact: true })).toBeVisible();
    await expect(card.getByText('DE', { exact: true })).toBeVisible();

    // Nothing offers elek.io Cloud, which the alpha does not have.
    await expect(mainWindow.getByText(/elek\.io Cloud/)).toBeHidden();
  });

  test('says on each card where it syncs, and names every logo it draws', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const local = await createProjectViaIpc(mainWindow, {
      name: 'Only here',
    });
    const synced = await createProjectViaIpc(mainWindow, {
      name: 'On a host',
    });
    const remote = setupRemote(testInfo, {
      mirror: join(testDataDirs(testInfo).dataDir, 'projects', synced.id),
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: synced.id,
      url: remote.url,
    });
    await navigate(mainWindow, '#/projects');

    // A Project with no Git repository says so and has no state line, since
    // Core counts what is not synced against a remote only. It still says
    // whether it has a Release.
    expect(await stateLinesOf(mainWindow, 'Only here')).toEqual([
      'This computer only',
      'No Release yet',
    ]);
    expect(local.remoteOriginUrl).toBeNull();

    // One that does names its host and what the check found. The address is a
    // plain path here, which has no hostname, so the name is the words for a
    // host Desktop cannot name rather than the address itself.
    await expect(
      projectCardOf(mainWindow, 'On a host').getByText('Another Git host')
    ).toBeVisible();
    await expect(
      projectCardOf(mainWindow, 'On a host').getByText('Everything synced')
    ).toBeVisible();
  });

  test('names the host from every shape an address comes in, and nothing else of it', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    // Every shape a Project's origin reaches Desktop in. Only the hostname is
    // read, so neither a token nor a home folder in an address can be shown,
    // and a host Simple Icons has no logo for reads as its hostname.
    const addresses: { name: string; url: string; reads: string }[] = [
      {
        name: 'Https',
        url: 'https://github.com/example/https.git',
        reads: 'GitHub',
      },
      {
        name: 'Ssh',
        url: 'git@github.com:example/ssh.git',
        reads: 'GitHub',
      },
      {
        name: 'Ssh scheme',
        url: 'ssh://git@codeberg.org/example/ssh-scheme.git',
        reads: 'Codeberg',
      },
      {
        name: 'Upper case',
        url: 'https://GitLab.com/example/upper.git',
        reads: 'GitLab',
      },
      {
        name: 'With www',
        url: 'https://www.bitbucket.org/example/www.git',
        reads: 'Bitbucket',
      },
      {
        name: 'With a token',
        url: 'https://someone:ghp_notarealtoken@github.com/example/token.git',
        reads: 'GitHub',
      },
      {
        name: 'Self hosted',
        url: 'https://git.example.com/example/self-hosted.git',
        reads: 'git.example.com',
      },
      {
        name: 'A path',
        url: '/home/someone/repositories/a-path.git',
        reads: 'Another Git host',
      },
    ];

    for (const address of addresses) {
      const project = await createProjectViaIpc(mainWindow, {
        name: address.name,
      });
      await setRemoteOriginUrlViaIpc(mainWindow, {
        id: project.id,
        url: address.url,
      });
    }

    // The check never runs, so nothing here reaches a network and each card
    // draws what its address alone says.
    await stubCoreHang(electronApp, 'core:projects:getChanges');
    await navigate(mainWindow, '#/projects');

    for (const address of addresses) {
      await expect(
        projectCardOf(mainWindow, address.name).getByText(address.reads, {
          exact: true,
        }),
        `${address.name} reads ${address.reads}`
      ).toBeVisible();
    }

    // Nothing of an address itself is on the page: not a token, not a path and
    // not a repository's name.
    const shown = await mainWindow.getByRole('main').innerText();
    for (const part of [
      'ghp_notarealtoken',
      'someone',
      '/home/',
      'https://',
      '.git',
    ]) {
      expect(shown, `${part} is not shown`).not.toContain(part);
    }
  });

  test('fills each card on its own, so one Git repository holds up no other', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    await recordLogsViaIpc(electronApp);
    await setUserViaIpc(mainWindow);
    const reachable = await createProjectViaIpc(mainWindow, {
      name: 'Reachable',
    });
    const unreachable = await createProjectViaIpc(mainWindow, {
      name: 'Unreachable',
    });
    const remote = setupRemote(testInfo, {
      mirror: join(testDataDirs(testInfo).dataDir, 'projects', reachable.id),
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: reachable.id,
      url: remote.url,
    });
    // A path no repository is at, which is a Git repository nothing can reach.
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: unreachable.id,
      url: join(testInfo.outputPath('nowhere'), 'gone.git'),
    });
    await navigate(mainWindow, '#/projects');

    // The one that answers says so, and the one that does not says that in its
    // own line, in the warning color. Neither holds up the other, and nothing
    // reaches the error screen.
    await expect(
      projectCardOf(mainWindow, 'Reachable').getByText('Everything synced')
    ).toBeVisible();
    await expect(
      projectCardOf(mainWindow, 'Unreachable').getByText(
        "Can't reach the Git repository"
      )
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
    await expect(
      mainWindow.getByText("Desktop can't read your Projects.")
    ).toBeHidden();

    // The failure is in the log file with its type and its stack, the way a
    // pane's boundary writes one, so a repository that stopped answering is
    // never only on screen.
    const logged = (await recordedLogs(electronApp)).filter((record) =>
      record.message.startsWith('Project card check error:')
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(logged[0]?.level).toBe('error');
    expect(logged[0]?.meta['error.type']).toBeDefined();
  });

  test('shows the page at once while the checks are still running', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await createProjectViaIpc(mainWindow, { name: 'Used cars' });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: (await createProjectViaIpc(mainWindow, { name: 'Service app' })).id,
      url: 'https://example.invalid/service-app.git',
    });

    // A Project on a host Simple Icons has a logo for. Its address is never
    // reached here, because the check is held below, so the card draws what
    // the address alone says.
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: (await createProjectViaIpc(mainWindow, { name: 'Used bikes' })).id,
      url: 'https://github.com/example/used-bikes.git',
    });

    // A check that never answers, which is a Git repository taking its time.
    await stubCoreHang(electronApp, 'core:projects:getChanges');
    await navigate(mainWindow, '#/projects');

    // The page is there with every card on it, each saying where it syncs,
    // while the line the check fills is still a placeholder.
    await expect(
      mainWindow.getByRole('heading', { name: 'Projects', level: 1 })
    ).toBeVisible();
    await expect(projectCardOf(mainWindow, 'Used cars')).toBeVisible();
    const waiting = projectCardOf(mainWindow, 'Service app');
    // A host Simple Icons has no logo for reads as its hostname, with Lucide's
    // git-branch beside it.
    await expect(waiting.getByText('example.invalid')).toBeVisible();
    await expect(
      waiting.locator('[data-slot="skeleton"]').first()
    ).toBeVisible();

    // One it has a logo for reads as the brand's own name, with that logo.
    const named = projectCardOf(mainWindow, 'Used bikes');
    await expect(named.getByText('GitHub')).toBeVisible();
    await expect(named.locator('[data-brand-logo]')).toBeVisible();

    // A logo never stands on its own: every brand logo on the page has the
    // host's name beside it in words.
    const unnamed = await mainWindow.evaluate(() =>
      Array.from(document.querySelectorAll('[data-brand-logo]'))
        .map(
          (logo) =>
            logo.closest('[data-slot="project-state-line"]')?.textContent ?? ''
        )
        .filter((name) => name.trim() === '')
    );
    expect(unnamed).toEqual([]);
  });

  test('keeps a new Project on this computer when its Git repository refuses it', async ({
    mainWindow,
  }, testInfo) => {
    // Slow on purpose: the create is followed by two more calls, and each one
    // re-reads the Project before the next runs.
    test.slow();
    await setUserViaIpc(mainWindow);
    await navigateToProjectCreate(mainWindow);

    // Another Git host, with an address no repository is at, so the first sync
    // cannot go through.
    await fillProjectForm(mainWindow, {
      name: 'Used cars',
      description: 'The cars for sale on the website',
    });
    await mainWindow.getByRole('radio', { name: 'Another Git host' }).click();
    await mainWindow
      .getByLabel('Address', { exact: true })
      .fill(join(testInfo.outputPath('nowhere'), 'gone.git'));
    await mainWindow.getByRole('button', { name: 'Create Project' }).click();

    // The Project was created before the sync was tried, so Desktop says it is
    // here rather than leaving the editor on a form that would make a second
    // one.
    const dialog = mainWindow.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'Used cars was created, but not synced',
      })
    ).toBeVisible({ timeout: 30000 });
    await expect(
      dialog.getByText('Everything you entered is on this computer.')
    ).toBeVisible();
    // The cause, in words rather than as Core wrote it, since an address can
    // carry a password.
    await expect(
      dialog.getByText('The Git repository could not be reached')
    ).toBeVisible();

    // Opening it leads to the Project, and the Projects page lists it.
    await dialog.getByRole('button', { name: 'Open the Project' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/dashboard/);
    await navigate(mainWindow, '#/projects');
    await expect(projectCardOf(mainWindow, 'Used cars')).toBeVisible();
  });

  test('puts a new Project on the Git repository its address names', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    // Slow on purpose, for the same reason as the spec above.
    test.slow();
    await recordLogsViaIpc(electronApp);
    await setUserViaIpc(mainWindow);
    const remote = setupRemote(testInfo);
    await navigateToProjectCreate(mainWindow);

    await fillProjectForm(mainWindow, {
      name: 'Used cars',
      description: 'The cars for sale on the website',
    });
    // The address is asked for only once another Git host is chosen, and it
    // says it is needed.
    await expect(
      mainWindow.getByLabel('Address', { exact: true })
    ).toBeHidden();
    await mainWindow.getByRole('radio', { name: 'Another Git host' }).click();
    await mainWindow.getByLabel('Address', { exact: true }).fill(remote.url);
    await mainWindow.getByRole('button', { name: 'Create Project' }).click();

    // Both calls went through, so the Project opens and its card names where it
    // syncs rather than this computer.
    await expect(mainWindow).toHaveURL(/#\/projects\/[^/]+\/dashboard/, {
      timeout: 60000,
    });
    await navigate(mainWindow, '#/projects');
    await expect(
      projectCardOf(mainWindow, 'Used cars').getByText('Another Git host')
    ).toBeVisible();

    // Nothing of the three calls reached an error boundary on the way: the
    // Project the create wrote into the cache is read back through its own
    // query, so the two invalidations after it have something to refetch with.
    const caught = (await recordedLogs(electronApp)).filter((record) =>
      record.message.startsWith('Uncaught route error:')
    );
    expect(caught).toEqual([]);
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

  test('holds Create Project with its reason while a field is empty', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigateToProjectCreate(mainWindow);
    const create = mainWindow.getByRole('button', { name: 'Create Project' });

    // Name and Description are empty on open, and the Project starts with one
    // language, so two fields still need a Value and the button says so.
    await expect(blockedReason(mainWindow)).toHaveText(
      '2 fields are still empty'
    );
    await expect(create).toBeDisabled();
    // Blocked means aria-disabled, so the button keeps its place in the tab
    // order and points at the reason.
    await expect(create).toHaveAttribute('aria-describedby', /.+/);

    // Nothing reaches Core while it is blocked, however the submit is raised,
    // and the validator does not even run, so no field is flagged either.
    await stubCoreRecord(electronApp, 'core:projects:create');
    // A click, which the control still takes, since it is not `disabled`.
    await create.click({ force: true });
    await mainWindow
      .getByLabel('Name', { exact: true })
      .press('Enter', { noWaitAfter: true });
    expect(await recordedCoreCalls(electronApp)).toEqual([]);
    await expect(
      mainWindow.getByLabel('Name', { exact: true })
    ).toHaveAttribute('aria-invalid', 'false');
    await expect(mainWindow).toHaveURL(/#\/projects\/create$/);

    // Filling both frees the button and clears the reason.
    await fillProjectForm(mainWindow, {
      name: 'Used cars',
      description: 'The cars for sale on the website',
    });
    await expect(blockedReason(mainWindow)).toBeHidden();
    await expect(create).toBeEnabled();
  });

  test('asks before what was typed into the create form is lost', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigateToProjectCreate(mainWindow);
    await mainWindow.getByLabel('Name', { exact: true }).fill('Used cars');

    // Leaving the page with something nobody saved asks, named by the page.
    await mainWindow
      .getByRole('banner')
      .getByRole('link', { name: 'elek.io Desktop, Projects' })
      .click();
    const dialog = mainWindow.locator('[data-slot="discard-changes-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('Discard your changes to Create Project?')
    ).toBeVisible();

    // Keeping the changes stays on the page with what was typed.
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects\/create$/);
    await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
      'Used cars'
    );
  });

  test('shows Welcome with both ways in, then a card once a project exists', async ({
    mainWindow,
  }) => {
    // A User but no Project: the Projects page is its own empty state, which is
    // the Welcome screen, with the mark, both actions and the three notes, and
    // no page head to repeat them.
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Create Project' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', {
        name: 'Download from another Git host',
      })
    ).toBeVisible();
    for (const note of ['Offline', 'Sync', 'Release']) {
      await expect(
        mainWindow.getByRole('main').getByText(note, { exact: true }),
        `the note ${note}`
      ).toBeVisible();
    }
    await expect(mainWindow.getByLabel('Filter Projects')).toBeHidden();
    // Nothing of elek.io Cloud, which the alpha does not offer.
    await expect(mainWindow.getByText(/elek\.io Cloud/)).toBeHidden();

    // Seeding a project (over IPC, which skips the renderer cache) and reloading
    // surfaces its card with both name and description, and Welcome goes.
    await createProjectViaIpc(mainWindow);
    await reloadWindow(mainWindow);

    await expect(mainWindow.getByText('Test Project')).toBeVisible();
    await expect(
      mainWindow.getByText('A Project created by the E2E tests')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeHidden();
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
    await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
      'Test Project'
    );

    // Nothing edited yet, so Save is gated
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();

    // Editing the name dirties the form, so Save enables
    await mainWindow
      .getByLabel('Name', { exact: true })
      .fill('Renamed Project');
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
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();
  });

  test('routes a project with unpushed commits through the force-delete modal', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Mirror the Project's draft branch into a bare origin, so the
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
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();
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

    // Adding one goes through the picker: its list holds the languages this
    // Project does not support yet, the search narrows them, and choosing one
    // adds its chip. A language already supported is not offered.
    await mainWindow.getByRole('combobox', { name: 'Add language' }).click();
    const languages = mainWindow.getByRole('listbox');
    await expect(languages).toBeVisible();
    await expect(languages.getByRole('option', { name: 'de' })).toBeHidden();
    const search = mainWindow.getByRole('combobox', {
      name: 'Search languages',
    });
    // The field keeps its name inside itself as well, since no label stands
    // above it, which is the one exception ci makes to placeholder text.
    await expect(search).toHaveAttribute('placeholder', 'Search languages');
    await search.fill('es');
    await languages.getByRole('option', { name: 'es' }).click();
    // Choosing closes the picker. Wait for its popup to be gone rather than
    // its list: the popup carries the dialog role for as long as it animates
    // out, and the dialog helpers further down resolve to every dialog.
    await expect(
      mainWindow.locator('[data-slot="combobox-content"]')
    ).toBeHidden();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove es' })
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

    // Saving persists the set as it now stands. A reload re-reads from Core and
    // shows 'en' and the added 'es' (de gone, en stayed), guarding the
    // default-remove guard, the picker and the supported-set persistence.
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await reloadWindow(mainWindow);
    await expect(
      mainWindow.getByRole('button', { name: 'Remove en' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove es' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove de' })
    ).toBeHidden();
  });

  test('sets the remote origin URL and reveals Sync', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // A bare mirror of the Project's draft is a reachable origin, so the
    // sidebar's check succeeds once the origin is set and the console stays
    // clean (clone --bare copies the refs without an LFS push path).
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });

    await navigateToVersionControl(mainWindow, project.id);

    // No origin yet: Save is gated and the sidebar shows no Sync (it renders
    // only when remoteOriginUrl != null).
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();
    await expect(mainWindow.getByRole('button', { name: 'Sync' })).toBeHidden();

    // Setting the origin dirties the form, so Save enables.
    await mainWindow.getByLabel('Remote URL').fill(remote.url);
    await expect(
      mainWindow.getByRole('button', { name: 'Save changes' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    // The origin is set: the Sync button appears, which renders only for
    // a Project that has one, so the change reached Core. The page stays open
    // and makes its form pristine again with what it saved, which re-gates
    // Save.
    await expect(
      mainWindow.getByRole('button', { name: 'Sync' })
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

  test('downloads a project from another Git host and shows it in the list', async ({
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

    // With the local copy gone, the Projects page is the Welcome screen again,
    // which carries the same way in as the page head does.
    await navigate(mainWindow, '#/projects');
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();

    // The address the dialog asks for is the bare's plain filesystem path (what
    // setupRemote returns), which Core stores as the Project's origin. A path
    // has no hostname, so its card says "Another Git host" rather than the
    // address itself, which can carry a credential.
    const dialog = await downloadProject(mainWindow, remote.url);

    // The download reaches Core without throwing: the dialog closes and the
    // Project reappears on the page by its name, its card rendered rather than
    // crashing to the error boundary. Core's on-disk clone (files, LFS
    // materialization) is Core's own test, not asserted here. Downloading the
    // same id twice hits the root error boundary, which the spec below drives.
    await expect(dialog).toBeHidden();
    // Scoped to the page, since the toast that confirmed it names the Project
    // too.
    await expect(
      mainWindow.getByRole('main').getByText('Cloned Project')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeHidden();
    await expect(
      projectCardOf(mainWindow, 'Cloned Project').getByText('Another Git host')
    ).toBeVisible();
  });

  test('answers a download Core refuses in the dialog, with the address kept', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Old Project',
    });

    // A Project made before Core 0.25 has the branches work and production.
    // Renaming a mirror's branches back gives such a remote, and removing the
    // local copy leaves nothing for a Conflict to trip over.
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });
    renameBranchesOnRemote(remote.path, {
      draft: 'work',
      main: 'production',
    });
    await deleteProjectViaIpc(mainWindow, { id: project.id, force: true });

    await navigate(mainWindow, '#/projects');
    const dialog = await downloadProject(mainWindow, remote.url);

    // Core refuses it with PreconditionFailed, which the dialog explains in
    // place, keeping the address to correct
    await expect(
      dialog.getByText(
        'This repository holds no Project, or one made with an older version of elek.io Desktop. Ask whoever set it up.'
      )
    ).toBeVisible();
    await expect(dialog.getByLabel('Address', { exact: true })).toHaveValue(
      remote.url
    );
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();
  });

  test('routes a download of a Project already here to the root error boundary', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The mirror holds the same Project id the data directory already has, so
    // Core answers Conflict, which the Clone dialog does not handle in place
    const projectPath = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id
    );
    const remote = setupRemote(testInfo, { mirror: projectPath });

    await navigate(mainWindow, '#/projects');
    await downloadProject(mainWindow, remote.url);

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('This repository holds no Project')
    ).toBeHidden();
  });

  test('rejects a download with an empty address client-side', async ({
    mainWindow,
  }) => {
    // cloneProjectSchema.url is a required string and TextControl normalizes an
    // empty input to null, so a cleared address is the client-rejectable case:
    // the resolver flags it before any IPC call, rather than sending an empty
    // address to Core.
    await setUserViaIpc(mainWindow);

    await navigate(mainWindow, '#/projects');
    const dialog = await openDownloadDialog(mainWindow);
    // The words the dialog used to go by are gone from it.
    await expect(mainWindow.getByText('Clone a Project by URL')).toBeHidden();

    // On open the address field is not flagged (no validation has run).
    const url = dialog.getByLabel('Address', { exact: true });
    await expect(url).toHaveAttribute('aria-invalid', 'false');

    // Type then clear, so the field value normalizes to null, and submit. The
    // resolver flags URL invalid and clones nothing: the dialog stays open and
    // the route stays on the Projects list, proving the reject was client-side.
    await url.fill('placeholder');
    await url.fill('');
    await dialog.getByRole('button', { name: 'Download' }).click();
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

import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  navigateToCollectionSettings,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createComponentViaIpc,
  navigateToComponent,
} from '../helpers/component.js';
import {
  createEntryViaIpc,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import {
  recordedCoreCalls,
  stubCoreHang,
  stubCoreRecord,
  stubCoreResolve,
} from '../helpers/ipc.js';
import { reloadWindow } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectSettings,
  navigateToVersionControl,
} from '../helpers/project.js';
import { setupRemote } from '../helpers/remote.js';
import { navigateToUserProfile, setUserViaIpc } from '../helpers/user.js';

/**
 * What keeps a form from saving, as it stands below Save.
 *
 * ci puts it on a row of its own under the button, in the warning color, and
 * has Save point at it. The row is what this reads, and the pointing is
 * asserted from the button.
 */
function blockedReason(page: Page): Locator {
  return page.locator('[data-slot="form-blocked-reason"]');
}

/** The question asked before changes nobody saved are lost. */
function discardDialog(page: Page): Locator {
  return page.locator('[data-slot="discard-changes-dialog"]');
}

/** A Project with one Collection whose only field is a required Title. */
async function projectWithEntry(page: Page): Promise<{
  projectId: string;
  collectionId: string;
  entryId: string;
}> {
  await setUserViaIpc(page);
  const project = await createProjectViaIpc(page);
  const collection = await createCollectionViaIpc(page, {
    projectId: project.id,
    fieldDefinitions: [textFieldDefinition()],
  });
  const entry = await createEntryViaIpc(page, {
    projectId: project.id,
    collectionId: collection.id,
    values: { title: stringValue({ en: 'The stored title' }) },
  });

  return {
    projectId: project.id,
    collectionId: collection.id,
    entryId: entry.id,
  };
}

/** The one in-app link every screen has, which leaves the page it is on. */
function leaveThePage(page: Page): Locator {
  return page
    .getByRole('banner')
    .getByRole('link', { name: 'elek.io Desktop, Projects' });
}

test.describe('A form that cannot be saved yet', () => {
  test('says why below Save, and neither a click nor Enter saves', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    const title = mainWindow.getByLabel('Title', { exact: true });
    const save = mainWindow.getByRole('button', { name: 'Update Article' });

    // Nothing is missing yet, so Save waits only for a change.
    await expect(blockedReason(mainWindow)).toBeHidden();

    // Core refuses an Entry whose required Value is empty in a language of the
    // Project, so emptying the one required field is what blocks Save.
    await title.fill('');
    await expect(blockedReason(mainWindow)).toHaveText(
      'English is missing 1 Value'
    );
    await expect(save).toBeDisabled();

    // Nothing may reach Core, however the submit is raised. The channel in
    // front of it is the seam this records.
    await stubCoreRecord(electronApp, 'core:entries:update');

    // A click, which the control still takes, since it is not `disabled`.
    await save.click({ force: true });
    // Enter in a field, which raises a submit of the form itself rather than a
    // click on the button.
    await title.press('Enter');

    expect(await recordedCoreCalls(electronApp)).toEqual([]);
    // Still on the page, which a saved Entry would have left.
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/${ids.entryId}/update`)
    );
    await expect(blockedReason(mainWindow)).toHaveText(
      'English is missing 1 Value'
    );
    // The submit was ignored rather than run, so the validator did not mark
    // the field either. That is what tells a blocked form from one that is
    // checked when Save is pressed.
    await expect(title).toHaveAttribute('aria-invalid', 'false');
  });

  test('keeps Save reachable and names its reason, and blocks the same way without one', async ({
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    const title = mainWindow.getByLabel('Title', { exact: true });
    const save = mainWindow.getByRole('button', { name: 'Update Article' });

    // An unchanged form blocks Save too, and says nothing: there is nothing to
    // save rather than something to fix.
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).not.toHaveAttribute('disabled', /.*/);
    await expect(save).not.toHaveAttribute('aria-describedby', /.*/);

    await title.fill('');

    // Blocked by a reason now: still reachable with the keyboard, and read out
    // with the line that says why, which is what `disabled` would take away.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).not.toHaveAttribute('disabled', /.*/);
    await save.focus();
    await expect(save).toBeFocused();

    const reasonId = await save.getAttribute('aria-describedby');
    expect(reasonId).not.toBeNull();
    await expect(mainWindow.locator(`#${reasonId ?? ''}`)).toHaveText(
      'English is missing 1 Value'
    );
    // The same element ci draws the line as, in the warning color with its
    // icon, so the color alone does not carry it.
    await expect(blockedReason(mainWindow)).toHaveAttribute(
      'id',
      reasonId ?? ''
    );
  });

  test('blocks Save the same way while it is saving', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    const title = mainWindow.getByLabel('Title', { exact: true });
    const save = mainWindow.getByRole('button', { name: 'Update Article' });

    // The save never answers, so the form stays mid-save to be read instead of
    // racing the navigation a finished save ends in.
    await stubCoreHang(electronApp, 'core:entries:update');
    await title.fill('A title that is being saved');
    await save.click();

    // Blocked the same way as a reason blocks it, which is what keeps the
    // button and its spinner reachable: `aria-disabled` rather than
    // `disabled`, which would drop it out of the tab order mid-save.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).not.toHaveAttribute('disabled', /.*/);
    await save.focus();
    await expect(save).toBeFocused();

    // And it says nothing, because a save in flight is nothing to fix.
    await expect(save).not.toHaveAttribute('aria-describedby', /.*/);
    await expect(blockedReason(mainWindow)).toBeHidden();
  });
});

test.describe('A form while its own save runs', () => {
  test('is read-only on the page that stays open, and keeps what was sent', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToVersionControl(mainWindow, project.id);

    const url = mainWindow.getByLabel('Remote URL', { exact: true });
    const sent = 'https://example.com/first.git';

    // The save never answers, so the window the form is locked for stays open
    // to be read.
    await stubCoreHang(electronApp, 'core:projects:setRemoteOriginUrl');
    await url.fill(sent);
    // Submitted from the field, so what focus does while the form saves is
    // about the field rather than about the button that was pressed.
    await url.press('Enter');

    // Read-only rather than disabled: the field keeps its focus and its look,
    // and it is still enabled, which a disabled `<fieldset>` around it would
    // also take away.
    await expect(url).toHaveAttribute('readonly', '');
    await expect(url).toBeEnabled();
    await expect(url).toBeFocused();

    // So the keystroke is refused rather than taken and dropped. Typed through
    // the keyboard, because `fill` waits for a field it may write to and this
    // one must not be writable.
    await mainWindow.keyboard.type('https://example.com/second.git');
    await expect(url).toHaveValue(sent);
  });

  test('knows about an edit typed the moment the save is through', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToVersionControl(mainWindow, project.id);

    const url = mainWindow.getByLabel('Remote URL', { exact: true });
    const save = mainWindow.getByRole('button', { name: 'Save changes' });

    // A remote that is really there, so the Project card may read it once the
    // URL is stored rather than failing on a remote nobody can reach.
    await url.fill(setupRemote(testInfo).url);
    await save.click();

    // Typed as early as the form takes it, which is the moment the lock lifts.
    // `fill` waits for exactly that, so this lands in the first instant the
    // field is writable again.
    await url.fill('/a-remote-nobody-saved');

    // And the form knows it holds something unsaved: Save is available, and
    // leaving asks. A form that counted as clean here would have let the state
    // the save brought back drop what was typed on top of it.
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await leaveThePage(mainWindow).click();
    await expect(
      discardDialog(mainWindow).getByRole('heading', {
        name: 'Discard your changes to Version Control Settings?',
      })
    ).toBeVisible();
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(url).toHaveValue('/a-remote-nobody-saved');
  });

  test('stays read-only until the state the save brings back has arrived', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToVersionControl(mainWindow, project.id);

    const url = mainWindow.getByLabel('Remote URL', { exact: true });

    // The form fills from its query, so it holds every field read-only until
    // the Project has been read. The read is stubbed to hang below, so this
    // waits for the first one to have landed rather than racing it: a stub put
    // in place while it is still in flight would leave the form read-only for
    // the reason this spec is not about.
    await expect(url).toBeEditable();

    // The save answers at once and stores nothing, so what holds the form after
    // it is the read it asks for, and no Project ends up pointing at a remote
    // this spec would have to reach.
    await stubCoreResolve(
      electronApp,
      'core:projects:setRemoteOriginUrl',
      undefined
    );
    // The read the save invalidates never answers, so the moment after Core
    // answered and before the form is filled again is stable to read.
    await stubCoreHang(electronApp, 'core:projects:read');
    await url.fill('https://example.com/first.git');
    await url.press('Enter');

    // Core answered, which is what the toast says.
    await expect(mainWindow.getByText('Remote URL saved')).toBeVisible();

    // And the form is still read-only, because what it is to show next is
    // still on its way.
    await expect(url).toHaveAttribute('readonly', '');
    await expect(url).toBeEnabled();
  });

  test('is read-only rather than grey on the Project settings', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToProjectSettings(mainWindow, project.id);

    const name = mainWindow.getByLabel('Project name', { exact: true });
    const sent = 'A name saved first';

    await stubCoreHang(electronApp, 'core:projects:update');
    await name.fill(sent);
    await name.press('Enter');

    await expect(name).toHaveAttribute('readonly', '');
    await expect(name).toBeEnabled();
    await expect(name).toBeFocused();

    // The two controls of the languages field that would change it take no
    // press while the form saves, since neither is an input that could be
    // read-only on its own.
    await expect(
      mainWindow.getByRole('combobox', { name: 'Add language' })
    ).toBeDisabled();
    await expect(
      mainWindow.getByRole('button', { name: 'Remove en' })
    ).toBeDisabled();

    await mainWindow.keyboard.type('A name typed during the save');
    await expect(name).toHaveValue(sent);
  });
});

test.describe('Leaving a page with changes nobody saved', () => {
  test('asks, named by the page, and keeps the changes or lets go of them', async ({
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    const title = mainWindow.getByLabel('Title', { exact: true });

    // Nothing was typed, so leaving asks nothing.
    await leaveThePage(mainWindow).click();
    await expect(mainWindow).toHaveURL((url) => url.hash === '#/projects');
    await expect(discardDialog(mainWindow)).toBeHidden();

    await navigateToEntryUpdate(mainWindow, ids);
    await title.fill('A title nobody saved');

    // Keep editing leaves both the page and what was typed alone.
    await leaveThePage(mainWindow).click();
    await expect(
      discardDialog(mainWindow).getByRole('heading', {
        name: 'Discard your changes to The stored title?',
      })
    ).toBeVisible();
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(discardDialog(mainWindow)).toBeHidden();
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/${ids.entryId}/update`)
    );
    await expect(title).toHaveValue('A title nobody saved');

    // Discard lets go of it and carries on where it was going.
    await leaveThePage(mainWindow).click();
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(mainWindow).toHaveURL((url) => url.hash === '#/projects');
    await expect(discardDialog(mainWindow)).toBeHidden();
  });

  test('asks nothing after the form saved itself', async ({ mainWindow }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    await mainWindow
      .getByLabel('Title', { exact: true })
      .fill('A title that is saved');
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();

    // Saving leaves this page for the list of Entries. That navigation is the
    // form's own, so the guard lets it through rather than asking about the
    // changes it just saved.
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/collections/${ids.collectionId}`)
    );
    await expect(discardDialog(mainWindow)).toBeHidden();

    // The Profile is the form where only that rule carries it: it stays
    // writable while it saves, so the guard is live at the moment the submit
    // navigates away.
    await navigateToUserProfile(mainWindow);
    await mainWindow
      .getByLabel('Full name', { exact: true })
      .fill('Mara Klein');
    await mainWindow.getByRole('button', { name: 'Save local User' }).click();

    await expect(mainWindow).toHaveURL((url) => url.hash === '#/projects');
    await expect(discardDialog(mainWindow)).toBeHidden();
  });

  test('asks nothing when the page takes a way out itself', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // Changed, so leaving would ask.
    await mainWindow
      .getByLabel('Collection name (Plural)', { exact: true })
      .fill('Report');

    // Deleting the Collection takes the page off screen on purpose, and takes
    // everything typed into it with it, so there is nothing to ask about.
    await mainWindow.getByRole('button', { name: 'Delete Collection' }).click();
    await mainWindow
      .getByRole('button', { name: 'Yes, delete this Collection' })
      .click();

    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/projects/${project.id}/collections`)
    );
    await expect(discardDialog(mainWindow)).toBeHidden();
  });

  test('asks on every page form that edits something today', async ({
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
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });

    const pages: {
      open: () => Promise<void>;
      label: string;
      question: string;
    }[] = [
      {
        open: async () =>
          navigateToEntryUpdate(mainWindow, {
            projectId: project.id,
            collectionId: collection.id,
            entryId: entry.id,
          }),
        label: 'Title',
        question: 'Discard your changes to The stored title?',
      },
      {
        open: async () =>
          navigateToCollectionSettings(mainWindow, {
            projectId: project.id,
            collectionId: collection.id,
          }),
        label: 'Collection name (Plural)',
        question: 'Discard your changes to Configure Articles?',
      },
      {
        open: async () =>
          navigateToComponent(mainWindow, {
            projectId: project.id,
            componentId: component.id,
          }),
        label: 'Component name',
        question: 'Discard your changes to Teaser?',
      },
      {
        open: async () => navigateToProjectSettings(mainWindow, project.id),
        label: 'Project name',
        question: 'Discard your changes to General Settings?',
      },
      {
        open: async () => navigateToVersionControl(mainWindow, project.id),
        label: 'Remote URL',
        question: 'Discard your changes to Version Control Settings?',
      },
      {
        open: async () => navigateToUserProfile(mainWindow),
        label: 'Full name',
        question: 'Discard your changes to User profile?',
      },
    ];

    for (const page of pages) {
      await page.open();
      await mainWindow
        .getByLabel(page.label, { exact: true })
        .fill('Something nobody saved');
      await leaveThePage(mainWindow).click();

      await expect(
        discardDialog(mainWindow).getByRole('heading', { name: page.question })
      ).toBeVisible();
      await discardDialog(mainWindow)
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(mainWindow).toHaveURL((url) => url.hash === '#/projects');
    }
  });
});

test.describe('Closing the window with changes nobody saved', () => {
  test('reloads and ends the run with a form left changed', async ({
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);
    const title = mainWindow.getByLabel('Title', { exact: true });
    await title.fill('A title nobody saved');

    // A reload is not a close, so nothing holds it. It is how the app recovers
    // from the error screen, and it is what most of the suite arranges a route
    // with.
    await reloadWindow(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);
    await expect(title).toHaveValue('The stored title');

    // Left changed on purpose. The run ends here, so the teardown is what has
    // to close a window that holds something unsaved.
    await title.fill('A title nobody saved either');
    await expect(title).toHaveValue('A title nobody saved either');
  });

  test('closes at once while nothing is unsaved', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);

    // Awaited from before the close, since a window with nothing unsaved is
    // gone before anything could start listening afterwards.
    const closed = mainWindow.waitForEvent('close');
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });

    await closed;
    expect(mainWindow.isClosed()).toBe(true);
  });

  test('asks the same question, and closes once Discard is pressed', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);
    const title = mainWindow.getByLabel('Title', { exact: true });
    await title.fill('A title nobody saved');

    const askToClose = async (): Promise<void> => {
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });
    };

    // Keep editing keeps the window and what was typed in it.
    await askToClose();
    await expect(
      discardDialog(mainWindow).getByRole('heading', {
        name: 'Discard your changes to The stored title?',
      })
    ).toBeVisible();
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(discardDialog(mainWindow)).toBeHidden();
    expect(mainWindow.isClosed()).toBe(false);
    await expect(title).toHaveValue('A title nobody saved');

    // Discard closes it.
    await askToClose();
    await expect(discardDialog(mainWindow)).toBeVisible();
    const closed = mainWindow.waitForEvent('close');
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Discard' })
      .click();
    await closed;
    expect(mainWindow.isClosed()).toBe(true);
  });

  test('asks and closes on a window the app made again', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);

    // macOS keeps the app alive without a window and makes a new one when the
    // dock icon is clicked, which is what `activate` is. Every other system
    // quits instead, so the listener that quits is taken off and the app
    // behaves like macOS wherever this runs. The window the app makes here is
    // not the one the IPC handlers were registered with.
    const opened = electronApp.waitForEvent('window');
    await electronApp.evaluate(async ({ app, BrowserWindow }) => {
      app.removeAllListeners('window-all-closed');
      await Promise.all(
        BrowserWindow.getAllWindows().map(
          async (window) =>
            new Promise<void>((resolve) => {
              window.once('closed', () => {
                resolve();
              });
              window.close();
            })
        )
      );
      app.emit('activate');
    });
    const reopened = await opened;

    // Whatever the renderer failed at while answering, which is where a
    // handler that acts on a window that is gone ends up.
    const pageErrors: string[] = [];
    reopened.on('pageerror', (error) => pageErrors.push(error.message));

    await navigateToEntryUpdate(reopened, ids);
    const title = reopened.getByLabel('Title', { exact: true });
    await title.fill('A title nobody saved');

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect(
      discardDialog(reopened).getByRole('heading', {
        name: 'Discard your changes to The stored title?',
      })
    ).toBeVisible();

    // Discard closes this window, rather than the one that was there when the
    // handlers were registered, which is gone.
    const closed = reopened.waitForEvent('close');
    await discardDialog(reopened)
      .getByRole('button', { name: 'Discard' })
      .click();
    await closed;
    expect(reopened.isClosed()).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(mainWindow.isClosed()).toBe(true);
  });

  test('asks the same question before the app quits', async ({
    electronApp,
    mainWindow,
  }) => {
    const ids = await projectWithEntry(mainWindow);
    await navigateToEntryUpdate(mainWindow, ids);
    await mainWindow
      .getByLabel('Title', { exact: true })
      .fill('A title nobody saved');

    // A quit closes every window, so the question comes up for this one and
    // holds the quit until it is answered.
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });
    await expect(
      discardDialog(mainWindow).getByRole('heading', {
        name: 'Discard your changes to The stored title?',
      })
    ).toBeVisible();
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(discardDialog(mainWindow)).toBeHidden();
    expect(mainWindow.isClosed()).toBe(false);

    // Discard ends the app rather than only its window.
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });
    await expect(discardDialog(mainWindow)).toBeVisible();
    const quit = electronApp.waitForEvent('close');
    await discardDialog(mainWindow)
      .getByRole('button', { name: 'Discard' })
      .click();
    await quit;
  });
});

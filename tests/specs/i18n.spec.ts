import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  navigateToCollectionSettings,
} from '../helpers/collection.js';
import { stubCoreReject } from '../helpers/ipc.js';
import { navigate } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectSettings,
} from '../helpers/project.js';
import { setUserViaIpc, waitForUserLoaded } from '../helpers/user.js';

/**
 * How the words of the app behave once they come from the catalog: which
 * language the document declares, and what a toast says after a change went
 * through and after one did not.
 */

test.describe('The app in one language', () => {
  test('the document declares the language the words are in', async ({
    mainWindow,
  }) => {
    // Before a User exists the app is in the source locale, which index.html
    // already declares, and the renderer keeps it there.
    await navigate(mainWindow, '#/projects');
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');

    // A User whose language Desktop carries a catalog for.
    await setUserViaIpc(mainWindow, { language: 'en' });
    await navigate(mainWindow, '#/user/profile');
    await waitForUserLoaded(mainWindow);
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');

    // What index.html declares is overwritten here, so what the assertion
    // below reads can only be what the renderer wrote. Every navigation of
    // this suite boots the window fresh, which would put the declaration back,
    // so the language is changed from here on through the app itself.
    await mainWindow.evaluate(() => {
      document.documentElement.setAttribute('lang', 'zz');
    });
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'zz');

    // A language Desktop has no catalog for, picked the way a User picks one.
    // Its words stay English, so that is what the document has to declare
    // rather than the language asked for.
    await mainWindow.getByLabel('Preferred language').click();
    await mainWindow.getByRole('option', { name: 'de', exact: true }).click();
    await mainWindow.getByRole('button', { name: 'Save local User' }).click();
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('a toast says what happened to what, and never reads as a method and an object', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });

    // A change the Project's settings make, which ends in a toast with nothing
    // to answer.
    await navigateToProjectSettings(mainWindow, project.id);
    await expect(mainWindow.getByLabel('Project name')).toHaveValue(
      'Autohaus Ebersfelde'
    );
    await mainWindow.getByLabel('Project name').fill('Autohaus Thamm');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    const projectToast = mainWindow.getByText('Project Autohaus Thamm saved');
    await expect(projectToast).toBeVisible();
    const shown = [(await projectToast.innerText()).trim()];

    // And a change to a Collection, from the other end of the app.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow.getByLabel('Collection name (Plural)', { exact: true })
    ).toHaveValue('Articles');
    await mainWindow
      .getByLabel('Collection name (Plural)', { exact: true })
      .fill('Blog posts');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    const collectionToast = mainWindow.getByText('Collection saved');
    await expect(collectionToast).toBeVisible();
    shown.push((await collectionToast.innerText()).trim());

    // No toast reads as the call that produced it, which is what the sentences
    // above replaced. A fallback to `{method} {objectType}` would show one of
    // these pairs.
    const methods = [
      'create',
      'update',
      'delete',
      'clone',
      'set',
      'save',
      'synchronize',
      'release',
      'start',
      'stop',
    ];
    const objectTypes = [
      'project',
      'asset',
      'collection',
      'component',
      'entry',
      'value',
      'api',
      'user',
      'report',
    ];
    const asCall = new RegExp(
      `^(${methods.join('|')}) (${objectTypes.join('|')})$`
    );

    expect(shown).toHaveLength(2);
    for (const text of shown) {
      expect(text).not.toMatch(asCall);
    }
  });

  test('a failure toast says what did not happen, and nothing of what failed', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });

    await navigateToProjectSettings(mainWindow, project.id);
    await expect(mainWindow.getByLabel('Project name')).toHaveValue(
      'Autohaus Ebersfelde'
    );
    await mainWindow.getByLabel('Project name').fill('Autohaus Thamm');

    // A failure the save has no handling of its own for, which reaches the
    // error screen while the mutation's own toast still shows. What it throws
    // carries a message no editor could read, which is what the toast's own
    // sentence replaces.
    await stubCoreReject(electronApp, 'core:projects:update');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();

    const toast = mainWindow.getByText('Could not save the Project');
    await expect(toast).toBeVisible();

    // The whole sentence, so nothing of the call, the error's type, an id or
    // what was thrown rode along with it.
    expect((await toast.innerText()).trim()).toBe('Could not save the Project');
  });
});

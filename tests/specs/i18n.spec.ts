import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  createAssetViaIpc,
  deleteOpenAsset,
  makeTempFile,
  openAsset,
  pngBytes,
} from '../helpers/asset.js';
import {
  addFieldDefinition,
  createCollection,
  createCollectionViaIpc,
  navigateToCollectionCreate,
  navigateToCollectionSettings,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createComponentViaIpc,
  navigateToComponent,
  navigateToComponentCreate,
} from '../helpers/component.js';
import { confirmDialog } from '../helpers/dialog.js';
import { fillEntryForm, navigateToEntryCreate } from '../helpers/entry.js';
import { stubCoreReject } from '../helpers/ipc.js';
import { navigate, reloadWindow } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToAssets,
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
    // already declares, and the renderer keeps it there. The first start is the
    // one screen then, since the gate on the root route settles every address
    // on it until a User exists.
    await navigate(mainWindow, '#/welcome');
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');

    // A User whose language Desktop carries a catalog for.
    await setUserViaIpc(mainWindow, { language: 'en' });
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');

    // A language Desktop has no catalog for. The user menu offers only the
    // catalogs it carries, so such a language can only come from a User
    // written outside it, which is what this seeds. Its words stay English, so
    // that is what the document has to declare rather than the language asked
    // for, and what the menu says the app is set to.
    await setUserViaIpc(mainWindow, { language: 'de' });
    await reloadWindow(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);
    await expect(mainWindow.locator('html')).toHaveAttribute('lang', 'en');

    await mainWindow.getByRole('button', { name: /Test User/ }).click();
    const menu = mainWindow.getByRole('menu').first();
    await expect(
      menu.getByRole('menuitem', { name: 'Language' })
    ).toContainText('English');
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
    await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
      'Autohaus Ebersfelde'
    );
    await mainWindow.getByLabel('Name', { exact: true }).fill('Autohaus Thamm');
    await mainWindow.getByRole('button', { name: 'Save' }).click();
    const projectToast = mainWindow.getByText('Project Autohaus Thamm saved', {
      exact: true,
    });
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
    const collectionToast = mainWindow.getByText(
      'Collection Blog posts saved',
      {
        exact: true,
      }
    );
    await expect(collectionToast).toBeVisible();
    shown.push((await collectionToast.innerText()).trim());

    // And an Entry, which Core gives no name of its own, so its toast names the
    // kind of object rather than the Entry.
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await fillEntryForm(mainWindow, { Title: 'Zwei Hallen, ein Dach' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    const entryToast = mainWindow.getByText('Entry created', { exact: true });
    await expect(entryToast).toBeVisible();
    shown.push((await entryToast.innerText()).trim());

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

    expect(shown).toHaveLength(3);
    for (const text of shown) {
      expect(text).not.toMatch(asCall);
    }
  });

  test('a toast after a create names what was created', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Both forms are driven rather than the call behind them, so the name in
    // each toast is the one the editor just typed.
    await navigateToCollectionCreate(mainWindow, project.id);
    await createCollection(mainWindow, {
      namePlural: 'Events',
      nameSingular: 'Event',
      description: 'What the dealership puts on',
      slugPlural: 'events',
      slugSingular: 'event',
      field: { label: 'Headline', description: 'The headline of the event' },
    });
    await expect(
      mainWindow.getByText('Collection Events created', { exact: true })
    ).toBeVisible();

    await navigateToComponentCreate(mainWindow, project.id);
    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Teaser');
    await mainWindow
      .getByLabel('Component slug', { exact: true })
      .fill('teaser');
    await addFieldDefinition(mainWindow, {
      label: 'Headline',
      description: 'The headline of the teaser',
      owner: 'component',
    });
    await mainWindow.getByRole('button', { name: 'Create Component' }).click();
    await expect(
      mainWindow.getByText('Component Teaser created', { exact: true })
    ).toBeVisible();
  });

  test('a toast names a Collection and a Component the way the screen does', async ({
    mainWindow,
  }) => {
    // A Collection's and a Component's name is content, stored per language, so
    // the toast has to read it through the chain a screen reads it through: the
    // User's language, then the Project's default, then English. Both records
    // below answer in both languages, with different words, so each language
    // that can stand first in the chain gives a different name. Only the
    // User's language gives the one every screen here shows.
    await setUserViaIpc(mainWindow, { language: 'de' });
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Nachricht' },
        plural: { en: 'Articles', de: 'Nachrichten' },
      },
      description: {
        en: 'What the dealership says',
        de: 'Was das Autohaus sagt',
      },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
      ],
    });
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Teaser', de: 'Anreisser' },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
      ],
    });

    // The Collection, on the screen it is changed on. Its heading is the name
    // the screen resolved, while the input beside it holds the Project's
    // default language, which is the other name in the record. Neither name is
    // edited here, so the toast after the save has to carry the heading's one.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow.getByRole('heading', { name: 'Configure Nachrichten' })
    ).toBeVisible();
    await expect(
      mainWindow.getByLabel('Collection name (Plural)', { exact: true })
    ).toHaveValue('Articles');
    await mainWindow
      .getByLabel('Description', { exact: true })
      .fill('What the dealership announces');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      mainWindow.getByText('Collection Nachrichten saved', { exact: true })
    ).toBeVisible();
    // The save lands on the Collection itself, whose list of Entries carries
    // the same name again, with how many it holds beside it, so the two cannot
    // disagree.
    await expect(
      mainWindow.getByRole('heading', { name: /^Nachrichten\b/ })
    ).toBeVisible();

    // And the Component, whose name is one record rather than two.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByRole('heading', { name: 'Anreisser', exact: true })
    ).toBeVisible();
    await expect(
      mainWindow.getByLabel('Component name', { exact: true })
    ).toHaveValue('Teaser');
    await mainWindow
      .getByLabel('Component slug', { exact: true })
      .fill('anreisser');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      mainWindow.getByText('Component Anreisser saved', { exact: true })
    ).toBeVisible();
    // The save lands on the list of Components, which names each one the same
    // way.
    await expect(
      mainWindow.getByRole('main').getByRole('link', { name: 'Anreisser' })
    ).toBeVisible();
  });

  test('a toast after a delete names what went', async ({
    mainWindow,
  }, testInfo) => {
    // A delete answers with nothing, so each sentence below names the object
    // out of the cache entry the delete then clears. This is where the name
    // matters most: the object is gone, so nobody can open it afterwards to
    // see which one went.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const component = await createComponentViaIpc(mainWindow, {
      projectId: project.id,
    });
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath,
      // Core slugifies an Asset's name on write, so this is the name the grid
      // shows and the one the toast has to carry.
      name: 'company-logo',
    });

    // The Collection, whose name is content stored per language and so goes
    // through the same chain a screen reads it through.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow.getByRole('button', { name: 'Delete Collection' }).click();
    await confirmDialog(mainWindow, 'Yes, delete this Collection');
    await expect(
      mainWindow.getByText('Collection Articles deleted', { exact: true })
    ).toBeVisible();

    // The Component, the same.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await mainWindow.getByRole('button', { name: 'Delete Component' }).click();
    await confirmDialog(mainWindow, 'Yes, delete this Component');
    await expect(
      mainWindow.getByText('Component Teaser deleted', { exact: true })
    ).toBeVisible();

    // The Asset, named the way its card names it, by file name.
    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'company-logo.png');
    await deleteOpenAsset(mainWindow, 'company-logo.png');
    await expect(
      mainWindow.getByText('Asset company-logo.png deleted', { exact: true })
    ).toBeVisible();

    // And the Project, last, because it takes the rest with it. A Project with
    // no Git repository is deleted rather than removed, from the one confirm
    // that says it cannot be brought back.
    await navigateToProjectSettings(mainWindow, project.id);
    await mainWindow
      .getByRole('button', { name: 'Delete Project', exact: true })
      .click();
    await confirmDialog(mainWindow, 'Delete Project');
    await expect(
      mainWindow.getByText('Project Autohaus Ebersfelde deleted', {
        exact: true,
      })
    ).toBeVisible();
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
    await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
      'Autohaus Ebersfelde'
    );
    await mainWindow.getByLabel('Name', { exact: true }).fill('Autohaus Thamm');

    // A failure the save has no handling of its own for, which reaches the
    // error screen while the mutation's own toast still shows. What it throws
    // carries a message no editor could read, which is what the toast's own
    // sentence replaces.
    await stubCoreReject(electronApp, 'core:projects:update');
    await mainWindow.getByRole('button', { name: 'Save' }).click();

    const toast = mainWindow.getByText('Could not save the Project');
    await expect(toast).toBeVisible();

    // The whole sentence, so nothing of the call, the error's type, an id or
    // what was thrown rode along with it.
    expect((await toast.innerText()).trim()).toBe('Could not save the Project');
  });
});

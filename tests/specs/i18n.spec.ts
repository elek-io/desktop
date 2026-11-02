import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
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
import { fillEntryForm, navigateToEntryCreate } from '../helpers/entry.js';
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
    const collectionToast = mainWindow.getByText('Collection Blog posts saved');
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
    const entryToast = mainWindow.getByText('Entry created');
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
      mainWindow.getByText('Collection Events created')
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
      mainWindow.getByText('Component Teaser created')
    ).toBeVisible();
  });

  test('a toast names a Collection and a Component the way the screen does', async ({
    mainWindow,
  }) => {
    // A Collection's and a Component's name is content, stored per language, so
    // the toast has to read it through the chain a screen reads it through: the
    // User's language, then the Project's default, then English. The User's
    // language below has no word in either record, so only the Project's
    // default can answer, and English is filled in first so that reading the
    // record in whichever language it happens to carry would answer with the
    // English name instead.
    await setUserViaIpc(mainWindow, { language: 'fr' });
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'de', supported: ['de', 'en'] } },
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Nachricht' },
        plural: { en: 'Articles', de: 'Nachrichten' },
      },
      description: { en: 'What the shop says', de: 'Was das Haus sagt' },
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
    // the screen resolved, so the toast after the save has to carry the same
    // one.
    await navigateToCollectionSettings(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      mainWindow.getByRole('heading', { name: 'Configure Nachrichten' })
    ).toBeVisible();
    await mainWindow
      .getByLabel('Collection name (Plural)', { exact: true })
      .fill('Meldungen');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      mainWindow.getByText('Collection Meldungen saved')
    ).toBeVisible();
    // The save lands on the Collection itself, whose heading is the same name
    // again, so the two cannot disagree.
    await expect(
      mainWindow.getByRole('heading', { name: 'Meldungen' })
    ).toBeVisible();

    // And the Component, whose name is one record rather than two.
    await navigateToComponent(mainWindow, {
      projectId: project.id,
      componentId: component.id,
    });
    await expect(
      mainWindow.getByRole('heading', { name: 'Anreisser' })
    ).toBeVisible();
    await mainWindow
      .getByLabel('Component name', { exact: true })
      .fill('Werbung');
    await mainWindow.getByRole('button', { name: 'Save changes' }).click();
    await expect(mainWindow.getByText('Component Werbung saved')).toBeVisible();
    // The save lands on the list of Components, which names each one the same
    // way.
    await expect(
      mainWindow.getByRole('link', { name: 'Werbung' })
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

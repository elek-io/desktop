import { expect } from '@playwright/test';

import { closeApp, test } from '../fixtures/electronApp.js';
import { relaunchApp } from '../helpers/app.js';
import {
  createCollectionViaIpc,
  navigateToCollection,
} from '../helpers/collection.js';
import { createEntryViaIpc, stringValue } from '../helpers/entry.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Persistence', () => {
  test('renders seeded content after a full process restart', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    // Seed the full stack on the first window over IPC
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Persisted Project',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Persisted entry' }) },
    });

    // Close and relaunch against the same data dir. Unlike reloadWindow (which
    // reloads only the renderer), this restarts the main process and Core, so
    // seeing the seeded content proves it survived the restart on disk.
    const { app, window } = await relaunchApp(testInfo, electronApp);
    try {
      // The fresh boot lands on the Projects list and reads Core's state
      await expect(window).toHaveURL(/#\/projects$/);
      await expect(window.getByText('Persisted Project')).toBeVisible();

      // The seeded Entry still renders in its Collection's table
      await navigateToCollection(window, {
        projectId: project.id,
        collectionId: collection.id,
      });
      await expect(
        window.getByRole('cell', { name: 'Persisted entry' })
      ).toBeVisible();
    } finally {
      // The relaunched app is not covered by the fixture teardown, so close it
      await closeApp(app);
    }
  });
});

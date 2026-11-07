import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  textFieldDefinition,
} from '../helpers/collection.js';
import { parseColor, toBytes } from '../helpers/color.js';
import { createEntryViaIpc, stringValue } from '../helpers/entry.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { createReleaseViaIpc } from '../helpers/release.js';
import { setupRemote } from '../helpers/remote.js';
import { setUserViaIpc } from '../helpers/user.js';

/**
 * The Dashboard: what the Project holds, and what changed in it last.
 *
 * It is the Project's first page, so it says the facts an editor would
 * otherwise have to open four screens for, and shows the latest changes in the
 * History's own rows.
 */

/** Each fact of the ruled row, as its three lines read. */
async function factsOf(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="project-fact"]')).map(
      (cell) =>
        Array.from(cell.querySelectorAll('span')).map(
          (line) => line.textContent?.trim() ?? ''
        )
    )
  );
}

/** The background a marker is drawn in, as bytes a token can be compared to. */
async function markerBackground(page: Page, token: string): Promise<boolean> {
  const marker = page
    .locator('[data-slot="change-row"]')
    .first()
    .locator('span[aria-hidden="true"]');
  const [shown, declared] = await Promise.all([
    marker.evaluate((node) => getComputedStyle(node).backgroundColor),
    marker.evaluate(
      (node, property) => getComputedStyle(node).getPropertyValue(property),
      token
    ),
  ]);

  return toBytes(parseColor(shown)) === toBytes(parseColor(declared));
}

test.describe('The Dashboard', () => {
  test('shows the facts of the Project in a ruled row of four', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
    });
    await navigateToProjectDashboard(mainWindow, project.id);

    // Every fact says what it counts, the number, and what the number is made
    // of, so the bare number is never the only thing that carries it.
    await expect(
      mainWindow.getByText('in 1 Collection', { exact: true })
    ).toBeVisible();
    const facts = await factsOf(mainWindow);
    expect(facts).toEqual([
      ['Entries', '1', 'in 1 Collection'],
      ['Assets', '1', '1 image and 0 other files'],
      ['Languages', '2', 'English, the default, and German'],
      ['Last Release', 'None yet', ''],
    ]);

    // The four cells are one ruled row, as ci draws them: a rule above and
    // below, and a divider between two of them.
    const ruled = await mainWindow
      .locator('[data-slot="project-facts"]')
      .evaluate((row) => ({
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').length,
        top: getComputedStyle(row).borderTopWidth,
        bottom: getComputedStyle(row).borderBottomWidth,
      }));
    expect(ruled.columns).toBe(4);
    expect(ruled.top).toBe('1px');
    expect(ruled.bottom).toBe('1px');
  });

  test('names the Release the Project is at', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    const release = await createReleaseViaIpc(mainWindow, {
      projectId: project.id,
    });
    await navigateToProjectDashboard(mainWindow, project.id);

    await expect(
      mainWindow.getByText(release.version, { exact: true })
    ).toBeVisible();
  });

  test('shows the five latest changes in the History rows, with Full History', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });

    // Six changes, so the Dashboard has one more than it shows.
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: { title: stringValue({ en: title }) },
      });
    }
    await navigateToProjectDashboard(mainWindow, project.id);

    // Each change says in words who did what, and the five latest ones are
    // what the Dashboard shows of them.
    const rows = mainWindow.locator('[data-slot="change-row"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('You added an Entry');

    // The raw dump of the Project the page used to end on is gone.
    await expect(mainWindow.locator('main pre')).toHaveCount(0);

    // Full History opens the History of the Project, and a row opens its own
    // change.
    await mainWindow.getByRole('link', { name: 'Full History' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/history`
    );
  });

  test('says of each change whether it is synced, where that can be told', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToProjectDashboard(mainWindow, project.id);
    await expect(
      mainWindow.locator('[data-slot="change-row"]').first()
    ).toBeVisible();

    // Without a Git repository there is nothing to sync with, so a row claims
    // neither state: its marker is the one that says nothing, in the border
    // color rather than hollow or filled.
    expect(await markerBackground(mainWindow, '--color-border')).toBe(true);

    // With a reachable Git repository the check answers, and a change that has
    // not reached it takes the hollow marker: the pane's own surface inside a
    // border in the text color, which is how ci tells it from a synced one.
    const remote = setupRemote(testInfo, {
      mirror: join(testDataDirs(testInfo).dataDir, 'projects', project.id),
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    await navigateToProjectDashboard(mainWindow, project.id);

    // The newest change is the one the mirror does not hold, so the card's
    // check has to have answered before its marker can say so.
    await expect(mainWindow.getByText('1 change not synced')).toBeVisible({
      timeout: 15000,
    });
    expect(await markerBackground(mainWindow, '--color-card')).toBe(true);
    const border = await mainWindow
      .locator('[data-slot="change-row"]')
      .first()
      .locator('span[aria-hidden="true"]')
      .evaluate((node) => getComputedStyle(node).borderTopWidth);
    expect(border).toBe('1.5px');
  });
});

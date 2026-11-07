import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

import { colors } from '@elek-io/branding';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  textFieldDefinition,
} from '../helpers/collection.js';
import { parseColor, toBytes } from '../helpers/color.js';
import { createComponentViaIpc } from '../helpers/component.js';
import {
  createEntryViaIpc,
  deleteEntryViaIpc,
  stringValue,
} from '../helpers/entry.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { createReleaseViaIpc } from '../helpers/release.js';
import { setupRemote } from '../helpers/remote.js';
import { setTheme } from '../helpers/theme.js';
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

/** The fill of the newest change's marker, as bytes a token compares to. */
async function markerFill(page: Page): Promise<[number, number, number]> {
  return toBytes(
    parseColor(
      await page
        .locator('[data-slot="change-row"]')
        .first()
        .locator('span[aria-hidden="true"]')
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    )
  );
}

/**
 * One of ci's colors, read from the brand package rather than copied here, so
 * the assertion follows the token. Light mode, which the caller sets.
 */
function brandColor(token: 'border' | 'card'): [number, number, number] {
  return toBytes(parseColor(colors.light[token].oklch));
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
    // A Project of two languages holds every name and every Value in both, so
    // the Collection and the Entry below carry German too.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Article', de: 'Artikel' },
        plural: { en: 'Articles', de: 'Artikel' },
      },
      description: { en: 'Articles', de: 'Artikel' },
      fieldDefinitions: [
        textFieldDefinition({ label: { en: 'Title', de: 'Titel' } }),
      ],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours', de: 'Frühling' }),
      },
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
      ['Languages', '2', 'English, the default and German'],
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

    // Each change says in words who did what and what it was about, and the
    // five latest ones are what the Dashboard shows of them.
    const rows = mainWindow.locator('[data-slot="change-row"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('You added an Entry');
    await expect(rows.first()).toContainText('Five');

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

  test('names the object each change was about', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Article' }, plural: { en: 'Articles' } },
      fieldDefinitions: [textFieldDefinition()],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      name: 'showroom-evening',
      filePath: makeTempFile(testInfo, 'showroom-evening.png', pngBytes),
    });
    await navigateToProjectDashboard(mainWindow, project.id);

    const rows = mainWindow.locator('[data-slot="change-row"]');
    await expect(rows).toHaveCount(4);

    // Each kind of object by the name the app knows it under: an Asset by the
    // file name the Assets grid shows, a Collection by its plural name and an
    // Entry by its title.
    await expect(rows.filter({ hasText: 'You added an Asset' })).toContainText(
      'showroom-evening.png'
    );
    await expect(
      rows.filter({ hasText: 'You added a Collection' })
    ).toContainText('Articles');
    await expect(rows.filter({ hasText: 'You added an Entry' })).toContainText(
      'Spring opening hours'
    );

    // The Project's own first change is named by its sentence already, so its
    // row is the time alone.
    const created = rows.filter({ hasText: 'You created this Project' });
    await expect(created).toHaveCount(1);
    await expect(created).toContainText('less than a minute ago');

    // A Component, and the Entry gone from the Project altogether.
    await createComponentViaIpc(mainWindow, {
      projectId: project.id,
      name: { en: 'Teaser' },
    });
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    await navigateToProjectDashboard(mainWindow, project.id);
    await expect(rows).toHaveCount(5);

    await expect(
      rows.filter({ hasText: 'You added a Component' })
    ).toContainText('Teaser');

    // The Entry is read as it stood at its own change, so the row that added
    // it still names it now that it is gone.
    await expect(rows.filter({ hasText: 'You added an Entry' })).toContainText(
      'Spring opening hours'
    );

    // The delete took it out of the Project, so there is nothing left to name
    // it from and its own row keeps what its sentence says.
    const deleted = rows.filter({ hasText: 'You deleted an Entry' });
    await expect(deleted).toHaveCount(1);
    await expect(deleted).not.toContainText('Spring opening hours');
  });

  test('says of each change whether it is synced, where that can be told', async ({
    mainWindow,
  }, testInfo) => {
    await setTheme(mainWindow, 'light');
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToProjectDashboard(mainWindow, project.id);
    await expect(
      mainWindow.locator('[data-slot="change-row"]').first()
    ).toBeVisible();

    // Without a Git repository there is nothing to sync with, so a row claims
    // neither state: its marker is the one that says nothing, in the border
    // color rather than hollow or filled.
    expect(await markerFill(mainWindow)).toEqual(brandColor('border'));

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
    expect(await markerFill(mainWindow)).toEqual(brandColor('card'));
    const border = await mainWindow
      .locator('[data-slot="change-row"]')
      .first()
      .locator('span[aria-hidden="true"]')
      .evaluate((node) => ({
        width: getComputedStyle(node).borderTopWidth,
        color: getComputedStyle(node).borderTopColor,
      }));
    // A border there at all is what makes it hollow rather than filled. Its
    // width is read as a whole device pixel, so the 1.5 px it is drawn at is
    // not what comes back.
    expect(border.width).not.toBe('0px');
    expect(toBytes(parseColor(border.color))).toEqual(
      toBytes(parseColor(colors.light['foreground'].oklch))
    );
  });
});

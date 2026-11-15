import { expect, type Locator, type Page } from '@playwright/test';
import { format } from 'date-fns';
import { renameSync } from 'node:fs';
import { join } from 'node:path';

import { colors } from '@elek-io/branding';
import { uuid } from '@elek-io/core';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import {
  createAssetViaIpc,
  deleteAssetViaIpc,
  makeTempFile,
  pngBytes,
  updateAssetViaIpc,
} from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  deleteCollectionViaIpc,
} from '../helpers/collection.js';
import { parseColor, toBytes } from '../helpers/color.js';
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
import {
  mainPanel,
  projectCard,
  projectSidebar,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToHistory,
  navigateToProjectDashboard,
  projectHistoryViaIpc,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import {
  createReleaseViaIpc,
  expectReleaseCreated,
  listReleasesViaIpc,
  navigateToRelease,
  navigateToReleases,
  openReleaseDialog,
  releaseRow,
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
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
  windowSize,
} from '../helpers/window.js';

/** The version `projects.create` writes, which the first Release moves up from. */
const CREATED_VERSION = '0.0.1';

/** Where a Project's git repository lives under the per-test data directory. */
function projectPath(
  dataDir: string,
  projectId: string
): ReturnType<typeof join> {
  return join(dataDir, 'projects', projectId);
}

/**
 * Each row of what a Release changed, as its label and its count read.
 *
 * Scoped to what holds the summary, because the Releases screen and the
 * dialog over it can both draw one.
 */
async function changeCountsOf(scope: Locator): Promise<string[][]> {
  return scope
    .locator('[data-slot="release-changes"] li')
    .evaluateAll((rows) =>
      rows.map((row) => [
        row
          .querySelector('[data-slot="release-change-label"]')
          ?.textContent?.trim() ?? '',
        row
          .querySelector('[data-slot="release-change-count"]')
          ?.textContent?.trim() ?? '',
      ])
    );
}

/** Each row of the list of Releases, as its three parts read, newest first. */
async function releaseRowsOf(page: Page): Promise<string[][]> {
  return page
    .locator('[data-slot="release-row"]')
    .evaluateAll((rows) =>
      rows.map((row) => [
        row
          .querySelector('[data-slot="release-version"]')
          ?.textContent?.trim() ?? '',
        row
          .querySelector('[data-slot="release-published"]')
          ?.textContent?.trim() ?? '',
        row.querySelector('[data-slot="badge"]')?.textContent?.trim() ?? '',
      ])
    );
}

/** The fill of one row's marker, as bytes a token compares to. */
async function markerFillOf(
  page: Page,
  version: string
): Promise<[number, number, number]> {
  return toBytes(
    parseColor(
      await releaseRow(page, version)
        .locator('span[aria-hidden="true"]')
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    )
  );
}

/**
 * One of ci's colors, read from the brand package rather than copied here, so
 * the assertion follows the token. Light mode, which the caller sets.
 */
function brandColor(
  token: 'brand' | 'muted-foreground'
): [number, number, number] {
  return toBytes(parseColor(colors.light[token].oklch));
}

/**
 * How many changes of an Entry or an Asset the Project's History holds since
 * the Release `tagId` addresses.
 *
 * Read off Core's own History rather than off the History screen, because what
 * the counts have to agree with is the changes since the last Release, and the
 * History is newest first with the Release's own commit among them.
 */
async function entryAndAssetChangesSince(
  page: Page,
  projectId: string,
  tagId: string
): Promise<number> {
  const history = await projectHistoryViaIpc(page, { id: projectId });
  const release = history.fullHistory.findIndex(
    (commit) => commit.tag?.id === tagId
  );

  if (release === -1) {
    throw new Error(`The History holds no commit tagged ${tagId}`);
  }

  return history.fullHistory
    .slice(0, release)
    .filter((commit) =>
      ['entry', 'asset'].includes(commit.message.reference.objectType)
    ).length;
}

/**
 * Where each pane of the screen stands inside the panel that holds them, and
 * anything inside one that is laid out wider than its own box.
 *
 * A pane reaching past the panel is a collision, a width of zero is a pane
 * with no room, and content wider than its box with nothing to scroll it is a
 * clip. Each is what the smallest window the app supports is measured for.
 */
async function panesOfThePanel(page: Page): Promise<{
  panel: { left: number; right: number };
  panes: { left: number; right: number; width: number }[];
  overflowing: { slot: string | null; over: number }[];
  sideways: { slot: string | null; over: number }[];
}> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-slot="panel"]');
    const panes = Array.from(
      document.querySelectorAll('[data-slot="panel"] [data-slot="pane"]')
    );
    if (panel === null || panes.length === 0) {
      throw new Error('The panel draws no panes');
    }
    const box = panel.getBoundingClientRect();
    return {
      panel: { left: box.left, right: box.right },
      panes: panes.map((pane) => {
        const rect = pane.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
      overflowing: Array.from(
        document.querySelectorAll('[data-slot="panel"] *')
      )
        .filter(
          (element) =>
            element.scrollWidth - element.clientWidth > 1 &&
            getComputedStyle(element).overflowX === 'visible'
        )
        .map((element) => ({
          slot: element.getAttribute('data-slot'),
          over: element.scrollWidth - element.clientWidth,
        })),
      // What a pane scrolls sideways to keep. Content wider than the pane
      // shows as that rather than as a clip wherever the pane scrolls, which
      // is every screen's body, so it is measured beside the clip itself.
      sideways: Array.from(
        document.querySelectorAll(
          '[data-slot="panel"] [data-slot="scroll-area-viewport"]'
        )
      )
        .filter((element) => element.scrollWidth - element.clientWidth > 1)
        .map((element) => ({
          slot: element.getAttribute('data-slot'),
          over: element.scrollWidth - element.clientWidth,
        })),
    };
  });
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

    // The page is reached from the Project's sidebar, whose row carries how
    // many Releases there are, so its name starts with the row's own name. The
    // number is Core's, and this Project has published nothing yet.
    await navigateToProjectDashboard(mainWindow, project.id);
    const releasesRow = projectSidebar(mainWindow).getByRole('link', {
      name: /^Releases\s*0$/,
    });
    await expect(releasesRow).toBeVisible();
    await releasesRow.click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/releases`
    );

    // Nothing has been published yet, so the page shows its empty state and
    // carries Create Release there rather than at the head of a list that has
    // no rows.
    await expect(mainWindow.getByText('No Releases yet')).toBeVisible();

    // Scoped to the panel, because the dialog it opens carries a button of the
    // same name and is portaled outside the panel.
    const releaseButton = mainPanel(mainWindow).getByRole('button', {
      name: 'Create Release',
      exact: true,
    });
    await expect(releaseButton).toBeVisible();
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // Opening it moves focus into the dialog.
    await expect(dialog.locator(':focus')).toHaveCount(1);

    // A Release cannot be undone, which the dialog says before it is confirmed,
    // and its one primary button names the act rather than agreeing with it.
    await expect(dialog.getByText('It cannot be undone.')).toBeVisible();

    // The old and the new version, the bump as a badge carrying its word, and
    // the reason in one sentence, which opens on what sets the version.
    await expect(dialog.getByText('Version', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(`${CREATED_VERSION} becomes 0.1.0`)
    ).toBeVisible();
    await expect(dialog.getByText('0.1.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Minor', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        'Desktop sets the version from what changed. This is a minor Release, because a Collection was added.'
      )
    ).toBeVisible();

    // Every control in the dialog has an accessible name, which is also what
    // lets the locators here find them.
    await expectNoAxeViolations(mainWindow);

    // Escape closes it from the keyboard and hands focus back to what opened it.
    await dismissDialog(mainWindow);
    await expect(releaseButton).toBeFocused();

    await openReleaseDialog(mainWindow);
    await dialog.getByRole('button', { name: 'Create Release' }).click();

    // The outcome is a toast with nothing to answer, and the dialog closes.
    await expectReleaseCreated(mainWindow, '0.1.0');
    await expect(dialog).toBeHidden();

    // What was published and when, without a reload: the Releases list shows
    // the version Core wrote, and the Project carries it in the sidebar, whose
    // row counts the new Release without the Project being opened again.
    await expect(mainWindow.getByText('No Releases yet')).toBeHidden();
    await expect(
      projectSidebar(mainWindow).getByRole('link', { name: /^Releases\s*1$/ })
    ).toBeVisible();
    await expect(releaseRow(mainWindow, '0.1.0')).toBeVisible();
    // The Project card names the Release it is now at, so the version Core
    // wrote shows beside the Project rather than only in the list.
    await expect(
      projectCard(mainWindow).getByText('Release 0.1.0')
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

  test('counts the Entries and Assets it would publish, one row per kind, and they agree with the History since the last Release', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const doomedEntry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Goes away' }) },
    });
    const keptEntry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Stays' }) },
    });
    const renamedAsset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const doomedAsset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'goes-away.png', pngBytes),
      name: 'Goes away',
    });

    // A first Release, so the second one has a released state to diff against.
    // Everything created and removed inside one draft nets to no change, which
    // is why a removal needs a Release behind it.
    await createReleaseViaIpc(mainWindow, { projectId: project.id });
    const [firstRelease] = (
      await listReleasesViaIpc(mainWindow, { projectId: project.id })
    ).list;
    expect(firstRelease?.version).toBe('0.1.0');

    // One change of every kind Core reports for an Entry and an Asset since
    // that Release. An Asset whose name changed is the one kind that is not a
    // replaced file, and both land in the same row.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Arrives' }) },
    });
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: keptEntry.id,
      values: { title: stringValue({ en: 'Stays, with another title' }) },
    });
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: doomedEntry.id,
    });
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'arrives.png', pngBytes),
      name: 'Arrives',
    });
    await updateAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: renamedAsset.id,
      name: 'Showroom at night',
      description: renamedAsset.description,
    });
    await deleteAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: doomedAsset.id,
      extension: doomedAsset.extension,
    });

    await navigateToReleases(mainWindow, project.id);
    await openReleaseDialog(mainWindow);
    const dialog = mainWindow.getByRole('dialog');

    // One row per kind that has any, each with its count, as Core reports
    // them. Nothing else, so a kind nothing happened to says nothing.
    expect(await changeCountsOf(dialog)).toEqual([
      ['Entries added', '1'],
      ['Entries changed', '1'],
      ['Entries deleted', '1'],
      ['Assets added', '1'],
      ['Assets changed', '1'],
      ['Assets deleted', '1'],
    ]);

    // And they are the changes the Project's History holds since that Release,
    // which is what ci's rule for the rows asks of them. Each object here
    // changed once since the Release, so the two counts are the same number.
    const since = await entryAndAssetChangesSince(
      mainWindow,
      project.id,
      firstRelease?.tagId ?? ''
    );
    expect(since).toBe(6);

    // A removed Entry breaks what a site reads, so the Release is major and the
    // badge says so in words rather than by its color alone.
    await expect(dialog.getByText('Major', { exact: true })).toBeVisible();
    await expect(dialog.getByText('0.1.0 becomes 1.0.0')).toBeVisible();
    await expect(dialog.getByText('1.0.0', { exact: true })).toBeVisible();
  });

  test('lists each Release newest first with its date, who released it and its bump, and marks the latest', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
    await setTheme(mainWindow, 'light');
    const project = await createProjectViaIpc(mainWindow);

    // Two Releases of different bumps: a Collection added is minor, and the
    // same Collection removed again breaks what a site reads, so it is major.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createReleaseViaIpc(mainWindow, { projectId: project.id });
    await deleteCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    // Core sorts the Releases by the date of the commit each tag points at,
    // and git writes that date in whole seconds, so two Releases made inside
    // one second carry the same date and nothing but git's own tie-break
    // orders them. The wait is what makes the newer one newer.
    await mainWindow.waitForTimeout(1100);
    await createReleaseViaIpc(mainWindow, { projectId: project.id });

    await navigateToReleases(mainWindow, project.id);
    const { list } = await listReleasesViaIpc(mainWindow, {
      projectId: project.id,
    });
    const [latest, before] = list;
    if (latest === undefined || before === undefined) {
      throw new Error('The Project holds fewer than two Releases');
    }

    // Newest first, in the order Core answers with, each row with its version,
    // the day it went out in the User's own locale, who released it and its
    // bump as a badge.
    expect(list.map((release) => release.version)).toEqual(['1.0.0', '0.1.0']);
    expect(await releaseRowsOf(mainWindow)).toEqual([
      [
        '1.0.0',
        `${format(new Date(latest.datetime), 'PP')}, Mara Klein`,
        'Major',
      ],
      [
        '0.1.0',
        `${format(new Date(before.datetime), 'PP')}, Mara Klein`,
        'Minor',
      ],
    ]);

    // The latest Release is the list's one highlight, so it carries the brand
    // marker and every other row the gray one.
    expect(await markerFillOf(mainWindow, '1.0.0')).toEqual(
      brandColor('brand')
    );
    expect(await markerFillOf(mainWindow, '0.1.0')).toEqual(
      brandColor('muted-foreground')
    );

    // Create Release heads the list, which is where the screen's one primary
    // button stands once there is something in it.
    await expect(
      mainPanel(mainWindow).getByRole('button', {
        name: 'Create Release',
        exact: true,
      })
    ).toBeVisible();
  });

  test('shows what the chosen Release changed, and opens it in the History', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createReleaseViaIpc(mainWindow, { projectId: project.id });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Arrives' }) },
    });
    await createReleaseViaIpc(mainWindow, { projectId: project.id });

    // Nothing is chosen until a row is, and the list beside it holds both ways
    // on, so the pane says so in plain words rather than repeating either.
    await navigateToReleases(mainWindow, project.id);
    await expect(mainWindow.getByText('No Release chosen')).toBeVisible();

    const chosen = releaseRow(mainWindow, '0.2.0');
    await chosen.click();

    // The chosen row is marked as the one the pane is about, by its surface
    // and the bar, and says so to a screen reader.
    await expect(chosen).toHaveAttribute('aria-current', 'page');
    await expect(chosen).toHaveAttribute('data-active', 'true');

    // What it is, who published it and when, then the version it moved to and
    // what it changed.
    await expect(
      mainWindow.getByRole('heading', { name: 'Release 0.2.0' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('The whole Project. You released it on')
    ).toBeVisible();
    await expect(mainWindow.getByText('0.1.0 becomes 0.2.0')).toBeVisible();
    await expect(
      mainWindow.getByRole('main').getByText('Minor', { exact: true })
    ).toBeVisible();
    await expect(
      mainWindow.getByText(
        'This is a minor Release, because an Entry was added.'
      )
    ).toBeVisible();
    expect(await changeCountsOf(mainPanel(mainWindow))).toEqual([
      ['Entries added', '1'],
    ]);

    // What sets the version is the dialog's own sentence, about a Release that
    // is about to be made rather than one that was.
    await expect(
      mainWindow.getByText('Desktop sets the version from what changed.')
    ).toBeHidden();

    // The way into the History, where the Release stands among the changes it
    // published. The commit it points at is the Release's own, so the History
    // opens on it rather than on its list.
    await mainWindow.getByRole('link', { name: 'Open in History' }).click();
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.startsWith(`#/projects/${project.id}/history/`)
    );
    await expect(
      mainWindow.getByRole('main').getByText('Release 0.2.0')
    ).toBeVisible();
  });

  test('names the person Core says published the Release, not the one at this computer', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow, { name: 'Test User' });
    const project = await createProjectViaIpc(mainWindow);

    // Who published a Release and what it changed are Core's answers, read off
    // the Release's own git tag, so neither can be arranged from this computer:
    // every Release made here carries the User as its author. Both answers are
    // stubbed to say somebody else, which is what shows the screen reads them
    // rather than working them out.
    const tagId = uuid();
    await stubCoreResolve(electronApp, 'core:releases:list', {
      total: 1,
      list: [
        {
          tagId,
          type: 'release',
          version: '1.4.0',
          datetime: '2026-09-28T14:02:00.000Z',
          author: { name: 'Mara Klein', email: 'mara@example.com' },
          bump: 'minor',
        },
      ],
    });
    await stubCoreResolve(electronApp, 'core:releases:changes', {
      project,
      bump: 'minor',
      currentVersion: '1.3.2',
      nextVersion: '1.4.0',
      projectChanges: [],
      collectionChanges: [],
      fieldChanges: [],
      componentChanges: [],
      componentFieldChanges: [],
      assetChanges: [],
      entryChanges: [
        {
          collectionId: project.id,
          entryId: project.id,
          changeType: 'added',
          bump: 'minor',
        },
      ],
    });

    await navigateToRelease(mainWindow, project.id, tagId);

    await expect(releaseRow(mainWindow, '1.4.0')).toContainText('Mara Klein');
    await expect(
      mainWindow.getByText('The whole Project. Mara Klein released it on')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('The whole Project. You released it on')
    ).toBeHidden();

    // And what it changed is Core's answer too, in the version it moved and
    // the row of counts below it.
    await expect(mainWindow.getByText('1.3.2 becomes 1.4.0')).toBeVisible();
    expect(await changeCountsOf(mainPanel(mainWindow))).toEqual([
      ['Entries added', '1'],
    ]);
  });

  test('says in its own pane when the chosen Release cannot be read', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    await createReleaseViaIpc(mainWindow, { projectId: project.id });

    // An address for a Release this Project does not hold, which is what an
    // address kept from a Project that no longer holds one asks for. Core
    // refuses the read, and a read that failed belongs to the pane it
    // happened in, see contributing/error-handling.md.
    await navigateToRelease(mainWindow, project.id, uuid());

    await expect(
      mainWindow.getByText("Desktop can't read this Release.")
    ).toBeVisible({ timeout: 15000 });
    await expect(
      mainWindow.getByRole('button', { name: 'Try again' })
    ).toBeVisible();

    // The list beside it is untouched, and nothing took the whole window to
    // the error screen.
    await expect(releaseRow(mainWindow, '0.1.0')).toBeVisible();
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeHidden();
  });

  test('keeps the screen and the dialog inside the smallest window the app supports, in both modes', async ({
    mainWindow,
    electronApp,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    // An Entry in the Release, so the chosen one has a row of counts to lay
    // out beside the list rather than a version and a sentence alone.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });
    await createReleaseViaIpc(mainWindow, { projectId: project.id });
    const [release] = (
      await listReleasesViaIpc(mainWindow, { projectId: project.id })
    ).list;
    if (release === undefined) {
      throw new Error('The Project holds no Release');
    }

    // Something to release after it, so the dialog has a version row, a
    // sentence and a row of counts to fit in.
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Winter tyres: what to check' }) },
    });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await navigateToRelease(mainWindow, project.id, release.tagId);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await waitForLayout(mainWindow);
      await expect(releaseRow(mainWindow, release.version)).toBeVisible();
      // What the chosen Release changed is drawn rather than still read, so
      // the pane is measured with its own content instead of with the
      // skeleton that stands in for it.
      await expect(
        mainWindow.getByRole('main').getByText('Entries added')
      ).toBeVisible();

      const measured = await panesOfThePanel(mainWindow);
      for (const pane of measured.panes) {
        // Every pane has room of its own and none of them reaches past the
        // panel it sits in, which is what a collision or a clip would show as.
        expect(pane.width, theme).toBeGreaterThan(0);
        expect(pane.left, theme).toBeGreaterThanOrEqual(measured.panel.left);
        expect(pane.right, theme).toBeLessThanOrEqual(measured.panel.right);
      }
      // The list keeps ci's 296 px beside the pane of the chosen Release, and
      // nothing inside either of them is laid out wider than the box it is
      // drawn in, which is what a clip shows as.
      expect(
        measured.panes.map((pane) => Math.round(pane.width)),
        theme
      ).toContain(296);
      expect(measured.overflowing, theme).toEqual([]);
      expect(measured.sideways, theme).toEqual([]);

      // The dialog over it fits the window too, with its buttons inside it.
      await openReleaseDialog(mainWindow);
      const dialog = mainWindow.getByRole('dialog');
      const fitted = await mainWindow.evaluate(() => {
        const content = document.querySelector('[data-slot="dialog-content"]');
        const footer = document.querySelector('[data-slot="dialog-footer"]');
        if (content === null || footer === null) {
          throw new Error('The Release dialog draws no content and footer');
        }
        return {
          viewport: window.innerHeight,
          top: content.getBoundingClientRect().top,
          bottom: content.getBoundingClientRect().bottom,
          footerBottom: footer.getBoundingClientRect().bottom,
        };
      });
      expect(fitted.top, theme).toBeGreaterThanOrEqual(0);
      expect(fitted.bottom, theme).toBeLessThanOrEqual(fitted.viewport);
      expect(fitted.footerBottom, theme).toBeLessThanOrEqual(fitted.viewport);
      await expect(
        dialog.getByRole('button', { name: 'Create Release' })
      ).toBeInViewport();
      await expect(
        dialog.getByRole('button', { name: 'Cancel' })
      ).toBeInViewport();
      await dismissDialog(mainWindow);
    }

    expect(await windowSize(electronApp)).toEqual(MINIMUM_WINDOW_SIZE);
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
      dialog.getByText(`${CREATED_VERSION} becomes 0.0.2`)
    ).toBeVisible();
    await expect(dialog.getByText('0.0.2', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Patch', { exact: true })).toBeVisible();

    // No change drove the bump, so the sentence says why without naming one,
    // and no row claims an Entry or an Asset moved.
    await expect(
      dialog.getByText(
        'Desktop sets the version from what changed. This is a patch Release, because what a site reads is unchanged.'
      )
    ).toBeVisible();
    expect(await changeCountsOf(dialog)).toEqual([]);

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
      releaseRow(mainWindow, '0.0.2-preview.1').getByText('Preview', {
        exact: true,
      })
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
    expect(await changeCountsOf(dialog)).toEqual([]);

    // There is nothing to confirm, so the one button that is left says what it
    // does rather than offering to cancel something nobody started.
    await expect(
      dialog.getByRole('button', { name: 'Close', exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true })
    ).toBeHidden();

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
    // the card's count says there is nothing to sync and Sync is disabled. That
    // count refreshes on its own only every three minutes, which is longer than
    // an editor takes to act on the refusal below. The card says it is synced
    // once the first check landed, so this waits for the count rather than for
    // a button that is disabled anyway.
    await navigateToReleases(mainWindow, project.id);
    const synchronize = mainWindow.getByRole('button', { name: 'Sync' });
    await expect(mainWindow.getByText('Everything synced')).toBeVisible();
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
    // fetched, so the count behind Sync is the one the dialog just saw
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

    await expect(dialog.getByText('1.2.3 becomes 2.0.0')).toBeVisible();
    await expect(dialog.getByText('2.0.0', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Major', { exact: true })).toBeVisible();
    // A change to the Project itself rather than to its content, so the
    // sentence carries it and no row claims an Entry or an Asset moved.
    await expect(
      dialog.getByText(
        'Desktop sets the version from what changed. This is a major Release, because a Component was renamed.'
      )
    ).toBeVisible();
    expect(await changeCountsOf(dialog)).toEqual([]);
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

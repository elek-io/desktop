import { expect, type Locator, type Page } from '@playwright/test';
import { format } from 'date-fns';
import { join } from 'node:path';

import { colors } from '@elek-io/branding';

import { test, testDataDirs } from '../fixtures/electronApp.js';
import {
  createAssetViaIpc,
  deleteAssetViaIpc,
  jpegBytes,
  makeTempFile,
  pngBytes,
  updateAssetViaIpc,
} from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  dateFieldDefinition,
  deleteCollectionViaIpc,
  markdownFieldDefinition,
  referenceFieldDefinition,
  selectFieldDefinition,
  textFieldDefinition,
  toggleFieldDefinition,
} from '../helpers/collection.js';
import { contrastRatio, parseColor, toBytes } from '../helpers/color.js';
import {
  assetReferenceValue,
  booleanValue,
  createEntryViaIpc,
  deleteEntryViaIpc,
  markdownEditorSurface,
  markdownValue,
  mdAstParagraph,
  referenceValue,
  stringValue,
  temporalValue,
  updateEntryViaIpc,
} from '../helpers/entry.js';
import { errorScreenTitle } from '../helpers/error.js';
import { stubCoreRejectWithType } from '../helpers/ipc.js';
import { recordedLogs, recordLogsViaIpc } from '../helpers/log.js';
import { navigate, projectCard } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToHistory,
  projectHistoryViaIpc,
  setRemoteOriginUrlViaIpc,
  updateProjectViaIpc,
} from '../helpers/project.js';
import { createReleaseViaIpc } from '../helpers/release.js';
import { setupRemote } from '../helpers/remote.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/**
 * The History of a Project: every change in one column of ruled rows, and the
 * chosen change showing the Entry, the Asset or the Project once, read rather
 * than edited, with what changed marked in place.
 */

/** Every row of the list, newest first. */
function changeRows(page: Page): Locator {
  return page.locator('[data-slot="change-row"]');
}

/**
 * One row, by what its sentence says.
 *
 * Scoped to the list, because the breadcrumb above it names the chosen change
 * by the same sentence.
 */
function changeRow(page: Page, says: string | RegExp): Locator {
  return page
    .locator('[data-slot="change-list"]')
    .getByRole('link', { name: says });
}

/** The heading above each group of rows, in the order they stand. */
async function groupLabelsOf(page: Page): Promise<string[]> {
  return page
    .locator('[data-slot="change-group"]')
    .evaluateAll((groups) =>
      groups.map((group) => group.textContent?.trim() ?? '')
    );
}

/** Which rows stand under one group's heading, by what their sentences say. */
async function rowsUnder(page: Page, label: string): Promise<string[]> {
  return page.evaluate((heading) => {
    const group = Array.from(
      document.querySelectorAll('[data-slot="change-group"]')
    ).find((candidate) => candidate.textContent?.trim() === heading);
    if (group === undefined) {
      throw new Error(`The list has no "${heading}" group`);
    }
    return Array.from(
      group.parentElement?.querySelectorAll('[data-slot="change-row"]') ?? []
    ).map((row) => row.textContent?.trim() ?? '');
  }, label);
}

/** The fill of one row's marker, as bytes a token compares to. */
async function markerFillOf(row: Locator): Promise<[number, number, number]> {
  return toBytes(
    parseColor(
      await row
        .locator('span[aria-hidden="true"]')
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    )
  );
}

/** Whether one row's marker is hollow, which is a border around the surface. */
async function markerIsHollow(row: Locator): Promise<boolean> {
  return row
    .locator('span[aria-hidden="true"]')
    .first()
    .evaluate((node) => getComputedStyle(node).borderTopWidth !== '0px');
}

/**
 * One of ci's colors, read from the brand package rather than copied here, so
 * the assertion follows the token.
 */
function brandColor(
  mode: 'light' | 'dark',
  token: 'border' | 'card' | 'muted' | 'muted-foreground' | 'brand'
): [number, number, number] {
  return toBytes(parseColor(colors[mode][token].oklch));
}

/** Waits for the chosen change to have drawn its fields before they are read. */
async function waitForFields(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="read-field"]').first()).toBeVisible();
}

/**
 * Each field of the chosen change, as its label, its Value and its mark read.
 *
 * A Value's text is its runs run together, so a word that changed reads as the
 * old one and the new one side by side, which is how they stand on screen.
 * Which of them is struck through and which underlined is read by
 * `removedWords` and `addedWords`.
 */
async function fieldsOf(
  page: Page
): Promise<{ label: string; value: string; isChanged: boolean }[]> {
  return page.locator('[data-slot="read-field"]').evaluateAll((fields) =>
    fields.map((field) => {
      const label =
        field.querySelector('[data-slot="field-label"]')?.textContent?.trim() ??
        '';
      const tag =
        field
          .querySelector('[data-slot="field-changed"]')
          ?.textContent?.trim() ?? '';
      return {
        // The label without the "Changed" that stands right after it inside
        // it, which `isChanged` says instead.
        label:
          tag === '' ? label : label.slice(0, label.length - tag.length).trim(),
        value:
          field
            .querySelector('[data-slot="read-value"]')
            ?.textContent?.trim() ?? '',
        isChanged: field.getAttribute('data-changed') === 'true',
      };
    })
  );
}

/**
 * Each row of a Value that points at something, as its name and the line below
 * it read, in the order they stand.
 */
async function rowsOf(page: Page): Promise<{ name: string; line: string }[]> {
  return page.locator('[data-slot="read-row"]').evaluateAll((rows) =>
    rows.map((row) => ({
      name:
        row
          .querySelector(':scope > span:last-child > span:first-child')
          ?.textContent?.trim() ?? '',
      line:
        row
          .querySelector(':scope > span:last-child > span:nth-child(2)')
          ?.textContent?.trim() ?? '',
    }))
  );
}

/** The words this change took out of the Values on screen. */
async function removedWords(page: Page): Promise<string[]> {
  return page.locator('[data-slot="value-removed"]').allInnerTexts();
}

/** The words it added to them. */
async function addedWords(page: Page): Promise<string[]> {
  return page.locator('[data-slot="value-added"]').allInnerTexts();
}

/** The change the address names, opened fresh so every read runs. */
async function navigateToChange(
  page: Page,
  projectId: string,
  commitHash: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/history/${commitHash}`);
}

/** The newest change of the Project, which is the one a test just made. */
async function newestChange(page: Page, projectId: string): Promise<string> {
  const { fullHistory } = await projectHistoryViaIpc(page, { id: projectId });
  const newest = fullHistory[0]?.hash;
  if (newest === undefined) {
    throw new Error('The Project has no change to open');
  }
  return newest;
}

test.describe('The History of a Project', () => {
  test('lists each change once in ruled rows, and marks the chosen one', async ({
    mainWindow,
  }) => {
    await setTheme(mainWindow, 'light');
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

    await navigateToHistory(mainWindow, project.id);

    // Three changes, each listed once: the Project, the Collection and the
    // Entry, newest first as Core reads them.
    await expect(changeRows(mainWindow)).toHaveCount(3);

    // A row says who made the change, what they did, the title of the Entry or
    // the Collection, and when.
    const entryRow = changeRow(mainWindow, /added an Entry/i);
    await expect(entryRow).toContainText('You added an Entry');
    await expect(entryRow).toContainText('Spring opening hours');
    await expect(entryRow).toContainText('less than a minute ago');
    await expect(changeRow(mainWindow, /added a Collection/i)).toContainText(
      'Articles'
    );

    // Every row is ruled below, as ci rules every list.
    expect(
      await entryRow.evaluate((row) => getComputedStyle(row).borderBottomWidth)
    ).toBe('1px');

    // The chosen row takes the muted surface and the bar, which is how ci
    // marks where you are. The pointer is taken off the row first, since a row
    // under it takes the same surface at half the opacity, which is what a row
    // measured where it was clicked would be reading instead.
    await entryRow.click();
    await mainWindow.mouse.move(0, 0);
    const chosen = await entryRow.evaluate((row) => ({
      surface: getComputedStyle(row).backgroundColor,
      shadow: getComputedStyle(row).boxShadow,
    }));
    const surface = parseColor(chosen.surface);
    expect(surface.a).toBe(1);
    expect(toBytes(surface)).toEqual(brandColor('light', 'muted'));
    expect(chosen.shadow).toContain('inset');
    expect(chosen.shadow).toContain('2px');

    // A change somebody else made says their name, in the row and in the head
    // of the change, which is what a Project shared through a Git repository
    // carries after a sync brought a colleague's changes in.
    await setUserViaIpc(mainWindow, {
      name: 'Jonas Brandt',
      email: 'jonas@elek.io',
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'New showroom in Kassel' }) },
    });
    await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
    await navigateToHistory(mainWindow, project.id);
    const byJonas = changeRow(mainWindow, /Jonas Brandt added an Entry/);
    await expect(byJonas).toContainText('New showroom in Kassel');
    await byJonas.click();
    await expect(mainWindow.locator('[data-slot="change-who"]')).toContainText(
      'Jonas Brandt added it'
    );

    // A change that deleted something names it too, read at the change before
    // it, since the delete took it out of the Project.
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    await navigateToHistory(mainWindow, project.id);
    await expect(changeRow(mainWindow, /You deleted an Entry/)).toContainText(
      'Spring opening hours'
    );

    // A deleted Collection the same way, by the name it was last known under.
    await deleteCollectionViaIpc(mainWindow, {
      projectId: project.id,
      id: collection.id,
    });
    await navigateToHistory(mainWindow, project.id);
    await expect(
      changeRow(mainWindow, /You deleted a Collection/)
    ).toContainText('Articles');
  });

  test('groups the rows into Not synced and Synced, and counts the same as the Project card', async ({
    mainWindow,
  }, testInfo) => {
    await setTheme(mainWindow, 'light');
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    // The mirror holds the Project and its Collection, so the one change it
    // does not hold is the Entry below, which is what the check counts.
    const remote = setupRemote(testInfo, {
      mirror: join(testDataDirs(testInfo).dataDir, 'projects', project.id),
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });

    await navigateToHistory(mainWindow, project.id);

    // The card above the pane counts what is not synced, and the groups follow
    // the same check, so the two cannot disagree.
    await expect(
      projectCard(mainWindow).getByText('1 change not synced')
    ).toBeVisible({ timeout: 15000 });
    expect(await groupLabelsOf(mainWindow)).toEqual(['Not synced', 'Synced']);
    expect(await rowsUnder(mainWindow, 'Not synced')).toHaveLength(1);

    // What is not synced carries the hollow marker, the pane's own surface
    // inside a border in the text color, and what is synced the filled one.
    const notSynced = changeRow(mainWindow, /added an Entry/i);
    const synced = changeRow(mainWindow, /created this Project/i);
    expect(await markerIsHollow(notSynced)).toBe(true);
    expect(await markerFillOf(notSynced)).toEqual(brandColor('light', 'card'));
    expect(await markerIsHollow(synced)).toBe(false);
    expect(await markerFillOf(synced)).toEqual(
      brandColor('light', 'muted-foreground')
    );

    // The head of the change says it in words as well, which is what the
    // marker beside it never carries alone.
    const head = mainWindow.locator('[data-slot="change-who"]');
    await notSynced.click();
    await expect(head).toContainText(/, not synced yet$/);
    await synced.click();
    await expect(head).toContainText(/, synced$/);
  });

  test('drops the groups where Desktop cannot check the Git repository, and never fails for it', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    await setTheme(mainWindow, 'light');
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Without a Git repository there is nothing to sync with, so there are no
    // groups and every marker is filled.
    await navigateToHistory(mainWindow, project.id);
    await expect(changeRows(mainWindow).first()).toBeVisible();
    expect(await groupLabelsOf(mainWindow)).toEqual([]);
    expect(await markerFillOf(changeRows(mainWindow).first())).toEqual(
      brandColor('light', 'muted-foreground')
    );

    // The chosen row's marker too, which is where a hollow one on the muted
    // surface it then stands on would reach no contrast at all.
    await changeRows(mainWindow).first().click();
    await mainWindow.mouse.move(0, 0);
    expect(await markerIsHollow(changeRows(mainWindow).first())).toBe(false);
    expect(await markerFillOf(changeRows(mainWindow).first())).toEqual(
      brandColor('light', 'muted-foreground')
    );

    // The head of the chosen change says what it is and who changed it, and
    // nothing about syncing, since there is nothing to sync with.
    const head = mainWindow.locator('[data-slot="change-who"]');
    await expect(head).toContainText('You created it');
    await expect(head).not.toContainText('synced');

    // With a Git repository the check runs, and one that cannot be made leaves
    // the History listing its changes without the groups: they are on this
    // computer either way.
    const remote = setupRemote(testInfo, {
      mirror: join(testDataDirs(testInfo).dataDir, 'projects', project.id),
    });
    await setRemoteOriginUrlViaIpc(mainWindow, {
      id: project.id,
      url: remote.url,
    });
    await recordLogsViaIpc(electronApp);
    // Core raises Internal when the git command fails at all, which is what a
    // repository nothing can reach leaves behind.
    await stubCoreRejectWithType(
      electronApp,
      'core:projects:getChanges',
      'Internal'
    );
    await navigateToHistory(mainWindow, project.id);

    await expect(
      projectCard(mainWindow).getByText("Can't reach the Git repository")
    ).toBeVisible({ timeout: 15000 });
    expect(await groupLabelsOf(mainWindow)).toEqual([]);
    expect(await markerFillOf(changeRows(mainWindow).first())).toEqual(
      brandColor('light', 'muted-foreground')
    );

    // The failed check never takes the screen: the rows are there and the
    // error screen is not.
    await expect(changeRows(mainWindow).first()).toBeVisible();
    await expect(errorScreenTitle(mainWindow)).toBeHidden();

    // A check that counts nothing leaves the head quiet about syncing as well,
    // rather than claiming the change is or is not synced.
    await changeRows(mainWindow).first().click();
    await expect(head).toContainText('You created it');
    await expect(head).not.toContainText('synced');

    // It is logged with its type and its stack, the way a pane's boundary
    // writes one, and nothing of Core's own answer reaches the screen.
    const logged = (await recordedLogs(electronApp)).filter(
      (record) =>
        record.level === 'error' && record.message.startsWith('Project card')
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(logged[0]?.source).toBe('desktop');
    expect(logged[0]?.meta['error.type']).toBe('Internal');
    expect(Object.keys(logged[0]?.meta ?? {})).toContain(
      'exception.stacktrace'
    );
    await expect(mainWindow.getByText(/E2E injected/)).toHaveCount(0);
  });

  test('marks a Release with the brand marker and shows what it changed', async ({
    mainWindow,
  }) => {
    await setTheme(mainWindow, 'light');
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });
    const release = await createReleaseViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToHistory(mainWindow, project.id);

    // The Release is the list's one highlight, in the brand color, and its row
    // says in words what it is.
    const row = changeRow(
      mainWindow,
      new RegExp(`released ${release.version}`)
    );
    await expect(row).toBeVisible();
    expect(await markerFillOf(row)).toEqual(brandColor('light', 'brand'));

    // Chosen, it shows its version, its bump and what it changed, the way the
    // Releases screen shows a Release.
    await row.click();
    const main = mainWindow.getByRole('main');
    await expect(
      main.getByRole('heading', { name: `Release ${release.version}` })
    ).toBeVisible();
    await expect(main.getByText('Entries added')).toBeVisible();
    await expect(main.getByText('Minor', { exact: true })).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'Open Release' })
    ).toBeVisible();
    // The head takes the brand marker as well, as the Releases screen's own
    // line does, rather than the marker of a sync state.
    expect(
      await markerFillOf(mainWindow.locator('[data-slot="change-who"]'))
    ).toEqual(brandColor('light', 'brand'));
  });

  test('shows a changed Entry once, with removed words struck through and added words underlined', async ({
    mainWindow,
  }) => {
    await setTheme(mainWindow, 'light');
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Article' }, plural: { en: 'Articles' } },
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition(),
        toggleFieldDefinition(),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        body: markdownValue({
          en: mdAstParagraph('Open until 6 pm on weekdays.'),
        }),
        featured: booleanValue({ en: false }),
      },
    });
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        body: markdownValue({
          en: mdAstParagraph('Open until 7 pm on weekdays.'),
        }),
        featured: booleanValue({ en: true }),
      },
    });

    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );

    // The Entry is shown once, laid out like its editor, and named by its
    // title. There is no second form beside it to compare against.
    await expect(
      mainWindow.getByRole('heading', { name: 'Spring opening hours' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('An Entry in the Articles Collection', {
        exact: false,
      })
    ).toBeVisible();
    await expect(mainWindow.getByText('Before', { exact: true })).toHaveCount(
      0
    );
    await expect(mainWindow.getByText('After', { exact: true })).toHaveCount(0);

    // Read rather than edited: no control holds a Value, so the markdown
    // editor with its toolbar is not there at all.
    await expect(markdownEditorSurface(mainWindow)).toHaveCount(0);
    await expect(mainWindow.getByRole('textbox')).toHaveCount(0);

    // The field that changed carries "Changed" after its label, and the
    // unchanged one carries nothing.
    await waitForFields(mainWindow);
    const fields = await fieldsOf(mainWindow);
    expect(fields).toEqual([
      { label: 'Title', value: 'Spring opening hours', isChanged: false },
      {
        label: 'Body',
        value: 'Open until 67 pm on weekdays.',
        isChanged: true,
      },
      { label: 'Featured', value: 'OffOn', isChanged: true },
    ]);
    await expect(mainWindow.locator('[data-slot="field-changed"]')).toHaveCount(
      2
    );

    // Inside the text, the words that went are struck through and the words
    // that came are underlined. A toggle is not text, so the old Value stands
    // struck beside the new one underlined.
    expect(await removedWords(mainWindow)).toEqual(['6', 'Off']);
    expect(await addedWords(mainWindow)).toEqual(['7', 'On']);

    // Neither mark is told by its color: the one is struck through and the
    // other underlined.
    const marks = await mainWindow.evaluate(() => {
      const read = (slot: string): string => {
        const node = document.querySelector(`[data-slot="${slot}"]`);
        if (node === null) {
          throw new Error(`The change draws no ${slot}`);
        }
        return getComputedStyle(node).textDecorationLine;
      };
      return { removed: read('value-removed'), added: read('value-added') };
    });
    expect(marks.removed).toBe('line-through');
    expect(marks.added).toBe('underline');

    // The changed field carries the bar on its left, in ink, since the marks
    // inside the Value already carry the colors.
    const bar = await mainWindow
      .locator('[data-slot="read-field"][data-changed="true"]')
      .first()
      .evaluate((field) => {
        const drawn = getComputedStyle(field, '::before');
        return { width: drawn.width, color: drawn.backgroundColor };
      });
    expect(bar.width).toBe('2px');
    expect(toBytes(parseColor(bar.color))).toEqual(
      toBytes(parseColor(colors.light['foreground'].oklch))
    );

    // A label cannot be for text, so it points at no element here, while the
    // same shell's label names the control of every field that has one.
    expect(
      await mainWindow
        .locator('[data-slot="read-field"] [data-slot="field-label"]')
        .first()
        .evaluate((label) => label.getAttribute('for'))
    ).toBeNull();
  });

  test('reads every Value the way its own field type reads one', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      name: 'showroom',
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
    });
    const other = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      name: 'showroom-evening',
      filePath: makeTempFile(testInfo, 'showroom-evening.png', pngBytes),
    });
    // A Collection to point at, so an Entry reference is read as well.
    const team = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Team member' }, plural: { en: 'Team' } },
      slug: { singular: 'team-member', plural: 'team' },
      fieldDefinitions: [textFieldDefinition()],
    });
    const mara = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: team.id,
      values: { title: stringValue({ en: 'Mara Klein' }) },
    });
    const jonas = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: team.id,
      values: { title: stringValue({ en: 'Jonas Brandt' }) },
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        dateFieldDefinition({ label: { en: 'Published on' } }),
        selectFieldDefinition({ label: { en: 'Style' } }),
        assetFieldDefinition({ label: { en: 'Cover' } }),
        referenceFieldDefinition({
          slug: 'authors',
          label: { en: 'Authors' },
          ofCollections: [team.id],
        }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        published: temporalValue({ en: '2026-03-01' }),
        style: stringValue({ en: 'primary' }),
        logo: assetReferenceValue(asset.id),
        authors: referenceValue(mara.id, team.id),
      },
    });
    // The Cover points at another Asset of the same count, which reads the
    // same either way, the Authors at another Entry, and the choice moves to
    // its other option.
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: {
        title: stringValue({ en: 'Spring opening hours' }),
        published: temporalValue({ en: '2026-03-08' }),
        style: stringValue({ en: 'outline' }),
        logo: assetReferenceValue(other.id),
        authors: referenceValue(jonas.id, team.id),
      },
    });

    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await waitForFields(mainWindow);

    // Each Value is read by the field type it belongs to rather than printed
    // as it is stored: a day reads in the User's own locale, with its own
    // anchor so it cannot shift by one, and a reference reads as how many
    // Assets it points at.
    const before = format(new Date('2026-03-01T00:00:00'), 'P');
    const after = format(new Date('2026-03-08T00:00:00'), 'P');
    expect(await fieldsOf(mainWindow)).toEqual([
      { label: 'Title', value: 'Spring opening hours', isChanged: false },
      {
        label: 'Published on',
        value: `${before}${after}`,
        isChanged: true,
      },
      { label: 'Style', value: 'primaryoutline', isChanged: true },
      // A reference points at something rather than reading as text, so it
      // draws the rows below instead of a text Value, and the field is marked
      // because what decides that is the stored Value either way.
      { label: 'Cover', value: '', isChanged: true },
      { label: 'Authors', value: '', isChanged: true },
    ]);

    // A reference names what it points at, as its own control does: the Asset
    // with what the file is, and the Entry with the Collection it is in. The
    // one that went stands struck through above the one that came.
    expect(await rowsOf(mainWindow)).toEqual([
      { name: 'showroom.png', line: 'PNG, 70 Bytes' },
      { name: 'showroom-evening.png', line: 'PNG, 70 Bytes' },
      { name: 'Mara Klein', line: 'Team' },
      { name: 'Jonas Brandt', line: 'Team' },
    ]);
    expect(await removedWords(mainWindow)).toEqual([
      before,
      'primary',
      'showroom.png',
      'Mara Klein',
    ]);
    expect(await addedWords(mainWindow)).toEqual([
      after,
      'outline',
      'showroom-evening.png',
      'Jonas Brandt',
    ]);
    // A day is one Value rather than words, so nothing inside it is compared.
    await expect(mainWindow.getByText('2026-03-08')).toHaveCount(0);
  });

  test('opens on the language that changed, says how many Values changed in it, and opens the Entry there', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      settings: { language: { default: 'en', supported: ['en', 'de'] } },
    });
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
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Spring opening hours', de: 'Frühling' }),
      },
    });
    // Only the German Value changes, so the change opens on German.
    await updateEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: {
        title: stringValue({
          en: 'Spring opening hours',
          de: 'Frühjahr',
        }),
      },
    });

    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );

    // The switch above the fields stands on German, and the line beside it
    // says how many Values changed in it.
    await expect(
      mainWindow.getByText('1 Value changed in German')
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: /German/, pressed: true })
    ).toBeVisible();
    expect(await removedWords(mainWindow)).toEqual(['Frühling']);
    expect(await addedWords(mainWindow)).toEqual(['Frühjahr']);

    // Open Entry opens the Entry in the language the change is read in.
    await mainWindow.getByRole('link', { name: 'Open Entry' }).click();
    await expect(mainWindow).toHaveURL((url) =>
      url.hash.endsWith(`/${entry.id}/update?language=de`)
    );

    // Switching the change to English says what changed there instead.
    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await mainWindow.getByRole('button', { name: /English/ }).click();
    await expect(
      mainWindow.getByText('0 Values changed in English')
    ).toBeVisible();
    expect(await removedWords(mainWindow)).toEqual([]);
  });

  test('shows a created Entry without marks and a deleted one as it last stood', async ({
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
      values: { title: stringValue({ en: 'Spring opening hours' }) },
    });
    const created = await newestChange(mainWindow, project.id);

    // Everything in a created Entry is new, so nothing in it is marked.
    await navigateToChange(mainWindow, project.id, created);
    await waitForFields(mainWindow);
    expect(await fieldsOf(mainWindow)).toEqual([
      { label: 'Title', value: 'Spring opening hours', isChanged: false },
    ]);
    expect(await removedWords(mainWindow)).toEqual([]);
    expect(await addedWords(mainWindow)).toEqual([]);

    // A deleted Entry shows its last state, and the head says it was deleted
    // and offers no way into it.
    await deleteEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await expect(mainWindow.getByText(/You deleted it/)).toBeVisible();
    await waitForFields(mainWindow);
    expect(await fieldsOf(mainWindow)).toEqual([
      { label: 'Title', value: 'Spring opening hours', isChanged: false },
    ]);
    await expect(
      mainWindow.getByRole('link', { name: 'Open Entry' })
    ).toHaveCount(0);
  });

  test("shows an Asset's and the Project's change the same way", async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
      description: 'The showroom in Kassel',
    });
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      name: 'showroom',
      description: 'The showroom from the street',
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
    });
    const added = await newestChange(mainWindow, project.id);

    // An Asset that was added shows the file it is, its name and its
    // description, without marks.
    await navigateToChange(mainWindow, project.id, added);
    await expect(
      mainWindow.getByRole('heading', { name: 'showroom.png' })
    ).toBeVisible();
    await expect(mainWindow.getByText('An Asset.')).toBeVisible();
    await waitForFields(mainWindow);
    expect(await fieldsOf(mainWindow)).toEqual([
      { label: 'File', value: 'PNG, 70 Bytes', isChanged: false },
      { label: 'Name', value: 'showroom.png', isChanged: false },
      {
        label: 'Description',
        value: 'The showroom from the street',
        isChanged: false,
      },
    ]);

    // An Asset somebody renamed and whose file was replaced marks both: the
    // name word by word, and the file by the type and size that say what it
    // is, since there is nothing inside a file to compare. Core writes the
    // name it is given as a file name, which is where the dash comes from.
    await updateAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
      name: 'showroom evening',
      description: 'The showroom from the street',
      newFilePath: makeTempFile(testInfo, 'evening.jpg', jpegBytes),
    });
    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await waitForFields(mainWindow);
    expect(await fieldsOf(mainWindow)).toEqual([
      // The file is one Value, so the old reading stands struck beside the
      // new one, while the name is words and only what changed in it is
      // marked.
      {
        label: 'File',
        value: 'PNG, 70 BytesJPG, 630 Bytes',
        isChanged: true,
      },
      { label: 'Name', value: 'showroom-evening.pngjpg', isChanged: true },
      {
        label: 'Description',
        value: 'The showroom from the street',
        isChanged: false,
      },
    ]);
    expect(await removedWords(mainWindow)).toEqual(['PNG, 70 Bytes', 'png']);
    expect(await addedWords(mainWindow)).toEqual([
      'JPG, 630 Bytes',
      '-evening',
      'jpg',
    ]);

    // One that deleted the Asset shows the state it was last in, and offers no
    // way into it.
    await deleteAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
      extension: 'jpg',
    });
    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await expect(mainWindow.getByText(/You deleted it/)).toBeVisible();
    await waitForFields(mainWindow);
    expect(await fieldsOf(mainWindow)).toEqual([
      { label: 'File', value: 'JPG, 630 Bytes', isChanged: false },
      { label: 'Name', value: 'showroom-evening.jpg', isChanged: false },
      {
        label: 'Description',
        value: 'The showroom from the street',
        isChanged: false,
      },
    ]);
    await expect(
      mainWindow.getByRole('link', { name: 'Open Asset' })
    ).toHaveCount(0);

    // The Project's own change shows its Settings in the same shape, with the
    // words that changed marked.
    await updateProjectViaIpc(mainWindow, {
      id: project.id,
      name: 'Autohaus Ebersfelde',
      description: 'The showroom in Göttingen',
      settings: project.settings,
    });
    await navigateToChange(
      mainWindow,
      project.id,
      await newestChange(mainWindow, project.id)
    );
    await expect(mainWindow.getByText('The whole Project.')).toBeVisible();
    await waitForFields(mainWindow);
    const fields = await fieldsOf(mainWindow);
    expect(fields.map((field) => [field.label, field.isChanged])).toEqual([
      ['Name', false],
      ['Description', true],
      ['Languages', false],
      ['Default language', false],
    ]);
    expect(await removedWords(mainWindow)).toEqual(['Kassel']);
    expect(await addedWords(mainWindow)).toEqual(['Göttingen']);
    await expect(
      mainWindow.getByRole('link', { name: 'Open settings' })
    ).toBeVisible();
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`keeps the chosen change inside the smallest window in ${mode} mode, with its marks at contrast`, async ({
      electronApp,
      mainWindow,
    }, testInfo) => {
      await setTheme(mainWindow, mode);
      await setUserViaIpc(mainWindow);
      const project = await createProjectViaIpc(mainWindow, {
        name: 'Autohaus Ebersfelde',
        description: 'The showroom in Kassel',
      });
      const collection = await createCollectionViaIpc(mainWindow, {
        projectId: project.id,
        fieldDefinitions: [textFieldDefinition()],
      });
      const entry = await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: {
          title: stringValue({
            en: 'From March 1, the showroom is open until 6 pm on weekdays',
          }),
        },
      });
      await updateEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values: {
          title: stringValue({
            en: 'From March 1, the showroom is open until 7 pm on weekdays and until 4 pm on Saturdays',
          }),
        },
      });
      const entryChange = await newestChange(mainWindow, project.id);
      // An Asset whose name and file both changed, and the Project's own
      // change, so every kind of change the screen draws is measured at the
      // smallest window rather than an Entry's alone.
      const asset = await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        name: 'showroom',
        description: 'The showroom from the street',
        filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      });
      await updateAssetViaIpc(mainWindow, {
        projectId: project.id,
        id: asset.id,
        name: 'showroom evening',
        description: 'The showroom from the street at dusk',
        newFilePath: makeTempFile(testInfo, 'evening.jpg', jpegBytes),
      });
      const assetChange = await newestChange(mainWindow, project.id);
      await updateProjectViaIpc(mainWindow, {
        id: project.id,
        name: 'Autohaus Ebersfelde',
        description:
          'The showroom in Göttingen rather than in Kassel, written long enough to wrap',
        settings: project.settings,
      });
      const projectChange = await newestChange(mainWindow, project.id);

      /**
       * What the panel holds at the smallest window.
       *
       * A line that is cut off counts as laid out too wide whatever its own
       * overflow says, because a line of a row is cut off rather than
       * overflowing: it carries `overflow: hidden` and would otherwise be
       * measured as fitting while the time at its end is not on screen.
       */
      const measure = async (): Promise<{
        panel: { left: number; right: number };
        panes: { left: number; right: number; width: number }[];
        overflowing: (string | null)[];
        sideways: (string | null)[];
      }> =>
        mainWindow.evaluate(() => {
          const panel = document.querySelector('[data-slot="panel"]');
          const panes = Array.from(
            document.querySelectorAll('[data-slot="panel"] [data-slot="pane"]')
          );
          if (panel === null || panes.length === 0) {
            throw new Error('The panel draws no panes');
          }
          const box = panel.getBoundingClientRect();
          const named = (element: ProbedElement): string | null =>
            element.getAttribute('data-slot') ?? element.tagName;
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
                (element) => element.scrollWidth - element.clientWidth > 1
              )
              .map(named),
            sideways: Array.from(
              document.querySelectorAll(
                '[data-slot="panel"] [data-slot="scroll-area-viewport"]'
              )
            )
              .filter(
                (element) => element.scrollWidth - element.clientWidth > 1
              )
              .map(named),
          };
        });

      // The Entry's change comes last, so the marks read below are its own.
      for (const [what, commitHash] of [
        ['an Asset', assetChange],
        ['the Project', projectChange],
        ['an Entry', entryChange],
      ] as const) {
        await navigateToChange(mainWindow, project.id, commitHash);
        await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
        await waitForLayout(mainWindow);
        await waitForFields(mainWindow);
        const where = `${mode}, ${what}`;
        const measured = await measure();

        // Every pane has room of its own and none of them reaches past the
        // panel it sits in, which is what a collision or a clip would show as,
        // and nothing inside them is laid out wider than the box it is drawn
        // in.
        for (const pane of measured.panes) {
          expect(pane.width, where).toBeGreaterThan(0);
          expect(pane.left, where).toBeGreaterThanOrEqual(measured.panel.left);
          expect(pane.right, where).toBeLessThanOrEqual(measured.panel.right);
        }
        // The list keeps ci's 296 px beside the chosen change.
        expect(
          measured.panes.map((pane) => Math.round(pane.width)),
          where
        ).toContain(296);
        expect(measured.overflowing, where).toEqual([]);
        expect(measured.sideways, where).toEqual([]);
      }

      await expect(
        mainWindow.locator('[data-slot="value-added"]').first()
      ).toBeVisible();

      // Each mark is read on the surface it carries, so the words that went
      // and the words that came both meet WCAG 2.2 AA for text.
      const read = await mainWindow.evaluate(() => {
        const of = (slot: string): { color: string; surface: string } => {
          const node = document.querySelector(`[data-slot="${slot}"]`);
          if (node === null) {
            throw new Error(`The change draws no ${slot}`);
          }
          const style = getComputedStyle(node);
          return { color: style.color, surface: style.backgroundColor };
        };
        return { removed: of('value-removed'), added: of('value-added') };
      });
      for (const mark of [read.removed, read.added]) {
        expect(
          contrastRatio(parseColor(mark.color), parseColor(mark.surface)),
          mode
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test('lets the Release marker arrive, and holds it still under reduced motion', async ({
    mainWindow,
  }) => {
    await mainWindow.emulateMedia({ reducedMotion: 'no-preference' });
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createCollectionViaIpc(mainWindow, { projectId: project.id });
    const release = await createReleaseViaIpc(mainWindow, {
      projectId: project.id,
    });

    await navigateToHistory(mainWindow, project.id);
    const row = changeRow(
      mainWindow,
      new RegExp(`released ${release.version}`)
    );
    await expect(row).toBeVisible();
    const marker = row.locator('span[aria-hidden="true"]').first();
    const motionOf = async (): Promise<{
      animation: string;
      duration: string;
      delay: string;
      easing: string;
      transition: string;
    }> =>
      marker.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          animation: style.animationName,
          duration: style.animationDuration,
          delay: style.animationDelay,
          easing: style.animationTimingFunction,
          transition: style.transitionDuration,
        };
      });

    // It arrives the way the mark's own period does: one movement, over the
    // 500 ms after the 200 ms delay that ci sets, in Tailwind's ease-out.
    expect(await motionOf()).toEqual({
      animation: 'marker-arrival',
      duration: '0.5s',
      delay: '0.2s',
      easing: 'cubic-bezier(0, 0, 0.2, 1)',
      transition: '0s',
    });

    // Under reduced motion it is simply in place, which is the end state the
    // movement arrives at, so nothing is lost by holding it there.
    await mainWindow.emulateMedia({ reducedMotion: 'reduce' });
    const held = await motionOf();
    expect({
      animation: held.animation,
      duration: held.duration,
      transition: held.transition,
    }).toEqual({ animation: 'none', duration: '0s', transition: '0s' });
  });
});

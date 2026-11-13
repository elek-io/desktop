import { expect, type Page } from '@playwright/test';

import { colors } from '@elek-io/branding';

import { test } from '../fixtures/electronApp.js';
import {
  createAssetViaIpc,
  deleteOpenAsset,
  makeTempFile,
  openAsset,
  pngBytes,
} from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  navigateToCollection,
} from '../helpers/collection.js';
import { parseColor, toBytes } from '../helpers/color.js';
import {
  createEntryViaIpc,
  entryRow,
  fillEntryForm,
  navigateToEntryCreate,
  stringValue,
} from '../helpers/entry.js';
import {
  externalOpens,
  recordExternalOpensViaIpc,
} from '../helpers/external.js';
import {
  bootOnHash,
  navigate,
  navigationRows,
  projectSidebar,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToAssets,
  navigateToProjectDashboard,
} from '../helpers/project.js';
import { openHelpMenu } from '../helpers/report.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import {
  MINIMUM_WINDOW_SIZE,
  resizeWindow,
  waitForLayout,
} from '../helpers/window.js';

/**
 * Boot the app fresh at `fromHash` and assert it redirects to `toHash`.
 *
 * `navigate` waits for the hash it was given, which a redirect breaks by
 * definition, so this passes the redirected destination as the hash to settle
 * on and shares the same boot.
 */
async function expectRedirect(
  page: Page,
  fromHash: string,
  toHash: string
): Promise<void> {
  await bootOnHash(page, fromHash, toHash);
}

/** The trail in the header, step by step, as a person reads it. */
async function breadcrumbTrail(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('listitem')
    .allInnerTexts();
}

test.describe('Navigation', () => {
  test('redirect chains land on the right routes', async ({ mainWindow }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'First article' }) },
    });

    // Each index route redirects to a concrete child via beforeLoad.
    await expectRedirect(mainWindow, '#/', '#/projects');
    await expectRedirect(
      mainWindow,
      `#/projects/${project.id}`,
      `#/projects/${project.id}/dashboard`
    );
    await expectRedirect(
      mainWindow,
      `#/projects/${project.id}/settings`,
      `#/projects/${project.id}/settings/general`
    );
    await expectRedirect(mainWindow, '#/user', '#/user/profile');
    await expectRedirect(
      mainWindow,
      `#/projects/${project.id}/collections/${collection.id}/${entry.id}`,
      `#/projects/${project.id}/collections/${collection.id}/${entry.id}/update`
    );
  });

  test('global chrome shows Help and navigates', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The dashboard gives a non-trivial breadcrumb trail (Projects > name > ...).
    await navigateToProjectDashboard(mainWindow, project.id);

    // The header lockup leads to the Projects page, which is the one link in
    // the banner landmark.
    await expect(
      mainWindow
        .getByRole('banner')
        .getByRole('link', { name: 'elek.io Desktop, Projects' })
    ).toBeVisible();

    // Help holds the documentation, Report an issue and the versions.
    await openHelpMenu(mainWindow);
    await expect(
      mainWindow.getByRole('menuitem', { name: 'Report an issue' })
    ).toBeVisible();
    const versionRows = [
      'elek.io Desktop',
      'elek.io Core',
      'Electron',
      'Chromium',
      'Node',
    ];
    for (const label of versionRows) {
      const row = mainWindow.getByRole('menuitem', { name: label });
      await expect(row).toBeVisible();
      // Each row appends its version, in Geist Mono and as the number alone,
      // which is what ci draws.
      await expect(
        row.locator('[data-slot="dropdown-menu-add-on"]')
      ).toHaveText(/^\d+\.\d+\.\d+/);
    }
    // The documentation opens in the browser. The main process denies a
    // hostname outside the ones it allows, so an address that reaches the
    // system is one Desktop is allowed to open.
    await recordExternalOpensViaIpc(electronApp);
    await mainWindow.getByRole('menuitem', { name: /^Docs/ }).click();
    await expect
      .poll(async () => externalOpens(electronApp))
      .toEqual(['https://elek.io/en/documentation']);
    await expect(mainWindow.getByRole('menu')).toBeHidden();

    // Back/forward drive the router history. An in-app navigation (no reload)
    // pushes a history entry, so back returns to the dashboard and forward
    // returns to the pushed route.
    await mainWindow.getByRole('link', { name: 'Full History' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/history`
    );
    await mainWindow.getByRole('button', { name: 'Go back' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/dashboard`
    );
    await mainWindow.getByRole('button', { name: 'Go forward' }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/history`
    );

    // The breadcrumb crumbs are real links.
    const breadcrumb = mainWindow.getByRole('navigation', {
      name: 'breadcrumb',
    });
    const crumbLinks = breadcrumb.getByRole('link');
    await expect(crumbLinks.first()).toBeVisible();
    expect(await crumbLinks.count()).toBeGreaterThanOrEqual(2);
  });

  test('names each page of the Settings and the Profile in the trail', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow, {
      name: 'Autohaus Ebersfelde',
    });

    // Each page of the Settings is its own step, after the Project and
    // Settings, so the trail says which one is open.
    await navigate(mainWindow, `#/projects/${project.id}/settings/general`);
    await expect
      .poll(async () => breadcrumbTrail(mainWindow))
      .toEqual(['Projects', 'Autohaus Ebersfelde', 'Settings', 'General']);

    await mainWindow
      .locator('[data-slot="settings-page"]')
      .filter({ hasText: 'Sync' })
      .click();
    await expect
      .poll(async () => breadcrumbTrail(mainWindow))
      .toEqual(['Projects', 'Autohaus Ebersfelde', 'Settings', 'Sync']);

    // The Projects step the Profile's trail starts on leads to the Projects
    // page, though the Profile sits outside that route.
    await navigate(mainWindow, '#/user/profile');
    await mainWindow
      .getByRole('navigation', { name: 'breadcrumb' })
      .getByRole('link', { name: 'Projects' })
      .click();
    await verifyCurrentRouteHash(mainWindow, '#/projects');
  });
});

/**
 * The one sidebar of a Project: the search, every page of the Project and every
 * Collection with how many Entries it holds.
 *
 * What it replaced was a second sidebar inside Collections, so the specs below
 * also pin that every Collection is reachable from this one, which is what the
 * Collections screens now rely on.
 */
test.describe("A Project's sidebar", () => {
  test('lists every page of the Project and every Collection in one order', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const articles = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Event' }, plural: { en: 'Events' } },
      slug: { singular: 'event', plural: 'events' },
    });

    await navigateToProjectDashboard(mainWindow, project.id);
    const sidebar = projectSidebar(mainWindow);
    await expect(sidebar.getByRole('link', { name: /^Events/ })).toBeVisible();

    // Core answers the Collections of a Project in no particular order, so the
    // two of them are compared as a set while everything around them is in the
    // order ci draws.
    const rows = await navigationRows(mainWindow);
    expect(rows.slice(0, 3)).toEqual(['Dashboard', 'Assets', 'Components']);
    expect(rows.slice(3, -3).sort()).toEqual(['Articles', 'Events']);
    expect(rows.slice(-3)).toEqual(['History', 'Releases', 'Settings']);

    // One label, and it heads the Collections. Nothing heads the Project's own
    // pages, since every row of the navigation belongs to the Project.
    expect(
      await mainWindow
        .locator(
          '[data-slot="sidebar-content"] [data-slot="sidebar-group-label"]'
        )
        .evaluateAll((labels) =>
          labels.map((label) => label.textContent?.trim() ?? '')
        )
    ).toEqual(['Collections']);

    const measured = await mainWindow.evaluate(() => {
      const sidebar = document.querySelector('[data-slot="sidebar"]');
      const header = sidebar?.querySelector('[data-slot="sidebar-header"]');
      const content = sidebar?.querySelector('[data-slot="sidebar-content"]');
      const rule = content?.querySelector('[data-slot="sidebar-separator"]');
      const label = content?.querySelector(
        '[data-slot="sidebar-group-label"] span'
      );
      if (
        content === null ||
        content === undefined ||
        header === null ||
        header === undefined ||
        rule === null ||
        rule === undefined ||
        label === null ||
        label === undefined
      ) {
        throw new Error('The navigation has no rule ending the Collections');
      }

      return {
        headerBottom: Math.round(header.getBoundingClientRect().bottom),
        labelLeft: Math.round(label.getBoundingClientRect().x),
        ruleTop: Math.round(rule.getBoundingClientRect().y),
        ruleBottom: Math.round(rule.getBoundingClientRect().bottom),
        ruleLeft: Math.round(rule.getBoundingClientRect().x),
        menus: Array.from(
          content.querySelectorAll('[data-slot="sidebar-menu"]')
        ).map((menu) =>
          Array.from(
            menu.querySelectorAll('[data-slot="sidebar-menu-button"]')
          ).map((row) => {
            const box = row.getBoundingClientRect();
            return { top: Math.round(box.y), bottom: Math.round(box.bottom) };
          })
        ),
        rows: Array.from(
          content.querySelectorAll('[data-slot="sidebar-menu-button"]')
        ).map((row) => {
          const box = row.getBoundingClientRect();
          const icon = row.querySelector('svg');

          return {
            label: row.querySelector('span')?.textContent?.trim() ?? '',
            top: Math.round(box.y),
            bottom: Math.round(box.bottom),
            iconLeft:
              icon === null ? 0 : Math.round(icon.getBoundingClientRect().x),
          };
        }),
      };
    });

    // The rule ends the Collections: every row below it is one of the three
    // that must not read as a Collection, and the last row above it is one.
    const above = measured.rows.filter((row) => row.bottom <= measured.ruleTop);
    const below = measured.rows.filter((row) => row.top >= measured.ruleTop);
    expect(below.map((row) => row.label)).toEqual([
      'History',
      'Releases',
      'Settings',
    ]);
    expect(['Articles', 'Events']).toContain(above.at(-1)?.label);

    // The rule stands as far from the row below it as from the row above it,
    // as every rule of an aside does on the website too.
    expect(measured.ruleTop - (above.at(-1)?.bottom ?? 0)).toBe(
      (below[0]?.top ?? 0) - measured.ruleBottom
    );

    // The rows of one group stand 2 px apart, so the open row and the row
    // under the pointer never read as one.
    const gaps = measured.menus.flatMap((menu) =>
      menu.slice(1).map((row, at) => row.top - (menu[at]?.bottom ?? 0))
    );
    expect(gaps.length).toBeGreaterThan(4);
    expect([...new Set(gaps)]).toEqual([2]);

    // The search is the first thing below the Project and stands above the
    // first row of the navigation, which is where ci puts it. It renders in a
    // group of its own rather than among the rows, so the order of the rows
    // alone cannot show it.
    const search = sidebar.getByRole('button', {
      name: 'Search comes later',
    });
    const searchBox = await search.boundingBox();
    const searchIcon = await search.locator('svg').boundingBox();
    const lockup = await mainWindow
      .getByRole('banner')
      .getByRole('link', { name: 'elek.io Desktop, Projects' })
      .boundingBox();
    if (searchBox === null || searchIcon === null || lockup === null) {
      throw new Error('The sidebar has no search, or the header no lockup');
    }
    expect(searchBox.y).toBeGreaterThanOrEqual(measured.headerBottom);
    expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(
      measured.rows[0]?.top ?? 0
    );

    // One column carries the search's icon, every row's icon, the Collections
    // label and the rule, and it is the column the header lockup already
    // stands on, rather than one of ci's three.
    const column = Math.round(lockup.x);
    expect(Math.round(searchIcon.x)).toBe(column);
    expect([...new Set(measured.rows.map((row) => row.iconLeft))]).toEqual([
      column,
    ]);
    expect(measured.labelLeft).toBe(column);
    expect(measured.ruleLeft).toBe(column);

    // A Collection opens its Entries from this one sidebar, which is what the
    // second sidebar inside Collections used to do.
    await sidebar.getByRole('link', { name: /^Articles/ }).click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/collections/${articles.id}`
    );
  });

  test('counts what each page holds, and follows a create and a delete', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    // A second Collection, holding a different number of Entries, so each row
    // has to carry its own Collection's count rather than whichever one Core
    // answered first.
    const events = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: { singular: { en: 'Event' }, plural: { en: 'Events' } },
      slug: { singular: 'event', plural: 'events' },
    });
    for (const title of ['Spring fair', 'Summer party', 'Autumn market']) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: events.id,
        values: { title: stringValue({ en: title }) },
      });
    }
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'logo.png', pngBytes),
    });

    const sidebar = projectSidebar(mainWindow);

    // A Collection's row says how many Entries it holds in words, because its
    // own name does not say what the number counts. Core answers the
    // Collections of a Project in no order, so the two numbers also prove each
    // one landed on the row of the Collection it was read for.
    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(
      sidebar.getByRole('link', { name: /^Articles\s*0 Entries$/ })
    ).toBeVisible();
    await expect(
      sidebar.getByRole('link', { name: /^Events\s*3 Entries$/ })
    ).toBeVisible();

    // The create goes through the app, and the number follows it without the
    // Project being opened again.
    await fillEntryForm(mainWindow, { Title: 'Spring opening hours' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    await expect(
      sidebar.getByRole('link', { name: /^Articles\s*1 Entry$/ })
    ).toBeVisible();
    // The other Collection's number is untouched by it.
    await expect(
      sidebar.getByRole('link', { name: /^Events\s*3 Entries$/ })
    ).toBeVisible();

    // Assets and Components name what they count themselves, so their rows
    // carry the number alone. A delete takes it back down.
    await navigateToAssets(mainWindow, project.id);
    await expect(
      sidebar.getByRole('link', { name: /^Assets\s*1$/ })
    ).toBeVisible();
    await expect(
      sidebar.getByRole('link', { name: /^Components\s*0$/ })
    ).toBeVisible();
    await expect(
      sidebar.getByRole('link', { name: /^Releases\s*0$/ })
    ).toBeVisible();

    await openAsset(mainWindow, 'test-asset.png');
    await deleteOpenAsset(mainWindow, 'test-asset.png');
    await expect(
      sidebar.getByRole('link', { name: /^Assets\s*0$/ })
    ).toBeVisible();
  });

  test('opens Create Collection from the Collections label', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await navigateToProjectDashboard(mainWindow, project.id);

    // A ghost button on the label, which is a link rather than the create
    // page's own Create Collection button.
    await projectSidebar(mainWindow)
      .getByRole('link', { name: 'Create Collection' })
      .click();
    await verifyCurrentRouteHash(
      mainWindow,
      `#/projects/${project.id}/collections/create`
    );
    await expect(
      mainWindow.getByRole('button', { name: 'Create Collection' })
    ).toBeVisible();
  });

  test('says the search comes later while the screens keep filtering', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    for (const title of ['Spring opening hours', 'Winter tyres']) {
      await createEntryViaIpc(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
        values: { title: stringValue({ en: title }) },
      });
    }

    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });

    // Disabled, and it says why rather than only looking unavailable. It keeps
    // `aria-disabled` rather than `disabled`, so it stays reachable and the
    // sentence is read out, and it shows no shortcut, which comes with the
    // search itself.
    const search = projectSidebar(mainWindow).getByRole('button', {
      name: 'Search comes later',
    });
    await expect(search).toBeVisible();
    await expect(search).toBeDisabled();
    await expect(search).toHaveAttribute('aria-disabled', 'true');
    await expect(search).toHaveText('Search comes later');

    // Still reachable, which is what carrying `aria-disabled` rather than
    // `disabled` is for: a control taken out of the tab order would leave the
    // sentence that says why unread.
    await search.focus();
    await expect(search).toBeFocused();

    // What filters inside a screen is untouched by it.
    await expect(entryRow(mainWindow, 'Spring opening hours')).toBeVisible();
    await mainWindow.getByLabel('Filter Articles').fill('Winter');
    await expect(entryRow(mainWindow, 'Winter tyres')).toBeVisible();
    await expect(entryRow(mainWindow, 'Spring opening hours')).toBeHidden();
  });

  test('marks the open Collection, keeps the focus ring inside and cuts a long name', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      name: {
        singular: { en: 'Monthly newsletter issue' },
        plural: { en: 'Monthly newsletter issues and announcements' },
      },
      slug: { singular: 'newsletter-issue', plural: 'newsletter-issues' },
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: { title: stringValue({ en: 'The first issue' }) },
    });

    const row = projectSidebar(mainWindow).getByRole('link', {
      name: /^Monthly newsletter issues and announcements/,
    });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await navigateToCollection(mainWindow, {
        projectId: project.id,
        collectionId: collection.id,
      });

      // Marked for assistive technology by the route it leads to, and drawn as
      // ci draws it: the card surface with a hairline in light mode, and the
      // muted surface in dark mode, where the card surface is the ground.
      await expect(row).toHaveAttribute('aria-current', 'page');
      await expect(row).toHaveAttribute('data-active', 'true');

      // Read through the document rather than through the locator's own
      // handle, so what is measured is the row that is on screen now rather
      // than one a re-render has replaced.
      const surfaces = await mainWindow.evaluate(() => {
        const active = document.querySelector(
          '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"][data-active]'
        );
        const ground = document.querySelector('body');
        if (active === null || ground === null) {
          throw new Error('No row of the navigation is marked as the open one');
        }

        return {
          row: getComputedStyle(active).backgroundColor,
          // The hairline is one layer of the row's own box shadow, beside the
          // raised shadow ci draws with it, so an inset layer of 1 px is what
          // says it is there.
          hairline: getComputedStyle(active)
            .boxShadow.split(/,(?![^(]*\))/)
            .map((layer) => layer.trim())
            .filter((layer) => layer.endsWith('0px 0px 0px 1px inset')),
          ground: getComputedStyle(ground).backgroundColor,
        };
      });

      expect(toBytes(parseColor(surfaces.row)), theme).toEqual(
        toBytes(
          parseColor(
            theme === 'light'
              ? colors.light.background.oklch
              : colors.dark.muted.oklch
          )
        )
      );
      expect(toBytes(parseColor(surfaces.row)), theme).not.toEqual(
        toBytes(parseColor(surfaces.ground))
      );
      // Light mode adds the hairline, because the row's surface is white on an
      // almost white ground. Dark mode has none, as ci draws it, where the
      // muted surface already stands out from the ground.
      expect(surfaces.hairline.length, theme).toBe(theme === 'light' ? 1 : 0);
    }

    // The ring is drawn inside the row, because the list it sits in would clip
    // one drawn outside it. Reached with the keyboard, which is what
    // :focus-visible means.
    await row.focus();
    await mainWindow.keyboard.press('Tab');
    await mainWindow.keyboard.press('Shift+Tab');
    await expect(row).toBeFocused();

    const measured = await mainWindow.evaluate(() => {
      const focused = document.activeElement;
      const label = focused?.querySelector('span') ?? null;
      const count = focused?.querySelector('span[aria-hidden="true"]') ?? null;
      if (focused === null || label === null || count === null) {
        throw new Error('The focused element is not a row of the navigation');
      }

      return {
        isRow: focused.matches('[data-slot="sidebar-menu-button"]'),
        outlineOffset: getComputedStyle(focused).outlineOffset,
        nameIsCut: label.scrollWidth > label.clientWidth,
        countRight: Math.round(count.getBoundingClientRect().right),
        rowRight: Math.round(focused.getBoundingClientRect().right),
      };
    });

    expect(measured.isRow).toBe(true);
    expect(measured.outlineOffset).toBe('-2px');

    // A name too long for the row is cut rather than pushing the count out of
    // it, so the number stays inside the row with its padding to spare.
    expect(measured.nameIsCut).toBe(true);
    expect(measured.countRight).toBeLessThan(measured.rowRight);
  });

  test('scrolls at full row height, with a rule marking what it continues past', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    // More Collections than the smallest window the app supports can show, so
    // the list is what gives way rather than the rows.
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await createCollectionViaIpc(mainWindow, {
        projectId: project.id,
        name: {
          singular: { en: `Set ${index}` },
          plural: { en: `Sets ${index}` },
        },
        slug: { singular: `set-${index}`, plural: `sets-${index}` },
      });
    }

    const sidebar = projectSidebar(mainWindow);
    await navigateToProjectDashboard(mainWindow, project.id);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(mainWindow, theme);
      await navigateToProjectDashboard(mainWindow, project.id);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
      await expect(
        sidebar.getByRole('link', { name: /^Sets 8/ })
      ).toBeVisible();
      await waitForLayout(mainWindow);

      const atTop = await mainWindow.evaluate(() => {
        const content = document.querySelector(
          '[data-slot="sidebar"] [data-slot="sidebar-content"]'
        );
        if (content === null) {
          throw new Error('The sidebar has no navigation');
        }

        return {
          rowHeights: Array.from(
            new Set(
              Array.from(
                content.querySelectorAll('[data-slot="sidebar-menu-button"]')
              ).map((row) => Math.round(row.getBoundingClientRect().height))
            )
          ),
          scrolls: content.scrollHeight > content.clientHeight,
          above: getComputedStyle(content, '::before').opacity,
          below: getComputedStyle(content, '::after').opacity,
          cue: getComputedStyle(content, '::after').backgroundColor,
          border: getComputedStyle(document.documentElement).getPropertyValue(
            '--color-border'
          ),
        };
      });

      // Every row keeps the 32 px it is drawn at, and the list scrolls instead.
      expect(atTop.rowHeights, theme).toEqual([32]);
      expect(atTop.scrolls, theme).toBe(true);

      // Nothing sits above the first row yet, and the rule at the bottom says
      // the list continues past it. It is the border color in both themes.
      expect(atTop.above, theme).toBe('0');
      expect(atTop.below, theme).toBe('1');
      expect(toBytes(parseColor(atTop.cue)), theme).toEqual(
        toBytes(parseColor(atTop.border))
      );

      await mainWindow.evaluate(() => {
        const content = document.querySelector(
          '[data-slot="sidebar"] [data-slot="sidebar-content"]'
        );
        if (content === null) {
          throw new Error('The sidebar has no navigation');
        }
        content.scrollTop = content.scrollHeight;
      });

      // At the end of the list the two swap: rows sit above it, none below.
      //
      // Read until it settles rather than once. The opacity of a rule follows
      // the scroll position itself, which the style a page can read catches up
      // with a frame or more after the scroll, and how many frames that takes
      // is the system's own business. Where the list stands is read with it, so
      // a scroll that did not take reads apart from a rule that did not follow
      // one that did.
      await expect
        .poll(
          async () =>
            mainWindow.evaluate(() => {
              const content = document.querySelector(
                '[data-slot="sidebar"] [data-slot="sidebar-content"]'
              );
              if (content === null) {
                throw new Error('The sidebar has no navigation');
              }

              return {
                above: getComputedStyle(content, '::before').opacity,
                below: getComputedStyle(content, '::after').opacity,
                atEnd:
                  Math.round(content.scrollTop) ===
                  Math.round(content.scrollHeight - content.clientHeight),
              };
            }),
          { message: theme }
        )
        .toEqual({ above: '1', below: '0', atEnd: true });
    }
  });
});

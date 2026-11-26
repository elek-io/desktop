import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import {
  createCollectionViaIpc,
  navigateToCollection,
} from '../helpers/collection.js';
import { navigateToComponents } from '../helpers/component.js';
import { navigate, verifyCurrentRouteHash } from '../helpers/navigation.js';
import { createProjectViaIpc, navigateToAssets } from '../helpers/project.js';
import { navigateToReleases } from '../helpers/release.js';
import { setUserViaIpc } from '../helpers/user.js';

/** The one empty state component, wherever a screen shows one. */
function emptyState(page: Page): Locator {
  return page.locator('[data-slot="empty"]');
}

/**
 * What the empty state is painted with, and whether it carries the dark mode
 * colors the gradient always takes.
 *
 * Read off the computed style rather than off a class name, so the assertion is
 * what somebody sees rather than what was written.
 */
async function gradientOf(page: Page): Promise<{
  image: string;
  isDark: boolean;
}> {
  return page.evaluate(() => {
    const surface = document.querySelector('[data-slot="empty"]');

    if (surface === null) {
      throw new Error('No empty state is on screen');
    }
    const style = getComputedStyle(surface);

    return {
      image: style.backgroundImage,
      isDark: surface.classList.contains('dark'),
    };
  });
}

test.describe('Empty states', () => {
  // Pin all six app-wide empty strings in one place, walked in an order that
  // keeps each precondition true (project before assets and Releases, no
  // collections before the empty Collections state, a collection before its
  // empty entry table). This is the single spot a renamed empty state is
  // caught, so some overlap with the projects, entries and releases specs is
  // intentional.
  test('renders each area empty state when its total is zero', async ({
    mainWindow,
  }) => {
    // 1. A User, then the Projects page with no Project, which is Welcome.
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();

    // 2. A project with no Assets shows the Assets empty state.
    const project = await createProjectViaIpc(mainWindow);
    await navigateToAssets(mainWindow, project.id);
    await expect(mainWindow.getByText('No Assets yet')).toBeVisible();

    // 3. Nothing was published from the project, so Releases is empty.
    await navigateToReleases(mainWindow, project.id);
    await expect(mainWindow.getByText('No Releases yet')).toBeVisible();

    // 4. The project has no Components, so the Components list is empty.
    await navigateToComponents(mainWindow, project.id);
    await expect(mainWindow.getByText('No Components yet')).toBeVisible();

    // 5. The project has no Collections, so Collections says so where a
    // Collection would open.
    await navigate(mainWindow, `#/projects/${project.id}/collections`);
    await expect(mainWindow.getByText('No Collections yet')).toBeVisible();

    // 6. A Collection with no Entries shows the entry table empty state.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
    });
    await navigateToCollection(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(mainWindow.getByText('No results.')).toBeVisible();
  });

  test('draws every one of them with the one component on the one gradient', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    // Every screen that can stand empty, with what it says when it does. The
    // Collections route is in here because it used to say its line in plain
    // text rather than through the component.
    await navigate(mainWindow, '#/projects');
    await expect(emptyState(mainWindow)).toBeVisible();
    const welcome = await gradientOf(mainWindow);
    expect(welcome.image).toContain('linear-gradient');
    expect(welcome.isDark).toBe(true);

    const project = await createProjectViaIpc(mainWindow);
    const screens: { hash: string; says: string }[] = [
      { hash: `#/projects/${project.id}/assets`, says: 'No Assets yet' },
      { hash: `#/projects/${project.id}/releases`, says: 'No Releases yet' },
      {
        hash: `#/projects/${project.id}/components`,
        says: 'No Components yet',
      },
      {
        hash: `#/projects/${project.id}/collections`,
        says: 'No Collections yet',
      },
    ];

    for (const screen of screens) {
      await navigate(mainWindow, screen.hash);
      await expect(
        emptyState(mainWindow).getByText(screen.says),
        `on ${screen.hash}`
      ).toBeVisible();
      const painted = await gradientOf(mainWindow);
      expect(painted.image, `on ${screen.hash}`).toContain('linear-gradient');
      expect(painted.isDark, `on ${screen.hash}`).toBe(true);
    }
  });

  test('leaves a filter without matches plain, since the page is not empty', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await createProjectViaIpc(mainWindow, { name: 'Used cars' });
    await navigate(mainWindow, '#/projects');
    await expect(mainWindow.getByText('Used cars')).toBeVisible();

    // A page that holds something is never empty, however little the filter
    // leaves of it, so it says so in plain text without the gradient.
    await mainWindow.getByLabel('Filter Projects').fill('nothing matches this');
    await expect(
      mainWindow.getByText('No Project matches the filter.')
    ).toBeVisible();
    await expect(emptyState(mainWindow)).toBeHidden();
  });
});

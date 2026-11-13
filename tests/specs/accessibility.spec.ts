import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import { createCollectionViaIpc } from '../helpers/collection.js';
import { createComponentViaIpc } from '../helpers/component.js';
import { createEntryViaIpc, stringValue } from '../helpers/entry.js';
import {
  navigate,
  projectCard,
  waitForProjectCard,
} from '../helpers/navigation.js';
import {
  addProjectLanguageViaIpc,
  createProjectViaIpc,
  setRemoteOriginUrlViaIpc,
} from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import { MINIMUM_WINDOW_SIZE, resizeWindow } from '../helpers/window.js';

/** What a route's `arrange` hands the scan. */
interface Arranged {
  /** The hash the scan opens. */
  hash: string;
  /** The name of the Project the route is inside, where it is inside one. */
  project?: string;
}

/**
 * Wait until a route inside a Project has settled, so the scan reads the route
 * itself rather than what stands in for it while the Project is read.
 *
 * Until the Project is read, the sidebar is a skeleton, and a screen that
 * needs the Project draws nothing, so a scan then finds no heading and no main
 * landmark. Once it is read, the card checks the Project's Git repository, and
 * Sync and Check now fade in when the check answers. A scan that catches one
 * of them mid-fade measures a contrast neither keeps.
 */
async function waitForArrangedRoute(
  page: Page,
  arranged: Arranged
): Promise<void> {
  if (arranged.project === undefined) {
    return;
  }

  await waitForProjectCard(page, arranged.project);
  // The card draws a skeleton line until its check has answered. The check
  // asks the Git repository, so it is given the slack of a slow network.
  await expect(projectCard(page).locator('[data-slot="skeleton"]')).toHaveCount(
    0,
    { timeout: 20000 }
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-slot="project-card"]')
            ?.getAnimations({ subtree: true }).length ?? 0
      )
    )
    .toBe(0);
}

// Per-route accessibility assertions, opt-in ahead of the fixture-wide axe
// assertion the @todo still defers (see testing.md). Each route enforces every
// axe rule, color-contrast included. Add a route here once it is clean enough
// to enforce.
//
// `arrange` seeds whatever the route needs and returns the hash to scan, with
// the Project the route is inside, so a route inside a Project can be enforced
// too.
const enforcedRoutes: {
  name: string;
  arrange: (page: Page) => Promise<Arranged> | Arranged;
}[] = [
  {
    name: '#/projects',
    arrange: () => ({ hash: '#/projects' }),
  },
  // A Project's Releases, empty, which also puts the Project sidebar and a
  // Project's breadcrumb under the scan.
  {
    name: '#/projects/:projectId/releases',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return {
        hash: `#/projects/${project.id}/releases`,
        project: project.name,
      };
    },
  },
  // A Project's Components, empty.
  {
    name: '#/projects/:projectId/components',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return {
        hash: `#/projects/${project.id}/components`,
        project: project.name,
      };
    },
  },
  // The Component create form, which puts the field definitions editor and its
  // Add Field button under the scan.
  {
    name: '#/projects/:projectId/components/create',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return {
        hash: `#/projects/${project.id}/components/create`,
        project: project.name,
      };
    },
  },
  // One Component's configure form, with a field definition preview and its
  // reorder, edit and remove chrome.
  {
    name: '#/projects/:projectId/components/:componentId',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      const component = await createComponentViaIpc(page, {
        projectId: project.id,
      });
      return {
        hash: `#/projects/${project.id}/components/${component.id}`,
        project: project.name,
      };
    },
  },
];

/**
 * The screens an editor meets on the first day, scanned in both modes at the
 * smallest window the app supports.
 *
 * Each of them stands on the one gradient or lists cards on it, and the
 * gradient always carries the dark mode colors, so light mode is the case where
 * both a dark surface and a light card on it have to pass at once.
 */
const firstDayRoutes: {
  name: string;
  arrange: (page: Page) => Promise<Arranged> | Arranged;
}[] = [
  // The first start, which is the one screen before a User exists.
  {
    name: '#/welcome',
    arrange: () => ({ hash: '#/welcome' }),
  },
  // The Projects page with nothing on it, which is the Welcome screen.
  {
    name: '#/projects, empty',
    arrange: async (page) => {
      await setUserViaIpc(page);
      return { hash: '#/projects' };
    },
  },
  // The Projects page with cards, one of them on a Git repository nothing can
  // reach, so the warning line is under the scan too.
  {
    name: '#/projects, with cards',
    arrange: async (page) => {
      await setUserViaIpc(page);
      await createProjectViaIpc(page, { name: 'Only here' });
      const synced = await createProjectViaIpc(page, { name: 'On a host' });
      await setRemoteOriginUrlViaIpc(page, {
        id: synced.id,
        url: 'https://example.invalid/on-a-host.git',
      });
      return { hash: '#/projects' };
    },
  },
  // Create Project, with the address its second option asks for shown.
  {
    name: '#/projects/create',
    arrange: async (page) => {
      await setUserViaIpc(page);
      return { hash: '#/projects/create' };
    },
  },
];

/**
 * The Assets grid with an Asset open beside it, the Dashboard, both pages of a
 * Project's Settings and the Profile, scanned in both modes at the smallest
 * window the app supports.
 *
 * Each of them is a form or a ruled row of facts on the panel's own surface, so
 * contrast and a visible focus ring have to hold in light and dark mode alike.
 */
const projectAndProfileRoutes: {
  name: string;
  arrange: (page: Page) => Promise<Arranged> | Arranged;
}[] = [
  // Assets, with one card open, so the grid, the card that is marked current
  // and the pane's form are all under the scan.
  {
    name: '#/projects/:projectId/assets/:assetId',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      const asset = await createAssetViaIpc(page, {
        projectId: project.id,
        filePath: makeTempFile(test.info(), 'showroom.png', pngBytes),
      });
      return {
        hash: `#/projects/${project.id}/assets/${asset.id}`,
        project: project.name,
      };
    },
  },
  // An Entry in its three panes, with a Value one language is missing, so the
  // switch's marks, the warning at the field and the badge in the list are all
  // under the scan.
  {
    name: '#/projects/:projectId/collections/:collectionId/:entryId/update',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      const collection = await createCollectionViaIpc(page, {
        projectId: project.id,
      });
      const entry = await createEntryViaIpc(page, {
        projectId: project.id,
        collectionId: collection.id,
        values: { title: stringValue({ en: 'Spring opening hours' }) },
      });
      // The language is added after the Entry was written, which is how an
      // Entry ends up missing a required Value: Core refuses one that does.
      await addProjectLanguageViaIpc(page, project, 'de');
      return {
        hash: `#/projects/${project.id}/collections/${collection.id}/${entry.id}/update?language=de`,
        project: project.name,
      };
    },
  },
  {
    name: '#/projects/:projectId/dashboard',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return {
        hash: `#/projects/${project.id}/dashboard`,
        project: project.name,
      };
    },
  },
  {
    name: '#/projects/:projectId/settings/general',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return {
        hash: `#/projects/${project.id}/settings/general`,
        project: project.name,
      };
    },
  },
  // Sync with an address that carries a password, so the masked part is under
  // the scan too.
  {
    name: '#/projects/:projectId/settings/version-control',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      await setRemoteOriginUrlViaIpc(page, {
        id: project.id,
        url: 'https://mara-klein:a-token@example.invalid/website.git',
      });
      return {
        hash: `#/projects/${project.id}/settings/version-control`,
        project: project.name,
      };
    },
  },
  {
    name: '#/user/profile',
    arrange: () => ({ hash: '#/user/profile' }),
  },
];

test.describe('Accessibility', () => {
  for (const route of enforcedRoutes) {
    test(`has no axe violations on ${route.name}`, async ({ mainWindow }) => {
      // A User keeps the app chrome in its normal state, matching what the scan
      // was validated against, and every seed below needs one.
      await setUserViaIpc(mainWindow);
      const arranged = await route.arrange(mainWindow);
      await navigate(mainWindow, arranged.hash);
      await waitForArrangedRoute(mainWindow, arranged);
      await expectNoAxeViolations(mainWindow);
    });
  }

  for (const route of projectAndProfileRoutes) {
    for (const theme of ['light', 'dark'] as const) {
      test(`has no axe violations on ${route.name} in ${theme} mode`, async ({
        electronApp,
        mainWindow,
      }) => {
        await setUserViaIpc(mainWindow);
        const arranged = await route.arrange(mainWindow);
        await navigate(mainWindow, arranged.hash);
        await setTheme(mainWindow, theme);
        await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
        await waitForArrangedRoute(mainWindow, arranged);
        await expectNoAxeViolations(mainWindow);
      });
    }
  }

  for (const route of firstDayRoutes) {
    for (const theme of ['light', 'dark'] as const) {
      test(`has no axe violations on ${route.name} in ${theme} mode`, async ({
        electronApp,
        mainWindow,
      }) => {
        const arranged = await route.arrange(mainWindow);
        await navigate(mainWindow, arranged.hash);
        await setTheme(mainWindow, theme);
        await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
        await waitForArrangedRoute(mainWindow, arranged);

        if (arranged.hash === '#/projects/create') {
          // The address stands inside the option that asks for it, so it is on
          // screen only once that option is chosen.
          await mainWindow
            .getByRole('radio', { name: 'Another Git host' })
            .click();
          await expect(
            mainWindow.getByLabel('Address', { exact: true })
          ).toBeVisible();
        }

        await expectNoAxeViolations(mainWindow);
      });
    }
  }
});

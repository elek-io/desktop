import { type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

// Per-route accessibility assertions, opt-in ahead of the fixture-wide axe
// assertion the @todo still defers (see testing.md). Each route enforces every
// axe rule except the ones in `disableRules`, which scope out issues the route
// does not pass yet (an app-wide color-contrast issue). Add a route here once it
// is clean enough to enforce.
//
// `arrange` seeds whatever the route needs and returns the hash to scan, so a
// route inside a Project can be enforced too.
const enforcedRoutes: {
  name: string;
  disableRules: string[];
  arrange: (page: Page) => Promise<string> | string;
}[] = [
  // The Projects list (empty) passes every rule except the app-wide
  // color-contrast issue, so it is the first enforced route.
  {
    name: '#/projects',
    disableRules: ['color-contrast'],
    arrange: () => '#/projects',
  },
  // A Project's Releases, empty, which also puts the Project sidebar and a
  // Project's breadcrumb under the scan.
  {
    name: '#/projects/:projectId/releases',
    disableRules: ['color-contrast'],
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return `#/projects/${project.id}/releases`;
    },
  },
];

test.describe('Accessibility', () => {
  for (const route of enforcedRoutes) {
    test(`has no axe violations on ${route.name}`, async ({ mainWindow }) => {
      // A User keeps the app chrome in its normal state, matching what the scan
      // was validated against, and every seed below needs one.
      await setUserViaIpc(mainWindow);
      await navigate(mainWindow, await route.arrange(mainWindow));
      await expectNoAxeViolations(mainWindow, {
        disableRules: route.disableRules,
      });
    });
  }
});

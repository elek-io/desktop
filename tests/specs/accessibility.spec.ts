import { type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import { createComponentViaIpc } from '../helpers/component.js';
import { navigate } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

// Per-route accessibility assertions, opt-in ahead of the fixture-wide axe
// assertion the @todo still defers (see testing.md). Each route enforces every
// axe rule, color-contrast included. Add a route here once it is clean enough
// to enforce.
//
// `arrange` seeds whatever the route needs and returns the hash to scan, so a
// route inside a Project can be enforced too.
const enforcedRoutes: {
  name: string;
  arrange: (page: Page) => Promise<string> | string;
}[] = [
  {
    name: '#/projects',
    arrange: () => '#/projects',
  },
  // A Project's Releases, empty, which also puts the Project sidebar and a
  // Project's breadcrumb under the scan.
  {
    name: '#/projects/:projectId/releases',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return `#/projects/${project.id}/releases`;
    },
  },
  // A Project's Components, empty.
  {
    name: '#/projects/:projectId/components',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return `#/projects/${project.id}/components`;
    },
  },
  // The Component create form, which puts the field definitions editor and its
  // Add Field button under the scan.
  {
    name: '#/projects/:projectId/components/create',
    arrange: async (page) => {
      const project = await createProjectViaIpc(page);
      return `#/projects/${project.id}/components/create`;
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
      return `#/projects/${project.id}/components/${component.id}`;
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
      await expectNoAxeViolations(mainWindow);
    });
  }
});

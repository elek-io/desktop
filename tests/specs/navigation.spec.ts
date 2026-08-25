import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { createCollectionViaIpc } from '../helpers/collection.js';
import { createEntryViaIpc, stringValue } from '../helpers/entry.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
} from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

/**
 * Boot the app fresh at `fromHash` and assert it redirects to `toHash`.
 *
 * The `navigate` helper asserts the requested hash equals the final hash, which
 * a redirect breaks by definition, so this drives the boot (goto + reload, like
 * `navigate`) and then verifies the redirected destination instead.
 */
async function expectRedirect(
  page: Page,
  fromHash: string,
  toHash: string
): Promise<void> {
  const base = page.url().split('#')[0];
  await page.goto(`${base}${fromHash}`);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await verifyCurrentRouteHash(page, toHash);
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

  test('global chrome shows version info and navigates', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The dashboard gives a non-trivial breadcrumb trail (Projects > name > ...).
    await navigateToProjectDashboard(mainWindow, project.id);

    // The app-header (banner landmark) holds the single "elek.io Desktop"
    // version dropdown trigger.
    const versionTrigger = mainWindow.getByRole('banner').getByRole('button');
    await versionTrigger.click();

    // Only version rows render in the dropdown now. Reporting used to live here
    // as a "Report an issue" link out to GitHub and moved to the in-app dialog
    // behind the header's Feedback button, covered by reports.spec.ts.
    await expect(
      mainWindow.getByRole('menuitem', { name: 'Report an issue' })
    ).toBeHidden();
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
      // Each row appends a non-empty "v…" value; "v" only occurs in that value.
      await expect(row).toContainText(/v\S/);
    }
    // Close the dropdown so it does not intercept the following interactions.
    await mainWindow.keyboard.press('Escape');

    // Back/forward drive the router history. An in-app navigation (no reload)
    // pushes a history entry, so back returns to the dashboard and forward
    // returns to the pushed route.
    await mainWindow.getByRole('button', { name: 'Full History' }).click();
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
});

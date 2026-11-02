import { expect, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { createCollectionViaIpc } from '../helpers/collection.js';
import { createEntryViaIpc, stringValue } from '../helpers/entry.js';
import {
  externalOpens,
  recordExternalOpensViaIpc,
} from '../helpers/external.js';
import { bootOnHash, verifyCurrentRouteHash } from '../helpers/navigation.js';
import {
  createProjectViaIpc,
  navigateToProjectDashboard,
} from '../helpers/project.js';
import { openHelpMenu } from '../helpers/report.js';
import { setUserViaIpc } from '../helpers/user.js';

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
      // Each row appends a non-empty "v…" value; "v" only occurs in that value.
      await expect(row).toContainText(/v\S/);
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

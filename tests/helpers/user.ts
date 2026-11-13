import { expect, type Page } from '@playwright/test';

import type { SetUserProps, User } from '@elek-io/core';

import { navigate } from './navigation.js';

// SetUserProps is a local | cloud union. The tests only ever set a local User,
// so overrides target that branch to keep the userType discriminant intact.
type LocalUserProps = Extract<SetUserProps, { userType: 'local' }>;

/**
 * Set a local User over IPC.
 *
 * Core stamps the git author from the current User, so a User must exist
 * before any write. This talks to `window.ipc` directly through
 * `page.evaluate`, which runs in the renderer where the bridge is exposed.
 */
export async function setUserViaIpc(
  page: Page,
  overrides: Partial<LocalUserProps> = {}
): Promise<User> {
  const props: LocalUserProps = {
    userType: 'local',
    // A local User never has an elek.io account id. It is what tells the two
    // kinds of User apart, so it is set rather than left off.
    id: null,
    name: 'Test User',
    email: 'test@elek.io',
    language: 'en',
    localApi: {
      port: 31310,
      isEnabled: false,
    },
    ...overrides,
  };

  const user = await page.evaluate(
    async (props) => window.ipc.core.user.set(props),
    props
  );

  // The gate in front of every screen settles on the first start while there is
  // no User, so a window sitting there is sent on: the renderer reads the User
  // on its next load. Every other screen is left where it is.
  if (new URL(page.url()).hash === '#/welcome') {
    await page.reload();
    await expect(page).toHaveURL(/#\/projects$/);
  }

  return user;
}

/** Route to the first start, which is where every address settles without a User. */
export async function navigateToFirstStart(page: Page): Promise<void> {
  await navigate(page, '#/welcome');
}

/**
 * Walk the first start, which is the one way to get a User through the app.
 *
 * Nothing in Desktop can be written before one exists, so every spec that
 * drives a screen after it either comes through here or seeds a User with
 * `setUserViaIpc`.
 */
export async function completeFirstStart(
  page: Page,
  props: { name?: string; email?: string } = {}
): Promise<void> {
  const { name = 'Test User', email = 'test@elek.io' } = props;

  await navigateToFirstStart(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/#\/projects$/);
}

/** Route to the User profile page and confirm the app rendered there. */
export async function navigateToUserProfile(page: Page): Promise<void> {
  await navigate(page, '#/user/profile');
}

/**
 * Read whether Core's local API is currently running, over IPC.
 *
 * The API lifecycle is driven from the main process, so this observes it there
 * rather than through the renderer. Used to assert the desktop app started or
 * stopped the API in response to the profile's Enabled toggle (P2-11).
 */
export async function apiIsRunningViaIpc(page: Page): Promise<boolean> {
  return page.evaluate(async () => window.ipc.core.api.isRunning());
}

/**
 * Wait until the User set over IPC has reached the renderer's query cache.
 *
 * The report dialog reads its contact block out of that cache at the moment it
 * opens (see report-dialog.tsx), so a dialog opened while the user query is
 * still loading shows an empty contact even though a User exists. The header's
 * user dropdown carries the name, so it appearing is the signal.
 */
export async function waitForUserLoaded(
  page: Page,
  name = 'Test User'
): Promise<void> {
  await expect(
    page.getByRole('button', { name: new RegExp(name) })
  ).toBeVisible();
}

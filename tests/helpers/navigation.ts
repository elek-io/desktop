import { expect, type Page } from '@playwright/test';

/**
 * Verify that the current route hash matches the expected hash
 *
 * Retries until the hash matches, since route redirects
 * like "/" to "/projects" happen client side
 */
export async function verifyCurrentRouteHash(
  page: Page,
  expectedHash: string
): Promise<void> {
  await expect(page).toHaveURL((url) => url.hash === expectedHash);
}

/**
 * Reload the renderer and wait for the app to remount.
 *
 * This reloads only the renderer, the main process and Core stay alive, so it
 * proves the renderer re-fetches persisted state from Core, not survival across
 * a full process restart.
 */
export async function reloadWindow(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
}

/**
 * Boot the app fresh on a hash and wait for the route it settles on.
 *
 * The renderer uses hash based routing, so pointing the URL at the hash and
 * reloading boots the app fresh on that route. Booting fresh matters for
 * arranged state, since an IPC seed does not touch the renderer's query cache,
 * so the route refetches from Core on this load. `goto` only sets the fragment
 * (a same-document navigation), the following `reload` is what boots fresh.
 *
 * A reload issued that soon after a fragment only navigation can commit the
 * document without the fragment. The app then boots on `/`, whose redirect
 * leaves it on `/projects`, and the route under test never mounts. Each
 * attempt below is a whole fresh boot, so the pair is retried until the router
 * has settled, rather than waited on with one URL assertion that can only time
 * out. `settledHash` differs from `hash` only where the route redirects.
 */
export async function bootOnHash(
  page: Page,
  hash: string,
  settledHash: string = hash
): Promise<void> {
  const base = page.url().split('#')[0];
  await expect(async () => {
    await page.goto(`${base}${hash}`);
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    expect(new URL(page.url()).hash).toBe(settledHash);
  }).toPass({ timeout: 8000, intervals: [250, 1000, 2000] });
}

/**
 * Navigate to a route by its hash and wait for the app to render there.
 *
 * For a route that redirects elsewhere, call `bootOnHash` with the hash the
 * router settles on.
 */
export async function navigate(page: Page, hash: string): Promise<void> {
  await bootOnHash(page, hash);
}

import { expect, type Locator, type Page } from '@playwright/test';

/** The Project's sidebar, which every screen inside a Project stands beside. */
export function projectSidebar(page: Page): Locator {
  return page.locator('[data-slot="sidebar"]');
}

/**
 * The Project card at the top of the sidebar: the switcher, what state the
 * Project is in, its last Release and Sync.
 */
export function projectCard(page: Page): Locator {
  return page.locator('[data-slot="project-card"]');
}

/**
 * The main panel, which is what a screen itself draws.
 *
 * Anything a screen shows is looked for in here rather than in the window,
 * because the Project's sidebar beside it carries links of its own, such as
 * Create Collection and one per Collection, which a name a screen shares with
 * one of them would match too.
 */
export function mainPanel(page: Page): Locator {
  return page.locator('[data-slot="panel"]');
}

/**
 * What the Project's navigation lists, top to bottom, by the name each row
 * shows.
 *
 * A row's name is its first span, so a count beside it, and the words a screen
 * reader hears instead of that count, stay out of the order.
 */
export async function navigationRows(page: Page): Promise<string[]> {
  return page
    .locator('[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('span')?.textContent?.trim() ?? '')
    );
}

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

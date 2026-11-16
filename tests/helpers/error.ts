import { type Locator, type Page } from '@playwright/test';

/**
 * The title of the screen that replaces the whole view when an error reaches
 * the root boundary.
 *
 * Named once here, because every spec about where a failure ends up asserts
 * this screen, and its words are the error screen's own to change.
 */
export const ERROR_SCREEN_TITLE = 'An unexpected error stopped this screen';

/**
 * The error screen's title, which is what says a failure reached the root
 * boundary rather than being answered in place.
 */
export function errorScreenTitle(page: Page): Locator {
  return page.getByRole('heading', { name: ERROR_SCREEN_TITLE });
}

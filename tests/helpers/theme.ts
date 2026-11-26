import { expect, type Page } from '@playwright/test';

/** The key the ThemeProvider keeps the choice under. */
const THEME_STORAGE_KEY = 'desktop-theme';

/**
 * Put the app in one theme and wait until the root carries it.
 *
 * The choice is written where the ThemeProvider reads it and the renderer is
 * reloaded, so the app applies the theme through its own provider rather than
 * through a class the test sets.
 */
export async function setTheme(
  page: Page,
  theme: 'light' | 'dark'
): Promise<void> {
  await page.evaluate((value) => {
    localStorage.setItem('desktop-theme', value);
  }, theme);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

export { THEME_STORAGE_KEY };

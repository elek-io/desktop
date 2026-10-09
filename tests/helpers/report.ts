import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The report dialog, scoped so its controls are never confused with the
 * triggers that opened it (both say "Report a bug").
 */
export function reportDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/** Open the report dialog from the header button that is on every route. */
export async function openReportDialogFromHeader(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Feedback' }).click();

  const dialog = reportDialog(page);
  await expect(dialog).toBeVisible();

  return dialog;
}

/**
 * Switch the open dialog between its two forms. The segmented control and the
 * dialog title share a label, so this asserts the title, which only the active
 * form sets.
 */
export async function switchReportMode(
  dialog: Locator,
  mode: 'Report a bug' | 'Share feedback'
): Promise<void> {
  await dialog.getByRole('button', { name: mode, exact: true }).click();
  await expect(dialog.getByRole('heading', { name: mode })).toBeVisible();
}

/**
 * Close the report dialog with its Cancel button. Escape and a click outside do
 * not close it, so a stray one cannot throw away what the user wrote.
 */
export async function closeReportDialog(page: Page): Promise<void> {
  const dialog = reportDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
}

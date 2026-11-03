import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Confirm an open shadcn Dialog / AlertDialog by clicking its confirm button.
 * Scoped to the open dialog so the confirm button is not confused with the
 * trigger that opened it (their labels often differ, e.g. "Delete Collection"
 * vs "Yes, delete this Collection").
 *
 * Matches either role: a `Dialog` exposes `role="dialog"`, an `AlertDialog`
 * (used for destructive confirms like the Asset delete) exposes
 * `role="alertdialog"`. Only one is ever open at a time, so the `.or` resolves
 * to a single element.
 */
export async function confirmDialog(
  page: Page,
  confirmName: string
): Promise<void> {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirmName }).click();
}

/**
 * Dismiss an open dialog with the Escape key.
 *
 * A dialog is visible before it has finished opening, and an Escape that
 * arrives during the entry transition is swallowed, which made this flaky. The
 * dialog carries `data-starting-style` while it enters, so the key is pressed
 * once that is gone.
 *
 * Matches either role, like `confirmDialog`: a `Dialog` exposes `role="dialog"`
 * and one that answers something the person is waiting for, such as a failed
 * sync, exposes `role="alertdialog"`. Only one is ever open at a time, so the
 * `.or` resolves to a single element.
 */
export async function dismissDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute('data-starting-style');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/**
 * Stub the native file-picker dialogs in the MAIN process.
 *
 * The dialog IPC handlers capture `dialog.showOpenDialog` / `showSaveDialog` by
 * reference at registration, so reassigning them at runtime would not intercept.
 * Instead this removes the existing handler and registers a replacement that
 * returns a canned, non-cancelled result. It has to run in main, not the
 * renderer: `contextBridge.exposeInMainWorld` freezes `window.ipc` and the calls
 * forward to Electron's `dialog` in the main process.
 *
 * Pass `open` (the paths an open dialog resolves to) and/or `save` (the path a
 * save dialog resolves to). Only the channels you pass are replaced.
 */
export async function stubFileDialog(
  electronApp: ElectronApplication,
  results: { open?: string[]; save?: string }
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, canned) => {
    if (canned.open !== undefined) {
      const filePaths = canned.open;
      ipcMain.removeHandler('electron:dialog:showOpenDialog');
      ipcMain.handle('electron:dialog:showOpenDialog', () => ({
        canceled: false,
        filePaths,
      }));
    }

    if (canned.save !== undefined) {
      const filePath = canned.save;
      ipcMain.removeHandler('electron:dialog:showSaveDialog');
      ipcMain.handle('electron:dialog:showSaveDialog', () => ({
        canceled: false,
        filePath,
      }));
    }
  }, results);
}

import {
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * What the app handed a native file dialog, of the keys a spec asserts.
 *
 * `properties` is read to say that the save dialog sets none: on macOS none of
 * them touches the name field, and the file goes where the person picked it.
 */
export interface FileDialogOptions {
  title?: string;
  buttonLabel?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}

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
 */
async function dismiss(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute('data-starting-style');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/** Dismiss an open `Dialog`, which exposes `role="dialog"`. */
export async function dismissDialog(page: Page): Promise<void> {
  await dismiss(page, page.getByRole('dialog'));
}

/**
 * Dismiss an open dialog that answers something the person is waiting for,
 * such as a failed sync, which exposes `role="alertdialog"`.
 *
 * Addressed by that role rather than by either, because a confirm step is an
 * `AlertDialog` too and both can be mounted at once, which a locator over the
 * two roles would resolve to.
 */
export async function dismissAlertDialog(page: Page): Promise<void> {
  await dismiss(page, page.getByRole('alertdialog'));
}

/**
 * Stub the native file-picker dialogs in the MAIN process, and record what the
 * app asked them for.
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
 *
 * The options of every call are kept in the main process, where
 * `lastSaveDialogOptions` and `lastOpenDialogOptions` read them back. No test
 * can drive a native panel, so what the app asks for is what a spec asserts,
 * and the panel itself is the hand check in contributing/testing.md.
 */
export async function stubFileDialog(
  electronApp: ElectronApplication,
  results: { open?: string[]; save?: string }
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, canned) => {
    globalThis.fileDialogCalls = globalThis.fileDialogCalls ?? [];

    if (canned.open !== undefined) {
      const filePaths = canned.open;
      ipcMain.removeHandler('electron:dialog:showOpenDialog');
      ipcMain.handle(
        'electron:dialog:showOpenDialog',
        (_event, options: unknown) => {
          globalThis.fileDialogCalls?.push({ dialog: 'open', options });
          return { canceled: false, filePaths };
        }
      );
    }

    if (canned.save !== undefined) {
      const filePath = canned.save;
      ipcMain.removeHandler('electron:dialog:showSaveDialog');
      ipcMain.handle(
        'electron:dialog:showSaveDialog',
        (_event, options: unknown) => {
          globalThis.fileDialogCalls?.push({ dialog: 'save', options });
          return { canceled: false, filePath };
        }
      );
    }
  }, results);
}

/** What the app asked the last save dialog for, or `null` when it opened none. */
export async function lastSaveDialogOptions(
  electronApp: ElectronApplication
): Promise<FileDialogOptions | null> {
  return lastFileDialogOptions(electronApp, 'save');
}

/** What the app asked the last open dialog for, or `null` when it opened none. */
export async function lastOpenDialogOptions(
  electronApp: ElectronApplication
): Promise<FileDialogOptions | null> {
  return lastFileDialogOptions(electronApp, 'open');
}

async function lastFileDialogOptions(
  electronApp: ElectronApplication,
  dialog: 'open' | 'save'
): Promise<FileDialogOptions | null> {
  return electronApp.evaluate((_electron, which) => {
    const calls = (globalThis.fileDialogCalls ?? []).filter(
      (call) => call.dialog === which
    );
    const last = calls.at(-1);

    return last === undefined ? null : (last.options as FileDialogOptions);
  }, dialog);
}

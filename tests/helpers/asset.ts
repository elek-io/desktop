import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFileSync } from 'node:fs';

import type { Asset, CreateAssetProps, ReadAssetProps } from '@elek-io/core';

import { mainPanel } from './navigation.js';

/**
 * A minimal valid 1x1 PNG.
 *
 * Core derives an Asset's `mimeType` and `extension` from the file path via the
 * `mime` package, so the extension of the name passed to `makeTempFile` is what
 * sets the type. The bytes still need to be a real image so the teaser's preview
 * loads without a failed-resource console error tripping the fixture's check.
 */
export const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** A minimal valid 1x1 baseline JPEG, the counterpart of `pngBytes` for the replace flow. */
export const jpegBytes = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD/2Q==',
  'base64'
);

/**
 * Write `bytes` to a file under the test output directory and return its path.
 *
 * Runs on the runner (Node side) with `node:fs`, so the returned path is a real
 * file the main-process file-dialog stub can hand to Core. The extension of
 * `name` decides the derived `mimeType`/`extension`, so name it `.png`, `.jpg`
 * and so on to match the bytes.
 */
export function makeTempFile(
  testInfo: TestInfo,
  name: string,
  bytes: Buffer
): string {
  const path = testInfo.outputPath(name);
  writeFileSync(path, bytes);
  return path;
}

/**
 * Delete an Asset directly over IPC, bypassing the UI.
 *
 * Use it to arrange what two windows do to each other: an Asset that is gone
 * by the time a form that chose it is saved. Core blocks the delete while a
 * saved Entry still references it, so the Entry in such a test is one that has
 * not been saved yet.
 */
export async function deleteAssetViaIpc(
  page: Page,
  props: { projectId: string; id: string; extension: string }
): Promise<void> {
  await page.evaluate(async (p) => window.ipc.core.assets.delete(p), props);
}

/**
 * Create an Asset directly over IPC, bypassing the UI and the native file dialog.
 *
 * Use this to arrange an Asset a test depends on but does not itself verify.
 * `filePath` must point at a real file (see `makeTempFile`), since Core copies
 * the binary into the Project. To exercise the create flow through the form and
 * the file picker, drive the Assets route with `stubFileDialog`.
 */
export async function createAssetViaIpc(
  page: Page,
  props: {
    projectId: string;
    filePath: string;
    name?: string;
    description?: string;
  }
): Promise<Asset> {
  const createProps: CreateAssetProps = {
    name: props.name ?? 'Test Asset',
    description: props.description ?? 'An Asset created by the E2E tests',
    projectId: props.projectId,
    filePath: props.filePath,
  };

  return page.evaluate(
    async (p) => window.ipc.core.assets.create(p),
    createProps
  );
}

/**
 * Read an Asset directly over IPC, bypassing the UI.
 *
 * Use it to say what a save did to the stored Asset, such as a rename that
 * left its file alone: the extension, the type and the size are what Core
 * derives from the file, so they are what says whether the file changed.
 */
export async function readAssetViaIpc(
  page: Page,
  props: { projectId: string; id: string }
): Promise<Asset> {
  const readProps: ReadAssetProps = {
    projectId: props.projectId,
    id: props.id,
  };

  return page.evaluate(async (p) => window.ipc.core.assets.read(p), readProps);
}

/**
 * One card of the Assets grid, by the file name it shows.
 *
 * Scoped to the main panel, because the breadcrumb names the open Asset the
 * same way and carries the link role too.
 */
export function assetCard(page: Page, fileName: string): Locator {
  return mainPanel(page).getByRole('link', {
    name: new RegExp(`^${fileName.replace(/[.*+?^$()[\]{}|\\]/g, '\\$&')}`),
  });
}

/** The Assets grid, which the screen and the Asset picker both draw. */
export function assetGrid(page: Page): Locator {
  return page.locator('[data-slot="asset-card"]');
}

/**
 * The file names of the grid's cards, in the order the grid shows them.
 *
 * Core answers the Assets of a Project in no particular order, so a test that
 * is about where a card stands reads the order rather than assuming one.
 */
export async function assetGridOrder(page: Page): Promise<string[]> {
  return assetGrid(page).evaluateAll((cards) =>
    cards.map(
      (card) =>
        card
          .querySelector('[data-slot="asset-card-name"]')
          ?.textContent?.trim() ?? ''
    )
  );
}

/** The pane beside the grid, which an opened or an added Asset fills. */
export function assetPane(page: Page): Locator {
  return page.locator('[data-slot="asset-pane"]');
}

/**
 * Open an Asset's pane from its card in the grid, by the file name the card
 * shows.
 */
export async function openAsset(page: Page, fileName: string): Promise<void> {
  await assetCard(page, fileName).click();
  await expect(
    assetPane(page).getByRole('button', { name: `More for ${fileName}` })
  ).toBeVisible();
}

/**
 * Delete the Asset whose pane is open, through its More menu and the confirm
 * ci rules for deleting.
 */
export async function deleteOpenAsset(
  page: Page,
  fileName: string
): Promise<void> {
  await page.getByRole('button', { name: `More for ${fileName}` }).click();
  await page.getByRole('menuitem', { name: 'Delete Asset' }).click();
  await expect(page.getByText(`Delete ${fileName}?`)).toBeVisible();
  await page.getByRole('button', { name: 'Delete Asset' }).click();
}

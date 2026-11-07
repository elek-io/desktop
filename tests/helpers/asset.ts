import { type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';

import type { Asset, CreateAssetProps } from '@elek-io/core';

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

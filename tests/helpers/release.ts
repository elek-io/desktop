import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

import {
  uuid,
  type ListReleasesProps,
  type ReleaseListItem,
} from '@elek-io/core';

import { navigate } from './navigation.js';

/** Route to a Project's Releases and confirm the app rendered there. */
export async function navigateToReleases(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/releases`);
}

/**
 * Open the Release dialog from the Releases page and wait for it to have read
 * what a Release would publish.
 *
 * The read runs on open and shows a skeleton while it is in flight, so the
 * dialog is only settled once either its primary button or one of the two
 * sentences that replace it is on screen.
 */
export async function openReleaseDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Release', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .getByRole('button', { name: 'Create Release' })
      .or(dialog.getByRole('alert'))
      .or(dialog.getByText('nothing to release'))
  ).toBeVisible();
}

/**
 * List a Project's Releases directly over IPC, bypassing the UI.
 *
 * Used to arrange or corroborate a precondition, such as a Project that holds
 * no Release yet.
 */
export async function listReleasesViaIpc(
  page: Page,
  props: ListReleasesProps
): Promise<{ list: ReleaseListItem[]; total: number }> {
  return page.evaluate(async (p) => window.ipc.core.releases.list(p), props);
}

/**
 * Tag a preview Release on a Project's git repository, on the runner.
 *
 * elek.io Desktop cannot make one (see not-yet-implemented.md), so this is how
 * a test arranges the one a Project can hold anyway, made by another tool, and
 * checks that the list marks it rather than showing it as the version a site
 * builds from. Core reads a tag's kind and version from its trailers and
 * addresses it by its name, which has to be a UUID, so the tag is written the
 * way Core writes one, like `coreCommitMessage` in `remote.ts`.
 */
export function tagPreviewRelease(dir: string, version: string): string {
  const id = uuid();
  execFileSync('git', [
    '-C',
    dir,
    // Identity is set inline, since a Project's repository carries none
    '-c',
    'user.name=E2E Preview',
    '-c',
    'user.email=e2e-preview@example.com',
    'tag',
    '--annotate',
    id,
    '-m',
    `Preview ${version}\n\nType: preview\nVersion: ${version}`,
  ]);
  return id;
}

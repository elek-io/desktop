import { type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GitMessage } from '@elek-io/core';

/** The branch all content edits happen on (see Core's git-and-sync docs). */
const DRAFT_BRANCH = 'draft';

/** The branch a Release promotes content to (see Core's git-and-sync docs). */
const MAIN_BRANCH = 'main';

/**
 * Build a Core-shaped commit message: a subject line followed by the git
 * trailers Core stamps on every commit (see Core's git-and-sync docs).
 *
 * getChanges only reports commits it can parse back into a Core commit (its
 * `log` filters on those trailers), so an out-of-band remote commit must carry
 * them to register as `behind`, exactly as a real collaborator's Core push
 * would. A plain commit without trailers is invisible to getChanges.
 */
function coreCommitMessage(message: GitMessage): string {
  const lines = [
    `${message.method} ${message.reference.objectType} ${message.reference.id}`,
    '',
    `Method: ${message.method}`,
    `Object-Type: ${message.reference.objectType}`,
    `Object-Id: ${message.reference.id}`,
  ];
  if (message.reference.collectionId !== undefined) {
    lines.push(`Collection-Id: ${message.reference.collectionId}`);
  }
  return lines.join('\n');
}

/**
 * Create a local bare git repo to stand in for a Project's remote `origin`.
 *
 * This runs on the runner (Node side), not in the renderer, so it uses the
 * system `git` on PATH directly. The bare repo lives under the per-test output
 * path, so it is isolated and cleaned up with the rest of the test artifacts.
 *
 * Pass `mirror` with an existing repo path to seed the bare repo with a copy of
 * all its refs (`git clone --bare`), which produces an origin the Project starts
 * out level with. This avoids Core's LFS push path, which is not reliable over a
 * plain bare remote. Without `mirror` the bare repo starts empty.
 */
export function setupRemote(
  testInfo: TestInfo,
  options: { mirror?: string } = {}
): { path: string; url: string } {
  const path = testInfo.outputPath('remote-origin');
  mkdirSync(path, { recursive: true });

  if (options.mirror !== undefined) {
    // A bare clone copies every ref without a working tree or an LFS push
    execFileSync('git', ['clone', '--bare', options.mirror, path]);
  } else {
    execFileSync('git', ['init', '--bare', path]);
  }

  // Core (via dugite) accepts the absolute path as the origin URL directly
  return { path, url: path };
}

/**
 * Read the commit SHA of a branch on a bare remote via `git ls-remote`.
 *
 * Runner-side corroboration for the sync and Release specs: comparing this
 * against the local SHA proves a round-trip actually reached the remote (P1-20),
 * or that a rejected sync or Release pushed nothing (P1-21). This observes only
 * the ref, not file contents, so it stays within the desktop verification
 * doctrine.
 */
export function remoteBranchSha(remotePath: string, branch: string): string {
  const output = execFileSync('git', [
    'ls-remote',
    remotePath,
    `refs/heads/${branch}`,
  ])
    .toString()
    .trim();
  const sha = output.split(/\s/)[0];
  if (sha === undefined || sha === '') {
    throw new Error(`No "${branch}" ref found on remote "${remotePath}"`);
  }
  return sha;
}

/** Read the commit SHA of the `draft` branch on a bare remote. */
export function remoteDraftSha(remotePath: string): string {
  return remoteBranchSha(remotePath, DRAFT_BRANCH);
}

/** Read the commit SHA of the `main` branch on a bare remote. */
export function remoteMainSha(remotePath: string): string {
  return remoteBranchSha(remotePath, MAIN_BRANCH);
}

/** Read a local branch's commit SHA of a Project's git repo. */
export function localBranchSha(dir: string, branch: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', branch])
    .toString()
    .trim();
}

/** Read the local `draft` branch commit SHA of a Project's git repo. */
export function localDraftSha(dir: string): string {
  return localBranchSha(dir, DRAFT_BRANCH);
}

/** Read the local `main` branch commit SHA of a Project's git repo. */
export function localMainSha(dir: string): string {
  return localBranchSha(dir, MAIN_BRANCH);
}

/** The branch a Project's git repo is checked out on. */
export function localCurrentBranch(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
    .toString()
    .trim();
}

/**
 * List the tag names a Project's git repo holds.
 *
 * Core names a Release tag by a UUID and keeps the version in the tag's
 * trailers, so a spec counts tags rather than matching a version string. The
 * version itself is asserted through the UI, which is where it is the desktop
 * app's responsibility.
 */
export function localTags(dir: string): string[] {
  return execFileSync('git', ['-C', dir, 'tag', '--list'])
    .toString()
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .sort();
}

/** List the tag names a bare remote holds, via `git ls-remote --tags`. */
export function remoteTags(remotePath: string): string[] {
  return (
    execFileSync('git', ['ls-remote', '--tags', remotePath])
      .toString()
      .trim()
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => line.replace(/^\S+\s+refs\/tags\//, ''))
      // An annotated tag also lists its dereferenced commit as "<name>^{}"
      .filter((name) => !name.endsWith('^{}'))
      .sort()
  );
}

/**
 * Delete an Entry file directly on the bare remote, out of band, bypassing
 * Core's delete gate.
 *
 * Clones the bare to a throwaway working tree, removes the file on `draft`,
 * commits, and pushes `draft` back to the bare. This is how a test arranges a
 * remote whose `draft` tree already holds a dangling reference (a reference whose
 * target was deleted on the remote), a state Core's own delete gate would never
 * allow, so a following local synchronize hits the sync-time integrity gate.
 */
export function deleteEntryOnRemote(
  testInfo: TestInfo,
  remotePath: string,
  relPath: string
): void {
  const workTree = testInfo.outputPath('remote-edit-clone');

  // No LFS objects are involved (Entry files are plain JSON), and skipping the
  // smudge filter keeps git-lfs from reaching for a remote it cannot serve.
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

  execFileSync('git', ['clone', remotePath, workTree], { env });
  execFileSync('git', ['-C', workTree, 'checkout', DRAFT_BRANCH], { env });
  execFileSync('git', ['-C', workTree, 'rm', relPath]);
  execFileSync('git', [
    '-C',
    workTree,
    // Identity is set inline so the runner needs no global git config
    '-c',
    'user.name=E2E Remote',
    '-c',
    'user.email=e2e-remote@example.com',
    'commit',
    '-m',
    `Delete ${relPath} out of band`,
  ]);
  execFileSync('git', ['-C', workTree, 'push', 'origin', DRAFT_BRANCH], {
    env,
  });
}

/**
 * Write a file and commit it on the bare remote as a Core-shaped commit, out of
 * band, then push it to `draft`.
 *
 * Clones the bare to a throwaway working tree, writes `file.relPath`, commits
 * with `message`'s Core trailers (so getChanges recognizes it, see
 * `coreCommitMessage`), and pushes `draft` back to the bare. This advances the
 * remote's `draft` by one commit that Core counts, so a local Project pointed at
 * it becomes `behind` by one, the state the behind-path sync spec needs. The
 * file is plain (not under `lfs/**`), so no LFS object is involved.
 */
export function commitFileOnRemote(
  testInfo: TestInfo,
  remotePath: string,
  file: { relPath: string; content: string },
  message: GitMessage
): void {
  const workTree = testInfo.outputPath('remote-commit-clone');

  // Entry/plain files are not LFS-tracked, and skipping the smudge filter keeps
  // git-lfs from reaching for a remote it cannot serve.
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };

  execFileSync('git', ['clone', remotePath, workTree], { env });
  execFileSync('git', ['-C', workTree, 'checkout', DRAFT_BRANCH], { env });
  writeFileSync(join(workTree, file.relPath), file.content);
  execFileSync('git', ['-C', workTree, 'add', file.relPath]);
  execFileSync('git', [
    '-C',
    workTree,
    // Identity is set inline so the runner needs no global git config
    '-c',
    'user.name=E2E Remote',
    '-c',
    'user.email=e2e-remote@example.com',
    'commit',
    '-m',
    coreCommitMessage(message),
  ]);
  execFileSync('git', ['-C', workTree, 'push', 'origin', DRAFT_BRANCH], {
    env,
  });
}

/**
 * Rename branches on a bare remote, out of band.
 *
 * Renaming `draft` to `work` and `main` to `production` turns a mirror into
 * the remote of a Project made before Core 0.25, which Core refuses to clone.
 */
export function renameBranchesOnRemote(
  remotePath: string,
  renames: Record<string, string>
): void {
  for (const [from, to] of Object.entries(renames)) {
    execFileSync('git', ['-C', remotePath, 'branch', '-m', from, to]);
  }
}

/** List the branch names a bare remote holds, via `git ls-remote --heads`. */
export function remoteBranches(remotePath: string): string[] {
  return execFileSync('git', ['ls-remote', '--heads', remotePath])
    .toString()
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.replace(/^\S+\s+refs\/heads\//, ''))
    .sort();
}

/**
 * Commit one unrelated file on a bare remote, out of band.
 *
 * Commits in a throwaway repository of its own and pushes `main` to the bare,
 * so the remote holds refs that share no history with the Project. That is the
 * repository a Git host creates with a README, which Core refuses to
 * synchronize with (see Core's git-and-sync docs).
 */
export function commitUnrelatedFileOnRemote(
  testInfo: TestInfo,
  remotePath: string,
  file: { relPath: string; content: string }
): void {
  const workTree = testInfo.outputPath('remote-unrelated-seed');
  mkdirSync(workTree, { recursive: true });

  // The branch is named here rather than taken from the runner's git config,
  // which decides what `init` without -b calls the first branch
  execFileSync('git', ['init', '-b', MAIN_BRANCH, workTree]);
  writeFileSync(join(workTree, file.relPath), file.content);
  execFileSync('git', ['-C', workTree, 'add', file.relPath]);
  execFileSync('git', [
    '-C',
    workTree,
    // Identity is set inline so the runner needs no global git config
    '-c',
    'user.name=E2E Remote',
    '-c',
    'user.email=e2e-remote@example.com',
    'commit',
    '-m',
    `Add ${file.relPath}`,
  ]);
  execFileSync('git', ['-C', workTree, 'push', remotePath, MAIN_BRANCH]);
}

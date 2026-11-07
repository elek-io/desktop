import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { StateMarker } from '@renderer/components/project-state';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useUser } from '@renderer/hooks/useUser';
import { changeSentence } from '@renderer/lib/changeSentence';

import { type GitCommit } from '@elek-io/core';

// The changes of a Project as ci's History draws them: a ruled row each, with
// a marker, what happened and when.
//
// One module, because two screens draw the same rows: the Dashboard shows the
// five latest ones and the History every one of them. A row says what happened
// in words, so nothing about it is told by its marker or its color alone.

/**
 * Whether a change has reached the Git repository.
 *
 * `unknown` is the answer wherever that cannot be told: a Project without a
 * Git repository has nothing to sync with, and a check that failed or has not
 * answered yet counts nothing. Such a row claims neither state rather than
 * claiming the wrong one, and what stopped the check stands in the Project
 * card beside it, see contributing/error-handling.md.
 */
export type ChangeSyncState = 'not-synced' | 'synced' | 'unknown';

/**
 * One change in ci's ruled row: its marker on the History's line, what
 * happened, and when.
 *
 * The whole row opens the change, so there is one way in, and its focus ring
 * is drawn inside the row, which the pane's edge would otherwise clip.
 */
export function ChangeRow({
  projectId,
  commit,
  syncState,
}: {
  projectId: string;
  commit: GitCommit;
  syncState: ChangeSyncState;
}): ReactElement {
  const { formatDatetime, userQuery } = useUser();
  const byYou = userQuery.data?.email === commit.author.email;

  return (
    <Link
      to="/projects/$projectId/history/$commitHash"
      params={{ projectId, commitHash: commit.hash }}
      activeProps={{ 'data-active': true }}
      className="relative flex gap-3 border-b px-(--pane-edge) py-2.5 no-underline before:absolute before:top-0 before:bottom-0 before:left-[calc(var(--pane-edge)+3px)] before:w-px before:bg-border hover:bg-muted/50 focus-visible:-outline-offset-4 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]"
    >
      {/*
        The marker sits on the line rather than behind it, with a ring in the
        surface it stands on, as ci draws the History's line through its
        markers.
      */}
      <span className="relative mt-[7px] flex rounded-[1.5px] shadow-[0_0_0_3px_var(--color-card)] in-data-active:shadow-[0_0_0_3px_var(--color-muted)]">
        <StateMarker variant={syncState === 'unknown' ? 'none' : syncState} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{changeSentence(commit, byYou)}</span>
        <span className="truncate text-small text-muted-foreground">
          {formatDatetime({ datetime: commit.datetime }).relative}
        </span>
      </span>
    </Link>
  );
}

/**
 * The changes of a Project, each in its own ruled row.
 *
 * The rows span the pane rather than the page body's text edge, so a row's
 * rule ends on the pane's divider the way ci draws it, which is what the
 * negative margin takes back. Each row carries the text edge itself.
 */
export function ChangeList({
  projectId,
  commits,
  syncStateOf,
}: {
  projectId: string;
  commits: GitCommit[];
  /** Whether each change is synced, which only a reader of the check knows. */
  syncStateOf?: (commit: GitCommit) => ChangeSyncState;
}): ReactElement {
  if (commits.length === 0) {
    return (
      <p className="py-4 text-muted-foreground">
        <Trans>Nothing has changed in this Project yet.</Trans>
      </p>
    );
  }

  return (
    <div className="-mx-(--pane-edge) border-t">
      {commits.map((commit) => (
        <ChangeRow
          key={commit.hash}
          projectId={projectId}
          commit={commit}
          syncState={
            syncStateOf === undefined ? 'unknown' : syncStateOf(commit)
          }
        />
      ))}
    </div>
  );
}

/** The same rows while the changes are still being read. */
export function ChangeListSkeleton({
  rows = 5,
  label,
}: {
  rows?: number;
  label: string;
}): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="-mx-(--pane-edge) border-t"
    >
      {Array.from({ length: rows }, (_row, index) => (
        <div
          key={index}
          className="flex gap-3 border-b px-(--pane-edge) py-2.5"
        >
          <Skeleton className="mt-[7px] size-[7px] rounded-[1.5px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { entryTitle } from '@renderer/components/fields/entry-title';
import { StateMarker } from '@renderer/components/project-state';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { changeContext, changeSentence } from '@renderer/lib/changeSentence';
import { queryOptions } from '@renderer/queries';

import { flattenFieldDefinitions, type GitCommit } from '@elek-io/core';

// The changes of a Project as ci's History draws them: a ruled row each, with
// a marker, what happened, what it was about and when.
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
 * What the change was about, as the app names it, and when it happened.
 *
 * ci's row names its Entry or Collection, which a commit carries as an id
 * only, so the object is read per row. It is read as it stood at the change,
 * which is what keeps the read from failing for an object that has since been
 * deleted, or whose Collection has. A delete took the object out of the Project
 * altogether, so that row is left with the kind of thing the sentence above it
 * already names.
 *
 * One component per kind of object rather than one with a read per kind, so a
 * row runs the one or two reads naming it needs.
 */
function ChangeContext({
  projectId,
  commit,
  when,
}: {
  projectId: string;
  commit: GitCommit;
  when: string;
}): ReactElement {
  const { method, reference } = commit.message;

  if (method === 'delete') {
    return <>{when}</>;
  }

  switch (reference.objectType) {
    case 'entry':
      // Core writes an Entry's Collection into the commit, and an Entry cannot
      // be read without it.
      return reference.collectionId === undefined ? (
        <>{when}</>
      ) : (
        <ChangedEntry
          projectId={projectId}
          collectionId={reference.collectionId}
          id={reference.id}
          commitHash={commit.hash}
          when={when}
        />
      );
    case 'collection':
      return (
        <ChangedCollection
          projectId={projectId}
          id={reference.id}
          commitHash={commit.hash}
          when={when}
        />
      );
    case 'component':
      return (
        <ChangedComponent
          projectId={projectId}
          id={reference.id}
          commitHash={commit.hash}
          when={when}
        />
      );
    case 'asset':
      return (
        <ChangedAsset
          projectId={projectId}
          id={reference.id}
          commitHash={commit.hash}
          when={when}
        />
      );
    // The sentence above already names the Project itself, and a Value is part
    // of an Entry, whose own id the commit does not carry.
    case 'project':
    case 'value':
      return <>{when}</>;
  }
}

/** The Entry a change was about, named the way every other place names one. */
function ChangedEntry({
  projectId,
  collectionId,
  id,
  commitHash,
  when,
}: {
  projectId: string;
  collectionId: string;
  id: string;
  commitHash: string;
  when: string;
}): ReactElement {
  const {
    userQuery: { data: user },
  } = useProject();
  // The Collection as it stood at the change, because its field definitions are
  // what name an Entry and it may have been deleted since, which would take the
  // Entry with it.
  const { data: collection } = useQueryNoError(
    queryOptions.collections.read({ projectId, id: collectionId, commitHash })
  );
  const { data: entry } = useQueryNoError(
    queryOptions.entries.read({ projectId, collectionId, id, commitHash })
  );

  if (
    collection === undefined ||
    entry === undefined ||
    user === null ||
    user === undefined
  ) {
    return <>{when}</>;
  }

  return (
    <>
      {changeContext({
        name: entryTitle({
          entry,
          fieldDefinitions: flattenFieldDefinitions(
            collection.fieldDefinitions
          ),
          language: user.language,
        }),
        when,
      })}
    </>
  );
}

/** The Collection a change was about, by the name the app knows it under. */
function ChangedCollection({
  projectId,
  id,
  commitHash,
  when,
}: {
  projectId: string;
  id: string;
  commitHash: string;
  when: string;
}): ReactElement {
  const { translateContent } = useProject();
  const { data: collection } = useQueryNoError(
    queryOptions.collections.read({ projectId, id, commitHash })
  );

  if (collection === undefined) {
    return <>{when}</>;
  }

  return (
    <>
      {changeContext({
        name: translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        }),
        when,
      })}
    </>
  );
}

/** The Component a change was about, by the name the app knows it under. */
function ChangedComponent({
  projectId,
  id,
  commitHash,
  when,
}: {
  projectId: string;
  id: string;
  commitHash: string;
  when: string;
}): ReactElement {
  const { translateContent } = useProject();
  const { data: component } = useQueryNoError(
    queryOptions.components.read({ projectId, id, commitHash })
  );

  if (component === undefined) {
    return <>{when}</>;
  }

  return (
    <>
      {changeContext({
        name: translateContent({
          key: 'component.name',
          record: component.name,
        }),
        when,
      })}
    </>
  );
}

/** The Asset a change was about, by the file name the Assets grid shows. */
function ChangedAsset({
  projectId,
  id,
  commitHash,
  when,
}: {
  projectId: string;
  id: string;
  commitHash: string;
  when: string;
}): ReactElement {
  const { data: asset } = useQueryNoError(
    queryOptions.assets.read({ projectId, id, commitHash })
  );

  if (asset === undefined) {
    return <>{when}</>;
  }

  return (
    <>
      {changeContext({
        name: `${asset.name}.${asset.extension}`,
        when,
      })}
    </>
  );
}

/**
 * One change in ci's ruled row: its marker on the History's line, what
 * happened, what it was about, and when.
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
  const { formatDatetime, userQuery } = useProject();
  const byYou = userQuery.data?.email === commit.author.email;

  return (
    <Link
      data-slot="change-row"
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
          <ChangeContext
            projectId={projectId}
            commit={commit}
            when={formatDatetime({ datetime: commit.datetime }).relative}
          />
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
    <div data-slot="change-list" className="-mx-(--pane-edge) border-t">
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

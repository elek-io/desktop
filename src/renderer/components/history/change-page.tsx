import { useLingui } from '@lingui/react/macro';
import { getRouteApi } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';

import { Page } from '@renderer/components/page';
import { StateMarker } from '@renderer/components/project-state';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { changeAuthorSentence } from '@renderer/lib/changeSentence';
import { type ChangeSyncState } from '@renderer/lib/changeSyncState';

import { type GitCommit } from '@elek-io/core';

// The one page every chosen change of the History is shown on: the name of
// what changed, the way into it, and one line saying what it is, who changed
// it, when, and whether it is synced.
//
// One component, because ci draws that head the same above an Entry, a
// Collection, an Asset, the Project and a Release, and only what stands below
// it differs.

/**
 * The route every chosen change is drawn in, which is what its crumb is set
 * on.
 *
 * Read through the router rather than imported from the route, which draws
 * this page: what changed is only known once the object has been read, so the
 * crumb is set here, beside the title it shows.
 */
/* eslint-disable-next-line lingui/no-unlocalized-strings -- the id of a route,
which nobody reads */
const changeRoute = getRouteApi('/projects/$projectId/history/$commitHash');

/**
 * The line below the name: the marker, what changed, who changed it and when,
 * and whether it has reached the Git repository.
 *
 * A Release takes the brand marker, which is the History's one highlight, and
 * every other change the marker of its sync state. The words say the state as
 * well, so nothing here is told by a marker or a color alone.
 */
function WhoChangedIt({
  commit,
  whatItIs,
  syncState,
}: {
  commit: GitCommit;
  whatItIs: string;
  syncState: ChangeSyncState;
}): ReactElement {
  const { t } = useLingui();
  const {
    formatRelativeShort,
    userQuery: { data: user },
  } = useProject();
  // How long ago it was rather than the moment it happened, which is how ci
  // words this line, in the shortest words the language has for it so the
  // sentence keeps one line. Under a minute every language words it as
  // something other than a count, which is what the sentence of its own is
  // for, see `formatRelativeShort`.
  const when = formatRelativeShort(commit.datetime) ?? t`just now`;
  const byYou = user?.email === commit.author.email;
  // Whether it is synced is only said where the check answered, since a
  // Project without a Git repository has nothing to sync with and a check that
  // failed counts nothing, see contributing/error-handling.md.
  const syncWord =
    syncState === 'not-synced'
      ? t`not synced yet`
      : syncState === 'synced'
        ? t`synced`
        : null;

  return (
    <span data-slot="change-who" className="flex items-center gap-2">
      <StateMarker
        variant={
          commit.message.method === 'release'
            ? 'release'
            : syncState === 'unknown'
              ? 'none'
              : syncState
        }
        arrives={commit.message.method === 'release'}
      />
      <span>
        {whatItIs}. {changeAuthorSentence(commit, byYou, when)}
        {syncWord === null ? null : <>, {syncWord}</>}
      </span>
    </span>
  );
}

export interface ChangePageProps {
  commit: GitCommit;
  /** What changed, by the name the app knows it under. */
  title: string;
  /** What it is, such as "An Entry in the Blog posts Collection". */
  whatItIs: string;
  /** Whether the change has reached the Git repository. */
  syncState: ChangeSyncState;
  /**
   * The way into what changed, such as Open Entry. Nothing where there is
   * nothing to open, which a change that deleted something leaves behind.
   */
  open?: ReactElement | undefined;
  children?: ReactNode;
}

/** The chosen change: its head, then what it changed. */
export function ChangePage({
  commit,
  title,
  whatItIs,
  syncState,
  open,
  children,
}: ChangePageProps): ReactElement {
  // The crumb names what changed, as ci's own does and as the title below it
  // says it, rather than repeating what happened to it.
  useBreadcrumb(changeRoute, title);

  return (
    <Page
      title={title}
      description={
        <WhoChangedIt
          commit={commit}
          whatItIs={whatItIs}
          syncState={syncState}
        />
      }
      {...(open === undefined ? {} : { actions: open })}
    >
      {children}
    </Page>
  );
}

import { useLingui } from '@lingui/react/macro';
import { type ReactElement, type ReactNode } from 'react';

import { Page } from '@renderer/components/page';
import { StateMarker } from '@renderer/components/project-state';
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
    formatDatetime,
    userQuery: { data: user },
  } = useProject();
  const when = formatDatetime({ datetime: commit.datetime }).absolute;
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

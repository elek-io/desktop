import { type ProjectState } from '@renderer/hooks/useProjectState';

import { type GitCommit } from '@elek-io/core';

// Whether each change of a Project has reached its Git repository, from the one
// check of it that the sidebar's Project card runs above every screen. So the
// count in that card, the markers of the Dashboard's rows and the groups of the
// History cannot disagree, and none of them costs a call of its own.

/**
 * Whether a change has reached the Git repository.
 *
 * Neither of the last two claims a state, and they differ in what the row then
 * draws. `unknown` takes the marker that says nothing, in the border color,
 * which is what the Dashboard shows where the check cannot tell, since the rows
 * there carry no grouping to read a filled marker against. `plain` takes ci's
 * filled marker, which is what the History shows once it drops its groups for
 * the same reason: without Not synced and Synced above them, a filled marker
 * claims nothing either.
 *
 * It cannot be told where a Project has no Git repository to sync with, and
 * where the check failed or has not answered yet. What stopped it stands in the
 * Project card beside both screens, see contributing/error-handling.md.
 */
export type ChangeSyncState = 'not-synced' | 'synced' | 'plain' | 'unknown';

/**
 * Whether the check of the Git repository can tell what is synced.
 *
 * The History groups its rows into Not synced and Synced only while it can, see
 * `components/history-sidebar.tsx`.
 */
export function tellsWhatIsSynced(state: ProjectState): boolean {
  return state.hasGitRepository && state.check.data !== undefined;
}

/**
 * Whether each change has reached the Git repository.
 *
 * `whenUntold` is what a row claims where the check cannot tell, which is the
 * one thing the two screens answer differently, see `ChangeSyncState`.
 */
export function changeSyncState({
  state,
  whenUntold,
}: {
  state: ProjectState;
  whenUntold: 'plain' | 'unknown';
}): (commit: GitCommit) => ChangeSyncState {
  if (tellsWhatIsSynced(state) === false) {
    return () => whenUntold;
  }

  const notSynced = new Set(
    (state.check.data?.ahead ?? []).map((commit) => commit.hash)
  );

  return (commit) => (notSynced.has(commit.hash) ? 'not-synced' : 'synced');
}

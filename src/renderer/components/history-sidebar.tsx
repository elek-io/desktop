import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';

import {
  ChangeList,
  ChangeListSkeleton,
  type ChangeGroup,
} from '@renderer/components/change-list';
import { PaneHead } from '@renderer/components/pane';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { useProjectState } from '@renderer/hooks/useProjectState';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import {
  changeSyncState,
  tellsWhatIsSynced,
} from '@renderer/lib/changeSyncState';
import { queryOptions } from '@renderer/queries';

import type { GitCommit, Project } from '@elek-io/core';

// The list of 296 px beside the chosen change: every change of the Project in
// ci's ruled rows, newest first, grouped into Not synced and Synced.
//
// Which changes are not synced comes from the one check of the Git repository
// that the sidebar's Project card runs above this screen, so the groups cost no
// second call and the count in that card and the rows here cannot disagree.

/**
 * The changes of the Project in the groups ci draws, or in one ungrouped list
 * where there is nothing to group them by.
 *
 * There is nothing to group by while the Project has no Git repository, while
 * the check has not answered, and where it failed. The rows then take the
 * marker that claims no state, and what stopped the check stands in the
 * Project card beside this pane, see contributing/error-handling.md.
 */
function changeGroups({
  commits,
  notSynced,
  isGrouped,
  words,
}: {
  commits: GitCommit[];
  notSynced: ReadonlySet<string>;
  isGrouped: boolean;
  words: { notSynced: string; synced: string };
}): ChangeGroup[] {
  if (isGrouped === false) {
    return [{ commits }];
  }

  return [
    {
      label: words.notSynced,
      commits: commits.filter((commit) => notSynced.has(commit.hash)),
    },
    {
      label: words.synced,
      commits: commits.filter((commit) => notSynced.has(commit.hash) === false),
    },
  ];
}

export function HistorySidebar({
  project,
}: {
  project: Project;
}): ReactElement {
  const { t } = useLingui();
  const { data: history, isPending: isReadingHistory } = useQueryNoError(
    queryOptions.projects.history({ id: project.id })
  );
  const state = useProjectState(project);
  // A check that failed or has not answered tells nothing, which is what drops
  // the groups rather than failing the pane. `useProjectState` keeps the
  // failure off the error screen and logs it the way a pane's boundary logs
  // one, see contributing/error-handling.md.
  const isGrouped = tellsWhatIsSynced(state);
  const notSynced = new Set(
    (state.check.data?.ahead ?? []).map((commit) => commit.hash)
  );
  const syncStateOf = changeSyncState({ state, whenUntold: 'plain' });

  return (
    // The rows are the way from one change to the next, which is what makes
    // this a navigation rather than a column of content.
    <nav aria-label={t`Changes`} className="flex min-h-0 flex-1 flex-col">
      <PaneHead>
        {/* The chosen change beside it carries the screen's h1, so the list's
        own title is the heading below it. */}
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-label">
          <span className="truncate">
            <Trans>History</Trans>
          </span>
          <span className="truncate font-normal text-muted-foreground">
            <Trans>of this Project</Trans>
          </span>
        </h2>
      </PaneHead>
      <ScrollArea className="flex-1">
        {/* The rows span the pane rather than its text edge, so a row's rule
        ends on the pane's divider the way ci draws it, and each row carries
        the edge itself. */}
        <div className="px-(--pane-edge) pb-6">
          {isReadingHistory ? (
            <ChangeListSkeleton label={t`Reading the changes`} />
          ) : (
            <ChangeList
              projectId={project.id}
              groups={changeGroups({
                commits: history.fullHistory,
                notSynced,
                isGrouped,
                words: { notSynced: t`Not synced`, synced: t`Synced` },
              })}
              syncStateOf={syncStateOf}
            />
          )}
        </div>
      </ScrollArea>
    </nav>
  );
}

/** The same pane while the Project itself is still being read. */
export function HistorySidebarSkeleton(): ReactElement {
  const { t } = useLingui();

  return (
    <nav aria-label={t`Changes`} className="flex min-h-0 flex-1 flex-col">
      <PaneHead>
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-label">
          <span className="truncate">
            <Trans>History</Trans>
          </span>
          <span className="truncate font-normal text-muted-foreground">
            <Trans>of this Project</Trans>
          </span>
        </h2>
      </PaneHead>
      <div className="px-(--pane-edge) pb-6">
        <ChangeListSkeleton label={t`Reading the changes`} />
      </div>
    </nav>
  );
}

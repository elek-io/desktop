import { Trans, useLingui } from '@lingui/react/macro';
import { X } from 'lucide-react';
import { type ReactElement } from 'react';

import { PaneHead } from '@renderer/components/pane';
import { StateMarker } from '@renderer/components/project-state';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { changeSentence } from '@renderer/lib/changeSentence';

import type { GitCommitWithRelease } from '@elek-io/core';

// The History of one Entry, in the pane ci draws on the right: every change of
// this Entry, newest first, and the Release that first included each of them.
//
// Core answers the Release per change, by git's ancestry, so a run of changes
// that share one carries its Release above them, which is the Release they went
// out in. A change with none is not published yet.
//
// See contributing/renderer/loading-and-updating-data.md.

/** One row of the pane: a marker on the line, then what it says and when. */
function HistoryRow({
  marker,
  says,
  when,
}: {
  marker: ReactElement;
  says: ReactElement | string;
  when: string;
}): ReactElement {
  return (
    <div
      data-slot="entry-change"
      className="relative flex gap-3 py-1.5 before:absolute before:top-0 before:bottom-0 before:left-[3px] before:w-px before:bg-border"
    >
      {/*
        The marker sits on the line rather than behind it, with a ring in the
        surface it stands on, as ci draws the History's line through its
        markers.
      */}
      <span className="relative mt-[7px] flex rounded-[1.5px] shadow-[0_0_0_3px_var(--color-card)]">
        {marker}
      </span>
      <span className="flex min-w-0 flex-col">
        <span>{says}</span>
        <span className="text-small text-muted-foreground">{when}</span>
      </span>
    </div>
  );
}

/**
 * Every change of the Entry, and the Release each of them first went out in.
 *
 * A Release stands above the changes it included, because the list runs newest
 * first and a Release happened after everything it holds. Which changes those
 * are is Core's answer rather than this pane's: consecutive changes that name
 * the same Release belong to it.
 */
function EntryChanges({
  changes,
}: {
  changes: GitCommitWithRelease[];
}): ReactElement {
  const {
    formatDatetime,
    userQuery: { data: user },
  } = useProject();

  if (changes.length === 0) {
    return (
      <p className="py-4 text-muted-foreground">
        <Trans>This Entry has not changed since it was created.</Trans>
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {changes.map((change, index) => {
        const byYou = user?.email === change.author.email;
        const { release } = change;
        const previous = changes[index - 1];
        // The newest change of a Release, which is the one its row stands
        // above. Everything below it shares the same Release.
        const leadsItsRelease =
          release !== null && release.tagId !== previous?.release?.tagId;
        const version = release?.version ?? '';

        return (
          <div key={change.hash} className="flex flex-col">
            {leadsItsRelease ? (
              <HistoryRow
                marker={<StateMarker variant="release" />}
                says={<Trans>In Release {version}</Trans>}
                when={
                  formatDatetime({
                    datetime: release.datetime,
                  }).relative
                }
              />
            ) : null}
            <HistoryRow
              marker={<StateMarker variant="plain" />}
              says={changeSentence(change, byYou)}
              when={formatDatetime({ datetime: change.datetime }).relative}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The same rows while the changes are still being read. */
function EntryHistorySkeleton(): ReactElement {
  const { t } = useLingui();

  return (
    <div role="status" aria-busy="true" aria-label={t`Loading the History`}>
      {[1, 2, 3].map((row) => (
        <div key={row} className="flex gap-3 py-1.5">
          <Skeleton className="mt-[7px] size-[7px] rounded-[1.5px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface EntryHistoryPaneProps {
  /** The Entry's changes, or `undefined` while they are still being read. */
  changes: GitCommitWithRelease[] | undefined;
  onClose: () => void;
}

/**
 * The pane itself: its head with the one way out of it, then the changes.
 *
 * It has no Release button, because a Release covers the whole Project rather
 * than one Entry.
 */
export function EntryHistoryPane({
  changes,
  onClose,
}: EntryHistoryPaneProps): ReactElement {
  const { t } = useLingui();

  return (
    <>
      <PaneHead>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-label">
            <Trans>History</Trans>
          </span>
          <span className="truncate text-small text-muted-foreground">
            <Trans>of this Entry</Trans>
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          Icon={X}
          aria-label={t`Close the History`}
          onClick={onClose}
        />
      </PaneHead>
      <ScrollArea className="flex-1">
        <div className="px-(--pane-edge) pb-6">
          {changes === undefined ? (
            <EntryHistorySkeleton />
          ) : (
            <EntryChanges changes={changes} />
          )}
        </div>
      </ScrollArea>
    </>
  );
}

import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowRight,
  FileMinus,
  FilePenLine,
  FilePlus,
  ImageMinus,
  ImagePlus,
  ImageUp,
  type LucideIcon,
} from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';

import { Badge } from '@renderer/components/ui/badge';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { bumpWord } from '@renderer/lib/release';

import { type ReleaseDiff } from '@elek-io/core';

// What one Release holds, as ci draws it in the Release dialog and beside the
// list on the Releases screen: the version it moves to with its bump, the
// sentence that says why, and the Entries and Assets it added, changed and
// deleted.
//
// One component for both, because Core answers a Release that was published
// and one that would be in the same shape, see
// node_modules/@elek-io/core/docs/releases.md. The sentence is the caller's,
// since only a pending Release can say there is nothing to release.

/** One row of the changes: what kind of change it is, and how many there are. */
interface ChangeCount {
  key: string;
  icon: LucideIcon;
  label: string;
  count: number;
}

/** How many of the diff's Entry changes are of one kind. */
function entriesOf(
  diff: ReleaseDiff,
  changeType: 'added' | 'modified' | 'deleted'
): number {
  return diff.entryChanges.filter((change) => change.changeType === changeType)
    .length;
}

/** How many of the diff's Asset changes are of one kind. */
function assetsOf(
  diff: ReleaseDiff,
  changeType: 'added' | 'deleted' | 'metadataChanged' | 'binaryChanged'
): number {
  return diff.assetChanges.filter((change) => change.changeType === changeType)
    .length;
}

export interface ReleaseSummaryProps {
  /** What the Release changed, as Core reports it. */
  diff: ReleaseDiff;
  /**
   * Why the version moves the way it does, or nothing where there is no
   * sentence to show, such as a Release whose bump Core could not read.
   */
  reason: ReactNode;
}

/**
 * The version a Release moves to, why, and what it changed.
 *
 * The version row is read as one sentence by a screen reader, because the
 * arrow between the two numbers is a drawing and "0.1.0 1.0.0" says nothing on
 * its own. The badge stays outside that sentence, so the bump is heard as the
 * word it is written as rather than twice.
 */
export function ReleaseSummary({
  diff,
  reason,
}: ReleaseSummaryProps): ReactElement {
  const { t } = useLingui();
  const { currentVersion, nextVersion, bump } = diff;
  // ci gives Entries and Assets a row each, because they are what somebody
  // reading a Project's content meets, and the sentence above the rows carries
  // what else moved, such as a Collection or a field definition. Only a kind
  // that has any gets a row, as ci's rule says, so a Release that changed no
  // Asset says nothing about Assets.
  const counts: ChangeCount[] = [
    {
      key: 'entries-added',
      icon: FilePlus,
      label: t`Entries added`,
      count: entriesOf(diff, 'added'),
    },
    {
      key: 'entries-changed',
      icon: FilePenLine,
      label: t`Entries changed`,
      count: entriesOf(diff, 'modified'),
    },
    {
      key: 'entries-deleted',
      icon: FileMinus,
      label: t`Entries deleted`,
      count: entriesOf(diff, 'deleted'),
    },
    {
      key: 'assets-added',
      icon: ImagePlus,
      label: t`Assets added`,
      count: assetsOf(diff, 'added'),
    },
    {
      key: 'assets-changed',
      icon: ImageUp,
      label: t`Assets changed`,
      // An Asset counts as changed whether its file or its name and
      // description moved, which is the one row ci draws for both.
      count:
        assetsOf(diff, 'binaryChanged') + assetsOf(diff, 'metadataChanged'),
    },
    {
      key: 'assets-deleted',
      icon: ImageMinus,
      label: t`Assets deleted`,
      count: assetsOf(diff, 'deleted'),
    },
  ].filter((row) => row.count > 0);

  // 512 px, ci's own width for this block: its 560 px box is border-box over a
  // 24 px edge, and the page around this one already draws that edge.
  return (
    <div className="flex max-w-128 flex-col gap-2">
      {bump === null || nextVersion === null ? null : (
        <>
          <span className="text-label">
            <Trans>Version</Trans>
          </span>
          <p className="flex items-center gap-2.5 text-h4">
            <span aria-hidden="true" className="text-muted-foreground">
              {currentVersion}
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span aria-hidden="true">{nextVersion}</span>
            <span className="sr-only">
              <Trans>
                {currentVersion} becomes {nextVersion}
              </Trans>
            </span>
            <Badge variant="outline">{bumpWord(bump)}</Badge>
          </p>
        </>
      )}

      {reason === null ? null : (
        <p className="text-small text-muted-foreground">{reason}</p>
      )}

      {counts.length === 0 ? null : (
        <ul data-slot="release-changes" className="mt-2 border-t">
          {counts.map((row) => (
            // Every row is ruled below, the last one included, so the block
            // of counts is closed the way ci draws it.
            <li key={row.key} className="flex h-9 items-center gap-2 border-b">
              <row.icon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <span data-slot="release-change-label">{row.label}</span>
              <span
                data-slot="release-change-count"
                className="ml-auto text-small text-muted-foreground"
              >
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The same shape while the Release is still being read. */
export function ReleaseSummarySkeleton(): ReactElement {
  const { t } = useLingui();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t`Loading the Release`}
      className="flex max-w-128 flex-col gap-2"
    >
      <Skeleton className="h-4 w-16 rounded" />
      <Skeleton className="h-7 w-48 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <div className="mt-2 border-t">
        {[1, 2, 3].map((row) => (
          <div key={row} className="flex h-9 items-center border-b">
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

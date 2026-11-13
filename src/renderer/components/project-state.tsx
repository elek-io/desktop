import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ArrowDown,
  GitBranch,
  HardDrive,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { GitHostLogo } from '@renderer/components/git-host-logo';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { type ProjectState } from '@renderer/hooks/useProjectState';
import { useUser } from '@renderer/hooks/useUser';
import { gitHostOf } from '@renderer/lib/gitHost';
import { checkRefusal } from '@renderer/lib/sync';
import { cn } from '@renderer/lib/utils';

import { type ReleaseListItem } from '@elek-io/core';

// What state a Project is in, in the lines ci draws it as: where it syncs, what
// is not synced, what is coming in, what stopped the check, and its last
// Release.
//
// One module, because two screens draw the same lines: the sidebar's Project
// card for the open Project, and each card of the Projects page. Each of them
// composes them in its own order and adds what only it shows, which for the
// sidebar's card is when it last checked and a sync of its own that failed, see
// ci's Sync table. What they read is `useProjectState`.

/** A 12 px icon centered in the same column as a marker. */
const STATE_ICON = cn('size-3 -mx-[2.5px]');

/**
 * One line of the Project's state, in ci's own geometry: a column for the
 * marker or the icon that says the state, then what it says in words.
 *
 * Both the column's width and the line's height come from the surface the line
 * stands on, because ci draws them differently in each place: `--state-lead`
 * is 7 px in the sidebar's card and 12 px on a card of the Projects page, and
 * `--state-line-height` is the sidebar's 22 px row, which a card of the
 * Projects page leaves to the line's own 16 px.
 *
 * Every line says its state in words, so none of them is told by its color or
 * its marker alone. A line that appears because something went wrong carries
 * `announce`, which puts it in a live region: a Git repository that stopped
 * answering, or a sync that failed, arrives while the editor is looking
 * somewhere else. The counts and the check do not, since they change on their
 * own every three minutes and nobody needs to hear that.
 */
export function StateLine({
  lead,
  announce = false,
  className,
  children,
}: {
  /** The marker or the 12 px icon that stands in the line's own column. */
  lead: React.ReactNode;
  announce?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot="project-state-line"
      {...(announce ? { role: 'status' } : {})}
      className={cn(
        'flex h-[var(--state-line-height,22px)] items-center gap-2 text-small whitespace-nowrap',
        className
      )}
    >
      {/*
        One column for the marker and the 12 px icon alike, so every line's
        words start on the same edge, at the width the surface sets.
      */}
      <span className="grid w-[var(--state-lead,7px)] flex-none place-items-center">
        {lead}
      </span>
      {children}
    </div>
  );
}

/** A Lucide icon in a state line's own column, at the 12 px ci draws it. */
export function StateIcon({
  icon: Icon,
}: {
  icon: LucideIcon;
}): React.JSX.Element {
  return <Icon className={STATE_ICON} />;
}

/**
 * The 7 px square ci marks a state with: hollow for a change that is not
 * synced, filled for one that is, the brand color for a Release and the border
 * color where there is no Release yet.
 *
 * `release` is the brand color, which the open Project's card gives its
 * Release, and `release-muted` the gray marker the Projects page gives it,
 * because a list has one highlight at most, see ci's docs/color.md.
 *
 * It is hidden from a screen reader, because the words of its line already say
 * which state it marks.
 */
export function StateMarker({
  variant,
}: {
  variant:
    'not-synced' | 'synced' | 'release' | 'release-muted' | 'plain' | 'none';
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-[7px] flex-none rounded-[1.5px]',
        variant === 'not-synced' && 'border-[1.5px] border-foreground bg-card',
        variant === 'synced' && 'bg-muted-foreground',
        // ci's plain marker, for a row that says what it is in words and
        // claims nothing by its marker, such as one change of an Entry.
        variant === 'plain' && 'bg-muted-foreground',
        variant === 'release' && 'bg-brand',
        variant === 'release-muted' && 'bg-muted-foreground',
        variant === 'none' && 'bg-border'
      )}
    />
  );
}

/**
 * Where a Project syncs: the Git host's name with its logo, or that it is only
 * on this computer.
 *
 * ci draws this line in the text color, above the muted state lines, and a
 * logo never stands without the host's name beside it, which is why
 * `gitHostOf` answers with a name for every address.
 */
export function WhereItSyncs({
  remoteOriginUrl,
}: {
  remoteOriginUrl: string | null;
}): React.JSX.Element {
  if (remoteOriginUrl === null) {
    return (
      <StateLine
        className="text-foreground"
        lead={<StateIcon icon={HardDrive} />}
      >
        <Trans>This computer only</Trans>
      </StateLine>
    );
  }

  const host = gitHostOf(remoteOriginUrl);

  return (
    <StateLine
      className="min-w-0 text-foreground"
      lead={
        host.logo === null ? (
          <StateIcon icon={GitBranch} />
        ) : (
          <GitHostLogo logo={host.logo} className={STATE_ICON} />
        )
      }
    >
      <span className="truncate">{host.name}</span>
    </StateLine>
  );
}

/** A Release's version, and the day it went out in the User's own locale. */
export function ReleaseLine({
  release,
}: {
  release: ReleaseListItem;
}): React.JSX.Element {
  const { t } = useLingui();
  const { formatInUserLocale } = useUser();
  const { version } = release;

  return (
    <>
      {t`Release ${version}`}
      <span className="text-muted-foreground">
        {formatInUserLocale(new Date(release.datetime), 'PP')}
      </span>
    </>
  );
}

/**
 * When the Git repository was last checked, re-read on a clock of its own.
 *
 * The check runs every three minutes, so a line that only followed the check
 * would say "just now" for three minutes at a time. This re-renders every 30
 * seconds instead, which is the shortest step the words it shows have.
 */
export function LastChecked({ at }: { at: number }): React.JSX.Element {
  const { t } = useLingui();
  const { formatRelativeShort } = useUser();
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    const clock = window.setInterval(() => {
      setTick((previous) => previous + 1);
    }, 30000);

    return () => {
      window.clearInterval(clock);
    };
  }, []);

  const ago = formatRelativeShort(at);

  return (
    <span className="text-muted-foreground">
      {ago === null ? t`Checked just now` : t`Checked ${ago}`}
    </span>
  );
}

/**
 * What the check says about the Project: what is not synced, what is coming in,
 * or that everything is.
 *
 * A Project without a Git repository has no line here at all, since Core counts
 * what is not synced against a remote only, and where it is kept is what
 * `WhereItSyncs` says instead. A check that failed has none either, because
 * nothing can be counted then and `CheckFailureLine` says so.
 */
export function SyncStateLines({
  state,
}: {
  state: ProjectState;
}): React.ReactNode {
  const { t } = useLingui();
  const { check, hasGitRepository, notSynced, incoming } = state;

  if (hasGitRepository === false || check.error !== null) {
    return null;
  }

  if (check.isPending) {
    return (
      <>
        <Skeleton className="h-[14px] w-32 rounded" />
        <Skeleton className="h-[14px] w-24 rounded" />
      </>
    );
  }

  if (notSynced === 0 && incoming === 0) {
    return (
      <StateLine lead={<StateMarker variant="synced" />}>
        <Trans>Everything synced</Trans>
      </StateLine>
    );
  }

  return (
    <>
      {notSynced === 0 ? null : (
        <StateLine lead={<StateMarker variant="not-synced" />}>
          {t`${plural(notSynced, {
            one: '# change not synced',
            other: '# changes not synced',
          })}`}
        </StateLine>
      )}
      {incoming === 0 ? null : (
        <StateLine lead={<StateIcon icon={ArrowDown} />}>
          {t`${plural(incoming, {
            one: '# incoming change',
            other: '# incoming changes',
          })}`}
        </StateLine>
      )}
    </>
  );
}

/**
 * The Release a Project is at, on a card of the Projects page: its last one
 * with the gray marker, that it has none yet, or that the Releases could not be
 * read.
 *
 * The gray marker rather than the brand one, because a list has one highlight
 * at most, see ci's docs/color.md. A failed read says so in the warning color
 * with `triangle-alert`, as the stopped check does, so the card says what it
 * does not know rather than saying there is no Release. It is a read the card
 * answers itself, see contributing/error-handling.md.
 */
export function LastReleaseLine({
  state,
}: {
  state: ProjectState;
}): React.ReactNode {
  const { releasesError, lastRelease } = state;

  if (releasesError !== null) {
    return (
      <StateLine
        announce
        className="text-warning"
        lead={<StateIcon icon={TriangleAlert} />}
      >
        <Trans>Can&apos;t read the Releases</Trans>
      </StateLine>
    );
  }

  if (lastRelease === undefined) {
    return (
      <StateLine lead={<StateMarker variant="none" />}>
        <Trans>No Release yet</Trans>
      </StateLine>
    );
  }

  return (
    <StateLine lead={<StateMarker variant="release-muted" />}>
      <ReleaseLine release={lastRelease} />
    </StateLine>
  );
}

/**
 * What stopped the check, where it was stopped: a Git repository nothing could
 * reach, or one that answered and refused access.
 *
 * In the warning color with `triangle-alert`, as ci draws a paused state, and
 * in a live region, because it arrives while the editor is looking somewhere
 * else.
 */
export function CheckFailureLine({
  state,
}: {
  state: ProjectState;
}): React.ReactNode {
  const { error } = state.check;

  if (error === null) {
    return null;
  }

  return (
    <StateLine
      announce
      className="text-warning"
      lead={<StateIcon icon={TriangleAlert} />}
    >
      {checkRefusal(error) === 'refused' ? (
        <Trans>The Git repository refused access</Trans>
      ) : (
        <Trans>Can&apos;t reach the Git repository</Trans>
      )}
    </StateLine>
  );
}

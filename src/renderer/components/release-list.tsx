import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { type ReactElement } from 'react';

import { PaneHead } from '@renderer/components/pane';
import { StateMarker } from '@renderer/components/project-state';
import { ReleaseDialog } from '@renderer/components/release-dialog';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { SkeletonRows } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { lastPublishedRelease } from '@renderer/hooks/useProjectState';
import { bumpWord } from '@renderer/lib/release';

import { type Project, type ReleaseListItem } from '@elek-io/core';

// The Releases of a Project as ci's list of 296 px beside the chosen one: one
// ruled row each, newest first, with the version, the day it went out, who
// released it and the bump it carried. The latest Release has the brand marker,
// the list's one highlight, and the others the gray one.

/**
 * One Release of the list: its marker, its version, when it went out and who
 * released it, and the bump as a badge.
 *
 * The whole row is the link, so there is one way in, and the Release it opens
 * is in the address. The open row takes the muted surface and the bar, and its
 * focus ring is drawn inside the row, which the pane's edge would otherwise
 * clip.
 *
 * A preview Release tags the editing branch without publishing anything, so it
 * carries a badge saying what it is beside the bump it targets, rather than
 * standing in the list as the version a site builds from.
 */
function ReleaseRow({
  projectId,
  release,
  isLatest,
}: {
  projectId: string;
  release: ReleaseListItem;
  /** Whether this is the Release the Project is at, which ci highlights. */
  isLatest: boolean;
}): ReactElement {
  const { t } = useLingui();
  const { formatInUserLocale } = useProject();
  // The day it went out rather than the hour, as ci draws the row, and in the
  // User's own locale rather than as the stored string.
  const published = formatInUserLocale(new Date(release.datetime), 'PP');
  const author = release.author.name;

  return (
    <Link
      data-slot="release-row"
      to="/projects/$projectId/releases/$tagId"
      params={{ projectId, tagId: release.tagId }}
      activeProps={{ 'data-active': true }}
      className="flex items-start gap-2.5 border-b px-(--pane-edge) py-2.5 no-underline hover:bg-muted/50 focus-visible:-outline-offset-4 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]"
    >
      {/* On the version's own line, where ci puts a row's marker. */}
      <span className="mt-[7px] flex">
        <StateMarker variant={isLatest ? 'release' : 'synced'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-slot="release-version" className="truncate font-medium">
          {release.version}
        </span>
        {/* ci draws the day and who released it as one line of the row. */}
        <span
          data-slot="release-published"
          className="truncate text-small text-muted-foreground"
        >
          {t`${published}, ${author}`}
        </span>
      </span>
      {release.type === 'preview' ? (
        <Badge variant="outline" className="mt-px">
          <Trans>Preview</Trans>
        </Badge>
      ) : null}
      {/*
        Core reads the bump off this Release's version against the one before
        it, and answers nothing only where the two target the same version,
        which no Release Desktop makes does.
      */}
      {release.bump === null ? null : (
        <Badge variant="outline" className="mt-px">
          {bumpWord(release.bump)}
        </Badge>
      )}
    </Link>
  );
}

export interface ReleaseListPaneProps {
  project: Project;
  /** The Project's Releases, or `undefined` while they are still being read. */
  releases: ReleaseListItem[] | undefined;
}

/**
 * The pane of 296 px beside the chosen Release: how many Releases the Project
 * has, Create Release, and one row per Release.
 *
 * Create Release stands in the head as the screen's one primary button, and
 * the dialog it opens carries it, so focus comes back to it when the dialog
 * closes.
 */
export function ReleaseListPane({
  project,
  releases,
}: ReleaseListPaneProps): ReactElement {
  const { t } = useLingui();
  // The newest Release a site can build from, which is the list's one
  // highlight. A preview is none, so it never takes the brand marker.
  const latest =
    releases === undefined ? undefined : lastPublishedRelease(releases);

  return (
    // The rows are the way from one Release to the next, which is what makes
    // this a navigation rather than a column of content.
    <nav aria-label={t`Releases`} className="flex min-h-0 flex-1 flex-col">
      <PaneHead>
        {/* The chosen Release beside it carries the screen's h1, so the list's
        own title is the heading below it. */}
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-label">
          <span className="truncate">
            <Trans>Releases</Trans>
          </span>
          {releases === undefined ? null : (
            <span className="font-normal text-muted-foreground">
              {releases.length}
            </span>
          )}
        </h2>
        <ReleaseDialog project={project}>
          <Button size="sm" Icon={Tag}>
            <Trans>Create Release</Trans>
          </Button>
        </ReleaseDialog>
      </PaneHead>
      <ScrollArea className="flex-1">
        {/* The rows span the pane rather than its text edge, so a row's rule
        ends on the pane's divider the way ci draws it, which is what the
        negative margin takes back, and each row carries the edge itself. */}
        <div className="px-(--pane-edge) pb-6">
          {releases === undefined ? (
            <ReleaseListSkeleton />
          ) : (
            <div
              data-slot="release-list"
              className="-mx-(--pane-edge) border-t [&>*:last-child]:border-b-0"
            >
              {releases.map((release) => (
                <ReleaseRow
                  key={release.tagId}
                  projectId={project.id}
                  release={release}
                  isLatest={release.tagId === latest?.tagId}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </nav>
  );
}

/** The same rows while the Releases are still being read. */
export function ReleaseListSkeleton(): ReactElement {
  const { t } = useLingui();

  return <SkeletonRows label={t`Loading the Releases`} />;
}

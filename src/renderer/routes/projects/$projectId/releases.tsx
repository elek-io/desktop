import { createFileRoute } from '@tanstack/react-router';
import { Rocket, Tag } from 'lucide-react';
import { type ReactElement } from 'react';

import { Page } from '@renderer/components/page';
import { ReleaseDialog } from '@renderer/components/release-dialog';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { type ReleaseListItem } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/releases')({
  component: ProjectReleasesPage,
});

function ProjectReleasesPage(): ReactElement {
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Releases');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    formatDatetime,
  } = useProject();
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );

  function Description(): ReactElement {
    return (
      <>
        A Release publishes everything saved in this Project as a version a
        website can build from. elek.io sets the version from what changed.
      </>
    );
  }

  // The Release dialog carries the button that opens it, so focus returns to
  // that button when the dialog closes. Only one of the two places it can sit
  // renders at a time.
  function ReleaseAction(): ReactElement {
    if (isReadingProject) {
      return (
        <Button Icon={Rocket} disabled>
          Release
        </Button>
      );
    }

    return (
      <ReleaseDialog project={project}>
        <Button Icon={Rocket}>Release</Button>
      </ReleaseDialog>
    );
  }

  // The empty state carries the action while there is no Release, so the two
  // never repeat each other, see ci's rule for an empty state.
  function Actions(): ReactElement {
    return (
      <>
        {isListingReleases || releases.total === 0 ? null : <ReleaseAction />}
      </>
    );
  }

  return (
    <>
      <Page
        title="Releases"
        description={<Description />}
        actions={<Actions />}
        layout="bare"
      >
        {isListingReleases ? (
          <div className="grid gap-2">
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-16 w-full rounded" />
            ))}
          </div>
        ) : releases.total === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Rocket />
              </EmptyMedia>
              <EmptyTitle>No Releases yet</EmptyTitle>
              <EmptyDescription>
                Nothing has been published from this Project yet. A Release
                takes everything saved here and gives it a version.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ReleaseAction />
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="grid gap-2">
            {releases.list.map((release) => (
              <li key={release.tagId}>
                <ReleaseRow
                  release={release}
                  published={
                    formatDatetime({ datetime: release.datetime }).absolute
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  );
}

function ReleaseRow({
  release,
  published,
}: {
  release: ReleaseListItem;
  published: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-md border p-4">
      <Tag className="h-4 w-4 shrink-0" />
      <span className="font-medium">{release.version}</span>
      {/* A preview Release tags `draft` without publishing it, so it is marked
          rather than listed as the version a site builds from. elek.io Desktop
          cannot make one, see contributing/not-yet-implemented.md. */}
      {release.type === 'preview' ? (
        <Badge variant="outline">Preview</Badge>
      ) : null}
      <span className="ml-auto text-sm text-muted-foreground">
        Published {published}
      </span>
    </div>
  );
}

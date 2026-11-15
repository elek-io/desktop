import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { type ReactElement } from 'react';

import { Pane, Panes } from '@renderer/components/pane';
import { ReleaseDialog } from '@renderer/components/release-dialog';
import { ReleaseListPane } from '@renderer/components/release-list';
import { Button } from '@renderer/components/ui/button';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute('/projects/$projectId/releases')({
  component: ProjectReleasesLayout,
});

/**
 * The Releases of a Project beside the chosen one, or the empty state while
 * the Project has published nothing.
 *
 * It is a layout route, so the list stays as it is while one Release opens
 * after another, which keeps the place somebody had scrolled to.
 */
function ProjectReleasesLayout(): ReactElement {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Releases`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );

  // The empty state takes the whole panel, head and all, so nothing repeats
  // the action it offers, see ci's rule for an empty state. Create Release
  // stands in it, because nothing else on the screen leads to one.
  if (isListingReleases === false && releases.total === 0) {
    return (
      <Pane name={t`the Releases of this Project`}>
        <Empty>
          <EmptyMedia>
            <Tag />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>No Releases yet</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>
              Nothing has been published from this Project yet. A Release takes
              everything saved here and gives it a version your website and apps
              build from.
            </Trans>
          </EmptyDescription>
          <EmptyActions>
            {isReadingProject ? (
              <Button Icon={Tag} disabled>
                <Trans>Create Release</Trans>
              </Button>
            ) : (
              // The dialog carries the button that opens it, so focus returns
              // to that button when the dialog closes.
              <ReleaseDialog project={project}>
                <Button Icon={Tag}>
                  <Trans>Create Release</Trans>
                </Button>
              </ReleaseDialog>
            )}
          </EmptyActions>
        </Empty>
      </Pane>
    );
  }

  return (
    <Panes>
      <Pane width="list" name={t`the Releases of this Project`}>
        {isReadingProject ? null : (
          <ReleaseListPane
            project={project}
            releases={isListingReleases ? undefined : releases.list}
          />
        )}
      </Pane>
      <Outlet />
    </Panes>
  );
}

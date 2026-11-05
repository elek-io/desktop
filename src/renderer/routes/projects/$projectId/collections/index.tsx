import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Layers, Plus } from 'lucide-react';
import { type ReactElement } from 'react';

import { Button } from '@renderer/components/ui/button';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute('/projects/$projectId/collections/')({
  component: ProjectCollectionsIndexPage,
});

/**
 * Where Collections lands before one of them is opened.
 *
 * Every Collection is a row of the Project's sidebar, so this says in one line
 * what to do next: pick one. A Project with no Collection at all has nothing
 * to pick, so it gets ci's empty state with the way to create the first one,
 * which is the same page the sidebar's own Create Collection opens.
 */
function ProjectCollectionsIndexPage(): ReactElement {
  const { projectId } = Route.useParams();
  const { data: collections, isPending: isListingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  if (isListingCollections) {
    return (
      <div className="px-(--pane-edge) py-5">
        <Skeleton className="h-5 w-72 rounded" />
      </div>
    );
  }

  if (collections.total === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Layers />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>No Collections yet</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>
            A Collection says which fields each of its Entries holds, such as a
            title, a date and a cover. Create the first one to start writing.
          </Trans>
        </EmptyDescription>
        <EmptyActions>
          <Button
            Icon={Plus}
            className="no-underline"
            render={
              <Link
                to="/projects/$projectId/collections/create"
                params={{ projectId }}
              />
            }
          >
            <Trans>Create Collection</Trans>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <p className="px-(--pane-edge) py-5">
      <Trans>Choose a Collection in the sidebar to see its Entries.</Trans>
    </p>
  );
}

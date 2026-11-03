import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

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
 * what to do next: pick one, or create the first.
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

  return (
    <p className="px-(--pane-edge) py-5">
      {collections.total === 0 ? (
        <Trans>No Collections yet</Trans>
      ) : (
        <Trans>Choose a Collection in the sidebar to see its Entries.</Trans>
      )}
    </p>
  );
}

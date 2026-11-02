import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import {
  CollectionsSidebar,
  CollectionsSidebarSkeleton,
} from '@renderer/components/collections-sidebar';
import { Pane, Panes } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute('/projects/$projectId/collections')({
  component: ProjectCollectionsLayout,
});

function ProjectCollectionsLayout(): ReactElement {
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Collections');
  const { data: collections, isPending: isListingCollections } =
    useQueryNoError(
      queryOptions.collections.list({
        projectId,
        limit: 0,
      })
    );

  return (
    <Panes>
      <Pane width="list">
        {isListingCollections ? (
          <CollectionsSidebarSkeleton projectId={projectId} />
        ) : (
          <CollectionsSidebar projectId={projectId} collections={collections} />
        )}
      </Pane>
      <Pane>
        <Outlet />
      </Pane>
    </Panes>
  );
}

import { useLingui } from '@lingui/react/macro';
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

/**
 * The list of Collections, read inside the pane that shows it.
 *
 * A component of its own, so the list's own read is answered in the list's
 * pane. Read in the layout above both panes it would take the Collection
 * beside it down with it, which does not depend on it. See
 * contributing/error-handling.md.
 */
function CollectionList({ projectId }: { projectId: string }): ReactElement {
  const { data: collections, isPending: isListingCollections } =
    useQueryNoError(
      queryOptions.collections.list({
        projectId,
        limit: 0,
      })
    );

  if (isListingCollections) {
    return <CollectionsSidebarSkeleton projectId={projectId} />;
  }

  return <CollectionsSidebar projectId={projectId} collections={collections} />;
}

function ProjectCollectionsLayout(): ReactElement {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Collections`);

  return (
    <Panes>
      <Pane width="list" name={t`the Collections of this Project`}>
        <CollectionList projectId={projectId} />
      </Pane>
      <Pane name={t`what this screen shows`}>
        <Outlet />
      </Pane>
    </Panes>
  );
}

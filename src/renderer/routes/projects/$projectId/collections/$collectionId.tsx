import { useLingui } from '@lingui/react/macro';
import { Outlet, createFileRoute, useMatches } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { EntryListPane } from '@renderer/components/entry-list';
import { Pane, Panes } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId'
)({
  component: ProjectCollectionLayout,
});

/**
 * The settings of a Collection, which ci draws as one page rather than beside
 * the list of its Entries.
 */
// The route's own id, which nobody reads as words.
// eslint-disable-next-line lingui/no-unlocalized-strings
const SETTINGS_ROUTE = '/projects/$projectId/collections/$collectionId/update';

/**
 * A Collection's Entries beside whatever of it is open: an Entry's editor with
 * its History, the form for a new Entry, or nothing at all.
 *
 * It is a layout route, so the list stays as it is while an Entry opens, is
 * saved or is left, which is what keeps a filter somebody typed and the place
 * they had scrolled to.
 */
function ProjectCollectionLayout(): ReactElement {
  const { t } = useLingui();

  const { projectId, collectionId } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    translateContent,
  } = useProject();
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({
      projectId: projectId,
      id: collectionId,
    })
  );
  const { data: entries, isPending: isListingEntries } = useQueryNoError(
    queryOptions.entries.list({ projectId, collectionId, limit: 0 })
  );
  useBreadcrumb(
    Route,
    isReadingCollection
      ? undefined
      : translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        })
  );
  // The settings take the whole panel, so the list of Entries stands beside
  // the screens it belongs to and nothing else.
  const isSettingsOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === SETTINGS_ROUTE),
  });

  if (isSettingsOpen) {
    return <Outlet />;
  }

  return (
    <Panes>
      <Pane width="list" name={t`the Entries of this Collection`}>
        {isReadingProject ? null : (
          <EntryListPane
            project={project}
            collection={isReadingCollection ? undefined : collection}
            entries={isListingEntries ? undefined : entries.list}
          />
        )}
      </Pane>
      <Outlet />
    </Panes>
  );
}

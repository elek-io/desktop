import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { entryTitle } from '@renderer/components/fields/entry-title';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { flattenFieldDefinitions } from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/$entryId'
)({
  component: ProjectCollectionEntryLayout,
});

function ProjectCollectionEntryLayout(): ReactElement {
  const { projectId, collectionId, entryId } = Route.useParams();
  const {
    userQuery: { data: user },
  } = useProject();
  const { data: entry, isPending: isReadingEntry } = useQueryNoError(
    queryOptions.entries.read({
      projectId,
      collectionId,
      id: entryId,
    })
  );
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({ projectId, id: collectionId })
  );
  // The crumb names the Entry the way every other place does, in the language
  // the person reads the app in.
  useBreadcrumb(
    Route,
    isReadingEntry || isReadingCollection || user === null || user === undefined
      ? undefined
      : entryTitle({
          entry,
          fieldDefinitions: flattenFieldDefinitions(
            collection.fieldDefinitions
          ),
          language: user.language,
        })
  );

  return <Outlet />;
}

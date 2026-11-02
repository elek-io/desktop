import { Trans } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Plus, Settings } from 'lucide-react';
import { type ReactElement } from 'react';

import {
  EntryTable,
  EntryTableSkeleton,
} from '@renderer/components/entry-table';
import { Page } from '@renderer/components/page';
import { Button } from '@renderer/components/ui/button';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/'
)({
  component: ProjectCollectionIndexPage,
});

function ProjectCollectionIndexPage(): ReactElement {
  const router = useRouter();
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

  function Title(): string {
    if (isReadingCollection === false) {
      return translateContent({
        key: 'collection.name.plural',
        record: collection.name.plural,
      });
    }

    return '';
  }

  function Description(): ReactElement {
    return (
      <>
        {isReadingCollection === false
          ? translateContent({
              key: 'collection.description',
              record: collection.description,
            })
          : ''}
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <>
        <Button
          Icon={Plus}
          onClick={async () =>
            router.navigate({
              to: '/projects/$projectId/collections/$collectionId/create',
              params: {
                projectId,
                collectionId,
              },
            })
          }
        >
          {isReadingCollection === false
            ? `Create ${translateContent({
                key: 'currentCollection.name.singular',
                record: collection.name.singular,
              })}`
            : 'Create Entry'}
        </Button>

        <Button
          Icon={Settings}
          variant="secondary"
          onClick={async () =>
            router.navigate({
              to: '/projects/$projectId/collections/$collectionId/update',
              params: {
                projectId,
                collectionId,
              },
            })
          }
        >
          <Trans>Configure</Trans>
        </Button>
      </>
    );
  }

  return (
    <Page title={Title()} description={<Description />} actions={<Actions />}>
      {isReadingProject === false &&
      isReadingCollection === false &&
      isListingEntries === false ? (
        <EntryTable
          project={project}
          collection={collection}
          entries={entries}
        />
      ) : (
        <EntryTableSkeleton />
      )}
    </Page>
  );
}

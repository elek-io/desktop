import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { Blocks, Plus } from 'lucide-react';
import { type ReactElement } from 'react';

import { Page } from '@renderer/components/page';
import { Button } from '@renderer/components/ui/button';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { type Component } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/components/')({
  component: ProjectComponentsPage,
});

function ProjectComponentsPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  const { translateContent } = useProject();
  const { data: components, isPending: isListingComponents } = useQueryNoError(
    queryOptions.components.list({ projectId, limit: 0 })
  );

  function Description(): ReactElement {
    return (
      <Trans>
        A Component is a group of fields an Entry can hold more than once, in
        any order. A page uses them as its sections.
      </Trans>
    );
  }

  // The empty state carries the action while there is no Component, so the two
  // never repeat each other, see ci's rule for an empty state.
  function CreateAction(): ReactElement {
    return (
      <Button
        Icon={Plus}
        onClick={async () =>
          router.navigate({
            to: '/projects/$projectId/components/create',
            params: { projectId },
          })
        }
      >
        <Trans>Create Component</Trans>
      </Button>
    );
  }

  // The empty state takes the whole pane, head and all, so nothing repeats the
  // action it offers, see ci's rule for an empty state.
  if (isListingComponents === false && components.total === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Blocks />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>No Components yet</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>
            Nothing in this Project is built from Components yet. Create one to
            give a Collection a field whose sections an editor fills in.
          </Trans>
        </EmptyDescription>
        <EmptyActions>
          <CreateAction />
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <Page
      title={t`Components`}
      description={<Description />}
      actions={<>{isListingComponents ? null : <CreateAction />}</>}
    >
      {isListingComponents ? (
        <div className="grid gap-2">
          {[1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-16 w-full rounded" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-2">
          {components.list.map((component) => (
            <li key={component.id}>
              <ComponentRow
                projectId={projectId}
                component={component}
                name={translateContent({
                  key: 'component.name',
                  record: component.name,
                })}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function ComponentRow({
  projectId,
  component,
  name,
}: {
  projectId: string;
  component: Component;
  name: string;
}): ReactElement {
  const { t } = useLingui();

  const fieldCount = component.fieldDefinitions.length;

  return (
    <Link
      to="/projects/$projectId/components/$componentId"
      params={{ projectId, componentId: component.id }}
      className="flex items-center gap-4 rounded-md border p-4 hover:bg-accent"
    >
      <Blocks className="h-4 w-4 shrink-0" />
      <span className="font-medium">{name}</span>
      <span className="text-sm text-muted-foreground">{component.slug}</span>
      <span className="ml-auto text-sm text-muted-foreground">
        {t`${plural(fieldCount, { one: '# field', other: '# fields' })}`}
      </span>
    </Link>
  );
}

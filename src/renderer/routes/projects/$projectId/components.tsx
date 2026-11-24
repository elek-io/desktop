import { Trans, useLingui } from '@lingui/react/macro';
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
} from '@tanstack/react-router';
import { Blocks, Plus } from 'lucide-react';
import type { ReactElement } from 'react';

import { ComponentListPane } from '@renderer/components/component-list';
import { Pane, Panes } from '@renderer/components/pane';
import { Button } from '@renderer/components/ui/button';
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

export const Route = createFileRoute('/projects/$projectId/components')({
  component: ProjectComponentsLayout,
});

/** Where Components stands with no Component chosen, which nobody reads. */
// eslint-disable-next-line lingui/no-unlocalized-strings
const INDEX_ROUTE = '/projects/$projectId/components/';

/**
 * The Components of a Project beside the chosen one, or the empty state while
 * the Project has none.
 *
 * It is a layout route, so the list stays as it is while one Component opens
 * after another, which keeps the place somebody had scrolled to and the row
 * they came from marked.
 */
function ProjectComponentsLayout(): ReactElement {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Components`);
  const { data: components, isPending: isListingComponents } = useQueryNoError(
    queryOptions.components.list({ projectId, limit: 0 })
  );
  // Whether anything stands beside the list, which is what the empty state
  // takes the place of. Create Component is open while the first one is being
  // written, and then the screen is not empty any more.
  const isIndexOpen = useMatches({
    select: (matches) => matches.some((match) => match.routeId === INDEX_ROUTE),
  });

  // The empty state takes the whole panel, head and all, so nothing repeats
  // the action it offers, see ci's rule for an empty state. Create Component
  // stands in it, because the list beside it would hold the only other way to
  // one.
  if (isListingComponents === false && components.total === 0 && isIndexOpen) {
    return (
      <Pane name={t`the Components of this Project`}>
        <Empty>
          <EmptyMedia>
            <Blocks />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>No Components yet</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>
              Nothing in this Project is built from Components yet. Create one
              to give a Collection a field whose sections an editor fills in.
            </Trans>
          </EmptyDescription>
          <EmptyActions>
            <Button
              Icon={Plus}
              className="no-underline"
              render={
                <Link
                  to="/projects/$projectId/components/create"
                  params={{ projectId }}
                />
              }
            >
              <Trans>Create Component</Trans>
            </Button>
          </EmptyActions>
        </Empty>
      </Pane>
    );
  }

  return (
    <Panes>
      <Pane width="list" name={t`the Components of this Project`}>
        <ComponentListPane
          projectId={projectId}
          components={isListingComponents ? undefined : components.list}
        />
      </Pane>
      <Outlet />
    </Panes>
  );
}

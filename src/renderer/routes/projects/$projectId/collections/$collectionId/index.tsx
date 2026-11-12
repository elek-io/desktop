import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { Pane } from '@renderer/components/pane';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/'
)({
  component: ProjectCollectionIndexPage,
});

/**
 * What stands beside the list of Entries while none is open.
 *
 * In plain text without the gradient, because the Collection itself is not
 * empty, which is the same reason a filter without matches says so plainly.
 * The list beside it holds both ways on, the Entry to open and the one that
 * creates a new one, so nothing here repeats either.
 */
function ProjectCollectionIndexPage(): ReactElement {
  const { t } = useLingui();

  return (
    <Pane name={t`this Collection`}>
      <div className="flex flex-1 items-center justify-center p-(--pane-edge)">
        <p className="text-center text-muted-foreground">
          <Trans>No Entry chosen</Trans>
        </p>
      </div>
    </Pane>
  );
}

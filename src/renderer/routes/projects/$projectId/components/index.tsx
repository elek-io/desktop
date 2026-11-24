import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { Pane } from '@renderer/components/pane';

export const Route = createFileRoute('/projects/$projectId/components/')({
  component: ProjectComponentsIndexPage,
});

/**
 * What stands beside the list of Components while none is chosen.
 *
 * In plain text without the gradient, because the Project holds a Component,
 * which is the same reason a filter without matches says so plainly. The list
 * beside it holds both ways on, the Component to open and Create Component, so
 * nothing here repeats either.
 */
function ProjectComponentsIndexPage(): ReactElement {
  const { t } = useLingui();

  return (
    <Pane name={t`this Component`}>
      <div className="flex flex-1 items-center justify-center p-(--pane-edge)">
        <p className="text-center text-muted-foreground">
          <Trans>No Component chosen</Trans>
        </p>
      </div>
    </Pane>
  );
}

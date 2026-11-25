import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { Pane } from '@renderer/components/pane';

export const Route = createFileRoute('/projects/$projectId/history/')({
  component: ProjectHistoryIndexPage,
});

/**
 * What stands beside the list of changes while none is chosen.
 *
 * In plain text without the gradient, because the Project has changed, which
 * is the same reason a filter without matches says so plainly. The list beside
 * it holds the way on, so nothing here repeats it.
 */
function ProjectHistoryIndexPage(): ReactElement {
  const { t } = useLingui();

  return (
    <Pane name={t`this change`}>
      <div className="flex flex-1 items-center justify-center p-(--pane-edge)">
        <p className="text-center text-muted-foreground">
          <Trans>No change chosen</Trans>
        </p>
      </div>
    </Pane>
  );
}

import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { Pane } from '@renderer/components/pane';

export const Route = createFileRoute('/projects/$projectId/releases/')({
  component: ProjectReleasesIndexPage,
});

/**
 * What stands beside the list of Releases while none is chosen.
 *
 * In plain text without the gradient, because the Project has published
 * something, which is the same reason a filter without matches says so
 * plainly. The list beside it holds both ways on, the Release to open and
 * Create Release, so nothing here repeats either.
 */
function ProjectReleasesIndexPage(): ReactElement {
  const { t } = useLingui();

  return (
    <Pane name={t`this Release`}>
      <div className="flex flex-1 items-center justify-center p-(--pane-edge)">
        <p className="text-center text-muted-foreground">
          <Trans>No Release chosen</Trans>
        </p>
      </div>
    </Pane>
  );
}

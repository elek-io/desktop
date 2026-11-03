import { useLingui } from '@lingui/react/macro';
import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/collections')({
  component: ProjectCollectionsLayout,
});

/**
 * Everything under Collections, which the Project's sidebar leads to.
 *
 * The layout holds no list of its own: every Collection of the Project is a row
 * of that one sidebar, so what opens here takes the whole panel.
 */
function ProjectCollectionsLayout(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, t`Collections`);

  return <Outlet />;
}

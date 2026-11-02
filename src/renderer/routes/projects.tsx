import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects')({
  component: ProjectsLayout,
});

/**
 * Only the Projects crumb. The main panel is rendered by each screen below
 * this route, because a Project's screens have the sidebar beside their panel
 * and the Projects page has none.
 */
function ProjectsLayout(): ReactElement {
  useBreadcrumb(Route, 'Projects');

  return <Outlet />;
}

import { Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/components')({
  component: ProjectComponentsLayout,
});

function ProjectComponentsLayout(): ReactElement {
  useBreadcrumb(Route, 'Components');

  return <Outlet />;
}

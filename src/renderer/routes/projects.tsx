import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Pane, Panel } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects')({
  component: ProjectsLayout,
});

function ProjectsLayout(): ReactElement {
  useBreadcrumb(Route, 'Projects');

  return (
    <Panel>
      <Pane>
        <Outlet />
      </Pane>
    </Panel>
  );
}

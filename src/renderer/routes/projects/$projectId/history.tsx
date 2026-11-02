import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import {
  HistorySidebar,
  HistorySidebarSkeleton,
} from '@renderer/components/history-sidebar';
import { Pane, Panes } from '@renderer/components/pane';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';

export const Route = createFileRoute('/projects/$projectId/history')({
  component: ProjectHistoryLayout,
});

function ProjectHistoryLayout(): ReactElement {
  useBreadcrumb(Route, 'History');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();

  return (
    <Panes>
      <Pane width="list" name="the changes of this Project">
        {isReadingProject ? (
          <HistorySidebarSkeleton />
        ) : (
          <HistorySidebar project={project} />
        )}
      </Pane>
      <Pane>
        <Outlet />
      </Pane>
    </Panes>
  );
}

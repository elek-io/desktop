import { useLingui } from '@lingui/react/macro';
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

/**
 * The changes of a Project beside the chosen one.
 *
 * It is a layout route, so the list stays as it is while one change opens after
 * another, which keeps the place somebody had scrolled to.
 */
function ProjectHistoryLayout(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, t`History`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();

  return (
    <Panes>
      <Pane width="list" name={t`the changes of this Project`}>
        {isReadingProject ? (
          <HistorySidebarSkeleton />
        ) : (
          <HistorySidebar project={project} />
        )}
      </Pane>
      <Outlet />
    </Panes>
  );
}

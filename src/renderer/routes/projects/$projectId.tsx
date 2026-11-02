import { Outlet, createFileRoute } from '@tanstack/react-router';

import { Pane, Panel } from '@renderer/components/pane';
import { ProjectSidebar } from '@renderer/components/project-sidebar';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { ProjectProvider } from '@renderer/providers/ProjectProvider';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
});

function ProjectLayoutContent(): React.JSX.Element {
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  useBreadcrumb(Route, isReadingProject === false ? project.name : undefined);

  return (
    <>
      <ProjectSidebar />
      {/*
        The sidebar's own padding is the gap to the panel, so the panel takes
        none on that side.
      */}
      <Panel className="ml-0">
        <Pane>
          <Outlet />
        </Pane>
      </Panel>
    </>
  );
}

function ProjectLayout(): React.JSX.Element {
  const { projectId } = Route.useParams();

  return (
    <ProjectProvider projectId={projectId}>
      <ProjectLayoutContent />
    </ProjectProvider>
  );
}

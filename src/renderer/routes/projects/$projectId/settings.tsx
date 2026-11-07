import { Trans, useLingui } from '@lingui/react/macro';
import { Link, Outlet, createFileRoute } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { Pane, PaneHead, Panes } from '@renderer/components/pane';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { SkeletonRows } from '@renderer/components/ui/skeleton';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { gitHostOf } from '@renderer/lib/gitHost';

export const Route = createFileRoute('/projects/$projectId/settings')({
  component: ProjectSettingsLayout,
});

/**
 * One page of the Settings in the list beside them: what it is called and what
 * it holds.
 *
 * The chosen row takes the muted surface and the bar, and the whole row opens
 * the page, so there is one way in and the focus ring is drawn inside the row,
 * which the pane's edge would otherwise clip.
 */
function SettingsRow({
  to,
  projectId,
  title,
  line,
}: {
  to:
    | '/projects/$projectId/settings/general'
    | '/projects/$projectId/settings/version-control';
  projectId: string;
  title: ReactNode;
  line: ReactNode;
}): ReactElement {
  return (
    <Link
      to={to}
      params={{ projectId }}
      activeProps={{ 'data-active': true }}
      className="flex gap-2.5 border-b px-(--pane-edge) py-2.5 no-underline hover:bg-muted/50 focus-visible:-outline-offset-4 data-active:bg-muted data-active:shadow-[inset_2px_0_0_var(--color-foreground)]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label">{title}</span>
        <span className="mt-0.5 truncate text-small text-muted-foreground">
          {line}
        </span>
      </span>
    </Link>
  );
}

/**
 * The pages of a Project's Settings, in the list of 296 px beside the chosen
 * one.
 *
 * Several pages rather than one, because elek.io Cloud adds more. Each row
 * says what its page holds, and Sync says where the Project syncs, so the list
 * answers that without the page being opened.
 */
function SettingsList(): ReactElement {
  const { t } = useLingui();

  const {
    projectId,
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();

  if (isReadingProject) {
    return <SkeletonRows rows={2} label={t`Reading these Settings`} />;
  }

  const { remoteOriginUrl } = project;

  return (
    <div className="-mx-(--pane-edge) border-t">
      <SettingsRow
        to="/projects/$projectId/settings/general"
        projectId={projectId}
        title={<Trans>General</Trans>}
        line={<Trans>Name, description and languages</Trans>}
      />
      <SettingsRow
        to="/projects/$projectId/settings/version-control"
        projectId={projectId}
        title={<Trans>Sync</Trans>}
        line={
          remoteOriginUrl === null ? (
            <Trans>This computer only</Trans>
          ) : (
            gitHostOf(remoteOriginUrl).name
          )
        }
      />
    </div>
  );
}

function ProjectSettingsLayout(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, t`Settings`);

  return (
    <Panes>
      <Pane width="list" name={t`the pages of these Settings`}>
        <PaneHead>
          <span className="text-label">
            <Trans>Settings</Trans>
          </span>
        </PaneHead>
        <ScrollArea className="flex-1">
          <div className="px-(--pane-edge) pb-6">
            <SettingsList />
          </div>
        </ScrollArea>
      </Pane>
      <Pane name={t`this page of these Settings`}>
        <Outlet />
      </Pane>
    </Panes>
  );
}

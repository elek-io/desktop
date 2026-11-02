import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { Link, type ToPathOption } from '@tanstack/react-router';
import {
  Blocks,
  Layers,
  LayoutDashboard,
  Settings,
  Image,
  History,
  type LucideIcon,
  ArrowDownUp,
  RefreshCw,
  DownloadCloud,
  UploadCloud,
  Rocket,
} from 'lucide-react';
import React, { useState } from 'react';

import {
  ProjectSwitcher,
  ProjectSwitcherSkeleton,
} from '@renderer/components/project-switcher';
import { Button } from '@renderer/components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from '@renderer/components/ui/button-group';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { queryOptions } from '@renderer/queries';

import { type CoreErrorType } from '@elek-io/core';

function ProjectNavigation(): React.JSX.Element {
  const { t } = useLingui();

  // Built here rather than at module scope, so each label reads the catalog in
  // use rather than the one active at import time.
  const projectNavigation: {
    label: string;
    to: ToPathOption; // @todo fix type
    icon: LucideIcon;
  }[] = [
    {
      label: t`Dashboard`,
      to: '/projects/$projectId/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: t`Assets`,
      to: '/projects/$projectId/assets',
      icon: Image,
    },
    {
      label: t`Collections`,
      to: '/projects/$projectId/collections',
      icon: Layers,
    },
    {
      label: t`Components`,
      to: '/projects/$projectId/components',
      icon: Blocks,
    },
    {
      label: t`History`,
      to: '/projects/$projectId/history',
      icon: History,
    },
    {
      label: t`Releases`,
      to: '/projects/$projectId/releases',
      icon: Rocket,
    },
    {
      label: t`Settings`,
      to: '/projects/$projectId/settings',
      icon: Settings,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="shrink-0">
        <Trans>Navigation</Trans>
      </SidebarGroupLabel>
      <SidebarGroupContent className="shrink-0">
        <SidebarMenu>
          {projectNavigation.map((item) => (
            <SidebarMenuItem className="shrink-0" key={item.to}>
              <SidebarMenuButton
                render={
                  <Link to={item.to} activeProps={{ 'data-active': true }} />
                }
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// Copy for a failed sync, keyed by CoreError type. Each text names only what
// Core raises that type for while synchronizing: a Conflict for a reference
// whose target is gone from the integrated tree, and for PreconditionFailed
// the three causes an editor meets, a repository holding something else, a
// Git LFS endpoint that will not take the Assets and a textual rebase
// conflict. An unreachable repository is neither type and reaches the root
// error boundary. See contributing/error-handling.md.
const syncErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    Conflict: msg`An Entry in this Project points at an Entry or an Asset that no longer exists, so no change reached the Git repository. Open that Entry, point it at something else or clear the field, then synchronize again.`,
    PreconditionFailed: msg`No change reached the Git repository. It may hold something besides this Project, it may not be able to store Assets, or the same text may have been changed here and somewhere else. Your changes on this computer are safe. Ask whoever set up this Project.`,
  };

const syncErrorFallback = msg`The synchronization stopped, and no change reached the Git repository. Your changes on this computer are safe. Please try again.`;

export function ProjectSidebar(): React.JSX.Element {
  const { t } = useLingui();

  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const {
    data: projectChanges,
    isFetching: isFetchingProjectChanges,
    refetch: refetchProjectChanges,
  } = useQueryNoError(queryOptions.projects.getChanges(project));

  const [isSyncConflictDialogOpen, setIsSyncConflictDialogOpen] =
    useState(false);
  const [syncError, setSyncError] = useState<unknown>(null);
  // A sync failure we can explain is handled in place.
  // See contributing/error-handling.md.
  const openSyncConflictDialog = (error: unknown): void => {
    setSyncError(error);
    setIsSyncConflictDialogOpen(true);
  };
  const {
    mutateAsync: synchronizeProject,
    isPending: isSynchronizingProject,
    handleError: handleSyncError,
  } = useAppMutation(queryOptions.projects.synchronize, {
    handled: {
      Conflict: openSyncConflictDialog,
      PreconditionFailed: openSyncConflictDialog,
    },
  });

  if (isReadingProject) {
    return <ProjectSidebarSkeleton />;
  }

  const { type: syncErrorType } = parseIpcError(syncError);

  return (
    <Sidebar>
      {/*
        What belongs to the Project keeps its room above the navigation, which
        is what scrolls.
      */}
      <SidebarHeader className="shrink-0">
        <ProjectSwitcher project={project} />
      </SidebarHeader>
      {/*
        The navigation scrolls at full row height: no row is allowed to shrink,
        so the smallest window the app supports scrolls the list instead of
        squeezing every row until it fits.
      */}
      <SidebarContent className="[&>*]:shrink-0">
        {project.remoteOriginUrl != null ? (
          <SidebarGroup>
            <ButtonGroup className="w-full">
              <Button
                className="flex-1"
                onClick={async () => {
                  try {
                    await synchronizeProject({ id: project.id });
                  } catch (error) {
                    handleSyncError(error);
                  }
                }}
                isLoading={isSynchronizingProject}
                disabled={
                  isFetchingProjectChanges ||
                  isSynchronizingProject ||
                  projectChanges === undefined ||
                  (projectChanges.ahead.length === 0 &&
                    projectChanges.behind.length === 0)
                }
                Icon={ArrowDownUp}
              >
                <Trans>Synchronize</Trans>
              </Button>
              <ButtonGroupSeparator />
              <Button
                onClick={async () => await refetchProjectChanges()}
                disabled={isFetchingProjectChanges || isSynchronizingProject}
                Icon={RefreshCw}
              >
                <span className="sr-only">
                  <Trans>Refresh changes</Trans>
                </span>
              </Button>
            </ButtonGroup>
            <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
              {isFetchingProjectChanges ? (
                t`Loading`
              ) : (
                <span className="flex items-center justify-center">
                  <DownloadCloud className="mr-1 h-4 w-4" />
                  {projectChanges?.behind.length}
                  <UploadCloud className="mr-1 ml-4 h-4 w-4" />
                  {projectChanges?.ahead.length}
                </span>
              )}
            </p>

            <Dialog
              open={isSyncConflictDialogOpen}
              onOpenChange={setIsSyncConflictDialogOpen}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    <Trans>Could not synchronize this Project</Trans>
                  </DialogTitle>
                  <DialogDescription>
                    {describeCoreError(
                      syncErrorType,
                      syncErrorDescriptions,
                      syncErrorFallback
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={<Button type="button" variant="secondary" />}
                  >
                    <Trans>Close</Trans>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarGroup>
        ) : null}
        <ProjectNavigation />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

export function ProjectSidebarSkeleton(): React.JSX.Element {
  return (
    <Sidebar>
      <SidebarHeader className="shrink-0">
        <ProjectSwitcherSkeleton />
      </SidebarHeader>
      <SidebarContent className="[&>*]:shrink-0">
        <ProjectNavigation />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

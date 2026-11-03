import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { Link } from '@tanstack/react-router';
import {
  Blocks,
  Layers,
  LayoutDashboard,
  Settings,
  Images,
  History,
  type LucideIcon,
  ArrowDownUp,
  RefreshCw,
  DownloadCloud,
  UploadCloud,
  Tag,
  Plus,
  Search,
} from 'lucide-react';
import React, { useId, useState } from 'react';

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
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarSeparator,
} from '@renderer/components/ui/sidebar';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { queryOptions } from '@renderer/queries';

import { type CoreErrorType } from '@elek-io/core';

/**
 * The search across a Project, which Core cannot do yet.
 *
 * It keeps its place rather than being left out, so the sidebar does not change
 * shape once Core can search, and it says when that is instead of only looking
 * unavailable. It carries `aria-disabled` rather than `disabled`, so it stays
 * in the tab order and a screen reader reaches the sentence that says why, and
 * it keeps the muted surface at full contrast instead of fading, as ci's
 * Sidebar rules it. The shortcut comes with the search itself, so none is shown
 * here.
 */
function ProjectSearch(): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled
      focusableWhenDisabled
      Icon={Search}
      data-slot="sidebar-search"
      className="w-full justify-start gap-2 bg-muted text-muted-foreground aria-disabled:opacity-100"
    >
      <Trans>Search comes later</Trans>
    </Button>
  );
}

/**
 * One row of the navigation: an icon, what the row opens, and how many things
 * it holds where ci draws a count.
 *
 * The number stands at the right as ci draws it, and a long name is cut instead
 * of pushing it out of the row. A row whose own name does not say what the
 * number counts, which is every Collection, passes `counted` and says it in
 * words instead of reading out the bare number.
 */
function NavigationRow({
  link,
  icon: Icon,
  label,
  count,
  counted,
}: {
  /** The `Link` this row is, so each one keeps the params its route takes. */
  link: React.ReactElement;
  icon: LucideIcon;
  label: string;
  /** How many things the row's page holds, or nothing while it is read. */
  count?: number | undefined;
  /**
   * The same number in the words a screen reader reads instead of it, such as
   * "3 Entries". Left out where the row's own name says what is counted.
   */
  counted?: string | undefined;
}): React.JSX.Element {
  return (
    <SidebarMenuItem className="shrink-0">
      <SidebarMenuButton
        render={link}
        className="text-muted-foreground data-active:bg-background data-active:text-foreground data-active:ring-1 data-active:shadow-raised data-active:ring-border dark:data-active:bg-muted dark:data-active:ring-0"
      >
        <Icon />
        <span className="truncate">{label}</span>
        {count === undefined ? null : (
          <>
            <span
              aria-hidden={counted === undefined ? undefined : 'true'}
              className="ml-auto shrink-0 text-small text-muted-foreground"
            >
              {count}
            </span>
            {counted === undefined ? null : (
              <span className="sr-only">{counted}</span>
            )}
          </>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Everything of a Project that has a page, in ci's order: the Dashboard, Assets
 * and Components, then every Collection under its label, then the History,
 * Releases and Settings.
 *
 * No label heads the Project's own pages, since every row belongs to the
 * Project, and a rule inset to the column of the icons ends the Collections, so
 * the three rows below them do not read as Collections.
 */
function ProjectNavigation(): React.JSX.Element {
  const { t } = useLingui();

  const { projectId, translateContent } = useProject();
  const { data: assetCount, isPending: isCountingAssets } = useQueryNoError(
    queryOptions.assets.count({ projectId })
  );
  const { data: componentCount, isPending: isCountingComponents } =
    useQueryNoError(queryOptions.components.count({ projectId }));
  // Core counts no Releases, so the number comes from the list of them, which
  // the Releases screen reads through the same query.
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );
  const { data: collections, isPending: isListingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const collectionList = isListingCollections ? [] : collections.list;
  const entryCounts = useQueriesNoError(
    collectionList.map((collection) =>
      queryOptions.entries.count({ projectId, collectionId: collection.id })
    )
  );
  const collectionsLabelId = useId();
  // Each count is `undefined` while it is still being read, so a row shows no
  // number before the number is known rather than a zero that then changes.
  const assetTotal = isCountingAssets ? undefined : assetCount;
  const componentTotal = isCountingComponents ? undefined : componentCount;
  const releaseTotal = isListingReleases ? undefined : releases.total;

  return (
    <>
      {/*
        The Project's own pages. No label heads them, since every row of the
        navigation belongs to the Project.
      */}
      <SidebarGroup className="shrink-0 py-0">
        <SidebarGroupContent className="shrink-0">
          <SidebarMenu>
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/dashboard"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={LayoutDashboard}
              label={t`Dashboard`}
            />
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/assets"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={Images}
              label={t`Assets`}
              count={assetTotal}
            />
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/components"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={Blocks}
              label={t`Components`}
              count={componentTotal}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/*
        Every Collection by its own plural name, with how many Entries it holds.
        An empty group shows its label and its button alone, because the button
        is the way to add the first Collection.
      */}
      <SidebarGroup className="shrink-0 py-0">
        <SidebarGroupLabel className="mt-3 mb-1 justify-between pr-2">
          <span id={collectionsLabelId}>
            <Trans>Collections</Trans>
          </span>
          {/*
            A link rather than a button, because it opens a page, and the
            registry's group action rather than a `Button`, which would mark
            what it renders as a button whatever element it is. It sits in the
            label's own row, so the positioning the registry gives it goes.
          */}
          <SidebarGroupAction
            className="relative top-auto right-auto -mr-1 size-6 text-muted-foreground"
            render={
              <Link
                to="/projects/$projectId/collections/create"
                params={{ projectId }}
                aria-label={t`Create Collection`}
                activeProps={{ 'data-active': true }}
              />
            }
          >
            <Plus />
          </SidebarGroupAction>
        </SidebarGroupLabel>
        <SidebarGroupContent className="shrink-0">
          <SidebarMenu aria-labelledby={collectionsLabelId}>
            {isListingCollections
              ? [1, 2, 3].map((key) => (
                  <SidebarMenuItem className="shrink-0" key={key}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))
              : collectionList.map((collection, index) => {
                  const entryQuery = entryCounts[index];
                  const entryTotal =
                    entryQuery === undefined || entryQuery.isPending
                      ? undefined
                      : entryQuery.data;

                  return (
                    <NavigationRow
                      key={collection.id}
                      link={
                        <Link
                          to="/projects/$projectId/collections/$collectionId"
                          params={{ projectId, collectionId: collection.id }}
                          activeProps={{ 'data-active': true }}
                        />
                      }
                      icon={Layers}
                      label={translateContent({
                        key: 'collection.name.plural',
                        record: collection.name.plural,
                      })}
                      count={entryTotal}
                      counted={
                        entryTotal === undefined
                          ? undefined
                          : t`${plural(entryTotal, { one: '# Entry', other: '# Entries' })}`
                      }
                    />
                  );
                })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/*
        The rule that ends the Collections, inset to the column of the icons and
        the counts, so the three rows below it do not read as Collections. The
        inset is the wrapper's padding, because the rule itself spans whatever
        it sits in.
      */}
      <div className="shrink-0 px-4 py-2">
        <SidebarSeparator className="mx-0" />
      </div>

      <SidebarGroup className="shrink-0 py-0">
        <SidebarGroupContent className="shrink-0">
          <SidebarMenu>
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/history"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={History}
              label={t`History`}
            />
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/releases"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={Tag}
              label={t`Releases`}
              count={releaseTotal}
            />
            <NavigationRow
              link={
                <Link
                  to="/projects/$projectId/settings"
                  params={{ projectId }}
                  activeProps={{ 'data-active': true }}
                />
              }
              icon={Settings}
              label={t`Settings`}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
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
      {project.remoteOriginUrl != null ? (
        <SidebarGroup className="shrink-0">
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
      {/*
        Below the Project card, and above the navigation, which is the only part
        that scrolls.
      */}
      <SidebarGroup className="shrink-0 pt-0 pb-2">
        <ProjectSearch />
      </SidebarGroup>
      {/*
        The navigation scrolls at full row height: no row is allowed to shrink,
        so the smallest window the app supports scrolls the list instead of
        squeezing every row until it fits.
      */}
      <SidebarContent className="gap-0 [&>*]:shrink-0">
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
      <SidebarGroup className="shrink-0 pt-0 pb-2">
        <ProjectSearch />
      </SidebarGroup>
      <SidebarContent className="gap-0 [&>*]:shrink-0">
        <ProjectNavigation />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
  Blocks,
  Layers,
  LayoutDashboard,
  Settings,
  Images,
  History,
  type LucideIcon,
  CircleAlert,
  HardDrive,
  RefreshCw,
  Tag,
  Plus,
  Search,
} from 'lucide-react';
import React, { useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  CheckFailureLine,
  LastChecked,
  ReleaseLine,
  StateIcon,
  StateLine,
  StateMarker,
  SyncStateLines,
} from '@renderer/components/project-state';
import {
  ProjectSwitcher,
  ProjectSwitcherSkeleton,
} from '@renderer/components/project-switcher';
import { SyncDialog } from '@renderer/components/sync-dialog';
import { Button } from '@renderer/components/ui/button';
import {
  Sidebar,
  SidebarContent,
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
import { useProjectState } from '@renderer/hooks/useProjectState';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { syncRefusalHandlers } from '@renderer/lib/sync';
import { cn } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import { type Project } from '@elek-io/core';

/** ci's link: the text color with the 2 px underline of the way forward. */
const CARD_LINK = cn(
  'underline decoration-link-underline decoration-2 underline-offset-2'
);

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
 *
 * Its icon stands on ci's one column with every row's: the group around it
 * takes no horizontal padding, and the `sm` button's own 10 px plus its border
 * are the 11 px ci puts an icon inside a row.
 */
function ProjectSearch(): React.JSX.Element {
  return (
    <Button
      variant="outline"
      disabled
      focusableWhenDisabled
      Icon={Search}
      className="w-full justify-start gap-2 bg-muted font-normal text-muted-foreground aria-disabled:opacity-100"
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
 *
 * Its icon stands 11 px inside the row, which is ci's one column for the
 * sidebar, rather than the registry's 8 px. The row itself spans the sidebar's
 * own padding, because the groups below give it none.
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
        className="px-[11px] text-muted-foreground data-active:bg-background data-active:text-foreground data-active:shadow-[var(--shadow-raised),inset_0_0_0_1px_var(--color-border)] dark:data-active:bg-muted dark:data-active:shadow-none"
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
 *
 * No group of it takes horizontal padding. Every row, the label and the rule
 * stand on ci's one column instead, 11 px inside a row whose box starts at the
 * sidebar's own 12 px, which is the column the header lockup takes too.
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
        navigation belongs to the Project. The rows of each group stand 2 px
        apart, so the open row and the row under the pointer never read as
        one, as the website's asides draw them.
      */}
      <SidebarGroup className="shrink-0 p-0">
        <SidebarGroupContent className="shrink-0">
          <SidebarMenu className="gap-0.5">
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
      <SidebarGroup className="shrink-0 p-0">
        <SidebarGroupLabel className="h-auto justify-between px-[11px] pt-3 pb-1">
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
            className="relative top-auto right-auto -my-1 -mr-1 size-6 text-muted-foreground"
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
          <SidebarMenu className="gap-0.5" aria-labelledby={collectionsLabelId}>
            {isListingCollections
              ? [1, 2, 3].map((key) => (
                  <SidebarMenuItem className="shrink-0" key={key}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))
              : collectionList.map((collection, index) => {
                  const entryQuery = entryCounts[index];
                  // Named `count`, because the name of a local reaches a
                  // translator as the plural's own placeholder, and every
                  // other place that counts Entries in words uses that name.
                  const count =
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
                      count={count}
                      counted={
                        count === undefined
                          ? undefined
                          : t`${plural(count, { one: '# Entry', other: '# Entries' })}`
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
      <div className="shrink-0 px-[11px] py-2">
        <SidebarSeparator className="mx-0" />
      </div>

      <SidebarGroup className="shrink-0 p-0">
        <SidebarGroupContent className="shrink-0">
          <SidebarMenu className="gap-0.5">
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

/**
 * The Project card: the switcher, what state the Project is in, and Sync.
 *
 * It is the first thing in the sidebar and stands on the sidebar's own column,
 * so its box starts where every row's box does and its content where every
 * row's icon does, 11 px further in. Its state belongs to the Project, which is
 * why it sits in the card rather than in the header, and Sync takes the card's
 * full width, since the Releases row leads to a Release and no button beside
 * Sync has to.
 *
 * Its state lines are the ones every card draws, from
 * `components/project-state.tsx`, and it adds the two only the open Project
 * has: when the Git repository was last checked, and a sync of its own that
 * failed. See ci's Sync table.
 */
function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const { t } = useLingui();
  const { projectId } = useProject();

  // The check of the Git repository, which this card answers itself, and the
  // Releases beside it. See contributing/error-handling.md.
  const state = useProjectState(project);
  const {
    error: checkError,
    isPending: isCheckingFirstTime,
    isFetching: isChecking,
    dataUpdatedAt: checkedAt,
    refetch: checkNow,
  } = state.check;

  const [syncError, setSyncError] = useState<unknown>(null);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const syncButton = useRef<HTMLButtonElement | null>(null);

  const synchronize = async (): Promise<void> => {
    try {
      await synchronizeProject({ id: project.id });
      // A sync that went through ends the failure the card was holding.
      setSyncError(null);
    } catch (error) {
      handleSyncError(error);
    }
  };

  /**
   * A refusal the dialog can answer: in the dialog while focus is still on
   * Sync, which is where ci puts a failure somebody is waiting for, and in a
   * toast with Retry once focus has moved on, since a dialog would take the
   * keyboard away from whatever they moved to.
   */
  const answerSyncRefusal = (error: unknown): void => {
    setSyncError(error);

    if (document.activeElement === syncButton.current) {
      setIsSyncDialogOpen(true);
      return;
    }

    toast.error(t`Sync failed`, {
      action: {
        label: t`Retry`,
        onClick: () => {
          void synchronize();
        },
      },
    });
  };

  const {
    mutateAsync: synchronizeProject,
    isPending: isSynchronizing,
    handleError: handleSyncError,
  } = useAppMutation(queryOptions.projects.synchronize, {
    handled: syncRefusalHandlers(answerSyncRefusal),
  });

  const { hasGitRepository, notSynced, incoming, lastRelease } = state;
  // Sync is the retry of a check that failed, so it stays usable then. What
  // keeps it from being pressed is a sync already running, a first check that
  // has not answered, and a check that answered with nothing to sync.
  const nothingToSync =
    checkError === null && notSynced === 0 && incoming === 0;

  return (
    <div
      data-slot="project-card"
      className="rounded-lg border bg-card shadow-raised"
    >
      <ProjectSwitcher project={project} />

      <div className="flex flex-col gap-1 border-t px-2.5 pt-2 pb-2.5">
        {hasGitRepository === false ? (
          <StateLine lead={<StateIcon icon={HardDrive} />}>
            <Trans>This computer only</Trans>
          </StateLine>
        ) : (
          <SyncStateLines state={state} />
        )}

        {lastRelease === undefined ? null : (
          <StateLine lead={<StateMarker variant="release" />}>
            <ReleaseLine release={lastRelease} />
          </StateLine>
        )}

        <CheckFailureLine state={state} />

        {syncError === null ? null : (
          <StateLine
            announce
            className="text-error"
            lead={<StateIcon icon={CircleAlert} />}
          >
            <Trans>Sync failed</Trans>
            <Button
              variant="link"
              className={cn('ml-auto h-auto p-0 text-small', CARD_LINK)}
              onClick={() => setIsSyncDialogOpen(true)}
            >
              <Trans>Show why</Trans>
            </Button>
          </StateLine>
        )}

        {hasGitRepository ? (
          <>
            <div className="mt-1.5 grid">
              <Button
                ref={syncButton}
                variant="outline"
                size="sm"
                Icon={RefreshCw}
                isLoading={isSynchronizing}
                focusableWhenDisabled
                disabled={isCheckingFirstTime || nothingToSync}
                onClick={() => {
                  void synchronize();
                }}
              >
                {isSynchronizing ? t`Syncing` : t`Sync`}
              </Button>
            </div>
            <StateLine lead={null} className="justify-between">
              {checkedAt === 0 ? <span /> : <LastChecked at={checkedAt} />}
              <Button
                variant="link"
                className={cn('h-auto p-0 text-small', CARD_LINK)}
                disabled={isChecking}
                focusableWhenDisabled
                onClick={() => {
                  void checkNow();
                }}
              >
                <Trans>Check now</Trans>
              </Button>
            </StateLine>
          </>
        ) : (
          <StateLine lead={null}>
            <Link
              to="/projects/$projectId/settings/version-control"
              params={{ projectId }}
              className={CARD_LINK}
            >
              <Trans>Set up sync in Settings</Trans>
            </Link>
          </StateLine>
        )}
      </div>

      <SyncDialog
        open={isSyncDialogOpen}
        onOpenChange={setIsSyncDialogOpen}
        error={syncError}
      />
    </div>
  );
}

export function ProjectSidebar(): React.JSX.Element {
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();

  if (isReadingProject) {
    return <ProjectSidebarSkeleton />;
  }

  return (
    <Sidebar>
      {/*
        The Project card keeps its room above the navigation, which is what
        scrolls. It takes no padding of its own, so the card's box stands where
        every row's box does.
      */}
      <SidebarHeader className="shrink-0 p-0 pb-2">
        <ProjectCard project={project} />
      </SidebarHeader>
      {/*
        Below the Project card, and above the navigation, which is the only part
        that scrolls.
      */}
      <SidebarGroup className="shrink-0 p-0 pb-2">
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
    </Sidebar>
  );
}

export function ProjectSidebarSkeleton(): React.JSX.Element {
  return (
    <Sidebar>
      <SidebarHeader className="shrink-0 p-0 pb-2">
        <div
          data-slot="project-card"
          className="rounded-lg border bg-card shadow-raised"
        >
          <ProjectSwitcherSkeleton />
        </div>
      </SidebarHeader>
      <SidebarGroup className="shrink-0 p-0 pb-2">
        <ProjectSearch />
      </SidebarGroup>
      <SidebarContent className="gap-0 [&>*]:shrink-0">
        <ProjectNavigation />
      </SidebarContent>
    </Sidebar>
  );
}

import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Blocks,
  Layers,
  LayoutDashboard,
  Settings,
  Images,
  History,
  type LucideIcon,
  ArrowDown,
  CircleAlert,
  HardDrive,
  RefreshCw,
  Tag,
  TriangleAlert,
  Plus,
  Search,
} from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { checkRefusal, syncRefusalHandlers } from '@renderer/lib/sync';
import { cn } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import { type Project, type ReleaseListItem } from '@elek-io/core';

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
        navigation belongs to the Project.
      */}
      <SidebarGroup className="shrink-0 p-0">
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
          <SidebarMenu aria-labelledby={collectionsLabelId}>
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

/**
 * One line of the Project's state, in ci's own geometry: a 7 px column for the
 * marker or the icon that says the state, then what it says in words.
 *
 * Every line says its state in words, so none of them is told by its color or
 * its marker alone. A line that appears because something went wrong carries
 * `announce`, which puts it in a live region: a Git repository that stopped
 * answering, or a sync that failed, arrives while the editor is looking
 * somewhere else. The counts and the check do not, since they change on their
 * own every three minutes and nobody needs to hear that.
 */
function StateLine({
  lead,
  announce = false,
  className,
  children,
}: {
  /** The marker or the 12 px icon that stands in the line's own column. */
  lead: React.ReactNode;
  announce?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      {...(announce ? { role: 'status' } : {})}
      className={cn(
        'flex h-[22px] items-center gap-2 text-small whitespace-nowrap',
        className
      )}
    >
      <span className="grid w-[7px] flex-none place-items-center">{lead}</span>
      {children}
    </div>
  );
}

/**
 * The 7 px square ci marks a state with: hollow for a change that is not
 * synced, filled for one that is, and the brand color for a Release.
 *
 * It is hidden from a screen reader, because the words of its line already say
 * which state it marks.
 */
function StateMarker({
  variant,
}: {
  variant: 'not-synced' | 'synced' | 'release';
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-[7px] flex-none rounded-[1.5px]',
        variant === 'not-synced' && 'border-[1.5px] border-foreground bg-card',
        variant === 'synced' && 'bg-muted-foreground',
        variant === 'release' && 'bg-brand'
      )}
    />
  );
}

/** A 12 px icon centered in the same 7 px column as a marker. */
const STATE_ICON = cn('size-3 -mx-[2.5px]');

/**
 * The Release this Project last published, with the day it went out.
 *
 * The newest Release Core lists that a site can build from. A preview Release
 * tags `draft` without publishing it, so it is not the Release a Project is
 * at, and Desktop cannot make one anyway, see
 * contributing/not-yet-implemented.md.
 */
function lastPublishedRelease(
  releases: ReleaseListItem[]
): ReleaseListItem | undefined {
  return releases.find((release) => release.type === 'release');
}

/** Its version, and the day it went out in the User's own locale. */
function ReleaseLine({
  release,
}: {
  release: ReleaseListItem;
}): React.JSX.Element {
  const { t } = useLingui();
  const { formatInUserLocale } = useProject();
  const { version } = release;

  return (
    <>
      {t`Release ${version}`}
      <span className="text-muted-foreground">
        {formatInUserLocale(new Date(release.datetime), 'PP')}
      </span>
    </>
  );
}

/**
 * When the Git repository was last checked, re-read on a clock of its own.
 *
 * The check runs every three minutes, so a line that only followed the check
 * would say "just now" for three minutes at a time. This re-renders every 30
 * seconds instead, which is the shortest step the words it shows have.
 */
function LastChecked({ at }: { at: number }): React.JSX.Element {
  const { t } = useLingui();
  const { formatRelativeShort } = useProject();
  const [, setTick] = useState(0);

  useEffect(() => {
    const clock = window.setInterval(() => {
      setTick((previous) => previous + 1);
    }, 30000);

    return () => {
      window.clearInterval(clock);
    };
  }, []);

  const ago = formatRelativeShort(at);

  return (
    <span className="text-muted-foreground">
      {ago === null ? t`Checked just now` : t`Checked ${ago}`}
    </span>
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
 * The card runs the one check of the Git repository and answers its failure
 * itself, as a state line, which is the one read a screen catches rather than
 * leaving to the boundary of the pane it sits in. It logs that failure the way
 * a pane's boundary logs one, so a repository that stopped answering is in the
 * log file either way. See contributing/error-handling.md.
 */
function ProjectCard({ project }: { project: Project }): React.JSX.Element {
  const { t } = useLingui();
  const { projectId } = useProject();

  const {
    data: changes,
    error: checkError,
    isPending: isCheckingFirstTime,
    isFetching: isChecking,
    dataUpdatedAt: checkedAt,
    refetch: checkNow,
  } = useQuery(queryOptions.projects.getChanges(project));
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );

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

  // The failed check reaches the log file with its type, message and stack, as
  // a pane's boundary writes one. From an effect rather than the render body,
  // so a re-render does not write the same record again.
  useEffect(() => {
    if (checkError === null) {
      return;
    }

    void window.ipc.core.logger.error({
      source: 'desktop',
      message: `Project card check error: ${parseIpcError(checkError).message}`,
      meta: errorLogAttributes(checkError),
    });
  }, [checkError]);

  const hasGitRepository = project.remoteOriginUrl !== null;
  const notSynced = changes?.ahead.length ?? 0;
  const incoming = changes?.behind.length ?? 0;
  const lastRelease = isListingReleases
    ? undefined
    : lastPublishedRelease(releases.list);
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
          <StateLine lead={<HardDrive className={STATE_ICON} />}>
            <Trans>This computer only</Trans>
          </StateLine>
        ) : isCheckingFirstTime ? (
          <>
            <Skeleton className="h-[14px] w-32 rounded" />
            <Skeleton className="h-[14px] w-24 rounded" />
          </>
        ) : checkError !== null ? null : notSynced === 0 && incoming === 0 ? (
          <StateLine lead={<StateMarker variant="synced" />}>
            <Trans>Everything synced</Trans>
          </StateLine>
        ) : (
          <>
            {notSynced === 0 ? null : (
              <StateLine lead={<StateMarker variant="not-synced" />}>
                {t`${plural(notSynced, {
                  one: '# change not synced',
                  other: '# changes not synced',
                })}`}
              </StateLine>
            )}
            {incoming === 0 ? null : (
              <StateLine lead={<ArrowDown className={STATE_ICON} />}>
                {t`${plural(incoming, {
                  one: '# incoming change',
                  other: '# incoming changes',
                })}`}
              </StateLine>
            )}
          </>
        )}

        {lastRelease === undefined ? null : (
          <StateLine lead={<StateMarker variant="release" />}>
            <ReleaseLine release={lastRelease} />
          </StateLine>
        )}

        {checkError === null ? null : (
          <StateLine
            announce
            className="text-warning"
            lead={<TriangleAlert className={STATE_ICON} />}
          >
            {checkRefusal(checkError) === 'refused' ? (
              <Trans>The Git repository refused access</Trans>
            ) : (
              <Trans>Can&apos;t reach the Git repository</Trans>
            )}
          </StateLine>
        )}

        {syncError === null ? null : (
          <StateLine
            announce
            className="text-error"
            lead={<CircleAlert className={STATE_ICON} />}
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

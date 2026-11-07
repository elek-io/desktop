import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';

import {
  ChangeList,
  ChangeListSkeleton,
  type ChangeSyncState,
} from '@renderer/components/change-list';
import { Page } from '@renderer/components/page';
import { Button } from '@renderer/components/ui/button';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useProjectState } from '@renderer/hooks/useProjectState';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import { type Project } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/dashboard')({
  component: ProjectDashboardPage,
});

/** How many of the latest changes the Dashboard shows, as ci draws it. */
const LATEST_CHANGES = 5;

/**
 * One fact about the Project: what it counts, the number, and one line that
 * says what the number is made of.
 *
 * Every cell says its number in words below it, so the bare number is never
 * the only thing that carries the meaning.
 */
function Fact({
  label,
  value,
  line,
}: {
  label: ReactNode;
  value: ReactNode;
  line: ReactNode;
}): ReactElement {
  return (
    <div className="relative flex flex-col gap-1 px-(--pane-edge) py-5">
      <span className="text-small text-muted-foreground">{label}</span>
      <span className="text-h3">{value}</span>
      <span className="text-small text-muted-foreground">{line}</span>
    </div>
  );
}

/** A fact's number and line while the reads behind them are still running. */
function FactPlaceholder(): ReactElement {
  return <Skeleton className="h-4 w-16 rounded" />;
}

/**
 * The facts in ci's ruled row of four.
 *
 * The row spans the pane rather than the page body's text edge, so a cell's
 * rule ends on the pane's own edge the way ci draws it, which is what the
 * negative margin takes back. The rule between two cells stops short of both
 * edges by the text edge or a fifth of the cell, whichever is less, as every
 * rule between two cells does.
 */
function Facts({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="-mx-(--pane-edge) grid grid-cols-4 border-y [&>*:not(:first-child)]:before:absolute [&>*:not(:first-child)]:before:inset-y-[min(32px,20%)] [&>*:not(:first-child)]:before:left-0 [&>*:not(:first-child)]:before:w-px [&>*:not(:first-child)]:before:bg-border">
      {children}
    </div>
  );
}

/**
 * What the Project holds, read inside the pane that shows it.
 *
 * Every read here is answered by the pane's boundary, which is the rule for a
 * failed read, see contributing/error-handling.md. The one exception is the
 * check of the Git repository, which `useProjectState` answers itself and
 * which the sidebar's Project card draws beside this screen.
 */
function DashboardFacts({ project }: { project: Project }): ReactElement {
  const { t } = useLingui();

  const { formatInUserLocale } = useProject();
  const projectId = project.id;
  const { data: collections, isPending: isListingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const collectionList = isListingCollections ? [] : collections.list;
  const entryCounts = useQueriesNoError(
    collectionList.map((collection) =>
      queryOptions.entries.count({ projectId, collectionId: collection.id })
    )
  );
  // The whole list rather than Core's count, because how many of the Assets
  // are images is only in the list, and both numbers come from the one read so
  // they cannot contradict each other.
  const { data: assets, isPending: isListingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId })
  );

  const isCountingEntries = entryCounts.some((count) => count.isPending);
  const entryTotal = entryCounts.reduce(
    (total, count) => total + (count.data ?? 0),
    0
  );
  const collectionTotal = collectionList.length;
  const images = isListingAssets
    ? 0
    : assets.list.filter((asset) => asset.mimeType.startsWith('image/')).length;
  const otherFiles = isListingAssets ? 0 : assets.total - images;
  const { supported, default: defaultLanguage } = project.settings.language;
  // The default language named as the default, then the others, joined the way
  // the language the app is read in joins a list. Each name comes from the
  // system's own language data rather than from the catalog, which is why it
  // is a placeholder in the one sentence that words it, see `languageName`.
  const defaultName = languageName(defaultLanguage);
  const languageList = new Intl.ListFormat(undefined, {
    // Intl's own option names, which nobody reads.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    style: 'long',
    type: 'conjunction',
  }).format([
    t`${defaultName}, the default`,
    ...supported
      .filter((language) => language !== defaultLanguage)
      .map((language) => languageName(language)),
  ]);
  const lastRelease = isListingReleases
    ? undefined
    : releases.list.find((release) => release.type === 'release');

  return (
    <Facts>
      <Fact
        label={<Trans>Entries</Trans>}
        value={
          isListingCollections || isCountingEntries ? (
            <FactPlaceholder />
          ) : (
            entryTotal
          )
        }
        line={
          isListingCollections ? null : (
            <EntriesLine collections={collectionTotal} />
          )
        }
      />
      <Fact
        label={<Trans>Assets</Trans>}
        value={isListingAssets ? <FactPlaceholder /> : assets.total}
        line={
          isListingAssets ? null : (
            <AssetsLine
              total={assets.total}
              images={images}
              otherFiles={otherFiles}
            />
          )
        }
      />
      <Fact
        label={<Trans>Languages</Trans>}
        value={supported.length}
        line={languageList}
      />
      <Fact
        label={<Trans>Last Release</Trans>}
        value={
          isListingReleases ? (
            <FactPlaceholder />
          ) : lastRelease === undefined ? (
            <Trans>None yet</Trans>
          ) : (
            lastRelease.version
          )
        }
        line={
          lastRelease === undefined
            ? null
            : formatInUserLocale(new Date(lastRelease.datetime), 'PP')
        }
      />
    </Facts>
  );
}

/** What the Entries fact's number is made of: the Collections they are in. */
function EntriesLine({ collections }: { collections: number }): ReactElement {
  const { t } = useLingui();

  if (collections === 0) {
    return <Trans>No Collections yet</Trans>;
  }

  return (
    <>
      {t`${plural(collections, {
        one: 'in # Collection',
        other: 'in # Collections',
      })}`}
    </>
  );
}

/** What the Assets fact's number is made of: how many of them are images. */
function AssetsLine({
  total,
  images,
  otherFiles,
}: {
  total: number;
  images: number;
  otherFiles: number;
}): ReactElement {
  const { t } = useLingui();

  if (total === 0) {
    return <Trans>Nothing added yet</Trans>;
  }

  return (
    <>
      {t`${plural(images, {
        one: '# image',
        other: '# images',
      })} and ${plural(otherFiles, {
        one: '# other file',
        other: '# other files',
      })}`}
    </>
  );
}

/**
 * The latest changes of the Project, in the History's own rows.
 *
 * Whether a change is synced comes from the one check of the Git repository,
 * which the sidebar's Project card reads above this screen, so a row here
 * costs no second call. While the check has no answer, or where there is no
 * Git repository to sync with, a row claims neither state, and what stopped
 * the check stands in that card.
 */
function LatestChanges({ project }: { project: Project }): ReactElement {
  const { t } = useLingui();

  const projectId = project.id;
  const { data: history, isPending: isReadingHistory } = useQueryNoError(
    queryOptions.projects.history({ id: projectId })
  );
  const state = useProjectState(project);
  const notSynced = new Set(
    (state.check.data?.ahead ?? []).map((commit) => commit.hash)
  );
  const syncStateOf = (commitHash: string): ChangeSyncState => {
    if (state.hasGitRepository === false || state.check.data === undefined) {
      return 'unknown';
    }

    return notSynced.has(commitHash) ? 'not-synced' : 'synced';
  };

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 pb-3">
        <h2 className="text-label">
          <Trans>Latest changes</Trans>
        </h2>
        <Button
          variant="outline"
          size="sm"
          Icon={History}
          className="ml-auto no-underline"
          render={
            <Link to="/projects/$projectId/history" params={{ projectId }} />
          }
        >
          <Trans>Full History</Trans>
        </Button>
      </div>
      {isReadingHistory ? (
        <ChangeListSkeleton label={t`Reading the latest changes`} />
      ) : (
        <ChangeList
          projectId={projectId}
          commits={history.fullHistory.slice(0, LATEST_CHANGES)}
          syncStateOf={(commit) => syncStateOf(commit.hash)}
        />
      )}
    </section>
  );
}

/**
 * The Project's first page: what it holds, and what changed in it last.
 *
 * It grows with statistics once elek.io Cloud's features exist.
 */
function ProjectDashboardPage(): ReactElement {
  const { t } = useLingui();

  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  useBreadcrumb(Route, t`Dashboard`);

  return (
    <Page title={t`Dashboard`}>
      {isReadingProject ? null : (
        <>
          <DashboardFacts project={project} />
          <LatestChanges project={project} />
        </>
      )}
    </Page>
  );
}

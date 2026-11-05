import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryOptions } from '@renderer/queries';
import { type ProjectChanges } from '@renderer/queries/options/projectOptions';

import { type Project, type ReleaseListItem } from '@elek-io/core';

/**
 * The Release a Project last published, with the day it went out.
 *
 * The newest Release Core lists that a site can build from. A preview Release
 * tags `draft` without publishing it, so it is not the Release a Project is
 * at, and Desktop cannot make one anyway, see
 * contributing/not-yet-implemented.md.
 */
export function lastPublishedRelease(
  releases: ReleaseListItem[]
): ReleaseListItem | undefined {
  return releases.find((release) => release.type === 'release');
}

/** What a card knows about one Project's Git repository and its Releases. */
export interface ProjectState {
  check: UseQueryResult<ProjectChanges>;
  /** Whether the Project syncs with a Git repository at all. */
  hasGitRepository: boolean;
  notSynced: number;
  incoming: number;
  /**
   * Its last published Release, or nothing while the Releases are being read
   * and where that read failed.
   */
  lastRelease: ReleaseListItem | undefined;
  /** What stopped the Releases from being read, or `null` while nothing did. */
  releasesError: Error | null;
}

/**
 * The one check of a Project's Git repository, and the Releases beside it.
 *
 * Both are reads a card answers itself rather than leaving to the boundary of
 * the pane it sits in, so this logs each failure the way a pane's boundary logs
 * one and hands the error back for the card to draw as a state line. Every card
 * reads them through this hook, so no screen writes an `isError` branch of its
 * own. See contributing/error-handling.md.
 *
 * Each card runs its own, which is what lets a slow or failing Git repository
 * hold up nothing but its own lines. The Releases are caught here for the same
 * reason: the Projects page reads them once per card, so one Project whose
 * Releases cannot be read would otherwise empty the page of every Project.
 */
export function useProjectState(project: Project): ProjectState {
  const check = useQuery(queryOptions.projects.getChanges(project));
  const releases = useQuery({
    ...queryOptions.releases.list({ projectId: project.id }),
    throwOnError: false,
  });

  const { error: checkError } = check;
  const { error: releasesError } = releases;

  // Each read the card answers itself reaches the log file with its type,
  // message and stack, as a pane's boundary writes one. One effect each, so a
  // re-render does not write the same record again and neither failure
  // re-logs because the other arrived.
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

  useEffect(() => {
    if (releasesError === null) {
      return;
    }

    void window.ipc.core.logger.error({
      source: 'desktop',
      message: `Project card Releases error: ${parseIpcError(releasesError).message}`,
      meta: errorLogAttributes(releasesError),
    });
  }, [releasesError]);

  return {
    check,
    hasGitRepository: project.remoteOriginUrl !== null,
    notSynced: check.data?.ahead.length ?? 0,
    incoming: check.data?.behind.length ?? 0,
    lastRelease:
      releases.data === undefined
        ? undefined
        : lastPublishedRelease(releases.data.list),
    releasesError,
  };
}

import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
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
  /** Its last published Release, or nothing while the Releases are read. */
  lastRelease: ReleaseListItem | undefined;
}

/**
 * The one check of a Project's Git repository, and the Releases beside it.
 *
 * The check is the one read a screen answers itself rather than leaving to the
 * boundary of the pane it sits in, so this logs its failure the way a pane's
 * boundary logs one and hands the error back for the card to draw as a state
 * line. Every card reads it through this hook, so no screen writes an
 * `isError` branch or a `throwOnError` of its own. See
 * contributing/error-handling.md.
 *
 * Each card runs its own, which is what lets a slow or failing Git repository
 * hold up nothing but its own lines.
 */
export function useProjectState(project: Project): ProjectState {
  const check = useQuery(queryOptions.projects.getChanges(project));
  const { data: releases, isPending: isListingReleases } = useQueryNoError(
    queryOptions.releases.list({ projectId: project.id })
  );
  const { error: checkError } = check;

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

  return {
    check,
    hasGitRepository: project.remoteOriginUrl !== null,
    notSynced: check.data?.ahead.length ?? 0,
    incoming: check.data?.behind.length ?? 0,
    lastRelease: isListingReleases
      ? undefined
      : lastPublishedRelease(releases.list),
  };
}

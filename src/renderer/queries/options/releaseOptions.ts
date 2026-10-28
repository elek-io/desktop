import { parseIpcError } from '@root/src/shared/ipcError';
import { queryOptions } from '@tanstack/react-query';

import { RELEASE_READ_REFUSALS } from '@renderer/lib/release';

import type {
  CoreErrorType,
  ListReleasesProps,
  Project,
  ReleaseDiff,
} from '@elek-io/core';

import { customMutationOptions } from '../util';
import { fetchProjectChanges, projectOptions } from './projectOptions';

/**
 * What reading a pending Release answered: the diff a Release would publish, or
 * the type of the `CoreError` that stopped the read.
 *
 * A refusal is an outcome of the read rather than a failure of it, because
 * "synchronize this Project first" is something the editor acts on in the
 * dialog, exactly like "nothing to release", which Core already answers with a
 * null bump. Only the types in `RELEASE_READ_REFUSALS` become this outcome, and
 * every other failure is re-thrown to the root error boundary, so the set of
 * expected types stays one list, see contributing/error-handling.md.
 */
export type PendingRelease =
  | { status: 'readable'; diff: ReleaseDiff }
  | { status: 'refused'; errorType: CoreErrorType };

export const releaseOptions = {
  list: (props: ListReleasesProps) =>
    queryOptions({
      queryKey: ['projects', props.projectId, 'current', 'releases', 'list'],
      queryFn: async () => {
        return await window.ipc.core.releases.list(props);
      },
      throwOnError: true,
    }),

  /**
   * What a Release of this Project would publish right now.
   *
   * Pass `enabled` only while the dialog is open: the diff goes stale the
   * moment anything is saved, so it is read fresh every time and kept out of
   * the cache afterwards (`staleTime` and `gcTime` of 0).
   */
  prepare: (project?: Project) =>
    queryOptions({
      enabled: project !== undefined,
      queryKey: ['projects', project?.id, 'current', 'releases', 'pending'],
      queryFn: async ({ client }): Promise<PendingRelease> => {
        const { id, remoteOriginUrl } = project!;
        try {
          if (remoteOriginUrl !== null) {
            // prepare() never fetches, so without this the diff would compare
            // against the remote as of the last fetch and could show a version
            // and changes that are not what a Release would publish.
            // getChanges() fetches, see Core's git-and-sync docs.
            const changes = await fetchProjectChanges(id);

            // That fetch moved `origin`, so what it answered is the current
            // count, while the sidebar's own copy refreshes only every three
            // minutes and keeps Synchronize disabled until it does. Publishing
            // it keeps the button usable the moment a refusal below tells the
            // editor to synchronize. Only a successful read is published, and
            // the fetch itself stays outside the shared query: a failure
            // belongs to this dialog, which answers it in place, while the
            // shared query would retry it three times first and leave the
            // dialog on its skeleton for the whole schedule.
            client.setQueryData(
              projectOptions.getChanges(project).queryKey,
              changes
            );
          }
          return {
            status: 'readable',
            diff: await window.ipc.core.releases.prepare({ projectId: id }),
          };
        } catch (error) {
          const { type } = parseIpcError(error);
          if (type !== undefined && RELEASE_READ_REFUSALS[type] !== undefined) {
            return { status: 'refused', errorType: type };
          }
          throw error;
        }
      },
      throwOnError: true,
      staleTime: 0,
      gcTime: 0,
    }),

  create: customMutationOptions({
    mutationFn: window.ipc.core.releases.create,
    meta: {
      method: 'release',
      objectType: 'project',
    },
    toasts: {
      success: (result) => `Release ${result.version} created`,
      error: 'Could not create a Release',
    },
    onSuccess: async (_result, variables, _onMutateResult, context) => {
      // A Release writes the new version into the Project, commits, tags and
      // moves both branches, so everything read from the Project is stale.
      await context.client.invalidateQueries({
        queryKey: ['projects', 'list'],
        refetchType: 'all',
      });
      await context.client.invalidateQueries({
        queryKey: ['projects', variables.projectId],
        // Everything but the dialog's own read of what a Release would
        // publish. That one is read fresh on every open and kept out of the
        // cache afterwards, so refetching it here would only put the dialog
        // back on its skeleton while this mutation waits for the answer.
        predicate: (query) =>
          query.queryKey[3] !== 'releases' || query.queryKey[4] !== 'pending',
        refetchType: 'all',
      });
    },
  }),
};

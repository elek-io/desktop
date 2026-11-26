import { t } from '@lingui/core/macro';
import { queryOptions } from '@tanstack/react-query';

import type {
  CountEntriesProps,
  Entry,
  EntryHistoryProps,
  ListEntriesProps,
  PaginatedList,
  ReadEntryProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { customMutationOptions, mergeListWithObject } from '../util';

export const entryOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.entries.create,
    meta: {
      method: 'create',
      objectType: 'entry',
    },
    toasts: {
      success: () => t`Entry created`,
      error: () => t`Could not create the Entry`,
    },
    onSuccess: async (createdEntry, variables, _result, context) => {
      // Add Entry to cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          createdEntry.id,
          'current',
        ],
        createdEntry
      );

      // And update the Entries list cache too
      context.client.setQueryData<PaginatedList<Entry>>(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          'list',
        ],
        (oldList) => mergeListWithObject(oldList, createdEntry)
      );

      // The count behind the Collection's row in the sidebar is Core's number
      // rather than ours to add to, so it is read again instead of incremented
      // here.
      await context.client.invalidateQueries({
        queryKey: entryOptions.count({
          projectId: variables.projectId,
          collectionId: variables.collectionId,
        }).queryKey,
      });
    },
  }),
  read: (props: ReadEntryProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'collections',
        props.collectionId,
        'current',
        'entries',
        props.id,
        props.commitHash === undefined ? 'current' : props.commitHash,
      ],
      queryFn: async () => {
        return await window.ipc.core.entries.read(props);
      },
      throwOnError: true,
    }),
  /**
   * The changes of one Entry, newest first, each with the first Release that
   * included it or none yet.
   *
   * It is read beside the Entry rather than before it, in a query of its own,
   * so the Entry's form draws without waiting for a read of the Project's git
   * history. Every mutation of this Entry invalidates the key, which is how the
   * History pane follows a save.
   */
  history: (props: EntryHistoryProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'collections',
        props.collectionId,
        'current',
        'entries',
        props.id,
        'history',
      ],
      queryFn: async () => {
        return await window.ipc.core.entries.history(props);
      },
      throwOnError: true,
    }),
  update: customMutationOptions({
    mutationFn: window.ipc.core.entries.update,
    meta: {
      method: 'update',
      objectType: 'entry',
    },
    toasts: {
      success: () => t`Entry saved`,
      error: () => t`Could not save the Entry`,
    },
    onSuccess: async (updatedEntry, variables, _result, context) => {
      // Update Entry in cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          updatedEntry.id,
          'current',
        ],
        updatedEntry
      );

      // And update the Entries list cache too
      context.client.setQueryData<PaginatedList<Entry>>(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          'list',
        ],
        (oldList) => mergeListWithObject(oldList, updatedEntry, 'update')
      );

      // The save is one more change of this Entry, and which commits its
      // history holds is Core's answer rather than ours to add to, so it is
      // read again.
      await context.client.invalidateQueries({
        queryKey: entryOptions.history({
          projectId: variables.projectId,
          collectionId: variables.collectionId,
          id: updatedEntry.id,
        }).queryKey,
      });
    },
  }),
  delete: customMutationOptions({
    mutationFn: window.ipc.core.entries.delete,
    meta: {
      method: 'delete',
      objectType: 'entry',
    },
    toasts: {
      success: () => t`Entry deleted`,
      error: () => t`Could not delete the Entry`,
    },
    onSuccess: async (_deletedEntry, variables, _result, context) => {
      // Remove Entry from cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          variables.id,
          'current',
        ],
        undefined
      );

      // And update the Entries list cache too
      context.client.setQueryData<PaginatedList<Entry>>(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.collectionId,
          'current',
          'entries',
          'list',
        ],
        (oldList) =>
          mergeListWithObject(oldList, { id: variables.id } as Entry, 'delete')
      );

      await context.client.invalidateQueries({
        queryKey: entryOptions.count({
          projectId: variables.projectId,
          collectionId: variables.collectionId,
        }).queryKey,
      });
    },
  }),
  list: (props: ListEntriesProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'collections',
        props.collectionId,
        'current',
        'entries',
        'list',
      ],
      queryFn: async () => {
        const entries = await window.ipc.core.entries.list(props);

        // Cache each entry individually too
        // so that we can access them directly without refetching later
        entries.list.forEach((entry) => {
          queryClient.setQueryData(
            [
              'projects',
              props.projectId,
              'current',
              'collections',
              props.collectionId,
              'current',
              'entries',
              entry.id,
              'current',
            ],
            entry
          );
        });

        return entries;
      },
      throwOnError: true,
    }),
  /**
   * How many Entries a Collection holds.
   *
   * Core counts the Entry files in one directory read, so the Collection's row
   * in the sidebar says how many there are without every Entry being read for
   * it. Every mutation that adds or removes one invalidates this key, which is
   * how the number follows a create and a delete.
   */
  count: (props: CountEntriesProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'collections',
        props.collectionId,
        'current',
        'entries',
        'count',
      ],
      queryFn: async () => {
        return await window.ipc.core.entries.count(props);
      },
      throwOnError: true,
    }),
};

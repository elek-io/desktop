import { t } from '@lingui/core/macro';
import { queryOptions } from '@tanstack/react-query';

import type {
  Entry,
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
    onSuccess: (createdEntry, variables, _result, context) => {
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
    onSuccess: (updatedEntry, variables, _result, context) => {
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
    onSuccess: (_deletedEntry, variables, _result, context) => {
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
};

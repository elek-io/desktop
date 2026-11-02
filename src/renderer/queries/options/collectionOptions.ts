import { t } from '@lingui/core/macro';
import { queryOptions } from '@tanstack/react-query';

import type {
  Collection,
  ListCollectionsProps,
  PaginatedList,
  ReadCollectionProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { customMutationOptions, mergeListWithObject } from '../util';

export const collectionOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.collections.create,
    meta: {
      method: 'create',
      objectType: 'collection',
    },
    toasts: {
      success: () => t`Collection created`,
      error: () => t`Could not create the Collection`,
    },
    onSuccess: (createdCollection, variables, _result, context) => {
      // Add Collection to cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          createdCollection.id,
          'current',
        ],
        createdCollection
      );

      // And update the Collections list cache too
      context.client.setQueryData<PaginatedList<Collection>>(
        ['projects', variables.projectId, 'current', 'collections', 'list'],
        (oldList) => mergeListWithObject(oldList, createdCollection)
      );
    },
  }),
  read: (props: ReadCollectionProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'collections',
        props.id,
        props.commitHash === undefined ? 'current' : props.commitHash,
      ],
      queryFn: async () => {
        return await window.ipc.core.collections.read(props);
      },
      throwOnError: true,
    }),
  update: customMutationOptions({
    mutationFn: window.ipc.core.collections.update,
    meta: {
      method: 'update',
      objectType: 'collection',
    },
    toasts: {
      success: () => t`Collection saved`,
      error: () => t`Could not save the Collection`,
    },
    onSuccess: (updatedCollection, variables, _result, context) => {
      // Update Collection in cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          updatedCollection.id,
          'current',
        ],
        updatedCollection
      );

      // And update the Collections list cache too
      context.client.setQueryData<PaginatedList<Collection>>(
        ['projects', variables.projectId, 'current', 'collections', 'list'],
        (oldList) => mergeListWithObject(oldList, updatedCollection, 'update')
      );
    },
  }),
  delete: customMutationOptions({
    mutationFn: window.ipc.core.collections.delete,
    meta: {
      method: 'delete',
      objectType: 'collection',
    },
    toasts: {
      success: () => t`Collection deleted`,
      error: () => t`Could not delete the Collection`,
    },
    onSuccess: (_deletedCollection, variables, _result, context) => {
      // Remove Collection from cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'collections',
          variables.id,
          'current',
        ],
        undefined
      );

      // And update the Collections list cache too
      context.client.setQueryData<PaginatedList<Collection>>(
        ['projects', variables.projectId, 'current', 'collections', 'list'],
        (oldList) =>
          mergeListWithObject(
            oldList,
            { id: variables.id } as Collection,
            'delete'
          )
      );
    },
  }),
  list: (props: ListCollectionsProps) =>
    queryOptions({
      queryKey: ['projects', props.projectId, 'current', 'collections', 'list'],
      queryFn: async () => {
        const collections = await window.ipc.core.collections.list(props);

        // Cache each collection individually too
        // so that we can access them directly without refetching later
        collections.list.forEach((collection) => {
          queryClient.setQueryData(
            [
              'projects',
              props.projectId,
              'current',
              'collections',
              collection.id,
              'current',
            ],
            collection
          );
        });

        return collections;
      },
      throwOnError: true,
    }),
};

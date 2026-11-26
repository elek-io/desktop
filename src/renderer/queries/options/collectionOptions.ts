import { t } from '@lingui/core/macro';
import {
  queryOptions,
  type MutationFunctionContext,
} from '@tanstack/react-query';

import type {
  Collection,
  DeleteCollectionProps,
  ListCollectionsProps,
  PaginatedList,
  ReadCollectionProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { translateContentFromCache } from '../translateContentFromCache';
import { customMutationOptions, mergeListWithObject } from '../util';

/**
 * A Collection's name in plural, which is what the app names a Collection by.
 *
 * The name is stored per language, so it is read through the same chain a
 * screen reads it through, rather than in whichever language happens to be
 * filled in. See contributing/renderer/internationalization.md.
 */
function collectionName(
  collection: Collection,
  projectId: string,
  context: MutationFunctionContext
): string {
  return translateContentFromCache(context.client, projectId, {
    key: 'collection.name.plural',
    record: collection.name.plural,
  });
}

/**
 * The name a deleted Collection was last shown under, or `undefined` when the
 * cache no longer holds it.
 *
 * A delete answers with nothing, so the Collection itself is only still
 * reachable under its own read key. The toast is built before the mutation's own
 * `onSuccess` writes to the cache, see `queries/util.ts`.
 */
function deletedCollectionName(
  variables: DeleteCollectionProps,
  context: MutationFunctionContext
): string | undefined {
  const collection = context.client.getQueryData(
    collectionOptions.read({ projectId: variables.projectId, id: variables.id })
      .queryKey
  );

  if (collection === undefined) {
    return undefined;
  }

  return collectionName(collection, variables.projectId, context);
}

export const collectionOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.collections.create,
    meta: {
      method: 'create',
      objectType: 'collection',
    },
    toasts: {
      success: (createdCollection, variables, context) => {
        const name = collectionName(
          createdCollection,
          variables.projectId,
          context
        );
        return t`Collection ${name} created`;
      },
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
      success: (updatedCollection, variables, context) => {
        const name = collectionName(
          updatedCollection,
          variables.projectId,
          context
        );
        return t`Collection ${name} saved`;
      },
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
      success: (_deletedCollection, variables, context) => {
        const name = deletedCollectionName(variables, context);

        if (name === undefined) {
          return t`Collection deleted`;
        }

        return t`Collection ${name} deleted`;
      },
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

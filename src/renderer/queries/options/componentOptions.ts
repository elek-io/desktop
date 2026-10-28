import { queryOptions } from '@tanstack/react-query';

import type {
  Component,
  ListComponentsProps,
  PaginatedList,
  ReadComponentProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { customMutationOptions, mergeListWithObject } from '../util';

export const componentOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.components.create,
    meta: {
      method: 'create',
      objectType: 'component',
    },
    onSuccess: (createdComponent, variables, _result, context) => {
      // Add Component to cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'components',
          createdComponent.id,
          'current',
        ],
        createdComponent
      );

      // And update the Components list cache too
      context.client.setQueryData<PaginatedList<Component>>(
        ['projects', variables.projectId, 'current', 'components', 'list'],
        (oldList) => mergeListWithObject(oldList, createdComponent)
      );
    },
  }),
  read: (props: ReadComponentProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.projectId,
        'current',
        'components',
        props.id,
        props.commitHash === undefined ? 'current' : props.commitHash,
      ],
      queryFn: async () => {
        return await window.ipc.core.components.read(props);
      },
      throwOnError: true,
    }),
  update: customMutationOptions({
    mutationFn: window.ipc.core.components.update,
    meta: {
      method: 'update',
      objectType: 'component',
    },
    onSuccess: async (updatedComponent, variables, _result, context) => {
      // Update Component in cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'components',
          updatedComponent.id,
          'current',
        ],
        updatedComponent
      );

      // And update the Components list cache too
      context.client.setQueryData<PaginatedList<Component>>(
        ['projects', variables.projectId, 'current', 'components', 'list'],
        (oldList) => mergeListWithObject(oldList, updatedComponent, 'update')
      );

      // A Component update cascades into every Entry that holds it, in the same
      // commit, so every Entry read before it may be stale. Which ones is
      // Core's to know, not ours, so the whole subtree is dropped and read
      // again. An Entry's query key sits under its Collection's, which is why
      // this invalidates from `collections` down.
      await context.client.invalidateQueries({
        queryKey: ['projects', variables.projectId, 'current', 'collections'],
      });
    },
  }),
  delete: customMutationOptions({
    mutationFn: window.ipc.core.components.delete,
    meta: {
      method: 'delete',
      objectType: 'component',
    },
    onSuccess: (_deletedComponent, variables, _result, context) => {
      // Remove Component from cache individually
      context.client.setQueryData(
        [
          'projects',
          variables.projectId,
          'current',
          'components',
          variables.id,
          'current',
        ],
        undefined
      );

      // And update the Components list cache too
      context.client.setQueryData<PaginatedList<Component>>(
        ['projects', variables.projectId, 'current', 'components', 'list'],
        (oldList) =>
          mergeListWithObject(
            oldList,
            { id: variables.id } as Component,
            'delete'
          )
      );
    },
  }),
  list: (props: ListComponentsProps) =>
    queryOptions({
      queryKey: ['projects', props.projectId, 'current', 'components', 'list'],
      queryFn: async () => {
        const components = await window.ipc.core.components.list(props);

        // Cache each Component individually too, so a later read of one does
        // not have to go back to Core
        components.list.forEach((component) => {
          queryClient.setQueryData(
            [
              'projects',
              props.projectId,
              'current',
              'components',
              component.id,
              'current',
            ],
            component
          );
        });

        return components;
      },
      throwOnError: true,
    }),
};

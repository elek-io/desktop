import { t } from '@lingui/core/macro';
import {
  queryOptions,
  type MutationFunctionContext,
} from '@tanstack/react-query';

import type {
  Component,
  CountComponentsProps,
  DeleteComponentProps,
  ListComponentsProps,
  PaginatedList,
  ReadComponentProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { translateContentFromCache } from '../translateContentFromCache';
import { customMutationOptions, mergeListWithObject } from '../util';

/**
 * A Component's name, which is what the app names a Component by.
 *
 * The name is stored per language, so it is read through the same chain a
 * screen reads it through, rather than in whichever language happens to be
 * filled in. See contributing/renderer/internationalization.md.
 */
function componentName(
  component: Component,
  projectId: string,
  context: MutationFunctionContext
): string {
  return translateContentFromCache(context.client, projectId, {
    key: 'component.name',
    record: component.name,
  });
}

/**
 * The name a deleted Component was last shown under, or `undefined` when the
 * cache no longer holds it.
 *
 * A delete answers with nothing, so the Component itself is only still
 * reachable under its own read key. The toast is built before the mutation's own
 * `onSuccess` writes to the cache, see `queries/util.ts`.
 */
function deletedComponentName(
  variables: DeleteComponentProps,
  context: MutationFunctionContext
): string | undefined {
  const component = context.client.getQueryData(
    componentOptions.read({ projectId: variables.projectId, id: variables.id })
      .queryKey
  );

  if (component === undefined) {
    return undefined;
  }

  return componentName(component, variables.projectId, context);
}

export const componentOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.components.create,
    meta: {
      method: 'create',
      objectType: 'component',
    },
    toasts: {
      success: (createdComponent, variables, context) => {
        const name = componentName(
          createdComponent,
          variables.projectId,
          context
        );
        return t`Component ${name} created`;
      },
      error: () => t`Could not create the Component`,
    },
    onSuccess: async (createdComponent, variables, _result, context) => {
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

      // The count behind the sidebar's Components row is Core's number rather
      // than ours to add to, so it is read again instead of incremented here.
      await context.client.invalidateQueries({
        queryKey: componentOptions.count({ projectId: variables.projectId })
          .queryKey,
      });
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
    toasts: {
      success: (updatedComponent, variables, context) => {
        const name = componentName(
          updatedComponent,
          variables.projectId,
          context
        );
        return t`Component ${name} saved`;
      },
      error: () => t`Could not save the Component`,
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
    toasts: {
      success: (_deletedComponent, variables, context) => {
        const name = deletedComponentName(variables, context);

        if (name === undefined) {
          return t`Component deleted`;
        }

        return t`Component ${name} deleted`;
      },
      error: () => t`Could not delete the Component`,
    },
    onSuccess: async (_deletedComponent, variables, _result, context) => {
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

      await context.client.invalidateQueries({
        queryKey: componentOptions.count({ projectId: variables.projectId })
          .queryKey,
      });
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
  /**
   * How many Components the Project holds.
   *
   * Core counts them without reading each one, so the sidebar's Components row
   * says how many there are without the whole list being read for it. Every
   * mutation that adds or removes one invalidates this key, which is how the
   * number follows a create and a delete.
   */
  count: (props: CountComponentsProps) =>
    queryOptions({
      queryKey: ['projects', props.projectId, 'current', 'components', 'count'],
      queryFn: async () => {
        return await window.ipc.core.components.count(props);
      },
      throwOnError: true,
    }),
};

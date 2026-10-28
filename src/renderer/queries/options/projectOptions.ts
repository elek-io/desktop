import { queryOptions } from '@tanstack/react-query';

import type {
  ListProjectsProps,
  PaginatedList,
  Project,
  ProjectHistoryProps,
  ReadProjectProps,
} from '@elek-io/core';

import { queryClient } from '../client';
import { customMutationOptions, mergeListWithObject } from '../util';

/** The commits a Project's branch is ahead of and behind its remote. Core declares no name for it. */
export type ProjectChanges = Awaited<
  ReturnType<ContextBridgeApi['core']['projects']['getChanges']>
>;

/**
 * How far a Project's branch is ahead of and behind its remote, fetched from the
 * remote first.
 *
 * The one place the call is made, so every caller moves `origin` the same way
 * and the answer can be published to the `getChanges` query below. Anything that
 * needs it outside that query reads it through here and writes what it got into
 * the query's cache, rather than opening a second query over the same call.
 */
export async function fetchProjectChanges(id: string): Promise<ProjectChanges> {
  return await window.ipc.core.projects.getChanges({ id });
}

export const projectOptions = {
  create: customMutationOptions({
    mutationFn: window.ipc.core.projects.create,
    // throwOnError: true,
    meta: {
      method: 'create',
      objectType: 'project',
    },
    onSuccess: (createdProject, _variables, _result, context) => {
      // Add Project to cache individually
      context.client.setQueryData(
        ['projects', createdProject.id, 'current'],
        createdProject
      );

      // And update the Projects list cache too
      context.client.setQueryData<PaginatedList<Project>>(
        ['projects', 'list'],
        (oldList) => mergeListWithObject(oldList, createdProject)
      );
    },
  }),
  read: (props: ReadProjectProps) =>
    queryOptions({
      queryKey: [
        'projects',
        props.id,
        props.commitHash === undefined ? 'current' : props.commitHash,
      ],
      queryFn: async () => {
        return await window.ipc.core.projects.read(props);
      },
      throwOnError: true,
    }),
  history: (props: ProjectHistoryProps) =>
    queryOptions({
      queryKey: ['projects', props.id, 'history'],
      queryFn: async () => {
        return await window.ipc.core.projects.history(props);
      },
      throwOnError: true,
    }),
  update: customMutationOptions({
    mutationFn: window.ipc.core.projects.update,
    meta: {
      method: 'update',
      objectType: 'project',
    },
    onSuccess: (updatedProject, _variables, _result, context) => {
      // Update Project in cache individually
      context.client.setQueryData(
        ['projects', updatedProject.id, 'current'],
        updatedProject
      );

      // And update the Projects list cache too
      context.client.setQueryData<PaginatedList<Project>>(
        ['projects', 'list'],
        (oldList) => mergeListWithObject(oldList, updatedProject, 'update')
      );
    },
  }),
  delete: customMutationOptions({
    mutationFn: window.ipc.core.projects.delete,
    meta: {
      method: 'delete',
      objectType: 'project',
    },
    onSuccess: (_deletedProject, variables, _result, context) => {
      // Remove Project from cache individually
      context.client.setQueryData(
        ['projects', variables.id, 'current'],
        undefined
      );

      // And update the Projects list cache too
      context.client.setQueryData<PaginatedList<Project>>(
        ['projects', 'list'],
        (oldList) =>
          mergeListWithObject(
            oldList,
            { id: variables.id } as Project,
            'delete'
          )
      );
    },
  }),
  list: (props?: ListProjectsProps) =>
    queryOptions({
      queryKey: ['projects', 'list'],
      queryFn: async () => {
        const projects = await window.ipc.core.projects.list(props);

        // Cache each project individually too
        // so that we can access them directly without refetching later
        projects.list.forEach((project) => {
          queryClient.setQueryData(
            ['projects', project.id, 'current'],
            project
          );
        });

        return projects;
      },
      throwOnError: true,
    }),
  clone: customMutationOptions({
    mutationFn: window.ipc.core.projects.clone,
    meta: {
      method: 'clone',
      objectType: 'project',
    },
    onSuccess: (clonedProject, _variables, _result, context) => {
      // Add Project to cache individually
      context.client.setQueryData(
        ['projects', clonedProject.id, 'current'],
        clonedProject
      );

      // And update the Projects list cache too
      context.client.setQueryData<PaginatedList<Project>>(
        ['projects', 'list'],
        (oldList) => mergeListWithObject(oldList, clonedProject)
      );
    },
  }),
  getChanges: (project?: Project) =>
    queryOptions({
      enabled: project !== undefined && project.remoteOriginUrl !== null,
      queryKey: ['projects', project?.id, 'current', 'changes'],
      queryFn: async () => {
        return await fetchProjectChanges(project!.id);
      },
      throwOnError: true,
      refetchInterval: 180000, // Refetch changes every 3 minutes
    }),
  synchronize: customMutationOptions({
    mutationFn: window.ipc.core.projects.synchronize,
    meta: {
      method: 'synchronize',
      objectType: 'project',
    },
    onSuccess: async (_data, variables, _result, context) => {
      // On synchronization anything inside the Project may have changed
      // so we invalidate it entirely
      await context.client.invalidateQueries({
        queryKey: ['projects', 'list'],
        refetchType: 'all',
      });
      await context.client.invalidateQueries({
        queryKey: ['projects', variables.id],
        refetchType: 'all',
      });
    },
  }),
  setRemoteOriginUrl: customMutationOptions({
    mutationFn: window.ipc.core.projects.setRemoteOriginUrl,
    meta: {
      method: 'update',
      objectType: 'project',
    },
    onSuccess: async (_data, variables, _result, context) => {
      // Remote origin URL is part of the Project data
      // so we invalidate it entirely
      await context.client.invalidateQueries({
        queryKey: ['projects', 'list'],
        refetchType: 'all',
      });
      await context.client.invalidateQueries({
        queryKey: ['projects', variables.id],
        refetchType: 'all',
      });
    },
  }),
};

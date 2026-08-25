import {
  mutationOptions,
  type DefaultError,
  type MutationFunction,
  type MutationFunctionContext,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  objectTypeSchema,
  z,
  type BaseFile,
  type PaginatedList,
} from '@elek-io/core';

const logableMutationMetaSchema = z.object({
  method: z.enum([
    // CRUD
    'create',
    'update',
    'delete',
    'clone',
    // User and Assets
    'set',
    'save',
    // Git remote
    'synchronize',
    // API Lifecycle
    'start',
    'stop',
  ]),
  objectType: z.enum([...objectTypeSchema.options, 'api', 'user', 'report']),
});
type LogableMutationMeta = z.infer<typeof logableMutationMetaSchema>;

/**
 * Custom mutation options wrapper with automatic display
 * of a toast notification whenever a mutation succeeds or fails
 *
 * This should be used for all mutations instead of the default `mutationOptions`.
 *
 * The display of a notification depends on the availability of the meta object with
 * method and objectType keys, which is enforced here too.
 *
 * It adds `throwOnError: true` to propagate errors to the nearest error boundary (__root.tsx).
 *
 * Additionally it logs all mutations with Core to enable full E2E debugging.
 */
export function customMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(options: {
  mutationFn: MutationFunction<TData, TVariables>;
  onSuccess: (
    data: TData,
    variables: TVariables,
    result: TOnMutateResult,
    context: MutationFunctionContext
  ) => Promise<unknown> | unknown;
  meta: LogableMutationMeta;
}): Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationKey'
> {
  const originalOnSuccess = options.onSuccess;

  return mutationOptions({
    ...options,
    throwOnError: true,
    onSuccess: async (data, variables, result, context) => {
      const logableMutationMeta = logableMutationMetaSchema.safeParse(
        context.meta
      );

      if (logableMutationMeta.success === false) {
        await window.ipc.core.logger.error({
          source: 'desktop',
          message: 'Detected mutation without meta',
          meta: {
            data,
            variables,
            result,
            context,
          },
        });
      } else {
        toast.success(
          `${logableMutationMeta.data.method} ${logableMutationMeta.data.objectType}`
        );

        await window.ipc.core.logger.info({
          source: 'desktop',
          message: `Successfully ${logableMutationMeta.data.method}ed ${logableMutationMeta.data.objectType}`,
          meta: {
            ...logableMutationMeta.data,
          },
        });
      }

      originalOnSuccess(data, variables, result, context);
    },
    onError: async (error, variables, result, context) => {
      const logableMutationMeta = logableMutationMetaSchema.safeParse(
        context.meta
      );

      if (logableMutationMeta.success === false) {
        await window.ipc.core.logger.error({
          source: 'desktop',
          message: 'Detected mutation without meta',
          meta: {
            error,
            variables,
            result,
            context,
          },
        });
      } else {
        toast.error(
          `${logableMutationMeta.data.method} ${logableMutationMeta.data.objectType}`
        );

        await window.ipc.core.logger.error({
          source: 'desktop',
          message: `Failed to ${logableMutationMeta.data.method} ${logableMutationMeta.data.objectType}`,
          meta: {
            ...logableMutationMeta.data,
          },
        });
      }
    },
  });
}

/**
 * Helper function to merge an object into a paginated list.
 *
 * Used in mutation onSuccess handlers to update list caches when
 * an individual object is created or updated.
 */
export function mergeListWithObject<T extends BaseFile>(
  oldList: PaginatedList<T> | undefined,
  object: T,
  method?: 'update' | 'delete'
): PaginatedList<T> {
  if (!oldList) {
    // No list exists yet, create a new one with just the object
    return {
      total: 1,
      limit: 0,
      offset: 0,
      list: [object],
    };
  }

  if (oldList.list.find((oldObject) => oldObject.id === object.id)) {
    if (method === undefined) {
      throw new Error(
        'mergeListWithObject: method must be provided when object exists in the list'
      );
    }

    if (method === 'update') {
      // Object exists in the list, update it
      return {
        ...oldList,
        list: oldList.list.map((oldObject) => {
          if (oldObject.id === object.id) {
            return object;
          }
          return oldObject;
        }),
      };
    } else {
      // Object exists in the list, remove it
      return {
        total: oldList.total - 1,
        limit: oldList.limit,
        offset: oldList.offset,
        list: oldList.list.filter((oldObject) => oldObject.id !== object.id),
      };
    }
  } else {
    // Object does not exist in the list, add it
    return {
      total: oldList.total + 1,
      limit: oldList.limit,
      offset: oldList.offset,
      list: [...oldList.list, object],
    };
  }
}

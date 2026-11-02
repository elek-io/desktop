import {
  type DefaultError,
  type QueryClient,
  type QueryKey,
  useQueries,
  type UseQueryOptions,
} from '@tanstack/react-query';

import type { UseQueryResultNoError } from './useQueryNoError';

/**
 * A wrapper around useQueries that ensures the correct types are returned when `throwOnError` is set to `true`
 *
 * This is the multi-query equivalent of `useQueryNoError`. It takes an array of query options
 * (all of the same type) and returns an array of results with the error state excluded.
 *
 * If any query has an error, it throws the first error found to the nearest error boundary.
 * It also logs an error if any query does not have `throwOnError` set to `true`.
 *
 * @see https://github.com/TanStack/query/discussions/6805
 *
 * @example
 * const results = useQueriesNoError(
 *   collections.map((c) => queryOptions.entries.list({ projectId, collectionId: c.id }))
 * );
 * const allPending = results.some((r) => r.isPending);
 * if (allPending) return <Loading />;
 * // Each result's data is now guaranteed to be defined
 */
export function useQueriesNoError<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Array<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>>,
  queryClient?: QueryClient
): Array<UseQueryResultNoError<TQueryFnData, TError, TData>> {
  const queries = useQueries(
    {
      queries: options,
    },
    queryClient
  );

  for (const queryOption of options) {
    if (
      queryOption.throwOnError === undefined ||
      queryOption.throwOnError === false
    ) {
      void window.ipc.core.logger.error({
        source: 'desktop',
        message: `useQueriesNoError called for queryKey "${JSON.stringify(
          queryOption.queryKey
        )}" without throwOnError set to true`,
      });
    }
  }

  for (const query of queries) {
    if (query.isError) {
      throw query.error;
    }
  }

  return queries as Array<UseQueryResultNoError<TQueryFnData, TError, TData>>;
}

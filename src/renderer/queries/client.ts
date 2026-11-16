import { QueryCache, QueryClient } from '@tanstack/react-query';

import { markReadFailure } from '@renderer/lib/readFailure';

/**
 * Every read that failed, marked as one.
 *
 * This is the one place a failed read is known as a read, which is what a
 * pane's error boundary needs to tell it from a failed write or a render bug
 * (see `lib/readFailure.ts`). It cannot be the hook that throws it, because
 * `throwOnError: true` makes TanStack Query itself throw during render, before
 * `useQueryNoError` looks at the result. A mutation has its own cache and is
 * never marked here.
 */
const queryCache = new QueryCache({
  onError: (error) => {
    markReadFailure(error);
  },
});

/**
 * Tanstack Query instance with agressive caching
 */
export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});

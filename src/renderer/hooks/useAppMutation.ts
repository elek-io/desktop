import { parseIpcError } from '@root/src/shared/ipcError';
import {
  useMutation,
  type DefaultError,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

import { type CoreErrorType } from '@elek-io/core';

/**
 * A map from a `CoreError` type to the in-place handler that drives the UI for
 * it. Its keys are the single source of truth for the "expected" set, read by
 * both the `throwOnError` predicate and the `handleError` dispatcher.
 */
export type CoreErrorHandlers = Partial<
  Record<CoreErrorType, (error: unknown) => void>
>;

export type UseAppMutationResult<TData, TError, TVariables, TContext> =
  UseMutationResult<TData, TError, TVariables, TContext> & {
    /**
     * Call this from the `catch` of an `await mutateAsync(...)`. It runs the
     * matching `handled` callback. An unhandled type is a no-op here, because
     * `throwOnError` has already routed it to the root error boundary.
     */
    handleError: (error: unknown) => void;
  };

/**
 * Wraps `useMutation` to handle an expected `CoreError` by type in place, instead
 * of letting it take over the screen through the root error boundary. Pass a
 * `handled` map and call the returned `handleError` from the `catch` of an
 * awaited `mutateAsync`. Never a blanket `throwOnError: false`.
 *
 * See contributing/error-handling.md for the full recipe and a worked example.
 */
export function useAppMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  config: { handled: CoreErrorHandlers }
): UseAppMutationResult<TData, TError, TVariables, TContext> {
  const { handled } = config;

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...options,
    // Opt out of the boundary only for the handled types. A non-CoreError carries
    // no type, so it propagates too.
    throwOnError: (error) => {
      const { type } = parseIpcError(error);
      return type === undefined || handled[type] === undefined;
    },
    // Suppress the wrapper's toast and log for the handled types only, since
    // their in-place surface reacts instead. Everything else keeps the wrapper's
    // onError, so an unexpected failure still carries its per-mutation
    // `{ method, objectType }` log alongside the boundary takeover.
    onError: (error, variables, onMutateResult, context) => {
      const { type } = parseIpcError(error);
      if (type !== undefined && handled[type] !== undefined) {
        return;
      }
      return options.onError?.(error, variables, onMutateResult, context);
    },
  });

  const handleError = (error: unknown): void => {
    const { type } = parseIpcError(error);
    const handler = type !== undefined ? handled[type] : undefined;
    handler?.(error);
  };

  return Object.assign(mutation, { handleError });
}

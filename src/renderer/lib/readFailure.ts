/**
 * Marks a read that failed, so a pane can answer it in its own place while
 * everything else stays fatal to the view.
 *
 * A pane that cannot read what it holds says so where it sits, with Try again
 * (see `components/pane.tsx`). A mutation that fails unexpectedly, and a
 * component that throws while rendering, are not that: they replace the whole
 * view with the root error screen, which offers Report an issue, and they are
 * logged and toasted on the way (see contributing/error-handling.md).
 *
 * A React error boundary catches everything thrown below it and cannot tell
 * the two apart by itself, because a failed read and a failed write arrive as
 * the same `CoreError`. So the query cache marks every read that failed, in
 * `queries/client.ts`, which is the one place a failure is known to be a read's,
 * and a pane's boundary re-throws anything that carries no mark.
 *
 * The mark is kept in a `WeakSet` rather than written onto the error, so
 * nothing is added to what the error screen shows, what a log record carries or
 * what crosses IPC, and a frozen error can be marked too. TanStack Query holds
 * one error object per failed query, which is the object thrown on every render
 * until the query is reset, so identity is enough to recognize it.
 */
const readFailures = new WeakSet<object>();

function isMarkable(error: unknown): error is object {
  return typeof error === 'object' && error !== null;
}

/**
 * Marks `error` as a failed read and returns it unchanged.
 */
export function markReadFailure<TError>(error: TError): TError {
  if (isMarkable(error)) {
    readFailures.add(error);
  }

  return error;
}

/**
 * Whether `error` is a read a query could not make.
 *
 * `false` for anything that was thrown while writing or rendering, and for a
 * thrown value that is not an object and so cannot be marked, which keeps the
 * root error screen the default rather than the exception.
 */
export function isReadFailure(error: unknown): boolean {
  return isMarkable(error) && readFailures.has(error);
}

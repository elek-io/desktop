import { parseIpcError } from '@root/src/shared/ipcError';

/** Matches one frame of a stack, which is a line of its own starting with `at`. */
const stackFrame = /^\s+at\s/;

/**
 * The technical cause of an error as one text, for the error screen's Details
 * and for what Copy details puts on the clipboard.
 *
 * It opens with the type in brackets after CoreError, as in
 * `CoreError [Internal]: ...`, which is how ci draws it, and then carries the
 * frames of the stack. The type is what a `CoreError` crossed IPC with, so an
 * error that carries none, which is any ordinary renderer bug, opens with its
 * message instead.
 *
 * The frames are taken rather than the whole stack, because a stack opens with
 * the message it was thrown with and the first line above already carries it.
 * An error whose stack holds no frames, which is what Electron reconstructs for
 * anything that is not a `CoreError`, is its first line alone.
 *
 * This is Core's own text, so what comes out of here is masked in the main
 * process before anybody reads it, see `shared/maskText.ts`.
 */
export function errorDetailsOf(error: unknown): string {
  const { type, message, stack } = parseIpcError(error);
  // Core's own error, which it writes in English and no language has a form of
  // its own for, the way the type itself has none.
  const opening =
    type === undefined
      ? message
      : // eslint-disable-next-line lingui/no-unlocalized-strings
        `CoreError [${type}]: ${message}`;
  const frames = (stack ?? '')
    .split('\n')
    .filter((line) => stackFrame.test(line));

  return [opening, ...frames].join('\n');
}

import { parseIpcError } from '@root/src/shared/ipcError';

/**
 * The attributes an error is logged with, as flat dotted keys.
 *
 * Every renderer site that writes an error to Core's logger goes through this,
 * so the shape cannot drift between them. Core writes the same names for its
 * own records (see its `logAttributeNames`), which is the point: one grep for
 * `exception.stacktrace` finds every stack in a log file, whoever wrote it.
 *
 * The names are split on purpose. `error.type` is Core's contract (`NotFound`,
 * `Conflict` and the rest) and is absent for an error that never came from
 * Core. `exception.type` is the JavaScript class, which is what tells a
 * `TypeError` from a `RangeError` and is the only one of the two an ordinary
 * renderer bug has.
 *
 * `exception.stacktrace` is absent only when the value thrown was not an Error
 * and carried no stack to begin with.
 */
export function errorLogAttributes(error: unknown): Record<string, unknown> {
  const { type, message, stack } = parseIpcError(error);

  return {
    ...(type === undefined ? {} : { 'error.type': type }),
    ...(error instanceof Error ? { 'exception.type': error.name } : {}),
    'exception.message': message,
    ...(stack === undefined ? {} : { 'exception.stacktrace': stack }),
  };
}

/**
 * React's component stack, which names the component that threw and the tree
 * above it. No Semantic Convention covers it, so it takes the `elek.` namespace
 * the way Core's own custom attributes do.
 *
 * It is the only renderer context a Core failure has, because an error that
 * crossed IPC arrives with no frames of its own.
 */
export const COMPONENT_STACK_ATTRIBUTE = 'elek.react.component_stack';

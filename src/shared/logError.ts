import { isCoreErrorType, parseIpcError } from './ipcError.js';

/**
 * The attributes an error is logged with, as flat dotted keys.
 *
 * Every site that writes an error to Core's logger goes through this, in either
 * process, so the shape cannot drift between them. Core writes the same names for its
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
 *
 * In the renderer a CoreError arrives encoded by IPC. In the main process it is
 * the CoreError itself, so its type is read off the instance instead.
 */
export function errorLogAttributes(error: unknown): Record<string, unknown> {
  return attributesOf(error, true);
}

/**
 * The same attributes for an error whose own message carries content somebody
 * wrote, which no log record may hold.
 *
 * Milkdown's parser and serializer put the whole node they could not match
 * into the message they throw, and for a markdown Value that node is the text
 * itself. The message is therefore left out, and the stack keeps its frames
 * only, since a stack starts with the message it was thrown with.
 *
 * A caller has to know that of its own errors, so this is the exception rather
 * than the rule. Everything else logs with `errorLogAttributes`, because a
 * message is what says which failure a stack belongs to.
 */
export function errorLogAttributesWithoutMessage(
  error: unknown
): Record<string, unknown> {
  return attributesOf(error, false);
}

function attributesOf(
  error: unknown,
  withMessage: boolean
): Record<string, unknown> {
  const decoded = parseIpcError(error);
  const { message, stack } = decoded;
  const type =
    decoded.type ??
    (error instanceof Error && 'type' in error && isCoreErrorType(error.type)
      ? error.type
      : undefined);
  const stacktrace = withMessage ? stack : stackFrames(stack);

  return {
    ...(type === undefined ? {} : { 'error.type': type }),
    ...(error instanceof Error ? { 'exception.type': error.name } : {}),
    ...(withMessage ? { 'exception.message': message } : {}),
    ...(stacktrace === undefined ? {} : { 'exception.stacktrace': stacktrace }),
  };
}

/**
 * The frames of a stack, without the message it starts with.
 *
 * V8 writes a stack as the error's `name: message` followed by one indented
 * `at ...` line per frame. A message of several lines takes several of them,
 * so the frames are taken rather than the first line dropped, and a line that
 * is not a frame is left out rather than kept.
 */
function stackFrames(stack: string | undefined): string | undefined {
  if (stack === undefined) {
    return undefined;
  }
  const frames = stack.split('\n').filter((line) => /^\s+at\s/.test(line));
  return frames.length === 0 ? undefined : frames.join('\n');
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

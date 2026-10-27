import { type CoreErrorType, type EntryIssue } from '@elek-io/core';

/**
 * Cross-process helpers to preserve a CoreError's `type` across the IPC
 * boundary. Electron serializes a thrown error to the plain Error shape
 * (message and stack), so the CoreError subclass and its `type`/`statusCode`
 * are dropped. The main process encodes the type into the message with a
 * sentinel, and the renderer decodes it back out.
 *
 * This module stays free of process-specific imports so electron-vite can
 * bundle it into both the main and the renderer build. It imports CoreErrorType
 * type-only, so it carries no runtime dependency on Core.
 */

/** Marks a message as a serialized CoreError. Unlikely to collide with real copy. */
export const IPC_CORE_ERROR_SENTINEL = '__elekio_core_error__';

// The known CoreErrorType values, so the renderer can validate a decoded type
// without importing Core at runtime. Built from a Record keyed by CoreErrorType,
// which forces the list to stay exhaustive: adding a type in Core makes this fail
// to compile until the new key is added, so parseIpcError can never silently drop
// a new but valid type. The Set gives a prototype-safe membership check (a bare
// `in` on the object would match inherited keys like "toString").
const coreErrorTypes = new Set<string>(
  Object.keys({
    NotFound: true,
    BadRequest: true,
    Unauthorized: true,
    Conflict: true,
    PreconditionFailed: true,
    UpgradeFailed: true,
    VersionSkew: true,
    RateLimited: true,
    Internal: true,
  } satisfies Record<CoreErrorType, true>)
);

export function isCoreErrorType(value: unknown): value is CoreErrorType {
  return typeof value === 'string' && coreErrorTypes.has(value);
}

/**
 * The keys of one of Core's field definition issues that may cross IPC.
 *
 * Everything else an issue carries is content somebody wrote:
 * `transformedValues` holds every Value of the Entry and `currentValue` the one
 * that cannot follow the change. No screen reads either, and a refused change
 * in a large Collection would otherwise pack every affected Entry's content
 * into one message, so they are dropped here, at the boundary, rather than at
 * the reader. The list is typed against Core's own `EntryIssue`, so a key
 * renamed there fails to compile.
 */
const forwardedIssueKeys = [
  'entryId',
  'collectionId',
  'fieldSlug',
  'issue',
] as const satisfies readonly (keyof EntryIssue)[];

/**
 * Whether a value is an object literal rather than a class instance, a `Date`,
 * a `Map` or anything else with a prototype of its own. Such a value survives
 * JSON as a string or as `{}`, which is not structured data a screen can branch
 * on, so only the literal shape crosses.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * One element of an array cause, narrowed to what may cross.
 *
 * An element carrying Core's `issue` key is one of its field definition
 * issues, so it crosses as the keys above and nothing else. Anything else
 * crosses as it is, so a cause of another shape is not silently emptied.
 */
function encodableIssue(candidate: unknown): unknown {
  if (isPlainObject(candidate) === false || 'issue' in candidate === false) {
    return candidate;
  }

  return Object.fromEntries(
    forwardedIssueKeys.map((key) => [key, candidate[key]])
  );
}

/**
 * Narrows a CoreError's `cause` to what may cross IPC, or `undefined`.
 *
 * Only structured data crosses, because the cause exists for a screen to branch
 * on rather than to show, so a cause is forwarded only when it is an array or a
 * plain object. That drops two shapes on purpose:
 *
 * - An `Error`, a `ZodError` included, keeps none of its own fields through
 *   JSON, so what would arrive is an empty object. Its message is already the
 *   CoreError's message.
 * - A primitive. Core passes git's raw stderr and stdout as the cause of a
 *   push it refuses, and a remote URL there can carry a credential, so no
 *   primitive cause is forwarded.
 *
 * The result is a JSON round trip, so the value it returns is a plain clone and
 * re-serializing it cannot throw.
 */
function encodableCause(cause: unknown): unknown {
  const narrowed = Array.isArray(cause)
    ? cause.map(encodableIssue)
    : isPlainObject(cause)
      ? cause
      : undefined;

  if (narrowed === undefined) {
    return undefined;
  }

  try {
    // The parse is what rejects what the stringify cannot express. A circular
    // value or a BigInt throws there, and a `toJSON` answering undefined makes
    // the stringify answer undefined, which the parse then throws on, since
    // TypeScript's own signature does not admit that return.
    return JSON.parse(JSON.stringify(narrowed)) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Encodes a CoreError's type, message, stack and cause into a single message
 * string. Called in the main process before re-throwing, so all four survive
 * IPC. The stack is Core's own origin stack, which the renderer-side IPC error
 * lacks (Electron reconstructs a frameless error). An `undefined` stack or
 * cause is simply omitted by JSON.stringify, so an error Core raised without a
 * cause encodes and decodes exactly as it did before the cause was carried.
 *
 * The cause is the issue list Core attaches to a `Conflict` it raises for a
 * field definition change it cannot carry out, which is what lets a screen name
 * the Entry to fix. Each issue crosses as `forwardedIssueKeys` and nothing
 * else. See `entryIssuesOf` in the renderer's `lib/schemaChange.ts`, the one
 * typed reader of it. Nothing renders or logs a cause raw.
 */
export function serializeCoreError(
  type: CoreErrorType,
  message: string,
  stack?: string,
  cause?: unknown
): string {
  return `${IPC_CORE_ERROR_SENTINEL}${JSON.stringify({
    type,
    message,
    stack,
    cause: encodableCause(cause),
  })}`;
}

/**
 * Decodes an error received in the renderer back into its type, message, stack
 * and cause.
 * Locates the sentinel by substring, so it is robust to Electron prefixing the
 * message (e.g. "Error invoking remote method ..."). Falls back to the raw
 * message for non-CoreError errors (route or plain JS errors) and any malformed
 * payload, so `type` is simply absent then.
 *
 * The `cause` is absent whenever Core raised the error without one, or raised
 * it with one the encoding does not forward. It is `unknown`, because what Core
 * attaches differs per call, so read it through a typed reader rather than
 * trusting its shape. `errorLogAttributes` leaves it out of every log record,
 * which is what keeps an Entry's content and a git remote's URL out of a log
 * file.
 *
 * A plain error keeps its own `stack`. That is the only stack such an error
 * has, and every caller logs what this returns, so dropping it left an ordinary
 * renderer bug in the log file with no frames at all (verified in a packaged
 * build). A CoreError still takes the sentinel branch below, so Core's origin
 * stack keeps winning where there is one.
 *
 * The fallback is deliberately only in this branch. A malformed sentinel
 * payload falls through to the bottom, where `error.stack` still holds the
 * encoded form and returning it would leak the sentinel onto the error screen.
 */
export function parseIpcError(error: unknown): {
  type?: CoreErrorType;
  message: string;
  stack?: string;
  cause?: unknown;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const sentinelIndex = raw.indexOf(IPC_CORE_ERROR_SENTINEL);

  if (sentinelIndex === -1) {
    const stack = error instanceof Error ? error.stack : undefined;
    return stack === undefined ? { message: raw } : { message: raw, stack };
  }

  const payload = raw.slice(sentinelIndex + IPC_CORE_ERROR_SENTINEL.length);

  try {
    const parsed: unknown = JSON.parse(payload);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      'message' in parsed
    ) {
      const { type, message } = parsed;
      if (isCoreErrorType(type) && typeof message === 'string') {
        const stack =
          'stack' in parsed && typeof parsed.stack === 'string'
            ? parsed.stack
            : undefined;
        // Spread rather than branched, so an absent stack or cause leaves the
        // key off entirely instead of present and undefined
        return {
          type,
          message,
          ...(stack === undefined ? {} : { stack }),
          ...('cause' in parsed ? { cause: parsed.cause } : {}),
        };
      }
    }
  } catch {
    // Malformed payload, fall back to the raw message below
  }

  return { message: raw };
}

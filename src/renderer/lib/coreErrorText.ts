import { type CoreErrorType } from '@elek-io/core';

/**
 * Maps a CoreError's `type` (preserved across IPC, see
 * [`shared/ipcError.ts`](../../shared/ipcError.ts)) to short, user-facing copy.
 * These components use hardcoded English (no i18n yet), so this is plain
 * strings. A consumer passes context-specific overrides and a fallback for the
 * types it does not override.
 */

/** App-wide, jargon-free copy per type, used when a consumer gives no fallback. */
const GENERIC_CORE_ERROR_TEXT: Record<CoreErrorType, string> = {
  NotFound: 'What you were looking for could not be found.',
  BadRequest: 'Some of the information provided was not valid.',
  Unauthorized: 'You need to set up a user before doing this.',
  Conflict:
    'This change conflicts with the current state. Please review and try again.',
  PreconditionFailed:
    'A required condition was not met, so the action was stopped.',
  UpgradeFailed: 'Upgrading this Project did not work.',
  VersionSkew:
    'This was written by a newer version of elek.io. Update to open it.',
  RateLimited:
    'Too much was sent from here recently. Please try again shortly.',
  Internal: 'Something went wrong. Please try again.',
};

/** Shown when the error carries no known type (a non-CoreError) and no fallback. */
const DEFAULT_CORE_ERROR_TEXT = 'Something went wrong. Please try again.';

/**
 * Returns copy for a decoded CoreError type. A matching `override` wins, then
 * the consumer's `fallback` (its own generic copy), then the app-wide generic,
 * and finally the default for an unknown type.
 */
export function describeCoreError(
  type: CoreErrorType | undefined,
  overrides?: Partial<Record<CoreErrorType, string>>,
  fallback?: string
): string {
  const override = type !== undefined ? overrides?.[type] : undefined;
  if (override !== undefined) {
    return override;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  if (type !== undefined) {
    return GENERIC_CORE_ERROR_TEXT[type];
  }
  return DEFAULT_CORE_ERROR_TEXT;
}

import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { type CoreErrorType } from '@elek-io/core';

/**
 * Maps a CoreError's `type` (preserved across IPC, see
 * [`shared/ipcError.ts`](../../shared/ipcError.ts)) to short, user-facing copy.
 *
 * Every sentence is a message of the catalog, held as a `MessageDescriptor` so
 * a map at module scope is not read before a catalog is active, and rendered
 * through `i18n._` at the moment it is shown. A consumer passes
 * context-specific overrides and a fallback for the types it does not override,
 * as descriptors too. This is the single seam that maps a `type` to a localized
 * string, see contributing/renderer/internationalization.md.
 */

/** App-wide, jargon-free copy per type, used when a consumer gives no fallback. */
const GENERIC_CORE_ERROR_TEXT: Record<CoreErrorType, MessageDescriptor> = {
  NotFound: msg`What you were looking for could not be found.`,
  BadRequest: msg`Some of the information provided was not valid.`,
  Unauthorized: msg`You need to set up a user before doing this.`,
  Conflict: msg`This change conflicts with the current state. Please review and try again.`,
  PreconditionFailed: msg`A required condition was not met, so the action was stopped.`,
  UpgradeFailed: msg`Upgrading this Project did not work.`,
  VersionSkew: msg`This was written by a newer version of elek.io. Update to open it.`,
  RateLimited: msg`Too much was sent from here recently. Please try again shortly.`,
  Internal: msg`Something went wrong. Please try again.`,
};

/** Shown when the error carries no known type (a non-CoreError) and no fallback. */
const DEFAULT_CORE_ERROR_TEXT = msg`Something went wrong. Please try again.`;

/**
 * Returns copy for a decoded CoreError type. A matching `override` wins, then
 * the consumer's `fallback` (its own generic copy), then the app-wide generic,
 * and finally the default for an unknown type.
 */
export function describeCoreError(
  type: CoreErrorType | undefined,
  overrides?: Partial<Record<CoreErrorType, MessageDescriptor>>,
  fallback?: MessageDescriptor
): string {
  const override = type !== undefined ? overrides?.[type] : undefined;
  if (override !== undefined) {
    return i18n._(override);
  }
  if (fallback !== undefined) {
    return i18n._(fallback);
  }
  if (type !== undefined) {
    return i18n._(GENERIC_CORE_ERROR_TEXT[type]);
  }
  return i18n._(DEFAULT_CORE_ERROR_TEXT);
}

import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { parseIpcError } from '@root/src/shared/ipcError';

import { type CoreErrorHandlers } from '@renderer/hooks/useAppMutation';

import {
  type CoreErrorType,
  type DanglingReference,
  type ReferenceComponentPathSegment,
} from '@elek-io/core';

/**
 * Everything Desktop says about a synchronization that did not go through, and
 * about a check of the Git repository that did not either.
 *
 * A sync the editor started is answered in the sync dialog for the four types
 * below and reaches the root error screen for every other one, see
 * [`contributing/error-handling.md`](../../../contributing/error-handling.md).
 * A failed check is answered as a state line in the Project card, which is one
 * of the two reads a screen catches itself.
 *
 * Every sentence is a message of the catalog, held as a `MessageDescriptor` so
 * a map at module scope is not read before a catalog is active, and rendered
 * through `describeCoreError` at the moment it is shown, see
 * [`coreErrorText.ts`](./coreErrorText.ts).
 */

/**
 * The `CoreError` types the sync dialog answers.
 *
 * One list, so the sentence a type is worded with and the in-place answer the
 * mutation gives it cannot drift apart: `SYNC_REFUSALS` is exhaustive over it,
 * and `syncRefusalHandlers` builds the mutation's `handled` map from it, which
 * is also what `useAppMutation` derives its `throwOnError` predicate from. A
 * type that is not here reaches the root error screen.
 */
export const SYNC_REFUSAL_TYPES = [
  'Conflict',
  'PreconditionFailed',
  'Unauthorized',
  'Internal',
] as const satisfies readonly CoreErrorType[];

export type SyncRefusalType = (typeof SYNC_REFUSAL_TYPES)[number];

/**
 * Why a synchronization stopped, per type.
 *
 * Each sentence names what stopped the sync and what to do next, and none of
 * them says that nothing was synced, which the dialog says once below the
 * Entries it lists.
 *
 * The causes are Core's, read off its
 * [git-and-sync doc](../../../node_modules/@elek-io/core/docs/git-and-sync.md#errors-during-git-operations):
 * the integrity scan before the push raises `Conflict`, a repository holding
 * something else, a Git LFS endpoint that will not take the Assets and a
 * textual rebase conflict raise `PreconditionFailed`, refused credentials raise
 * `Unauthorized`, and a git command that failed at all, most often a repository
 * nothing can reach, raises `Internal`.
 */
export const SYNC_REFUSALS: Record<SyncRefusalType, MessageDescriptor> = {
  Conflict: msg`Each field below points at an Entry or an Asset that no longer exists, because it was deleted here or on another computer. Open each Entry, choose something else or empty the field, then sync again.`,
  PreconditionFailed: msg`The Git repository may hold something besides this Project, it may not be able to store the Assets, or the same text may have been changed here and somewhere else. Ask whoever set up this Project.`,
  Unauthorized: msg`The Git repository refused access, so ask whoever set up this Project.`,
  Internal: msg`The Git repository could not be reached, so check your connection and try again.`,
};

/**
 * The `handled` map of the synchronize mutation: every type above answered the
 * same way, which is the dialog while focus is still on Sync and a toast with
 * Retry once it has moved on.
 */
export function syncRefusalHandlers(
  answer: (error: unknown) => void
): CoreErrorHandlers {
  const handlers: CoreErrorHandlers = {};

  for (const type of SYNC_REFUSAL_TYPES) {
    handlers[type] = answer;
  }

  return handlers;
}

/**
 * One reference a sync would have integrated whose target is gone.
 *
 * Deliberately narrower than Core's `DanglingReference`, which also carries
 * which carrier held the id, every hop of the chain down to the field and what
 * the missing target was. The dialog names the Entry to open and the field
 * inside it, so it reads those and the one hop that says where the field is
 * defined.
 */
export interface SyncConflictReference {
  collectionId: string;
  entryId: string;
  fieldSlug: string;
  /**
   * The Component whose own field definitions hold the field, or `null` where
   * the field is one of the Collection's own.
   */
  componentId: string | null;
}

/**
 * The Component a reference's chain of hops ends in, or `null` for a field the
 * Collection itself defines.
 *
 * Core walks a reference inside a `dynamic` field as a chain of hops, each
 * naming the Component of the item it stepped into. Only the last one defines
 * the leaf field, so only the last one's Component carries its label.
 */
function innermostComponentId(componentPath: unknown): string | null {
  if (Array.isArray(componentPath) === false) {
    return null;
  }

  const innermost: unknown = (componentPath as unknown[]).at(-1);

  if (typeof innermost !== 'object' || innermost === null) {
    return null;
  }

  const { componentId } = innermost as Partial<
    Record<keyof ReferenceComponentPathSegment, unknown>
  >;

  return typeof componentId === 'string' ? componentId : null;
}

/**
 * The references behind a sync Core refused with a `Conflict`, or an empty list
 * when the error carries none.
 *
 * Core attaches its `DanglingReference[]` as the cause of that `Conflict`, one
 * record per broken reference, and `shared/ipcError.ts` forwards an array cause
 * of plain objects as it is. Every other error answers an empty list, so the
 * dialog shows its sentence alone rather than an empty list under it.
 *
 * Two records can name the same field of the same Entry, once per carrier Core
 * found the id in and once per item of a Component that holds it, so the list
 * is deduplicated: the dialog offers one way into each field rather than one
 * per broken id. A leaf slug two Components both define stays two rows, since
 * each is named by its own Component's label.
 */
export function syncConflictReferencesOf(
  error: unknown
): SyncConflictReference[] {
  const { cause } = parseIpcError(error);

  if (Array.isArray(cause) === false) {
    return [];
  }

  const references: SyncConflictReference[] = [];
  const seen = new Set<string>();

  for (const candidate of cause as unknown[]) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }
    const { collectionId, entryId, fieldSlug, componentPath } =
      candidate as Partial<Record<keyof DanglingReference, unknown>>;
    if (
      typeof collectionId !== 'string' ||
      typeof entryId !== 'string' ||
      typeof fieldSlug !== 'string'
    ) {
      continue;
    }
    const componentId = innermostComponentId(componentPath);
    const key = `${collectionId}/${entryId}/${componentId ?? ''}/${fieldSlug}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    references.push({ collectionId, entryId, fieldSlug, componentId });
  }

  return references;
}

/**
 * What a failed check of the Git repository says in the Project card.
 *
 * `getChanges()` asks the remote before it counts, so it fails the two ways
 * talking to a remote fails: the remote refused the credentials, which Core
 * raises as `Unauthorized`, and the git command failed at all, which Core
 * raises as `Internal` and which an unreachable repository is by far the most
 * common cause of. ci draws the line for a repository that cannot be reached,
 * and one that answered and refused is not unreachable, so each gets its own.
 *
 * Anything else answers `unreachable` too, because the card has to say
 * something true and nothing could be counted whichever way this one call
 * failed. The failure is logged either way, the way a pane's boundary logs one.
 */
export function checkRefusal(error: unknown): 'refused' | 'unreachable' {
  const { type } = parseIpcError(error);

  return type === 'Unauthorized' ? 'refused' : 'unreachable';
}

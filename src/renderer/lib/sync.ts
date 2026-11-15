import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { parseIpcError } from '@root/src/shared/ipcError';

import { type CoreErrorHandlers } from '@renderer/hooks/useAppMutation';
import { coreErrorMessage } from '@renderer/lib/coreErrorText';

import {
  type CoreErrorReason,
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
 * a map at module scope is not read before a catalog is active, and rendered at
 * the moment it is shown: a refused sync through `syncRefusalSentence` below,
 * which picks the one sentence by the cause Core named and falls back to the
 * type through [`coreErrorText.ts`](./coreErrorText.ts).
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
 * That nothing left this computer, which holds for every refusal: Core pushes
 * nothing until every step before it went through.
 *
 * The dialog says it once. It closes a refusal that names its cause, and leads
 * one that names none, which is all there is to say about a refusal Desktop
 * cannot name.
 */
export const NOTHING_SYNCED = msg`Nothing was synced, and your changes stay on this computer.`;

/**
 * Why a synchronization stopped, for a refusal that names no cause, per type.
 *
 * Each sentence names what stopped the sync and what to do next, and none of
 * them says that nothing was synced, which the dialog says once below the
 * Entries it lists.
 *
 * The types are Core's, read off its
 * [git-and-sync doc](../../../node_modules/@elek-io/core/docs/git-and-sync.md#errors-during-git-operations):
 * the integrity scan before the push raises `Conflict`, refused credentials
 * raise `Unauthorized`, and a git command that failed at all, most often a
 * repository nothing can reach, raises `Internal`. A `PreconditionFailed` is
 * the one type Core refuses with a cause, so the sentence per cause below
 * answers it, and the type's own slot is what a refusal that names none is left
 * with: nothing but that nothing was synced, since every cause the type stands
 * for would be a guess.
 */
export const SYNC_REFUSALS: Record<SyncRefusalType, MessageDescriptor> = {
  Conflict: msg`Each field below points at an Entry or an Asset that no longer exists, because it was deleted here or on another computer. Open each Entry, choose something else or empty the field, then sync again.`,
  PreconditionFailed: NOTHING_SYNCED,
  Unauthorized: msg`The Git repository refused access, so ask whoever set up this Project.`,
  Internal: msg`The Git repository could not be reached, so check your connection and try again.`,
};

/**
 * A sentence per cause Core names, which is the shape of the map below.
 *
 * Named, so the type check says which cause has no sentence yet rather than
 * only that a mapped type was not satisfied.
 */
export type SyncRefusalCauses = Record<CoreErrorReason, MessageDescriptor>;

/**
 * Why a synchronization stopped, per cause Core named.
 *
 * Core names what it refused a sync for beside the type, as one value of the
 * closed list it exports, so the dialog says the one thing that stopped this
 * sync rather than every cause its type could stand for. Each sentence says
 * what happened and who gets past it, from Core's own
 * [table of causes](../../../node_modules/@elek-io/core/docs/git-and-sync.md#a-refused-sync-names-its-cause),
 * and none of them says that nothing was synced.
 *
 * The map is typed against Core's list, so a cause a Core release adds fails
 * the type check here until it has a sentence of its own. It is the one place
 * that list is kept, which is why the cause crosses IPC as a plain string, see
 * [`shared/ipcError.ts`](../../shared/ipcError.ts).
 *
 * The four that name elek.io Cloud are met by a Project whose Git repository is
 * Cloud's, which is the address its Sync settings are pointed at. Core asks
 * Cloud for that Project's credential, and these are the four answers it
 * refuses the sync on.
 */
export const SYNC_REFUSAL_CAUSES: SyncRefusalCauses = {
  uncommitted_changes: msg`Something outside elek.io Desktop changed this Project's files, so they cannot be synced as they are. Ask whoever set up this Project.`,
  remote_holds_something_else: msg`The Git repository holds something other than this Project. Ask whoever set up this Project for an empty Git repository.`,
  remote_main_without_draft: msg`The Git repository holds a published Release this computer does not have. Sync on the computer that published it, then sync here again.`,
  remote_without_atomic_push: msg`This Git host cannot take all of the changes in one go, which elek.io Desktop needs. Ask whoever set up this Project for another Git host.`,
  git_lfs_endpoint_unusable: msg`The Git repository will not take this Project's Assets. Ask whoever set up this Project to turn on Git LFS there, or to use another Git host.`,
  textual_conflict: msg`The same text was changed here and on another computer, so the two cannot be put together. Ask whoever set up this Project.`,
  remote_advanced: msg`Somebody else kept syncing with the Git repository while this sync ran. Try again.`,
  read_only_mode: msg`elek.io Desktop is set up to read content only, so it cannot sync. Ask whoever set it up on this computer.`,
  provisioned_copy: msg`This Project is a copy made for building a site, so it cannot sync. Remove it and download the Project again to work on it.`,
  git_library_missing: msg`Git on this computer is missing a part it needs. Ask whoever set up this computer to install it.`,
  remote_names_no_project: msg`The address this Project syncs with names no Project on elek.io Cloud. Ask whoever set up this Project to check it.`,
  project_on_another_host: msg`elek.io Cloud keeps this Project somewhere other than the address it syncs with. Ask whoever set up this Project to check that address.`,
  cloud_unreachable: msg`Can't reach elek.io Cloud. Check your internet connection and try again.`,
  git_host_unreachable: msg`elek.io Cloud could not reach this Project's Git host. Try again later.`,
};

/**
 * The same sentences by the cause's name as it arrives, which is a string.
 *
 * A `Map` rather than an index into the record above, so a name that happens
 * to be an inherited key, such as `toString`, answers nothing rather than
 * `Object.prototype`'s own member, the way `ipcError.ts` reads a type off a
 * `Set`. The descriptors are moved, not read, so no catalog is read before one
 * is active.
 */
const SENTENCE_BY_CAUSE = new Map<string, MessageDescriptor>(
  Object.entries(SYNC_REFUSAL_CAUSES)
);

/** The one sentence a refused synchronization leads with. */
export interface SyncRefusalSentence {
  /** What stopped the sync and what to do next, in the words of the catalog. */
  text: string;
  /**
   * Whether that sentence is already the one saying nothing was synced, which
   * is what a refusal naming no cause leads with, so the dialog does not say
   * it twice.
   */
  saysNothingWasSynced: boolean;
}

/**
 * What a refused synchronization says: the cause Core named, or, where it named
 * none and for a cause this build has no sentence for, that nothing was synced.
 *
 * The cause is looked up rather than taken as a key, so a value a newer Core
 * names falls back the same way a refusal without one does, which is the one
 * answer that stays true whatever stopped it.
 */
export function syncRefusalSentence(error: unknown): SyncRefusalSentence {
  const { type, reason } = parseIpcError(error);
  const cause =
    reason === undefined ? undefined : SENTENCE_BY_CAUSE.get(reason);
  const message =
    cause ?? coreErrorMessage(type, SYNC_REFUSALS, NOTHING_SYNCED);

  return {
    text: i18n._(message),
    saysNothingWasSynced: message === NOTHING_SYNCED,
  };
}

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

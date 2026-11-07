import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg, t } from '@lingui/core/macro';

import {
  type AssetChange,
  type CollectionChange,
  type ComponentChange,
  type CoreErrorType,
  type EntryChange,
  type FieldChange,
  type ProjectChange,
  type ReleaseDiff,
} from '@elek-io/core';

/**
 * Everything the Release dialog says about a pending Release, in one place: the
 * word of a bump, the sentence behind it, every change in words, and the copy
 * for each refusal.
 *
 * A Release is read and cut through `core.releases`, whose `ReleaseDiff` carries
 * a bump and seven arrays of changes but no sentence, so the sentence is derived
 * here. Every sentence is a message of the catalog. A map at module scope holds
 * `MessageDescriptor`s and is rendered through `i18n._` when it is shown, while
 * a sentence with a placeholder is a function that calls `t` at that moment,
 * see [`coreErrorText.ts`](./coreErrorText.ts).
 */

/** A change of any of the diff's arrays, carrying its own bump. */
export type ReleaseChange = ReleaseDiff[
  | 'projectChanges'
  | 'collectionChanges'
  | 'componentChanges'
  | 'fieldChanges'
  | 'componentFieldChanges'
  | 'assetChanges'
  | 'entryChanges'][number];

/** A change of the diff, with the sentence that says what it was. */
export interface DescribedReleaseChange {
  /** Stable across renders, so React keys never fall back to the index. */
  key: string;
  description: string;
  bump: ReleaseChange['bump'];
}

/** The word of a bump, so the badge is never read by its color alone. */
export function bumpWord(bump: ReleaseChange['bump']): string {
  switch (bump) {
    case 'major':
      return t`Major`;
    case 'minor':
      return t`Minor`;
    case 'patch':
      return t`Patch`;
  }
}

// What each change of the Project itself was. Exhaustive over Core's enum, so a
// new change type fails to compile until it has a sentence here.
const PROJECT_CHANGES: Record<ProjectChange['changeType'], MessageDescriptor> =
  {
    nameChanged: msg`The Project was renamed`,
    descriptionChanged: msg`The Project's description changed`,
    defaultLanguageChanged: msg`The default language changed`,
    supportedLanguageAdded: msg`A language was added`,
    supportedLanguageRemoved: msg`A language was removed`,
  };

const COLLECTION_CHANGES: Record<
  CollectionChange['changeType'],
  MessageDescriptor
> = {
  added: msg`A Collection was added`,
  deleted: msg`A Collection was removed`,
  slugChanged: msg`A Collection was renamed`,
};

const COMPONENT_CHANGES: Record<
  ComponentChange['changeType'],
  MessageDescriptor
> = {
  added: msg`A Component was added`,
  deleted: msg`A Component was removed`,
  slugChanged: msg`A Component was renamed`,
};

const ASSET_CHANGES: Record<AssetChange['changeType'], MessageDescriptor> = {
  added: msg`An Asset was added`,
  deleted: msg`An Asset was removed`,
  binaryChanged: msg`An Asset's file was replaced`,
  metadataChanged: msg`An Asset's name or description changed`,
};

const ENTRY_CHANGES: Record<EntryChange['changeType'], MessageDescriptor> = {
  added: msg`An Entry was added`,
  deleted: msg`An Entry was removed`,
  modified: msg`An Entry was changed`,
};

// A Field of a Collection or of a Component. Each sentence takes the Field's
// slug, which is the name a site reads its Value under.
const FIELD_CHANGES: Record<
  FieldChange['changeType'],
  (slug: string) => string
> = {
  added: (slug) => t`The Field ${slug} was added`,
  deleted: (slug) => t`The Field ${slug} was removed`,
  slugChanged: (slug) => t`A Field was renamed to ${slug}`,
  valueTypeChanged: (slug) => t`The Field ${slug} holds another kind of Value`,
  fieldTypeChanged: (slug) => t`The Field ${slug} has another type`,
  minMaxTightened: (slug) => t`The Field ${slug} allows less than before`,
  minMaxLoosened: (slug) => t`The Field ${slug} allows more than before`,
  isRequiredToNotRequired: (slug) => t`The Field ${slug} is no longer required`,
  isNotRequiredToRequired: (slug) => t`The Field ${slug} is now required`,
  isUniqueToNotUnique: (slug) => t`The Field ${slug} may repeat a Value now`,
  isNotUniqueToUnique: (slug) =>
    t`The Field ${slug} may no longer repeat a Value`,
  ofCollectionsChanged: (slug) =>
    t`The Field ${slug} points at other Collections`,
  ofComponentsChanged: (slug) => t`The Field ${slug} allows other Components`,
  slugFormatChanged: (slug) =>
    t`The Field ${slug} writes its Values differently`,
  labelChanged: (slug) => t`The Field ${slug} has another label`,
  descriptionChanged: (slug) => t`The Field ${slug} has another description`,
  defaultValueChanged: (slug) => t`The Field ${slug} has another default Value`,
  inputWidthChanged: (slug) => t`The Field ${slug} is shown at another width`,
  isDisabledChanged: (slug) => t`The Field ${slug} was turned on or off`,
  ofFieldDefinitionsChanged: (slug) =>
    t`The Field ${slug} is built from other Fields`,
};

/**
 * Every change of a diff as a sentence, in the order the arrays carry them:
 * the Project, its Collections and their Fields, its Components and their
 * Fields, its Assets and its Entries.
 *
 * Read from the diff's own arrays rather than through the History's diff
 * components, which take a `GitCommit` and compare two commits of one object.
 */
export function describeReleaseChanges(
  diff: ReleaseDiff
): DescribedReleaseChange[] {
  return [
    ...diff.projectChanges.map((change, index) => ({
      key: `project-${change.changeType}-${index}`,
      description: i18n._(PROJECT_CHANGES[change.changeType]),
      bump: change.bump,
    })),
    ...diff.collectionChanges.map((change) => ({
      key: `collection-${change.collectionId}-${change.changeType}`,
      description: i18n._(COLLECTION_CHANGES[change.changeType]),
      bump: change.bump,
    })),
    ...diff.fieldChanges.map((change) => ({
      key: `field-${change.fieldId}-${change.changeType}`,
      description: FIELD_CHANGES[change.changeType](change.fieldSlug),
      bump: change.bump,
    })),
    ...diff.componentChanges.map((change) => ({
      key: `component-${change.componentId}-${change.changeType}`,
      description: i18n._(COMPONENT_CHANGES[change.changeType]),
      bump: change.bump,
    })),
    ...diff.componentFieldChanges.map((change) => ({
      key: `component-field-${change.fieldId}-${change.changeType}`,
      description: FIELD_CHANGES[change.changeType](change.fieldSlug),
      bump: change.bump,
    })),
    ...diff.assetChanges.map((change) => ({
      key: `asset-${change.assetId}-${change.changeType}`,
      description: i18n._(ASSET_CHANGES[change.changeType]),
      bump: change.bump,
    })),
    ...diff.entryChanges.map((change) => ({
      key: `entry-${change.entryId}-${change.changeType}`,
      description: i18n._(ENTRY_CHANGES[change.changeType]),
      bump: change.bump,
    })),
  ];
}

/**
 * Why the version moves the way it does, in one sentence.
 *
 * The highest bump across every change decides the Release's, so the sentence
 * names that bump and the first change carrying it. A `draft` that is only
 * ahead in commits carries no classified change, which Core calls a patch, so
 * that sentence names no change.
 */
export function releaseReason(
  diff: ReleaseDiff,
  changes: DescribedReleaseChange[]
): string {
  if (diff.bump === null) {
    const { currentVersion } = diff;
    return t`Nothing has changed since version ${currentVersion}, so there is nothing to release.`;
  }

  const driver = changes.find((change) => change.bump === diff.bump);

  // One message per bump rather than the word of the bump dropped into one
  // sentence, because a word that carries grammar cannot be translated on its
  // own. The change that drives the bump is a placeholder, since it is already
  // a sentence of the catalog. Its first letter is lowercased so it reads as
  // one sentence, which holds for an English and a German sentence alike, both
  // of which open on an article.
  if (driver === undefined) {
    switch (diff.bump) {
      case 'major':
        return t`This is a major Release, because what a site reads is unchanged.`;
      case 'minor':
        return t`This is a minor Release, because what a site reads is unchanged.`;
      case 'patch':
        return t`This is a patch Release, because what a site reads is unchanged.`;
    }
  }

  const change = `${driver.description.charAt(0).toLowerCase()}${driver.description.slice(1)}`;

  switch (diff.bump) {
    case 'major':
      return t`This is a major Release, because ${change}.`;
    case 'minor':
      return t`This is a minor Release, because ${change}.`;
    case 'patch':
      return t`This is a patch Release, because ${change}.`;
  }
}

/**
 * Why reading what a Release would publish stopped, per `CoreError` type.
 *
 * The keys are the set of types the read answers in the dialog instead of
 * raising. Everything else reaches the root error boundary, so a cause nobody
 * planned for stays loud, see
 * [`contributing/error-handling.md`](../../../contributing/error-handling.md).
 *
 * `prepare()` writes nothing, so the causes are its own refusals plus what the
 * fetch before it can hit, read off Core's releases and git-and-sync docs.
 * Where one type covers several of them, the text names the one an editor meets
 * and what to do about it, in one sentence, and the rest are written down in
 * [`contributing/error-handling.md`](../../../contributing/error-handling.md).
 */
export const RELEASE_READ_REFUSALS: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  PreconditionFailed: msg`Changes were saved or a Release was made on another computer, so synchronize this Project first.`,
  Unauthorized: msg`The Git repository refused access, so ask whoever set up this Project.`,
  Internal: msg`The Git repository could not be reached, so check your connection and try again.`,
};

export const RELEASE_READ_FALLBACK = msg`What a Release would publish could not be read. Your changes on this computer are safe. Please try again.`;

/**
 * The refusals a second read can clear on its own.
 *
 * A repository that could not be reached may be reachable a moment later, so
 * reading again is the whole answer. The other two are not: both need something
 * done outside this dialog first, synchronizing the Project or being let into
 * the repository, so offering to read again would be a button that cannot
 * change the answer.
 */
export const RELEASE_READ_RETRYABLE: ReadonlySet<CoreErrorType> = new Set([
  'Internal',
]);

/**
 * Why a Release could not be made, per `CoreError` type.
 *
 * Core unwinds every step of a failed Release before the error arrives, so each
 * text can say that nothing was released, and the editor retries the same call.
 * The set of keys is the same contract as above: a type that is not here reaches
 * the root error boundary.
 *
 * `create()` commits, fetches and pushes, so `Unauthorized` covers credentials
 * the repository refused, `PreconditionFailed` a remote that moved on, and
 * `Internal` a git command that failed, most often a repository nothing can
 * reach. Each text is the read's sentence for the same type with the fact that
 * nothing was released in front of it, so one cause is named per refusal, the
 * same way round as above.
 */
export const RELEASE_CREATE_REFUSALS: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  PreconditionFailed: msg`Nothing was released, and this Project is exactly as it was. Changes were saved or a Release was made on another computer, so synchronize this Project first.`,
  Unauthorized: msg`Nothing was released, and this Project is exactly as it was. The Git repository refused access, so ask whoever set up this Project.`,
  Internal: msg`Nothing was released, and this Project is exactly as it was. The Git repository could not be reached, so check your connection and try again.`,
};

export const RELEASE_CREATE_FALLBACK = msg`Nothing was released, and this Project is exactly as it was. Please try again.`;

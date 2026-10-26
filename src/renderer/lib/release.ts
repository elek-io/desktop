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
 * here. The texts are hardcoded English like the rest of the renderer, see
 * [`coreErrorText.ts`](./coreErrorText.ts).
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
      return 'Major';
    case 'minor':
      return 'Minor';
    case 'patch':
      return 'Patch';
  }
}

// What each change of the Project itself was. Exhaustive over Core's enum, so a
// new change type fails to compile until it has a sentence here.
const PROJECT_CHANGES: Record<ProjectChange['changeType'], string> = {
  nameChanged: 'The Project was renamed',
  descriptionChanged: "The Project's description changed",
  defaultLanguageChanged: 'The default language changed',
  supportedLanguageAdded: 'A language was added',
  supportedLanguageRemoved: 'A language was removed',
};

const COLLECTION_CHANGES: Record<CollectionChange['changeType'], string> = {
  added: 'A Collection was added',
  deleted: 'A Collection was removed',
  slugChanged: 'A Collection was renamed',
};

const COMPONENT_CHANGES: Record<ComponentChange['changeType'], string> = {
  added: 'A Component was added',
  deleted: 'A Component was removed',
  slugChanged: 'A Component was renamed',
};

const ASSET_CHANGES: Record<AssetChange['changeType'], string> = {
  added: 'An Asset was added',
  deleted: 'An Asset was removed',
  binaryChanged: "An Asset's file was replaced",
  metadataChanged: "An Asset's name or description changed",
};

const ENTRY_CHANGES: Record<EntryChange['changeType'], string> = {
  added: 'An Entry was added',
  deleted: 'An Entry was removed',
  modified: 'An Entry was changed',
};

// A Field of a Collection or of a Component. Each sentence takes the Field's
// slug, which is the name a site reads its Value under.
const FIELD_CHANGES: Record<
  FieldChange['changeType'],
  (slug: string) => string
> = {
  added: (slug) => `The Field ${slug} was added`,
  deleted: (slug) => `The Field ${slug} was removed`,
  slugChanged: (slug) => `A Field was renamed to ${slug}`,
  valueTypeChanged: (slug) => `The Field ${slug} holds another kind of Value`,
  fieldTypeChanged: (slug) => `The Field ${slug} has another type`,
  minMaxTightened: (slug) => `The Field ${slug} allows less than before`,
  minMaxLoosened: (slug) => `The Field ${slug} allows more than before`,
  isRequiredToNotRequired: (slug) => `The Field ${slug} is no longer required`,
  isNotRequiredToRequired: (slug) => `The Field ${slug} is now required`,
  isUniqueToNotUnique: (slug) => `The Field ${slug} may repeat a Value now`,
  isNotUniqueToUnique: (slug) =>
    `The Field ${slug} may no longer repeat a Value`,
  ofCollectionsChanged: (slug) =>
    `The Field ${slug} points at other Collections`,
  ofComponentsChanged: (slug) => `The Field ${slug} allows other Components`,
  slugFormatChanged: (slug) =>
    `The Field ${slug} writes its Values differently`,
  labelChanged: (slug) => `The Field ${slug} has another label`,
  descriptionChanged: (slug) => `The Field ${slug} has another description`,
  defaultValueChanged: (slug) => `The Field ${slug} has another default Value`,
  inputWidthChanged: (slug) => `The Field ${slug} is shown at another width`,
  isDisabledChanged: (slug) => `The Field ${slug} was turned on or off`,
  ofFieldDefinitionsChanged: (slug) =>
    `The Field ${slug} is built from other Fields`,
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
      description: PROJECT_CHANGES[change.changeType],
      bump: change.bump,
    })),
    ...diff.collectionChanges.map((change) => ({
      key: `collection-${change.collectionId}-${change.changeType}`,
      description: COLLECTION_CHANGES[change.changeType],
      bump: change.bump,
    })),
    ...diff.fieldChanges.map((change) => ({
      key: `field-${change.fieldId}-${change.changeType}`,
      description: FIELD_CHANGES[change.changeType](change.fieldSlug),
      bump: change.bump,
    })),
    ...diff.componentChanges.map((change) => ({
      key: `component-${change.componentId}-${change.changeType}`,
      description: COMPONENT_CHANGES[change.changeType],
      bump: change.bump,
    })),
    ...diff.componentFieldChanges.map((change) => ({
      key: `component-field-${change.fieldId}-${change.changeType}`,
      description: FIELD_CHANGES[change.changeType](change.fieldSlug),
      bump: change.bump,
    })),
    ...diff.assetChanges.map((change) => ({
      key: `asset-${change.assetId}-${change.changeType}`,
      description: ASSET_CHANGES[change.changeType],
      bump: change.bump,
    })),
    ...diff.entryChanges.map((change) => ({
      key: `entry-${change.entryId}-${change.changeType}`,
      description: ENTRY_CHANGES[change.changeType],
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
    return `Nothing has changed since version ${diff.currentVersion}, so there is nothing to release.`;
  }

  const driver = changes.find((change) => change.bump === diff.bump);
  const word = bumpWord(diff.bump).toLowerCase();

  if (driver === undefined) {
    return `This is a ${word} Release, because what a site reads is unchanged.`;
  }

  return `This is a ${word} Release, because ${driver.description.charAt(0).toLowerCase()}${driver.description.slice(1)}.`;
}

/**
 * Why reading what a Release would publish stopped, per `CoreError` type.
 *
 * The keys are the set of types the read answers in the dialog instead of
 * raising. Everything else reaches the root error boundary, so a cause nobody
 * planned for stays loud, see
 * [`contributing/error-handling.md`](../../../contributing/error-handling.md).
 *
 * Each text names only what Core raises that type for on this path, read off
 * Core's releases and git-and-sync docs. `prepare()` writes nothing, so the
 * causes are its own refusals plus what the fetch before it can hit.
 */
export const RELEASE_READ_REFUSALS: Partial<Record<CoreErrorType, string>> = {
  PreconditionFailed:
    'Changes were saved or a Release was made on another computer, so synchronize this Project first.',
  Unauthorized:
    'The Git repository refused access, so ask whoever set up this Project.',
  Internal:
    'The Git repository could not be reached, so check your connection and try again.',
};

export const RELEASE_READ_FALLBACK =
  'What a Release would publish could not be read. Your changes on this computer are safe. Please try again.';

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
 * the repository refused, `PreconditionFailed` a remote that moved on or cannot
 * take a Release at all, and `Internal` a git command that failed, most often a
 * repository nothing can reach.
 */
export const RELEASE_CREATE_REFUSALS: Partial<Record<CoreErrorType, string>> = {
  PreconditionFailed:
    'Nothing was released, and this Project is exactly as it was. Either changes were saved or a Release was made on another computer, in which case synchronize this Project first, or the Git repository cannot take a Release, in which case ask whoever set it up.',
  Unauthorized:
    'Nothing was released, and this Project is exactly as it was. The Git repository refused access, so ask whoever set up this Project.',
  Internal:
    'Nothing was released, and this Project is exactly as it was. The Git repository could not be reached, so check your connection and try again.',
};

export const RELEASE_CREATE_FALLBACK =
  'Nothing was released, and this Project is exactly as it was. Please try again.';

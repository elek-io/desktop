import { t } from '@lingui/core/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { z } from 'zod';

import {
  supportedLanguageSchema,
  type ContentLossReason,
  type EntryIssueType,
  type SupportedLanguage,
} from '@elek-io/core';

/**
 * Reading the `cause` Core attaches to a `Conflict` it raises for a field
 * definition change it cannot carry out on its own.
 *
 * Core's `Conflict` covers unrelated refusals on the same call, a slug another
 * object already uses among them, and only the field definition cascade carries
 * an issue list. So the presence of issues is what tells the two apart, and
 * `type` alone cannot.
 *
 * One typed reader per shape, as the reader of the refusals of saving an Entry
 * is (`lib/entryRefusals.ts`), so nothing branches on a raw `cause`.
 *
 * @see node_modules/@elek-io/core/docs/schema-changes.md
 */

// The issue types Core declares, as a Record keyed by EntryIssueType, which
// forces the list to stay exhaustive: a type added in Core fails to compile
// here until it is listed. The content loss is taken out again below, because
// it is the one type that is accepted rather than answered with a Value, and it
// carries keys of its own.
const entryIssueTypes = {
  missing_required: 'missing_required',
  type_mismatch: 'type_mismatch',
  constraint_violation: 'constraint_violation',
  unique_collision: 'unique_collision',
  content_loss: 'content_loss',
} as const satisfies Record<EntryIssueType, EntryIssueType>;

/** The issue types a corrected Value answers, which is every one but the loss. */
const { content_loss: _accepted, ...neededValueIssueTypes } = entryIssueTypes;

// What about the change deletes the content, the same way: a reason added in
// Core fails to compile here until it is listed.
const contentLossReasons = {
  field_removed: 'field_removed',
  components_narrowed: 'components_narrowed',
  collections_narrowed: 'collections_narrowed',
} as const satisfies Record<ContentLossReason, ContentLossReason>;

/**
 * Where one issue sits, which is every id the dialog needs to draw its row and
 * to send the answer back: the Entry and its Collection, the field definition
 * by id and by its new slug, and the Component item the field belongs to where
 * the change is a Component's.
 *
 * Deliberately narrower than Core's own `EntryIssue`, which also carries
 * `transformedValues`, every Value of the Entry. The IPC boundary drops that
 * before an issue crosses (`forwardedIssueKeys` in `shared/ipcError.ts`), so it
 * never reaches the renderer at all.
 */
const issueLocationSchema = z.object({
  entryId: z.string(),
  collectionId: z.string(),
  fieldDefinitionId: z.string(),
  fieldSlug: z.string(),
  /** Only a Component's issue belongs to an item, so only it carries one. */
  componentItemId: z.string().optional(),
});

/**
 * One Value the change would delete, read for its content alone, which is what
 * the dialog strikes through. Its field definition says what type the content
 * is of, so the Value's own `valueType` is not read here.
 */
const lostValueSchema = z.object({ content: z.unknown() });

/**
 * Stored content the change would delete, which is accepted rather than
 * answered with a Value.
 */
const lostValueIssueSchema = issueLocationSchema.extend({
  issue: z.literal(entryIssueTypes.content_loss),
  reason: z.enum(contentLossReasons),
  currentValue: lostValueSchema,
  /** How many items of the Value would go, where the drop is partial. */
  itemCount: z.number().optional(),
  /** The one language the drop is in, where it is in one. */
  language: supportedLanguageSchema.optional(),
});

/** A change one Entry cannot follow until it is given a corrected Value. */
const neededValueIssueSchema = issueLocationSchema.extend({
  issue: z.enum(neededValueIssueTypes),
});

const schemaChangeIssueSchema = z.union([
  lostValueIssueSchema,
  neededValueIssueSchema,
]);

/** One Value a field definition change would delete. */
export type LostValueIssue = z.infer<typeof lostValueIssueSchema>;

/** One Value a field definition change needs before it can be saved. */
export type NeededValueIssue = z.infer<typeof neededValueIssueSchema>;

/** One thing a field definition change cannot carry out on its own. */
export type SchemaChangeIssue = LostValueIssue | NeededValueIssue;

/**
 * The issues behind a failed Collection or Component update, or an empty array
 * when the error carries none. An empty array is the answer for every other
 * `Conflict` too, which is what lets a screen tell a cascade refusal from a
 * slug already in use.
 *
 * An element of the cause that is not one of Core's issues is skipped rather
 * than emptying the list, so a cause of another shape answers nothing here.
 */
export function entryIssuesOf(error: unknown): SchemaChangeIssue[] {
  const { cause } = parseIpcError(error);
  const elements = z.array(z.unknown()).safeParse(cause);

  if (elements.success === false) {
    return [];
  }

  return elements.data.flatMap((candidate) => {
    const parsed = schemaChangeIssueSchema.safeParse(candidate);

    return parsed.success ? [parsed.data] : [];
  });
}

/** The Values the change would delete, out of everything it was refused for. */
export function lostValuesOf(issues: SchemaChangeIssue[]): LostValueIssue[] {
  return issues.filter(
    (issue): issue is LostValueIssue => issue.issue === 'content_loss'
  );
}

/** The Values the change needs, out of everything it was refused for. */
export function neededValuesOf(
  issues: SchemaChangeIssue[]
): NeededValueIssue[] {
  return issues.filter(
    (issue): issue is NeededValueIssue => issue.issue !== 'content_loss'
  );
}

/**
 * The field definition ids whose content may go, which is what Core takes back
 * as `acceptedContentLoss` to apply the change.
 *
 * Each id once, however many Entries it reaches: Core accepts the loss per
 * field definition rather than per Entry, and refuses for every id it was not
 * given, so an acceptance written for one edit never carries a second one
 * through.
 */
export function acceptedContentLossOf(issues: SchemaChangeIssue[]): string[] {
  return [
    ...new Set(lostValuesOf(issues).map((issue) => issue.fieldDefinitionId)),
  ];
}

/**
 * The language a lost Value is read in: the one Core named where the drop is in
 * one language, and otherwise the language the screen is in.
 */
export function lostValueLanguage(
  issue: LostValueIssue,
  shown: SupportedLanguage
): SupportedLanguage {
  return issue.language ?? shown;
}

/**
 * What has to happen to one Entry before the change can be saved, in words.
 * Never Core's own message, which is written for a developer reading a log.
 */
export function describeEntryIssue(issue: EntryIssueType): string {
  switch (issue) {
    case 'missing_required':
      return t`needs a Value for this Field, which is now required and has no default`;
    case 'type_mismatch':
      return t`holds a Value that does not fit this Field anymore`;
    case 'constraint_violation':
      return t`holds a Value this Field no longer allows`;
    case 'unique_collision':
      return t`holds a Value another Entry already holds, and this Field is now unique`;
    case 'content_loss':
      return t`would lose what it holds in this Field, so the change is refused`;
  }
}

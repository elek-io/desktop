import { z } from 'zod';

// Reading the details Core attaches to the two refusals of saving an Entry
// that belong on a field, and turning where Core says each happened into the
// path of that field on the form.
//
// One typed reader per shape, as the reader of a refused field definition
// change is (`lib/schemaChange.ts`), so nothing branches on a raw `cause`. It
// holds no words and no React, which is what lets it be read without a window:
// the sentence each refusal shows is in `hooks/useEntryRefusals.ts`.
//
// See contributing/error-handling.md.

/**
 * One Value another Entry of the same Collection already holds, in the same
 * language. Core collects them and raises a `Conflict` whose cause is the
 * list.
 *
 * Narrower than Core's own `UniqueValueConflict`, which also carries the Value
 * itself and the other Entry's id. Nothing on screen needs either: the Value
 * is in the field somebody is looking at, and the other Entry is not linked
 * from here.
 */
const uniqueValueConflictSchema = z.object({
  fieldSlug: z.string(),
  language: z.string(),
});

/**
 * One hop from an Entry's own field down into a section, which a reference
 * nested inside a dynamic field carries one of per level.
 *
 * The hop names the section by its id rather than by its place, because a
 * section can be moved, so the place it sits at is read off the form's Values.
 */
const componentPathSegmentSchema = z.object({
  fieldSlug: z.string(),
  itemId: z.string(),
});

/**
 * One reference Core refuses: it points at something that is gone, or at an
 * Asset whose type the field does not take. Core raises a `BadRequest` whose
 * cause holds the list.
 */
const entryReferenceIssueSchema = z.object({
  kind: z.enum(['reference_not_found', 'asset_mime_mismatch']),
  /**
   * What the reference points at, which a mismatched type does not carry
   * because only an Asset has one.
   */
  refKind: z.enum(['asset', 'entry']).optional(),
  fieldSlug: z.string(),
  language: z.string(),
  componentPath: z.array(componentPathSegmentSchema),
});

const referenceIssuesSchema = z.object({
  issues: z.array(entryReferenceIssueSchema).min(1),
});

export type UniqueValueConflict = z.infer<typeof uniqueValueConflictSchema>;
export type EntryReferenceIssue = z.infer<typeof entryReferenceIssueSchema>;

/** Where one refusal happened, as Core names it. */
export interface EntryRefusalLocation {
  fieldSlug: string;
  language: string;
  /**
   * The sections the field sits inside, outermost first. Left out where the
   * field is one of the Entry's own, which a unique Value always is.
   */
  componentPath?: { fieldSlug: string; itemId: string }[];
}

/**
 * The Values another Entry already holds, out of the cause of a `Conflict`, or
 * an empty list where the cause holds none.
 *
 * An empty list is the answer for every other `Conflict` too, which is what
 * tells a refusal belonging on a field from one nothing here can place.
 */
export function uniqueValueConflictsOf(cause: unknown): UniqueValueConflict[] {
  const parsed = z.array(uniqueValueConflictSchema).min(1).safeParse(cause);

  return parsed.success ? parsed.data : [];
}

/**
 * The references Core refused, out of the cause of a `BadRequest`, or an empty
 * list where the cause holds none.
 */
export function entryReferenceIssuesOf(cause: unknown): EntryReferenceIssue[] {
  const parsed = referenceIssuesSchema.safeParse(cause);

  return parsed.success ? parsed.data.issues : [];
}

/** The sections of one dynamic field's Value, each with its id and Values. */
const sectionsSchema = z.object({
  content: z.array(z.object({ id: z.string(), values: z.unknown() })),
});

/** A Value held per language, which every type but `dynamic` is. */
const translatableValueSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

/** One Value out of a record of them, keyed by its field's slug. */
function valueOf(values: unknown, fieldSlug: string): unknown {
  const parsed = z.record(z.string(), z.unknown()).safeParse(values);

  return parsed.success ? parsed.data[fieldSlug] : undefined;
}

/**
 * The path of the field one refusal belongs to, on an Entry form, or `null`
 * where the form holds no such field.
 *
 * `null` means Core named a place this form does not have, a section somebody
 * removed while the save was in flight for instance. A refusal nothing can
 * place reaches the root error boundary rather than landing on the wrong
 * field, see `hooks/useEntryRefusals.ts`.
 *
 * @param formValues Everything the Entry form holds, which is where each
 * section's own id is read, since Core names a section by its id while the
 * form binds it by its place.
 */
export function entryValuePath(
  location: EntryRefusalLocation,
  formValues: unknown
): string | null {
  // A form field's path, which react-hook-form reads, rather than words. It
  // starts at the key an Entry form binds every Value under, and each
  // following segment is the one that form writes, see
  // `components/forms/entry-form.tsx`.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const root = 'values';
  let prefix = root;
  let held: unknown = valueOf(formValues, root);

  for (const hop of location.componentPath ?? []) {
    const sections = sectionsSchema.safeParse(valueOf(held, hop.fieldSlug));
    if (sections.success === false) {
      return null;
    }
    const index = sections.data.content.findIndex(
      (section) => section.id === hop.itemId
    );
    const section = sections.data.content[index];
    if (section === undefined) {
      return null;
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings
    prefix = `${prefix}.${hop.fieldSlug}.content.${String(index)}.values`;
    held = section.values;
  }

  const leaf = translatableValueSchema.safeParse(
    valueOf(held, location.fieldSlug)
  );
  if (leaf.success === false) {
    return null;
  }

  // Every type that holds a reference keeps its content per language, so the
  // path ends on the language Core named. A dynamic field is the one type that
  // does not, and it holds no reference of its own.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  return `${prefix}.${location.fieldSlug}.content.${location.language}`;
}

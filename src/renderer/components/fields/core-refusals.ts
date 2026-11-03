// The English Core writes into a refusal of a Value, which the field type it
// lands on replaces with words an editor uses.
//
// Core raises these with a message of their own, and zod lets a message that
// arrives with an issue outrank every error map, so they are the one refusal
// `lib/refusedValueText.ts` cannot reach. Core gives them no code either, so
// they are matched by the opening of their text, and a module answers `null`
// for anything else. A message Core rewords therefore falls to the one
// sentence for a refusal nothing knows rather than reaching a field.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/**
 * The opening of each message, so the ones Core finishes with a value of their
 * own, such as the slug it expected, are matched by what stays the same.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Core's own English, matched
   so it can be replaced, and never shown. */
export const coreRefusals = {
  /** A reference to an Entry of a Collection the field does not allow. */
  foreignCollection:
    'Referenced Entry must belong to one of the allowed Collections',
  /** Text that holds nothing a slug can be made of. */
  unusableSlug: 'This value cannot be turned into a slug',
  /** A slug that is not yet in the form the field's own settings ask for. */
  nonCanonicalSlug: 'Value must be a canonical slug for this field',
  /**
   * A markdown tree that is empty, or holds one empty paragraph. Core stores
   * either as `null` per language, so both openings read alike.
   */
  emptyMarkdown:
    'Empty markdown values must be serialised as null per language',
  /** A markdown tree nested deeper than Core walks. */
  deepMarkdown: 'Markdown tree exceeds maximum nesting depth of',
} as const;
/* eslint-enable lingui/no-unlocalized-strings */

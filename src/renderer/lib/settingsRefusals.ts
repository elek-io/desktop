import { t } from '@lingui/core/macro';

// The English Core writes into a refusal of a Collection's, a Component's or a
// field definition's own settings, and the words an editor reads instead.
//
// Core raises these with a message of their own, and zod lets a message that
// arrives with an issue outrank every error map, so they are the one refusal
// `lib/refusedValueText.ts` cannot reach. Core gives them no code either, so
// they are matched by the opening of their text, and anything else falls to
// the one sentence for a refusal nothing knows rather than reaching a field as
// Core wrote it.
//
// See contributing/renderer/forms.md#the-words-a-refused-value-is-explained-in.

/**
 * The opening of each message, so the ones Core finishes with a value of its
 * own are matched by what stays the same.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Core's own English, matched
   so it can be replaced, and never shown. */
export const settingsRefusals = {
  /** A slug Core keeps for itself, such as `settings`. */
  reservedSlug: 'This slug is reserved and cannot be used',
  /** A slug another field of the same object already holds. */
  takenFieldSlug: 'Slug already in use',
  /** A minimum above the maximum. */
  minAboveMax: 'min must be less than or equal to max',
  /** A Default Value that is not one of the options. */
  defaultNotAnOption: 'The default value must be one of the defined options',
  /** A Default Value whose length is outside the field's own bounds. */
  defaultLengthOutOfRange:
    'The default value length must be within the min and max range',
  /** A Default Value outside the field's own bounds. */
  defaultOutOfRange: 'The default value must be within the min and max range',
  /** A Default Value on a field every Entry has to hold a different Value in. */
  uniqueWithDefault: 'A unique field cannot have a default value',
  /** A separator that is not one of the ones a web address takes. */
  badSeparator: 'Separator must be empty or one of',
  /** Task lists without the lists they sit in. */
  taskListsWithoutLists: 'taskListItems requires lists to be enabled',
  /** A slug written from itself. */
  slugFromItself: 'A slug field cannot reference itself as a source',
  /** The same field twice in the list a slug is written from. */
  duplicateSlugSource: 'Duplicate slug source field definition',
  /** A field the slug is written from that the object no longer holds. */
  goneSlugSource: 'Slug source field definition does not exist in this',
  /** A field a slug cannot be written from. */
  unusableSlugSource: 'A slug source must be a non-slug string field',
  /** A slug field inside a Component, which Core enforces per Collection. */
  slugInComponent: 'Slug fields are not supported inside Components',
  /** A unique field inside a Component, for the same reason. */
  uniqueInComponent: 'Unique fields are not supported inside Components',
  /** A markdown Default Value the field's own features do not allow. */
  markdownDefault: 'defaultValue:',
} as const;
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * The words for one refusal Core wrote its own English for, or `null` for one
 * these do not know.
 *
 * Each sentence is read from the message catalog as it is asked for, so a
 * change of language reaches the next refusal.
 */
export function settingsRefusalText(message: string): string | null {
  const { reservedSlug } = settingsRefusals;

  if (message.startsWith(reservedSlug)) {
    return t`This word is kept for elek.io. Choose another slug.`;
  }
  if (message.startsWith(settingsRefusals.takenFieldSlug)) {
    return t`Another field already uses this slug. Choose another one.`;
  }
  if (message.startsWith(settingsRefusals.minAboveMax)) {
    return t`The minimum can't be above the maximum.`;
  }
  if (message.startsWith(settingsRefusals.defaultNotAnOption)) {
    return t`Choose the Default Value from the options above.`;
  }
  if (
    message.startsWith(settingsRefusals.defaultLengthOutOfRange) ||
    message.startsWith(settingsRefusals.defaultOutOfRange)
  ) {
    return t`The Default Value doesn't fit between the minimum and the maximum.`;
  }
  if (message.startsWith(settingsRefusals.uniqueWithDefault)) {
    return t`A unique field takes no Default Value, since every Entry would start with the same one.`;
  }
  if (message.startsWith(settingsRefusals.badSeparator)) {
    return t`Choose a separator from the list.`;
  }
  if (message.startsWith(settingsRefusals.taskListsWithoutLists)) {
    return t`Task lists need Lists as well.`;
  }
  if (message.startsWith(settingsRefusals.slugFromItself)) {
    return t`A slug can't be written from itself.`;
  }
  if (message.startsWith(settingsRefusals.duplicateSlugSource)) {
    return t`This field is in the list twice.`;
  }
  if (message.startsWith(settingsRefusals.goneSlugSource)) {
    return t`This field is gone. Take it out of the list.`;
  }
  if (message.startsWith(settingsRefusals.unusableSlugSource)) {
    return t`A slug can only be written from a text field.`;
  }
  if (message.startsWith(settingsRefusals.slugInComponent)) {
    return t`A Component holds no slug field. Choose another type.`;
  }
  if (message.startsWith(settingsRefusals.uniqueInComponent)) {
    return t`A Component's fields can't be unique.`;
  }
  if (message.startsWith(settingsRefusals.markdownDefault)) {
    return t`This Default Value holds something the field doesn't allow.`;
  }

  return null;
}

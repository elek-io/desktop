import { fieldModule } from '@renderer/components/fields';
import { contentInLanguage } from '@renderer/components/fields/value-contracts';
import {
  holdsSameContent,
  valueMarks,
  type ValueMark,
} from '@renderer/lib/valueMarks';

import type { FieldDefinition, SupportedLanguage } from '@elek-io/core';

// What a change shows of one Value: whether it changed, and the runs to draw.
//
// Every Value is read through its field type's own `renderValue`, so nothing
// here knows how any type reads one, and the words come from jsdiff, see
// `lib/valueMarks.ts`.
//
// See contributing/renderer/forms.md#a-value-that-is-read-rather-than-edited.

/** What a change shows of one Value. */
export interface ValueReading {
  /** Whether this change touched it, which gives its field the bar and "Changed". */
  isChanged: boolean;
  /** Its runs, in the order they are read. */
  marks: ValueMark[];
}

/** The Value as it stands, with nothing marked. */
function asItStands(text: string): ValueReading {
  return {
    isChanged: false,
    marks: text === '' ? [] : [{ text, mark: null }],
  };
}

/**
 * Whether a change touched one Value in the language on screen.
 *
 * It compares the stored content rather than the two readings, so a Value
 * replaced by another that reads the same, such as one Asset for another, is
 * still marked. A Value held per language is compared in the language on
 * screen, and a `dynamic` field's list of sections, which is the one Value
 * that is not per language, is compared whole, so a change in it counts in
 * every language, as it is marked in every language.
 */
export function isValueChanged({
  fieldDefinition,
  before,
  after,
  language,
}: {
  fieldDefinition: FieldDefinition;
  /** The Value's content before the change, or `undefined` where it had none. */
  before: unknown;
  /** Its content after the change, or `undefined` where it has none. */
  after: unknown;
  language: SupportedLanguage;
}): boolean {
  const inLanguage = (content: unknown): unknown =>
    fieldModule(fieldDefinition).translatable
      ? contentInLanguage(content, language)
      : content;

  return holdsSameContent(inLanguage(before), inLanguage(after)) === false;
}

/**
 * What a change shows of one Value of a generated field: whether it changed,
 * and the runs to draw.
 *
 * A create and a delete mark nothing, because everything in a created Entry is
 * new and a deleted one is shown as it last stood, which is what ci asks for.
 */
export function valueReading({
  fieldDefinition,
  before,
  after,
  isMarked,
  language,
  formatInUserLocale,
}: {
  fieldDefinition: FieldDefinition;
  /** The Value's content before the change, or `undefined` where it had none. */
  before: unknown;
  /** Its content after the change, or `undefined` where it has none. */
  after: unknown;
  /** Whether this change marks what it touched, which a create and a delete do not. */
  isMarked: boolean;
  language: SupportedLanguage;
  formatInUserLocale: (date: Date, pattern: string) => string;
}): ValueReading {
  const module = fieldModule(fieldDefinition);
  const read = (content: unknown): string =>
    content === undefined
      ? ''
      : (module.renderValue({
          content,
          fieldDefinition,
          language,
          formatInUserLocale,
        }) ?? '');

  if (isMarked === false) {
    return asItStands(read(after === undefined ? before : after));
  }

  if (isValueChanged({ fieldDefinition, before, after, language }) === false) {
    return asItStands(read(after));
  }

  return {
    isChanged: true,
    marks: valueMarks({
      before: read(before),
      after: read(after),
      readsAsWords: module.readsAsWords,
    }),
  };
}

/**
 * The same for a field that is written out rather than generated, such as an
 * Asset's name or the Project's description.
 *
 * Those fields hold one text each rather than a Value of a field type, so what
 * they read as is the text itself and the caller says whether it is words.
 */
export function textReading({
  before,
  after,
  isMarked,
  readsAsWords = true,
}: {
  /** What the field held before the change, empty where it held nothing. */
  before: string;
  /** What it holds after it, empty where it holds nothing. */
  after: string;
  /** Whether this change marks what it touched. */
  isMarked: boolean;
  readsAsWords?: boolean;
}): ValueReading {
  if (isMarked === false) {
    return asItStands(after === '' ? before : after);
  }

  if (before === after) {
    return asItStands(after);
  }

  return {
    isChanged: true,
    marks: valueMarks({ before, after, readsAsWords }),
  };
}

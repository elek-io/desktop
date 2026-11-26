import { translatableDefault } from '@renderer/lib/utils';
import type { ValueMark } from '@renderer/lib/valueMarks';

import type { SupportedLanguage } from '@elek-io/core';

import type { ValueStateAt } from './module';

// The Value contracts more than one field type shares, as plain functions a
// type's own module opts into. Nothing here branches on a field type or a value
// type: a module picks the contract that describes its Value.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/**
 * One language's content out of a per-language record, or `undefined` where the
 * record holds nothing for it.
 */
export function contentInLanguage(
  content: unknown,
  language: SupportedLanguage
): unknown {
  if (content === null || typeof content !== 'object') {
    return undefined;
  }
  return (content as Record<string, unknown>)[language];
}

/** A per-language record holding the same default in every language. */
export function translatableContent(
  defaultValue: unknown,
  supportedLanguages: SupportedLanguage[]
): Record<SupportedLanguage, unknown> {
  return translatableDefault({ supportedLanguages, defaultValue });
}

/**
 * One language's content as text, for a Value shown rather than edited: a text
 * as it is stored and a number as it reads.
 *
 * `null` where the language holds nothing, so nothing stands where there is
 * nothing to read.
 */
export function storedText({
  content,
  language,
}: {
  content: unknown;
  language: SupportedLanguage;
}): string | null {
  const value = contentInLanguage(content, language);

  if (typeof value === 'string') {
    return value === '' ? null : value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

/** A Value of a type that is never read as text. */
export function noText(): null {
  return null;
}

/**
 * The text a Value of a text-like type contributes to an Entry's title: the
 * chosen language's content, or the first other language that holds something.
 */
export function textTitle({
  content,
  language,
}: {
  content: unknown;
  language: SupportedLanguage;
}): string | null {
  if (content === null || typeof content !== 'object') {
    return null;
  }
  const record: Record<string, unknown> = content as Record<string, unknown>;
  const preferred = record[language];
  if (typeof preferred === 'string' && preferred.length > 0) {
    return preferred;
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/** A Value of a type that never names an Entry. */
export function noTitle(): null {
  return null;
}

/** A preview holds no real Value, so a text-like control shows an empty one. */
export function emptyPreview(): null {
  return null;
}

/** How many objects a reference Value points at in one language. */
export function referenceCount({
  content,
  language,
}: {
  content: unknown;
  language: SupportedLanguage;
}): number {
  const references = contentInLanguage(content, language);
  return Array.isArray(references) ? references.length : 0;
}

/**
 * A date, datetime or time Value in the user's locale, parsed with the type's
 * own anchor and shown with its own date-fns pattern. The stored string is
 * returned unchanged where it is not a date at all, so nothing ever reads
 * "Invalid Date".
 */
export function temporalText({
  content,
  language,
  pattern,
  anchor,
  formatInUserLocale,
}: {
  content: unknown;
  language: SupportedLanguage;
  pattern: string;
  anchor: (value: string) => string;
  formatInUserLocale: (date: Date, pattern: string) => string;
}): string | null {
  const value = contentInLanguage(content, language);
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const date = new Date(anchor(value));
  return isNaN(date.getTime()) ? value : formatInUserLocale(date, pattern);
}

/** One reference as Core stores it: what it points at, and where that lives. */
export interface StoredReference {
  id: string;
  /**
   * The Collection of the Entry it points at. Core keeps it beside the id for
   * an Entry reference, which is what lets one be read without every
   * Collection being searched for it, and no other kind of reference has one.
   */
  collectionId?: string | undefined;
}

/**
 * What a reference Value points at in one language, in the order it is stored.
 *
 * One contract for every kind of reference, since each of them carries an id,
 * and what an id points at is read by the type's own folder. A reference
 * without one is left out rather than read, so a Value a sync left half
 * written draws the references it can.
 */
export function storedReferences({
  content,
  language,
}: {
  content: unknown;
  language: SupportedLanguage;
}): StoredReference[] {
  const references = contentInLanguage(content, language);

  if (Array.isArray(references) === false) {
    return [];
  }

  return references.flatMap((reference: unknown) => {
    if (typeof reference !== 'object' || reference === null) {
      return [];
    }
    if ('id' in reference === false || typeof reference.id !== 'string') {
      return [];
    }
    const id: string = reference.id;

    if (
      'collectionId' in reference &&
      typeof reference.collectionId === 'string'
    ) {
      return [{ id, collectionId: reference.collectionId }];
    }

    return [{ id }];
  });
}

/** One reference a change shows, read at its own state of the Value. */
export interface MarkedReference extends StoredReference {
  /** The commit the object it points at is read at. */
  commitHash: string | undefined;
  /** Whether it came with this change, went with it, or stands in both. */
  mark: ValueMark['mark'];
}

/**
 * Which references a change shows of one Value, in the order they are read.
 *
 * A change that marks nothing shows the state it left, which is the one after
 * it or the last there was where it deleted the object. One that marks what it
 * touched shows what went first, struck through, then what the field holds,
 * with what came underlined, so a replaced reference reads as the old one
 * beside the new one, which is what ci asks for a Value that is not text.
 *
 * One contract for every kind of reference, as `storedReferences` is.
 */
export function markedReferences({
  before,
  after,
  isMarked,
  language,
}: {
  before: ValueStateAt;
  after: ValueStateAt;
  isMarked: boolean;
  language: SupportedLanguage;
}): MarkedReference[] {
  const referencesOf = (state: ValueStateAt): StoredReference[] =>
    storedReferences({ content: state.content, language });

  if (isMarked === false) {
    const left = after.content === undefined ? before : after;
    return referencesOf(left).map((reference) => ({
      ...reference,
      commitHash: left.commitHash,
      mark: null,
    }));
  }

  const held = new Set(referencesOf(after).map((reference) => reference.id));
  const stood = new Set(referencesOf(before).map((reference) => reference.id));

  return [
    ...referencesOf(before)
      .filter((reference) => held.has(reference.id) === false)
      .map((reference) => ({
        ...reference,
        commitHash: before.commitHash,
        mark: 'removed' as const,
      })),
    ...referencesOf(after).map((reference) => ({
      ...reference,
      commitHash: after.commitHash,
      mark: stood.has(reference.id) ? null : ('added' as const),
    })),
  ];
}

import { translatableDefault } from '@renderer/lib/utils';

import type { SupportedLanguage } from '@elek-io/core';

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

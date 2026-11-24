import type { SupportedLanguage } from '@elek-io/core';

// How many of a Collection's or a Component's texts each language is still
// missing: its names, its description, and the label and description of each
// field it defines.
//
// Core takes a Collection or a Component only once every one of those holds a
// text in every language of the Project, which is what blocks Save and marks a
// language in the switch above the page. It holds no React and no words, so it
// can be read without a window.
//
// See contributing/renderer/forms.md#saves-block.

/** One text per language, as Core stores it. */
export interface TranslatableText {
  /** The record of texts, which may be `null` where Core takes none at all. */
  record: unknown;
  /**
   * Whether Core takes no text at all. A description is the case: either every
   * language holds one or none does, so a blank one is missing nothing while a
   * partly filled one is.
   */
  optional: boolean;
}

/** Whether one language of a text holds something Core would take. */
function holdsText(record: unknown, language: SupportedLanguage): boolean {
  if (typeof record !== 'object' || record === null) {
    return false;
  }
  const text: unknown = (record as Record<string, unknown>)[language];
  return typeof text === 'string' && text.trim() !== '';
}

/** The value at a path of an object, or `undefined` where it has none. */
function at(values: unknown, ...keys: string[]): unknown {
  let found: unknown = values;
  for (const key of keys) {
    if (typeof found !== 'object' || found === null) {
      return undefined;
    }
    found = (found as Record<string, unknown>)[key];
  }
  return found;
}

/**
 * How many texts each language is missing, counted over the texts given.
 *
 * Every language of the Project is in the answer, so a language that misses
 * nothing reads as zero rather than as absent.
 */
export function missingTranslations({
  texts,
  supportedLanguages,
}: {
  texts: TranslatableText[];
  supportedLanguages: SupportedLanguage[];
}): Map<SupportedLanguage, number> {
  const missing = new Map<SupportedLanguage, number>(
    supportedLanguages.map((language) => [language, 0])
  );

  for (const text of texts) {
    const filled = supportedLanguages.filter((language) =>
      holdsText(text.record, language)
    );
    // A text Core takes none of is missing nothing while it is blank
    // everywhere, and missing everywhere it is blank once one language holds
    // something, which is Core's own all or nothing rule.
    if (text.optional && filled.length === 0) {
      continue;
    }
    for (const language of supportedLanguages) {
      if (filled.includes(language) === false) {
        missing.set(language, (missing.get(language) ?? 0) + 1);
      }
    }
  }

  return missing;
}

/** The label and description of every field definition the values hold. */
function fieldDefinitionTexts(values: unknown): TranslatableText[] {
  const definitions = at(values, 'fieldDefinitions');
  if (Array.isArray(definitions) === false) {
    return [];
  }

  return (definitions as unknown[]).flatMap((definition) => {
    const own: TranslatableText[] = [
      { record: at(definition, 'label'), optional: false },
      { record: at(definition, 'description'), optional: true },
    ];
    // A group carries texts of its own and holds the definitions inside it.
    const members = at(definition, 'fieldDefinitions');
    return Array.isArray(members)
      ? [...own, ...fieldDefinitionTexts(definition)]
      : own;
  });
}

/**
 * Every text of a Collection: both its names, its description, and the label
 * and description of each field it defines.
 *
 * A Collection's own description is one Core takes in every language, unlike a
 * field definition's, see Core's `strictEntitySchema.ts`.
 */
export function collectionTranslatableTexts(
  values: unknown
): TranslatableText[] {
  return [
    { record: at(values, 'name', 'plural'), optional: false },
    { record: at(values, 'name', 'singular'), optional: false },
    { record: at(values, 'description'), optional: false },
    ...fieldDefinitionTexts(values),
  ];
}

/**
 * Every text of a Component: its name, its description, and the label and
 * description of each field it defines.
 *
 * A Component's own description may be left out altogether, which a
 * Collection's may not.
 */
export function componentTranslatableTexts(
  values: unknown
): TranslatableText[] {
  return [
    { record: at(values, 'name'), optional: false },
    { record: at(values, 'description'), optional: true },
    ...fieldDefinitionTexts(values),
  ];
}

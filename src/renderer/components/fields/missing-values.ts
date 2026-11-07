import { fieldModule } from '@renderer/components/fields';
import { contentInLanguage } from '@renderer/components/fields/value-contracts';

import type { FieldDefinition, SupportedLanguage } from '@elek-io/core';

/**
 * Whether a Value holds nothing at all.
 *
 * It is what Core refuses a required field for: a required Value is built as
 * `.min(1)` over the text or the list it holds, while an optional one is
 * nullable, so an empty string, an empty list and nothing at all are exactly
 * the three cases. A number and a toggle always hold something, since `0` and
 * `false` are neither.
 */
function holdsNothing(content: unknown): boolean {
  if (content === null || content === undefined || content === '') {
    return true;
  }
  return Array.isArray(content) && content.length === 0;
}

/**
 * The content of one Value as the form holds it. A form's Values are typed as
 * the schema's loose input, so one is read rather than assumed, and a slug the
 * form holds nothing for reads as a Value holding nothing.
 */
function contentOf(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  return (value as { content?: unknown }).content;
}

/**
 * How many required Values an Entry is still missing, per language of the
 * Project.
 *
 * Core refuses an Entry until every language of the Project holds each required
 * Value, so this is read per language rather than per field: a Value filled in
 * English and empty in German keeps the Entry from being saved, and the person
 * has to be told which language to open. Whether a Value is per-language is the
 * field type's own answer, so each is asked for it, and one that belongs to no
 * language counts under the Project's default, which is the language a form
 * opens in.
 *
 * It runs without a validator, so it is cheap enough to answer on every change.
 */
export function missingRequiredValues({
  values,
  fieldDefinitions,
  supportedLanguages,
  defaultLanguage,
}: {
  /** The Values as the form holds them, keyed by their field's slug. */
  values: Record<string, unknown>;
  /** The Collection's flattened field definitions. */
  fieldDefinitions: FieldDefinition[];
  supportedLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
}): Map<SupportedLanguage, number> {
  const missing = new Map<SupportedLanguage, number>(
    supportedLanguages.map((language) => [language, 0])
  );
  const count = (language: SupportedLanguage): void => {
    missing.set(language, (missing.get(language) ?? 0) + 1);
  };

  for (const fieldDefinition of fieldDefinitions) {
    if (fieldDefinition.isRequired === false) {
      continue;
    }
    const content = contentOf(values[fieldDefinition.slug]);

    if (fieldModule(fieldDefinition).translatable === false) {
      if (holdsNothing(content)) {
        count(defaultLanguage);
      }
      continue;
    }

    for (const language of supportedLanguages) {
      if (holdsNothing(contentInLanguage(content, language))) {
        count(language);
      }
    }
  }

  return missing;
}

import { fieldModule } from '@renderer/components/fields';
import { contentInLanguage } from '@renderer/components/fields/value-contracts';

import type { FieldDefinition, SupportedLanguage } from '@elek-io/core';

// The one answer to which required Values an Entry is still missing, for the
// form, the language switch above its fields and the list of Entries beside
// them.
//
// Whether a Value holds nothing is the field type's own answer, in
// `empty-values.ts`, so nothing here knows a field type. It runs without a
// validator, so it is cheap enough to answer on every change.
//
// See contributing/renderer/forms.md#a-missing-value-and-saves-block.

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
 * One section of a dynamic field as the form holds it: which Component it is
 * built from, and that Component's own Values.
 */
function sectionsOf(
  content: unknown
): { componentId: string; values: unknown }[] {
  if (Array.isArray(content) === false) {
    return [];
  }
  return content.flatMap((item: unknown) => {
    if (item === null || typeof item !== 'object') {
      return [];
    }
    const { componentId, values } = item as {
      componentId?: unknown;
      values?: unknown;
    };
    return typeof componentId === 'string' ? [{ componentId, values }] : [];
  });
}

/** The Values of one object, keyed by their field's slug. */
function valuesOf(values: unknown): Record<string, unknown> {
  if (values === null || typeof values !== 'object') {
    return {};
  }
  return values as Record<string, unknown>;
}

export interface MissingValuesProps {
  /**
   * The Values keyed by their field's slug, as a form or a stored Entry holds
   * them. Read rather than assumed, the same as one Value's content is, so a
   * form that holds nothing there yet counts as an Entry holding no Value.
   */
  values: unknown;
  /** The Collection's flattened field definitions. */
  fieldDefinitions: FieldDefinition[];
  supportedLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
  /**
   * The field definitions of the Component a section is built from, so the
   * Values inside a dynamic field's sections are counted too. A Component the
   * resolver does not know yet, while the Project's Components are still being
   * read, contributes nothing rather than a wrong count.
   */
  componentFieldDefinitions?: (componentId: string) => FieldDefinition[];
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
 * A dynamic field's sections are walked as well, because Core demands each
 * required Value of a section in every language too.
 */
export function missingRequiredValues({
  values: heldValues,
  fieldDefinitions,
  supportedLanguages,
  defaultLanguage,
  componentFieldDefinitions,
}: MissingValuesProps): Map<SupportedLanguage, number> {
  const values = valuesOf(heldValues);
  const missing = new Map<SupportedLanguage, number>(
    supportedLanguages.map((language) => [language, 0])
  );
  const count = (language: SupportedLanguage): void => {
    missing.set(language, (missing.get(language) ?? 0) + 1);
  };
  const add = (other: Map<SupportedLanguage, number>): void => {
    for (const [language, number] of other.entries()) {
      missing.set(language, (missing.get(language) ?? 0) + number);
    }
  };

  for (const fieldDefinition of fieldDefinitions) {
    const content = contentOf(values[fieldDefinition.slug]);

    // A section's own required Values count whether or not the field holding
    // the sections is required itself, since Core checks each section it finds.
    if (componentFieldDefinitions !== undefined) {
      for (const section of sectionsOf(content)) {
        add(
          missingRequiredValues({
            values: section.values,
            fieldDefinitions: componentFieldDefinitions(section.componentId),
            supportedLanguages,
            defaultLanguage,
            componentFieldDefinitions,
          })
        );
      }
    }

    if (fieldDefinition.isRequired === false) {
      continue;
    }

    for (const language of supportedLanguages) {
      if (
        isMissingValue({ fieldDefinition, content, language, defaultLanguage })
      ) {
        count(language);
      }
    }
  }

  return missing;
}

/**
 * Whether one field of an Entry misses its required Value in one language,
 * which is what marks that field.
 *
 * It is the one question the count above asks per language, so the field that
 * draws itself asks it too and the mark below a field and the count under Save
 * can never disagree.
 */
export function isMissingValue({
  fieldDefinition,
  content,
  language,
  defaultLanguage,
}: {
  fieldDefinition: FieldDefinition;
  /** The Value's content, which is the per-language record where there is one. */
  content: unknown;
  language: SupportedLanguage;
  /**
   * The Project's default language, which a Value belonging to no language
   * counts under, because that is the language a form opens in.
   */
  defaultLanguage: SupportedLanguage;
}): boolean {
  if (fieldDefinition.isRequired === false) {
    return false;
  }
  const module = fieldModule(fieldDefinition);

  if (module.translatable === false) {
    // One Value for every language, so it is missing under the default
    // language alone rather than under each of them, which would count one
    // Value as several and mark it in a language it says nothing about.
    return language === defaultLanguage && module.isEmpty(content);
  }

  return module.isEmpty(contentInLanguage(content, language));
}

/** One Value a field definition change needs before Core applies it. */
export interface NeededValue {
  /** The Entry the Value belongs to. */
  entryId: string;
  /** The field, by its new slug, which is what Core takes the Value back at. */
  fieldSlug: string;
  /** The field as the change leaves it, which the Value is written under. */
  fieldDefinition: FieldDefinition;
}

/**
 * How many of the Values a refused field definition change needs are still
 * missing, per language of the Project.
 *
 * The same question as above, asked of the Values written in the dialog of a
 * refused change rather than of one Entry's: those sit per Entry, keyed by the
 * Entry and then by the field's slug, because one change can leave several
 * Entries without a Value. Each is asked through `isMissingValue`, so a row of
 * that dialog marks itself exactly when it counts here.
 */
export function missingResolutionValues({
  values: heldValues,
  needed,
  supportedLanguages,
  defaultLanguage,
}: {
  /** The Values as the dialog's form holds them, by Entry and then by slug. */
  values: unknown;
  needed: NeededValue[];
  supportedLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
}): Map<SupportedLanguage, number> {
  const byEntry = valuesOf(heldValues);
  const missing = new Map<SupportedLanguage, number>(
    supportedLanguages.map((language) => [language, 0])
  );

  for (const { entryId, fieldSlug, fieldDefinition } of needed) {
    const content = contentOf(valuesOf(byEntry[entryId])[fieldSlug]);

    for (const language of supportedLanguages) {
      if (
        isMissingValue({ fieldDefinition, content, language, defaultLanguage })
      ) {
        missing.set(language, (missing.get(language) ?? 0) + 1);
      }
    }
  }

  return missing;
}

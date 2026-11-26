import { fieldModule } from '@renderer/components/fields';

import type { FieldDefinition, SupportedLanguage } from '@elek-io/core';

/**
 * The default Value a new Entry holds for one field definition, in the shape
 * the generated Entry schema expects. What the content looks like is the field
 * type's own answer, so this asks its folder for it.
 *
 * Shared by the create and update Entry routes so both fill Values the same
 * way, and by the dynamic field's editor, which seeds a new section's Values
 * from its Component's own field definitions.
 */
export function defaultEntryValue(
  fieldDefinition: FieldDefinition,
  supportedLanguages: SupportedLanguage[]
): {
  objectType: 'value';
  valueType: FieldDefinition['valueType'];
  content: unknown;
} {
  return {
    objectType: 'value',
    valueType: fieldDefinition.valueType,
    content: fieldModule(fieldDefinition).defaultContent(
      fieldDefinition,
      supportedLanguages
    ),
  };
}

/**
 * The default Values record (keyed by slug) for a set of field definitions.
 * Pass the flattened field definitions, since grouping does not affect Values.
 */
export function defaultEntryValues(
  fieldDefinitions: FieldDefinition[],
  supportedLanguages: SupportedLanguage[]
): Record<string, ReturnType<typeof defaultEntryValue>> {
  return Object.fromEntries(
    fieldDefinitions.map((fieldDefinition) => [
      fieldDefinition.slug,
      defaultEntryValue(fieldDefinition, supportedLanguages),
    ])
  );
}

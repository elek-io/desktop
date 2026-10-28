import { translatableDefault } from '@renderer/lib/utils';

import type {
  FieldDefinition,
  MdAstRoot,
  SupportedLanguage,
} from '@elek-io/core';

/**
 * Builds the default form Value for a single field definition, in the shape the
 * generated Entry schema expects. For every value type but `component` that is
 * a per-language `content` record under a slug. A `component` Value's content
 * is one flat array of Component items instead, which is why the content type
 * here is the union of the two.
 *
 * Shared by the create and update Entry routes so both hydrate Values the same
 * way, and by the dynamic field's editor, which seeds a new section's Values
 * from its Component's own field definitions.
 */
export function defaultEntryValue(
  definition: FieldDefinition,
  supportedLanguages: SupportedLanguage[]
): {
  objectType: 'value';
  valueType: FieldDefinition['valueType'];
  content: Record<SupportedLanguage, unknown> | unknown[];
} {
  switch (definition.valueType) {
    case 'boolean':
    case 'number':
    case 'string':
      return {
        objectType: 'value',
        valueType: definition.valueType,
        content: translatableDefault({
          supportedLanguages,
          defaultValue: definition.defaultValue,
        }),
      };
    case 'reference':
      return {
        objectType: 'value',
        valueType: definition.valueType,
        content: translatableDefault({
          supportedLanguages,
          defaultValue: [],
        }),
      };
    case 'mdast':
      return {
        objectType: 'value',
        valueType: definition.valueType,
        content: supportedLanguages.reduce(
          (acc, language) => {
            // Clone per language so the trees do not share one reference
            acc[language] =
              definition.defaultValue === null
                ? null
                : structuredClone(definition.defaultValue);
            return acc;
          },
          {} as Record<SupportedLanguage, MdAstRoot | null>
        ),
      };
    case 'component':
      // A page starts with no sections. Core's schema still demands at least
      // one for a required dynamic field, so an empty array surfaces on the
      // field rather than being pre-filled with a section nobody asked for.
      return {
        objectType: 'value',
        valueType: definition.valueType,
        content: [],
      };
    default: {
      // Exhaustive over Core's value types today, so TypeScript narrows the
      // definition to `never` here. The throw stays as the guard for a value
      // type a later Core adds: nothing makes a missing default a compile
      // error, and building one by guessing would write content nobody chose.
      // See contributing/not-yet-implemented.md.
      const unsupported: { valueType: string } = definition;
      throw new Error(
        `Unsupported valueType "${unsupported.valueType}" while building default Entry Values`
      );
    }
  }
}

/**
 * Builds the default Values record (keyed by slug) for a set of field definitions.
 * Pass the flattened field definitions (grouping does not affect Values).
 */
export function defaultEntryValues(
  fieldDefinitions: FieldDefinition[],
  supportedLanguages: SupportedLanguage[]
): Record<string, ReturnType<typeof defaultEntryValue>> {
  return Object.fromEntries(
    fieldDefinitions.map((definition) => [
      definition.slug,
      defaultEntryValue(definition, supportedLanguages),
    ])
  );
}

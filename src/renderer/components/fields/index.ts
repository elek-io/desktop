import { assetField } from '@renderer/components/fields/asset';
import { dateField } from '@renderer/components/fields/date';
import { datetimeField } from '@renderer/components/fields/datetime';
import { dynamicField } from '@renderer/components/fields/dynamic';
import { emailField } from '@renderer/components/fields/email';
import { entryField } from '@renderer/components/fields/entry';
import { ipv4Field } from '@renderer/components/fields/ipv4';
import { markdownField } from '@renderer/components/fields/markdown';
import { numberField } from '@renderer/components/fields/number';
import { rangeField } from '@renderer/components/fields/range';
import { selectField } from '@renderer/components/fields/select';
import { slugField } from '@renderer/components/fields/slug';
import { telephoneField } from '@renderer/components/fields/telephone';
import { textField } from '@renderer/components/fields/text';
import { textareaField } from '@renderer/components/fields/textarea';
import { timeField } from '@renderer/components/fields/time';
import { toggleField } from '@renderer/components/fields/toggle';
import { urlField } from '@renderer/components/fields/url';

import type { FieldType } from '@elek-io/core';

import type { FieldTypeModule } from './module';

// The registry: one module per Core field type, assembled from the folders.
// Everything outside a type's folder reads that type's module through
// `fieldModule`, which is why nothing else branches on a field type or a value
// type, and a lint rule says so. A folder may also export a helper for a Value
// shape only that type knows, which `dynamic/sections.ts` is: the branching
// still happens inside the folder.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/**
 * The registry's own type: one module per Core field type.
 *
 * Exported so the type test can name it rather than writing the mapped type
 * out a second time, which would have proven TypeScript rather than this
 * registry.
 */
export type FieldTypeRegistry = { [T in FieldType]: FieldTypeModule<T> };

/**
 * Every field type's module, keyed by its type.
 *
 * Being a mapped type over Core's `FieldType`, a field type Core adds fails to
 * compile here until it has a folder of its own, and each module sees only its
 * own narrowed field definition.
 */
const FIELD_TYPES: FieldTypeRegistry = {
  text: textField,
  number: numberField,
  textarea: textareaField,
  toggle: toggleField,
  email: emailField,
  date: dateField,
  datetime: datetimeField,
  time: timeField,
  url: urlField,
  telephone: telephoneField,
  ipv4: ipv4Field,
  range: rangeField,
  select: selectField,
  slug: slugField,
  asset: assetField,
  entry: entryField,
  markdown: markdownField,
  dynamic: dynamicField,
};

/**
 * The module of the field type a field definition names.
 *
 * Generic over the field type, so the module and the definition stay correlated:
 * every member of what comes back takes exactly the definition that was passed
 * in. Always read the module from the definition it is about, never pair one
 * definition's module with another definition.
 */
export function fieldModule<T extends FieldType>(fieldDefinition: {
  fieldType: T;
}): FieldTypeModule<T> {
  return FIELD_TYPES[fieldDefinition.fieldType];
}

/**
 * The field types the Add Field picker offers. A type whose folder carries no
 * authoring form is one Core defines and the client cannot author yet, so it is
 * listed as a type and offered as none.
 */
export const authorableFieldTypes: ReadonlySet<FieldType> = new Set(
  Object.entries(FIELD_TYPES)
    .filter(([, module]) => module.DefinitionDraft !== undefined)
    .map(([fieldType]) => fieldType as FieldType)
);

/**
 * The field types a Component cannot hold, which Core refuses on save. The Add
 * Field picker reads this, so the choice is never offered and then refused.
 */
export const fieldTypesForbiddenInComponents: ReadonlySet<FieldType> = new Set(
  Object.entries(FIELD_TYPES)
    .filter(([, module]) => module.forbiddenInComponent === true)
    .map(([fieldType]) => fieldType as FieldType)
);

export type { FieldTypeModule } from './module';
export { defaultEntryValue, defaultEntryValues } from './value-defaults';

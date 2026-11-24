import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

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

import { fieldTypeSchema, type FieldType } from '@elek-io/core';

import type { FieldTypeGroup, FieldTypeModule } from './module';

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

/** ci's groups of field types, in the order the pane offers them. */
const GROUP_WORDS = {
  text: msg`Text`,
  numbers: msg`Numbers`,
  choices: msg`Choices`,
  temporal: msg`Dates and times`,
  contact: msg`Contact and web`,
  links: msg`Links`,
} satisfies Record<FieldTypeGroup, MessageDescriptor>;

/** The groups in the order ci offers them. */
const GROUP_ORDER: readonly (keyof typeof GROUP_WORDS)[] = [
  'text',
  'numbers',
  'choices',
  'temporal',
  'contact',
  'links',
];

/**
 * Every field type in the order ci reads them, inside their groups.
 *
 * Which group a type belongs to is that type's own answer. This only says in
 * which order a group's types are offered, and a type it does not name yet
 * still shows up, at the end of the group its folder names.
 */
const FIELD_TYPE_ORDER: readonly FieldType[] = [
  'text',
  'textarea',
  'markdown',
  'slug',
  'number',
  'range',
  'toggle',
  'select',
  'date',
  'time',
  'datetime',
  'email',
  'url',
  'telephone',
  'ipv4',
  'entry',
  'asset',
  'dynamic',
];

/** One of ci's groups, with the field types it holds. */
export interface FieldTypesOfGroup {
  group: FieldTypeGroup;
  /** The group's name, read from the catalog as it is asked for. */
  label: string;
  /** Its field types, in the order ci draws them. */
  fieldTypes: FieldType[];
}

function fieldTypesOf(group: FieldTypeGroup): FieldType[] {
  const inGroup = fieldTypeSchema.options.filter(
    (fieldType) => FIELD_TYPES[fieldType].group === group
  );
  const ordered = FIELD_TYPE_ORDER.filter((fieldType) =>
    inGroup.includes(fieldType)
  );

  return [
    ...ordered,
    ...inGroup.filter((fieldType) => ordered.includes(fieldType) === false),
  ];
}

/**
 * Every field type in ci's groups, in ci's order, which is what the pane that
 * adds a field offers and what the Type picker of a field's settings holds.
 */
export function fieldTypeGroups(): FieldTypesOfGroup[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: i18n._(GROUP_WORDS[group]),
    fieldTypes: fieldTypesOf(group),
  }));
}

/**
 * The field types a Component cannot hold, which Core refuses on save. The Add
 * Field picker reads this, so the choice is never offered and then refused.
 */
export const fieldTypesForbiddenInComponents: ReadonlySet<FieldType> = new Set(
  fieldTypeSchema.options.filter(
    (fieldType) => FIELD_TYPES[fieldType].forbiddenInComponent === true
  )
);

export type { FieldTypeModule } from './module';
export { defaultEntryValue, defaultEntryValues } from './value-defaults';

import { msg, plural, t } from '@lingui/core/macro';
import { BlocksIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { countRules } from '@renderer/components/fields/rules';
import { noTitle } from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';

import {
  dynamicFieldDefinitionSchema,
  resolveOfComponents,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { DynamicControl } from './control';
import { DynamicDefinitionEditor } from './definition';

/**
 * The sections of a page: an ordered list of Component items, each holding that
 * Component's own Values.
 *
 * It is the one type whose Value is a flat array rather than content per
 * language, which is why it alone is not translatable.
 */
export const dynamicField: FieldTypeModule<'dynamic'> = {
  translatable: false,
  // A list of sections is not one control, so the rules beside its label
  // carry required.
  acceptsAriaRequired: false,
  Icon: BlocksIcon,
  group: 'links',
  rules: countRules,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <DynamicControl
      field={field}
      fieldDefinition={fieldDefinition}
      disabled={disabled}
      {...controlProps}
    />
  ),
  // A page starts with no sections. Core's schema still demands at least one
  // for a required dynamic field, so an empty list surfaces on the field rather
  // than being pre-filled with a section nobody asked for.
  defaultContent: () => [],
  previewContent: () => null,
  // Its Value is one flat list rather than content per language, so an empty
  // list is what Core refuses a required dynamic field for.
  isEmpty: holdsNothing,
  // How many sections the Value holds, which is what it reads as where it is
  // shown rather than edited: the rows of a refused change, where a narrowed
  // field strikes through the sections that would go. A section's own Values
  // are not read into that line, since each is a field of its own. This field
  // is the one that is not per-language, so it is never translated from
  // another language and the line never stands below a field.
  renderValue: ({ content }) =>
    Array.isArray(content) === false || content.length === 0
      ? null
      : t`${plural(content.length, { one: '# section', other: '# sections' })}`,
  titleText: noTitle,
  // An empty `ofComponents` allows every Component of the Project, which is
  // Core's own rule rather than ours, so it is read off Core.
  allowedComponentIds: (fieldDefinition, everyComponentId) => [
    ...resolveOfComponents(fieldDefinition, everyComponentId),
  ],
  uniquenessNote: () => msg`A dynamic field can't be unique.`,
  definitionSchema: () => dynamicFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'component',
    fieldType: 'dynamic',
    isUnique: false,
    ofComponents: [],
    min: null,
    max: null,
  }),
  DefinitionEditor: DynamicDefinitionEditor,
};

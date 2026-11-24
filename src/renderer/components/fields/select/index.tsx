import { msg } from '@lingui/core/macro';
import { ListIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  storedText,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { translatableDefault } from '@renderer/lib/utils';

import {
  numberSelectFieldDefinitionSchema,
  stringSelectFieldDefinitionSchema,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { SelectControl } from './control';
import { SelectDefinitionEditor } from './definition';

/** One option out of a list the field definition carries. */
export const selectField: FieldTypeModule<'select'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: ListIcon,
  group: 'choices',
  rules: scalarRules,
  Control: ({ field, fieldDefinition, disabled, controlProps, label }) => (
    <SelectControl
      field={field}
      fieldDefinition={fieldDefinition}
      label={label}
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  // A number select shows its default in the preview, as every other numeric
  // control does, while a string select shows an empty one.
  previewContent: (fieldDefinition) =>
    fieldDefinition.valueType === 'number'
      ? fieldDefinition.defaultValue
      : null,
  isEmpty: holdsNothing,
  renderValue: storedText,
  // A string option's words can name an Entry. A number option's cannot, which
  // textTitle answers on its own, since it only takes text.
  titleText: textTitle,
  // Only a select whose options are numbers cannot be unique, so a select of
  // text options keeps that a real choice.
  uniquenessNote: (fieldDefinition) =>
    fieldDefinition.valueType === 'number'
      ? msg`A number field can't be unique.`
      : null,
  // Core backs the one field type with a schema per option value type, so the
  // settings are checked against the one the field holds now.
  definitionSchema: (fieldDefinition) =>
    fieldDefinition.valueType === 'number'
      ? numberSelectFieldDefinitionSchema
      : stringSelectFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'select',
    defaultValue: null,
    options: [
      {
        value: '',
        label: translatableDefault({
          supportedLanguages,
          defaultValue: '',
        }),
      },
    ],
  }),
  DefinitionEditor: SelectDefinitionEditor,
};

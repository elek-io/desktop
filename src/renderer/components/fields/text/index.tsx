import { zodResolver } from '@hookform/resolvers/zod';
import { t } from '@lingui/core/macro';

import { textRules } from '@renderer/components/fields/rules';
import {
  contentAsStored,
  emptyPreview,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefaultValueInputField,
  DefinitionDraft,
  MinMaxRow,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { TextControl } from '@renderer/components/ui/field-controls';

import {
  textFieldDefinitionSchema,
  uuid,
  type TextFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<TextFieldDefinition> = {
  schema: textFieldDefinitionSchema,

  resolver: zodResolver(textFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'text',
    defaultValue: null,
    min: null,
    max: 250,
  }),
  Extras: ({ form }) => (
    <>
      <DefaultValueInputField form={form} name="defaultValue" type="text" />
      <MinMaxRow
        form={form}
        minName="min"
        maxName="max"
        unit={t`number of characters the user can enter`}
      />
    </>
  ),
};

/** A single line of text. */
export const textField: FieldTypeModule<'text'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: textRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="text"
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  listCell: contentAsStored,
  titleText: textTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

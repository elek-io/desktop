import { zodResolver } from '@hookform/resolvers/zod';

import { scalarRules } from '@renderer/components/fields/rules';
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
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { TextControl } from '@renderer/components/ui/field-controls';

import {
  emailFieldDefinitionSchema,
  uuid,
  type EmailFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<EmailFieldDefinition> = {
  schema: emailFieldDefinitionSchema,

  resolver: zodResolver(emailFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'email',
    defaultValue: null,
  }),
  Extras: ({ form }) => (
    <DefaultValueInputField form={form} name="defaultValue" type="email" />
  ),
};

/** An email address. */
export const emailField: FieldTypeModule<'email'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="email"
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

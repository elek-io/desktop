import { zodResolver } from '@hookform/resolvers/zod';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  storedText,
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
  telephoneFieldDefinitionSchema,
  uuid,
  type TelephoneFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<TelephoneFieldDefinition> = {
  schema: telephoneFieldDefinitionSchema,

  resolver: zodResolver(telephoneFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'telephone',
    defaultValue: null,
  }),
  Extras: ({ form }) => (
    <DefaultValueInputField form={form} name="defaultValue" type="tel" />
  ),
};

/** A telephone number. */
export const telephoneField: FieldTypeModule<'telephone'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="tel"
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
  renderValue: storedText,
  titleText: textTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

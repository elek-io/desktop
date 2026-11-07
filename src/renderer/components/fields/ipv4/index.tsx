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
  ipv4FieldDefinitionSchema,
  uuid,
  type Ipv4FieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<Ipv4FieldDefinition> = {
  schema: ipv4FieldDefinitionSchema,
  resolver: zodResolver(ipv4FieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'ipv4',
    defaultValue: null,
  }),
  Extras: ({ form }) => (
    <DefaultValueInputField form={form} name="defaultValue" type="text" />
  ),
};

/** An IPv4 address. HTML has no input type for one, so it is typed as text and Core validates it. */
export const ipv4Field: FieldTypeModule<'ipv4'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
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

import { zodResolver } from '@hookform/resolvers/zod';

import { scalarRules } from '@renderer/components/fields/rules';
import {
  emptyPreview,
  temporalCell,
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
  timeFieldDefinitionSchema,
  uuid,
  type TimeFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<TimeFieldDefinition> = {
  schema: timeFieldDefinitionSchema,

  resolver: zodResolver(timeFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'time',
    defaultValue: null,
  }),
  Extras: ({ form }) => (
    <DefaultValueInputField form={form} name="defaultValue" type="time" />
  ),
};

/** A time of day, stored as an ISO time without a zone. */
export const timeField: FieldTypeModule<'time'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="time"
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  listCell: ({ content, language, formatInUserLocale }) =>
    temporalCell({
      content,
      language,
      pattern: 'p',
      anchor: (value) => `1970-01-01T${value}`,
      formatInUserLocale,
    }),
  titleText: textTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

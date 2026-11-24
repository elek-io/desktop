import { Trans } from '@lingui/react/macro';
import { ClockIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  emptyPreview,
  temporalText,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import { timeFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** A time of day, stored as an ISO time without a zone. */
export const timeField: FieldTypeModule<'time'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: ClockIcon,
  group: 'temporal',
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
  isEmpty: holdsNothing,
  renderValue: ({ content, language, formatInUserLocale }) =>
    temporalText({
      content,
      language,
      pattern: 'p',
      anchor: (value) => `1970-01-01T${value}`,
      formatInUserLocale,
    }),
  titleText: textTitle,
  definitionSchema: () => timeFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'time',
    defaultValue: null,
  }),
  DefinitionEditor: ({ form, path }) => (
    <AppField
      form={form}
      name={path('defaultValue')}
      label={<Trans>Default Value</Trans>}
      description={
        <Trans>Every new Entry starts with it, in every language.</Trans>
      }
    >
      {({ field, controlProps }) => (
        <TextControl field={field} type="time" {...controlProps} />
      )}
    </AppField>
  ),
};

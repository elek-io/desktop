import { Trans } from '@lingui/react/macro';
import { CalendarIcon } from 'lucide-react';

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

import { dateFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { DateControl } from './control';

/** A day, stored as a `YYYY-MM-DD` string. */
export const dateField: FieldTypeModule<'date'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: CalendarIcon,
  group: 'temporal',
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <DateControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
  // One day, which ci marks whole rather than word by word.
  readsAsWords: false,
  renderValue: ({ content, language, formatInUserLocale }) =>
    temporalText({
      content,
      language,
      pattern: 'P',
      // A stored day carries no time or zone. Anchoring it to local midnight is
      // what keeps the day from shifting by one in a negative UTC offset.
      anchor: (value) => `${value}T00:00:00`,
      formatInUserLocale,
    }),
  titleText: textTitle,
  definitionSchema: () => dateFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'date',
    defaultValue: null,
  }),
  // Its own picker rather than a text input, so the Default Value is chosen
  // the way the field itself is filled in.
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
        <DateControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};

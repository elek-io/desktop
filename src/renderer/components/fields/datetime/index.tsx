import { Trans } from '@lingui/react/macro';
import { CalendarClockIcon } from 'lucide-react';

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

import { datetimeFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { DatetimeControl } from './control';

/** A day and a time, stored as an ISO datetime in UTC. */
export const datetimeField: FieldTypeModule<'datetime'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: CalendarClockIcon,
  group: 'temporal',
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <DatetimeControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
  // One moment, which ci marks whole rather than word by word.
  readsAsWords: false,
  renderValue: ({ content, language, formatInUserLocale }) =>
    temporalText({
      content,
      language,
      pattern: 'Pp',
      // A full ISO datetime carries its own zone.
      anchor: (value) => value,
      formatInUserLocale,
    }),
  titleText: textTitle,
  definitionSchema: () => datetimeFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'datetime',
    defaultValue: null,
  }),
  DefinitionEditor: ({ form, path }) => (
    <AppField
      form={form}
      name={path('defaultValue')}
      label={<Trans>Default Value</Trans>}
      description={
        <Trans>
          Every new Entry starts with it, in every language. It is shown in your
          local time and stored as UTC.
        </Trans>
      }
    >
      {({ field, controlProps }) => (
        <DatetimeControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};

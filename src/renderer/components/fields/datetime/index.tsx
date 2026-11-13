import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  emptyPreview,
  temporalText,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';

import {
  datetimeFieldDefinitionSchema,
  uuid,
  type DatetimeFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { DatetimeControl } from './control';

const spec: DefinitionSpec<DatetimeFieldDefinition> = {
  schema: datetimeFieldDefinitionSchema,

  resolver: zodResolver(datetimeFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'datetime',
    defaultValue: null,
  }),
  // Bespoke picker like date, plus its own copy about local display and UTC
  // storage.
  Extras: ({ form }) => (
    <AppField
      form={form}
      name="defaultValue"
      label={<Trans>Default value</Trans>}
      description={
        <Trans>
          The initial value for the field. It is shown in your local time and
          stored as UTC.
        </Trans>
      }
    >
      {({ field, controlProps }) => (
        <DatetimeControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};

/** A day and a time, stored as an ISO datetime in UTC. */
export const datetimeField: FieldTypeModule<'datetime'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <DatetimeControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
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
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

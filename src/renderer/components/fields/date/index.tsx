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
  dateFieldDefinitionSchema,
  uuid,
  type DateFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { DateControl } from './control';

const spec: DefinitionSpec<DateFieldDefinition> = {
  schema: dateFieldDefinitionSchema,

  resolver: zodResolver(dateFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'date',
    defaultValue: null,
  }),
  // Uses the bespoke date picker, not a plain text control, so it cannot route
  // through DefaultValueInputField.
  Extras: ({ form }) => (
    <AppField
      form={form}
      name="defaultValue"
      label={<Trans>Default value</Trans>}
      description={<Trans>The initial value for the field.</Trans>}
    >
      {({ field, controlProps }) => (
        <DateControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};

/** A day, stored as a `YYYY-MM-DD` string. */
export const dateField: FieldTypeModule<'date'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <DateControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
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
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

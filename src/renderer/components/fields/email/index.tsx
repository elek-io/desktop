import { Trans } from '@lingui/react/macro';
import { MailIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  emptyPreview,
  storedText,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import { emailFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** An email address. */
export const emailField: FieldTypeModule<'email'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: MailIcon,
  group: 'contact',
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
  isEmpty: holdsNothing,
  renderValue: storedText,
  titleText: textTitle,
  definitionSchema: () => emailFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'email',
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
        <TextControl field={field} type="email" {...controlProps} />
      )}
    </AppField>
  ),
};

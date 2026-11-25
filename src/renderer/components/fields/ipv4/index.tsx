import { Trans } from '@lingui/react/macro';
import { NetworkIcon } from 'lucide-react';

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

import { ipv4FieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** An IPv4 address. HTML has no input type for one, so it is typed as text and Core validates it. */
export const ipv4Field: FieldTypeModule<'ipv4'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: NetworkIcon,
  group: 'contact',
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
  isEmpty: holdsNothing,
  readsAsWords: true,
  renderValue: storedText,
  titleText: textTitle,
  definitionSchema: () => ipv4FieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'ipv4',
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
        <TextControl field={field} type="text" {...controlProps} />
      )}
    </AppField>
  ),
};

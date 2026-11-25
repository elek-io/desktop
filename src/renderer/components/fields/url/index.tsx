import { Trans } from '@lingui/react/macro';
import { GlobeIcon } from 'lucide-react';

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

import { urlFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** A web address. */
export const urlField: FieldTypeModule<'url'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: GlobeIcon,
  group: 'contact',
  rules: scalarRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="url"
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
  definitionSchema: () => urlFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'url',
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
        <TextControl field={field} type="url" {...controlProps} />
      )}
    </AppField>
  ),
};

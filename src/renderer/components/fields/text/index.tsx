import { Trans } from '@lingui/react/macro';
import { TypeIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { textRules } from '@renderer/components/fields/rules';
import {
  emptyPreview,
  storedText,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { DefinitionBounds } from '@renderer/components/forms/definition-controls';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import { textFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** A single line of text. */
export const textField: FieldTypeModule<'text'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: TypeIcon,
  group: 'text',
  rules: textRules,
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
  definitionSchema: () => textFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'text',
    defaultValue: null,
    min: null,
    max: 250,
  }),
  DefinitionEditor: ({ form, path }) => (
    <>
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number of characters editors can enter.</Trans>}
      />

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
    </>
  ),
};

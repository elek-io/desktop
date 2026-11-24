import { Trans } from '@lingui/react/macro';
import { AlignLeftIcon } from 'lucide-react';

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
import { TextareaControl } from '@renderer/components/ui/field-controls';

import { textareaFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** Several lines of text. */
export const textareaField: FieldTypeModule<'textarea'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: AlignLeftIcon,
  group: 'text',
  rules: textRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextareaControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
  renderValue: storedText,
  titleText: textTitle,
  definitionSchema: () => textareaFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'string',
    fieldType: 'textarea',
    defaultValue: null,
    min: null,
    max: null,
  }),
  DefinitionEditor: ({ form, path }) => (
    <>
      <AppField
        form={form}
        name={path('defaultValue')}
        label={<Trans>Default Value</Trans>}
        description={
          <Trans>Every new Entry starts with it, in every language.</Trans>
        }
      >
        {({ field, controlProps }) => (
          <TextareaControl field={field} rows={2} {...controlProps} />
        )}
      </AppField>
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number of characters editors can enter.</Trans>}
      />
    </>
  ),
};

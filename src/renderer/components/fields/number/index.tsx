import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { HashIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { numberRules } from '@renderer/components/fields/rules';
import {
  noTitle,
  storedText,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { DefinitionBounds } from '@renderer/components/forms/definition-controls';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import { numberFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** A number. */
export const numberField: FieldTypeModule<'number'> = {
  translatable: true,
  acceptsAriaRequired: true,
  Icon: HashIcon,
  group: 'numbers',
  rules: numberRules,
  Control: ({ field, disabled, controlProps }) => (
    <TextControl
      field={field}
      type="number"
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: (fieldDefinition) => fieldDefinition.defaultValue,
  isEmpty: holdsNothing,
  renderValue: storedText,
  titleText: noTitle,
  uniquenessNote: () => msg`A number field can't be unique.`,
  definitionSchema: () => numberFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'number',
    fieldType: 'number',
    defaultValue: null,
    min: null,
    max: null,
    isUnique: false,
  }),
  DefinitionEditor: ({ form, path }) => (
    <>
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number editors can enter.</Trans>}
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
          <TextControl field={field} type="number" {...controlProps} />
        )}
      </AppField>
    </>
  ),
};

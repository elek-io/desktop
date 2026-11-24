import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { SlidersHorizontalIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import {
  noTitle,
  storedText,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { DefinitionBounds } from '@renderer/components/forms/definition-controls';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { alwaysFilledFieldRules } from '@renderer/lib/fieldRules';

import { rangeFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { RangeControl } from './control';

/** A number picked on a slider between a minimum and a maximum. */
export const rangeField: FieldTypeModule<'range'> = {
  translatable: true,
  // The `slider` role does not take `aria-required`, and a range always holds
  // a number anyway.
  acceptsAriaRequired: false,
  Icon: SlidersHorizontalIcon,
  group: 'numbers',
  // A slider always holds a number, so Required would name a rule nobody can
  // break, and its ends are the control's own value domain.
  rules: alwaysFilledFieldRules,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <RangeControl
      field={field}
      fieldDefinition={fieldDefinition}
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
  requiredNote: () =>
    msg`A range is always required, since the slider always holds a number.`,
  uniquenessNote: () => msg`A number field can't be unique.`,
  definitionSchema: () => rangeFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'number',
    fieldType: 'range',
    defaultValue: 50,
    min: 0,
    max: 100,
    isRequired: true,
    isUnique: false,
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
          <TextControl field={field} type="number" {...controlProps} />
        )}
      </AppField>
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The two ends of the slider.</Trans>}
      />
    </>
  ),
};

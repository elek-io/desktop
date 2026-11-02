import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import {
  contentAsStored,
  noTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefaultValueInputField,
  DefinitionDraft,
  MinMaxRow,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { alwaysFilledFieldRules } from '@renderer/lib/fieldRules';

import {
  rangeFieldDefinitionSchema,
  uuid,
  type RangeFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { RangeControl } from './control';

const spec: DefinitionSpec<RangeFieldDefinition> = {
  uniquenessNote: msg`Number fields cannot be unique.`,
  requiredNote: msg`Ranges are always required, since the slider always returns a number.`,
  schema: rangeFieldDefinitionSchema,

  resolver: zodResolver(rangeFieldDefinitionSchema),
  // Range is always required and its default, min and max are mandatory numbers.
  // isRequired and isUnique are re-narrowed here to Core's literal types.
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'number',
    fieldType: 'range',
    defaultValue: 50,
    min: 0,
    max: 100,
    isRequired: true,
    isUnique: false,
  }),
  Extras: ({ form }) => (
    <>
      <DefaultValueInputField form={form} name="defaultValue" type="number" />
      <MinMaxRow
        form={form}
        minName="min"
        maxName="max"
        minDescription={<Trans>The lowest end of the slider.</Trans>}
        maxDescription={<Trans>The highest end of the slider.</Trans>}
      />
    </>
  ),
};

/** A number picked on a slider between a minimum and a maximum. */
export const rangeField: FieldTypeModule<'range'> = {
  translatable: true,
  // The `slider` role does not take `aria-required`, and a range always holds
  // a number anyway.
  acceptsAriaRequired: false,
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
  listCell: contentAsStored,
  titleText: noTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

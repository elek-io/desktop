import { zodResolver } from '@hookform/resolvers/zod';
import { msg, t } from '@lingui/core/macro';

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
      <DefaultValueInputField
        form={form}
        name="defaultValue"
        type="number"
        isRequired
      />
      <MinMaxRow
        form={form}
        minName="min"
        maxName="max"
        unit={t`Value the user is able to enter`}
        isRequired
      />
    </>
  ),
};

/** A number picked on a slider between a minimum and a maximum. */
export const rangeField: FieldTypeModule<'range'> = {
  translatable: true,
  // The `slider` role does not take `aria-required`, and a range always carries
  // a number anyway, so it says it in its label.
  acceptsAriaRequired: false,
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

import { zodResolver } from '@hookform/resolvers/zod';
import { msg, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import {
  contentAsStored,
  noTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  MinMaxRow,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import {
  numberFieldDefinitionSchema,
  uuid,
  type NumberFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<NumberFieldDefinition> = {
  uniquenessNote: msg`Number fields cannot be unique.`,
  resolver: zodResolver(numberFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'number',
    fieldType: 'number',
    defaultValue: null,
    min: null,
    max: null,
    isUnique: false,
  }),
  Extras: ({ form }) => (
    <>
      <AppField
        form={form}
        name="defaultValue"
        label={<Trans>Default value</Trans>}
        description={<Trans>The initial value for the field.</Trans>}
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="number" {...controlProps} />
        )}
      </AppField>
      <MinMaxRow
        form={form}
        minName="min"
        maxName="max"
        unit={t`value the user can enter`}
      />
    </>
  ),
};

/** A number. */
export const numberField: FieldTypeModule<'number'> = {
  translatable: true,
  acceptsAriaRequired: true,
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
  listCell: contentAsStored,
  titleText: noTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { textRules } from '@renderer/components/fields/rules';
import {
  storedText,
  emptyPreview,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  MinMaxRow,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { TextareaControl } from '@renderer/components/ui/field-controls';

import {
  textareaFieldDefinitionSchema,
  uuid,
  type TextareaFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<TextareaFieldDefinition> = {
  schema: textareaFieldDefinitionSchema,

  resolver: zodResolver(textareaFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'textarea',
    defaultValue: null,
    min: null,
    max: null,
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
          <TextareaControl field={field} {...controlProps} />
        )}
      </AppField>
      <MinMaxRow
        form={form}
        minName="min"
        maxName="max"
        minDescription={
          <Trans>The fewest characters the user can enter.</Trans>
        }
        maxDescription={<Trans>The most characters the user can enter.</Trans>}
      />
    </>
  ),
};

/** Several lines of text. */
export const textareaField: FieldTypeModule<'textarea'> = {
  translatable: true,
  acceptsAriaRequired: true,
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
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};

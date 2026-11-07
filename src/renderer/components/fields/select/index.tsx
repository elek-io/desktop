import { scalarRules } from '@renderer/components/fields/rules';
import {
  contentAsStored,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

import { type FieldTypeModule } from '../module';
import { SelectControl } from './control';
import { SelectDefinitionDraft } from './definition';

/** One option out of a list the field definition carries. */
export const selectField: FieldTypeModule<'select'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, fieldDefinition, disabled, controlProps, label }) => (
    <SelectControl
      field={field}
      fieldDefinition={fieldDefinition}
      label={label}
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  // A number select shows its default in the preview, as every other numeric
  // control does, while a string select shows an empty one.
  previewContent: (fieldDefinition) =>
    fieldDefinition.valueType === 'number'
      ? fieldDefinition.defaultValue
      : null,
  listCell: contentAsStored,
  // A string option's words can name an Entry. A number option's cannot, which
  // textTitle answers on its own, since it only takes text.
  titleText: textTitle,
  DefinitionDraft: (props) => <SelectDefinitionDraft {...props} />,
};

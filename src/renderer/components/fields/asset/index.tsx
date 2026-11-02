import { plural, t } from '@lingui/core/macro';

import {
  noTitle,
  referenceCount,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

import { type FieldTypeModule } from '../module';
import { AssetControl } from './control';
import { AssetDefinitionDraft } from './definition';

/** One or more of the Project's Assets, held as references. */
export const assetField: FieldTypeModule<'asset'> = {
  translatable: true,
  // The control is the dialog's trigger, a button, whose role does not take
  // `aria-required`, so it says it in its label.
  acceptsAriaRequired: false,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <AssetControl
      field={field}
      fieldDefinition={fieldDefinition}
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (_fieldDefinition, supportedLanguages) =>
    translatableContent([], supportedLanguages),
  previewContent: () => [],
  // A reference cannot be shown as it is stored, so the list says how many
  // Assets the field points at, as one sentence rather than a count joined to
  // a noun, so a language that inflects the noun with the count can.
  listCell: ({ content, language }) => {
    const count = referenceCount({ content, language });
    return count === 0
      ? undefined
      : t`${plural(count, { one: '# Asset', other: '# Assets' })}`;
  },
  titleText: noTitle,
  DefinitionDraft: (props) => <AssetDefinitionDraft {...props} />,
};

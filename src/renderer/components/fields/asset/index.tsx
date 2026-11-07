import { plural, t } from '@lingui/core/macro';

import { countRules } from '@renderer/components/fields/rules';
import {
  noTitle,
  referenceCount,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

import { type FieldTypeModule } from '../module';
import { AssetControl } from './control';
import { AssetDefinitionDraft } from './definition';
import { assetKindNote } from './kind';

/** One or more of the Project's Assets, held as references. */
export const assetField: FieldTypeModule<'asset'> = {
  translatable: true,
  // The control is a list of rows and the buttons that fill it, and a button's
  // role takes no `aria-required`, so the rules beside the label carry it,
  // which every one of those buttons names in `aria-describedby`, and Choose
  // and Replace say the word in their accessible name too.
  acceptsAriaRequired: false,
  rules: (fieldDefinition) =>
    countRules(
      fieldDefinition,
      assetKindNote(fieldDefinition.ofAssetMimeTypes)
    ),
  Control: ({ field, fieldDefinition, disabled, controlProps, label }) => (
    <AssetControl
      field={field}
      fieldDefinition={fieldDefinition}
      label={label}
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

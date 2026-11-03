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

/**
 * Which Assets the field takes, in one word, or nothing where it takes any.
 *
 * Core allows any list of MIME types, so a field could take a handful from
 * several kinds at once. Where every allowed type is of one kind, that kind is
 * the word somebody reads, and a mixed list says only that the choice is
 * narrowed, since the picker shows which Assets are left.
 */
function assetKindNote(mimeTypes: string[]): string[] {
  const everyTypeIs = (kind: string): boolean =>
    mimeTypes.every((mimeType) => mimeType.startsWith(kind));

  if (mimeTypes.length === 0) {
    return [];
  }
  if (everyTypeIs('image/')) {
    return [t`images only`];
  }
  if (everyTypeIs('video/')) {
    return [t`videos only`];
  }
  if (everyTypeIs('audio/')) {
    return [t`audio only`];
  }
  return [t`certain file types only`];
}

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

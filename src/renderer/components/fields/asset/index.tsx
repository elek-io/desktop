import { msg, plural, t } from '@lingui/core/macro';
import { ImageIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import { countRules } from '@renderer/components/fields/rules';
import {
  noTitle,
  referenceCount,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';

import { assetFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { AssetControl } from './control';
import { AssetDefinitionEditor } from './definition';
import { assetKindNote } from './kind';

/** One or more of the Project's Assets, held as references. */
export const assetField: FieldTypeModule<'asset'> = {
  translatable: true,
  // The control is a list of rows and the buttons that fill it, and a button's
  // role takes no `aria-required`, so the rules beside the label carry it,
  // which every one of those buttons names in `aria-describedby`, and Choose
  // and Replace say the word in their accessible name too.
  acceptsAriaRequired: false,
  Icon: ImageIcon,
  group: 'links',
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
  isEmpty: holdsNothing,
  // A reference cannot be read as it is stored, so it says how many Assets the
  // field points at, as one sentence rather than a count joined to a noun, so
  // a language that inflects the noun with the count can.
  renderValue: ({ content, language }) => {
    const count = referenceCount({ content, language });
    return count === 0
      ? null
      : t`${plural(count, { one: '# Asset', other: '# Assets' })}`;
  },
  titleText: noTitle,
  uniquenessNote: () => msg`A reference field can't be unique.`,
  definitionSchema: () => assetFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'reference',
    fieldType: 'asset',
    isUnique: false,
    min: null,
    max: null,
    ofAssetMimeTypes: [],
  }),
  DefinitionEditor: AssetDefinitionEditor,
};

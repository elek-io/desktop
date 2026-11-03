import { plural, t } from '@lingui/core/macro';

import { countRules } from '@renderer/components/fields/rules';
import {
  noTitle,
  referenceCount,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

import { type FieldTypeModule } from '../module';
import { EntryControl } from './control';
import { EntryDefinitionDraft } from './definition';

/** One or more Entries of the Collections the field allows, held as references. */
export const entryField: FieldTypeModule<'entry'> = {
  translatable: true,
  // The control is a list of rows and the buttons that fill it, and a button's
  // role takes no `aria-required`, so the rules beside the label carry it,
  // which every one of those buttons names in `aria-describedby`, and Choose
  // says the word in its accessible name too.
  acceptsAriaRequired: false,
  rules: countRules,
  Control: ({ field, fieldDefinition, disabled, controlProps, label }) => (
    <EntryControl
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
  listCell: ({ content, language }) => {
    const count = referenceCount({ content, language });
    return count === 0
      ? undefined
      : t`${plural(count, { one: '# Entry', other: '# Entries' })}`;
  },
  titleText: noTitle,
  DefinitionDraft: (props) => <EntryDefinitionDraft {...props} />,
};

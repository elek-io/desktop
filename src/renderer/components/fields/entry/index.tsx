import { plural, t } from '@lingui/core/macro';

import { coreRefusals } from '@renderer/components/fields/core-refusals';
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
  // Core refuses a reference to an Entry of a Collection the field does not
  // allow, which a field narrowed after the Entry was written leaves behind.
  // Its text is the one Core raises for an entryReference inside a markdown
  // tree too, see the markdown folder.
  coreRefusalText: ({ message }) =>
    message.startsWith(coreRefusals.foreignCollection)
      ? t`One Entry here is from a Collection this field doesn't take. Choose another one.`
      : null,
  DefinitionDraft: (props) => <EntryDefinitionDraft {...props} />,
};

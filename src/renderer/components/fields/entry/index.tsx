import { plural, t } from '@lingui/core/macro';

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
  // The control is the dialog's trigger, a button, whose role does not take
  // `aria-required`, so it says it in its label.
  acceptsAriaRequired: false,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <EntryControl
      field={field}
      fieldDefinition={fieldDefinition}
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

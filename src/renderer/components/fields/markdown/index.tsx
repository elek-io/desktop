import {
  contentInLanguage,
  emptyPreview,
  noTitle,
} from '@renderer/components/fields/value-contracts';

import {
  extractText,
  type MdAstRoot,
  type SupportedLanguage,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { MarkdownControl } from './control';
import { MarkdownDefinitionDraft } from './definition';

/** Rich text, stored as Core's mdast tree rather than as a markdown string. */
export const markdownField: FieldTypeModule<'markdown'> = {
  translatable: true,
  // The editor is a contenteditable the control must not reach into, so the
  // control-association props land on its wrapper and required is said in the
  // label.
  acceptsAriaRequired: false,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <MarkdownControl
      field={field}
      fieldDefinition={fieldDefinition}
      disabled={disabled}
      {...controlProps}
    />
  ),
  // A tree is cloned per language, so no two languages share one reference.
  defaultContent: (fieldDefinition, supportedLanguages) =>
    supportedLanguages.reduce(
      (content, language) => {
        content[language] =
          fieldDefinition.defaultValue === null
            ? null
            : structuredClone(fieldDefinition.defaultValue);
        return content;
      },
      {} as Record<SupportedLanguage, MdAstRoot | null>
    ),
  previewContent: emptyPreview,
  // A tree cannot be shown in a row, so the list shows its plain text.
  listCell: ({ content, language }) => {
    const tree = contentInLanguage(content, language);
    return tree === null || tree === undefined
      ? undefined
      : extractText(tree as MdAstRoot);
  },
  titleText: noTitle,
  DefinitionDraft: (props) => <MarkdownDefinitionDraft {...props} />,
};

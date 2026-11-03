import { t } from '@lingui/core/macro';

import { coreRefusals } from '@renderer/components/fields/core-refusals';
import { scalarRules } from '@renderer/components/fields/rules';
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
  // The editable element carries `role="textbox"`, which takes `aria-required`,
  // so the editor is told the control's props through ProseMirror's own
  // `attributes` rather than reached into.
  acceptsAriaRequired: true,
  rules: scalarRules,
  Control: ({ field, fieldDefinition, disabled, controlProps, label }) => (
    <MarkdownControl
      field={field}
      fieldDefinition={fieldDefinition}
      label={label}
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
  // Core refuses a tree that is stored as empty rather than as nothing, one
  // nested deeper than it walks, and a reference to an Entry of a Collection
  // the field does not allow, which is the text the entry folder words too.
  coreRefusalText: ({ message }) => {
    if (message.startsWith(coreRefusals.emptyMarkdown)) {
      return t`Write something here, or clear the field completely.`;
    }
    if (message.startsWith(coreRefusals.deepMarkdown)) {
      return t`This text has too many levels inside it. Take some out to save.`;
    }
    if (message.startsWith(coreRefusals.foreignCollection)) {
      return t`One Entry in this text is from a Collection this field doesn't take. Point it somewhere else.`;
    }
    return null;
  },
  DefinitionDraft: (props) => <MarkdownDefinitionDraft {...props} />,
};

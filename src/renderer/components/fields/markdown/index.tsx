import { msg, t } from '@lingui/core/macro';
import { FileTextIcon } from 'lucide-react';

import { coreRefusals } from '@renderer/components/fields/core-refusals';
import { holdsNoMarkdown } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  contentInLanguage,
  emptyPreview,
  noTitle,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';

import {
  extractText,
  markdownFieldDefinitionSchema,
  type MdAstRoot,
  type SupportedLanguage,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { MarkdownControl } from './control';
import { MarkdownDefinitionEditor } from './definition';

/** Rich text, stored as Core's mdast tree rather than as a markdown string. */
export const markdownField: FieldTypeModule<'markdown'> = {
  translatable: true,
  // The editable element carries `role="textbox"`, which takes `aria-required`,
  // so the editor is told the control's props through ProseMirror's own
  // `attributes` rather than reached into.
  acceptsAriaRequired: true,
  Icon: FileTextIcon,
  group: 'text',
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
  isEmpty: holdsNoMarkdown,
  readsAsWords: true,
  // A tree is not read as it is stored, so it is read as its plain text.
  renderValue: ({ content, language }) => {
    const tree = contentInLanguage(content, language);
    return tree === null || tree === undefined
      ? null
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
  uniquenessNote: () => msg`A markdown field can't be unique.`,
  definitionSchema: () => markdownFieldDefinitionSchema,
  // Its Default Value is a tree nobody edits yet, so a new field starts
  // without one, see contributing/not-yet-implemented.md.
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'mdast',
    fieldType: 'markdown',
    isUnique: false,
    defaultValue: null,
    min: null,
    max: null,
    features: {
      headings: [],
      blockquotes: false,
      lists: false,
      taskListItems: false,
      codeBlocks: false,
      thematicBreak: false,
      tables: false,
      footnotes: false,
      rawHtml: false,
      emphasis: false,
      strong: false,
      inlineCode: false,
      strikethrough: false,
      hardLineBreaks: false,
      externalLinks: false,
      externalImages: false,
      entryReferences: false,
      assetReferences: false,
    },
    ofCollections: [],
    ofAssetMimeTypes: [],
  }),
  DefinitionEditor: MarkdownDefinitionEditor,
};

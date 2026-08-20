import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { history } from '@milkdown/kit/plugin/history';
import { listener } from '@milkdown/kit/plugin/listener';
import {
  blockquoteAttr,
  blockquoteKeymap,
  blockquoteSchema,
  bulletListAttr,
  bulletListKeymap,
  bulletListSchema,
  codeBlockAttr,
  codeBlockKeymap,
  codeBlockSchema,
  createCodeBlockCommand,
  createCodeBlockInputRule,
  docSchema,
  downgradeHeadingCommand,
  emphasisAttr,
  emphasisKeymap,
  emphasisSchema,
  emphasisStarInputRule,
  emphasisUnderscoreInputRule,
  hardbreakAttr,
  hardbreakClearMarkPlugin,
  hardbreakFilterNodes,
  hardbreakFilterPlugin,
  hardbreakKeymap,
  hardbreakSchema,
  headingAttr,
  headingIdGenerator,
  headingSchema,
  hrAttr,
  hrSchema,
  htmlAttr,
  htmlSchema,
  imageAttr,
  imageSchema,
  inlineCodeAttr,
  inlineCodeInputRule,
  inlineCodeKeymap,
  inlineCodeSchema,
  inlineNodesCursorPlugin,
  insertHardbreakCommand,
  insertHrCommand,
  insertHrInputRule,
  insertImageCommand,
  insertImageInputRule,
  liftFirstListItemCommand,
  liftListItemCommand,
  linkAttr,
  linkSchema,
  listItemAttr,
  listItemKeymap,
  listItemSchema,
  orderedListAttr,
  orderedListKeymap,
  orderedListSchema,
  paragraphAttr,
  paragraphKeymap,
  paragraphSchema,
  remarkAddOrderInListPlugin,
  remarkHtmlTransformer,
  remarkInlineLinkPlugin,
  remarkLineBreak,
  remarkMarker,
  remarkPreserveEmptyLinePlugin,
  sinkListItemCommand,
  splitListItemCommand,
  strongAttr,
  strongInputRule,
  strongKeymap,
  strongSchema,
  syncHeadingIdPlugin,
  syncListOrderPlugin,
  textSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  updateLinkCommand,
  wrapInBlockquoteCommand,
  wrapInBlockquoteInputRule,
  wrapInBulletListCommand,
  wrapInBulletListInputRule,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
  wrapInOrderedListInputRule,
} from '@milkdown/kit/preset/commonmark';
import {
  autoInsertSpanPlugin,
  exitTable,
  extendListItemSchemaForTask,
  footnoteDefinitionSchema,
  footnoteReferenceSchema,
  goToNextTableCellCommand,
  goToPrevTableCellCommand,
  insertTableCommand,
  insertTableInputRule,
  keepTableAlignPlugin,
  remarkGFMPlugin,
  strikethroughAttr,
  strikethroughInputRule,
  strikethroughKeymap,
  strikethroughSchema,
  tableCellSchema,
  tableEditingPlugin,
  tableHeaderRowSchema,
  tableHeaderSchema,
  tableKeymap,
  tableRowSchema,
  tableSchema,
  toggleStrikethroughCommand,
  wrapInTaskListInputRule,
} from '@milkdown/kit/preset/gfm';

import type { MarkdownFeatures } from '@elek-io/core';

import {
  assetReferenceSchema,
  insertAssetReferenceCommand,
} from './plugins/asset-reference';
import {
  entryReferenceSchema,
  insertEntryReferenceCommand,
} from './plugins/entry-reference';
import {
  restrictedHeadingInputRule,
  restrictedHeadingKeymap,
} from './plugins/restricted-heading';

// Milkdown slices come in tuple and single-plugin flavors, same as the
// preset bundles handle them before flattening
type PluginSlice = MilkdownPlugin | MilkdownPlugin[];

/**
 * Assembles the editor's plugin list from per-node slices, so that node types
 * a markdown field's features disable do not exist in the editor at all -
 * they cannot be typed, pasted or serialized.
 *
 * Each enabled node also pulls in the remark plugins its parseMarkdown runner
 * depends on (see the schema-to-remark dependency notes inline).
 */
export function buildEditorPlugins(
  features: MarkdownFeatures
): MilkdownPlugin[] {
  const slices: PluginSlice[] = [
    // The always-on backbone: document, paragraphs, text and editor basics
    docSchema,
    paragraphAttr,
    paragraphSchema,
    textSchema,
    turnIntoTextCommand,
    paragraphKeymap,
    history,
    listener,
    clipboard,
    cursor,
  ];
  // remark-gfm is one processor plugin shared by all GFM node types
  const needsGfm =
    features.tables ||
    features.strikethrough ||
    features.footnotes ||
    features.taskListItems;
  if (needsGfm) {
    slices.push(remarkGFMPlugin);
  }
  const needsInlineAtomCursor =
    features.rawHtml ||
    features.externalImages ||
    features.entryReferences ||
    features.assetReferences;
  if (needsInlineAtomCursor) {
    slices.push(inlineNodesCursorPlugin);
  }

  if (features.headings.length > 0) {
    // The stock input rule and keymap always accept depths 1-6, which Core
    // then rejects for a field that allows only some of them. Both are
    // replaced with versions restricted to features.headings.
    slices.push(
      headingIdGenerator,
      headingAttr,
      headingSchema,
      restrictedHeadingInputRule(features.headings),
      wrapInHeadingCommand,
      downgradeHeadingCommand,
      restrictedHeadingKeymap(features.headings),
      syncHeadingIdPlugin
    );
  }
  if (features.blockquotes) {
    slices.push(
      blockquoteAttr,
      blockquoteSchema,
      wrapInBlockquoteInputRule,
      wrapInBlockquoteCommand,
      blockquoteKeymap
    );
  }
  if (features.lists) {
    slices.push(
      bulletListAttr,
      bulletListSchema,
      wrapInBulletListInputRule,
      wrapInBulletListCommand,
      bulletListKeymap,
      orderedListAttr,
      orderedListSchema,
      wrapInOrderedListInputRule,
      wrapInOrderedListCommand,
      orderedListKeymap,
      listItemAttr,
      // The task extension replaces the list item schema (same node id), so
      // exactly one of the two registers
      features.taskListItems ? extendListItemSchemaForTask : listItemSchema,
      sinkListItemCommand,
      liftListItemCommand,
      splitListItemCommand,
      liftFirstListItemCommand,
      listItemKeymap,
      // Annotates ordered list items with their number for parseMarkdown
      remarkAddOrderInListPlugin,
      syncListOrderPlugin
    );
    if (features.taskListItems) {
      slices.push(wrapInTaskListInputRule);
    }
  }
  if (features.codeBlocks) {
    slices.push(
      codeBlockAttr,
      codeBlockSchema,
      createCodeBlockInputRule,
      createCodeBlockCommand,
      codeBlockKeymap
    );
  }
  if (features.thematicBreak) {
    slices.push(hrAttr, hrSchema, insertHrInputRule, insertHrCommand);
  }
  if (features.rawHtml) {
    slices.push(
      htmlAttr,
      htmlSchema,
      // Wraps block-level raw HTML into paragraphs (the html node is inline)
      remarkHtmlTransformer,
      remarkPreserveEmptyLinePlugin
    );
  }
  if (features.tables) {
    slices.push(
      tableSchema,
      tableHeaderRowSchema,
      tableRowSchema,
      tableCellSchema,
      tableHeaderSchema,
      insertTableInputRule,
      tableKeymap,
      insertTableCommand,
      goToNextTableCellCommand,
      goToPrevTableCellCommand,
      exitTable,
      keepTableAlignPlugin,
      autoInsertSpanPlugin,
      tableEditingPlugin
    );
  }
  if (features.footnotes) {
    slices.push(footnoteDefinitionSchema, footnoteReferenceSchema);
  }

  if (features.emphasis) {
    slices.push(
      emphasisAttr,
      emphasisSchema,
      emphasisStarInputRule,
      emphasisUnderscoreInputRule,
      toggleEmphasisCommand,
      emphasisKeymap
    );
  }
  if (features.strong) {
    slices.push(
      strongAttr,
      strongSchema,
      strongInputRule,
      toggleStrongCommand,
      strongKeymap
    );
  }
  // Preserves the author's emphasis/strong marker style (* vs _) on round trip
  if (features.emphasis || features.strong) {
    slices.push(remarkMarker);
  }
  if (features.inlineCode) {
    slices.push(
      inlineCodeAttr,
      inlineCodeSchema,
      inlineCodeInputRule,
      toggleInlineCodeCommand,
      inlineCodeKeymap
    );
  }
  if (features.strikethrough) {
    slices.push(
      strikethroughAttr,
      strikethroughSchema,
      strikethroughInputRule,
      toggleStrikethroughCommand,
      strikethroughKeymap
    );
  }
  if (features.hardLineBreaks) {
    slices.push(
      hardbreakAttr,
      hardbreakSchema,
      insertHardbreakCommand,
      hardbreakKeymap,
      // Splits text on newlines into break nodes the hardbreak schema matches
      remarkLineBreak,
      hardbreakClearMarkPlugin,
      hardbreakFilterNodes,
      hardbreakFilterPlugin
    );
  }
  if (features.externalLinks) {
    slices.push(linkAttr, linkSchema, toggleLinkCommand, updateLinkCommand);
  }
  if (features.externalImages) {
    slices.push(
      imageAttr,
      imageSchema,
      insertImageCommand,
      insertImageInputRule
    );
  }
  // Converts reference-style links and images into the inline form the
  // link/image schemas can parse
  if (features.externalLinks || features.externalImages) {
    slices.push(remarkInlineLinkPlugin);
  }
  if (features.entryReferences) {
    slices.push(entryReferenceSchema, insertEntryReferenceCommand);
  }
  if (features.assetReferences) {
    slices.push(assetReferenceSchema, insertAssetReferenceCommand);
  }

  return slices.flat();
}

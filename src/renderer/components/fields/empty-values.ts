import { isEmptyParagraphOnly, type MdAstBlockNode } from '@elek-io/core';

// When one Value of a field type holds nothing, which is what Core refuses a
// required field for. A type's own folder picks the contract that describes its
// Value, the way it picks the one for its title or its read-only text, so
// nothing here branches on a field type.
//
// It holds no words, no React and no path alias, which is what lets the spec
// read it without the app, see tests/specs/missing-values.spec.ts.
//
// See contributing/renderer/forms.md#a-missing-value-and-saves-block.

/**
 * Whether one language's content of a text, a number, a choice, a date, a
 * toggle or a list of references holds nothing.
 *
 * It is what Core refuses a required field for: a required Value is built as
 * `.min(1)` over the trimmed text or the list it holds, while an optional one
 * is nullable, so nothing at all, a text of spaces and an empty list are the
 * three cases. A number and a toggle always hold something, since `0` and
 * `false` are neither, and nothing in their place counts for the same reason
 * Core refuses it there.
 */
export function holdsNothing(content: unknown): boolean {
  if (content === null || content === undefined) {
    return true;
  }
  if (typeof content === 'string') {
    return content.trim() === '';
  }
  return Array.isArray(content) && content.length === 0;
}

/** A markdown Value's tree, as far as reading it for emptiness needs. */
interface MarkdownTree {
  children: MdAstBlockNode[];
}

/**
 * Whether the content is a tree at all. A Value that is none is read as empty
 * below, since Core refuses it either way.
 */
function isMarkdownTree(content: unknown): content is MarkdownTree {
  if (content === null || typeof content !== 'object') {
    return false;
  }
  return Array.isArray((content as { children?: unknown }).children);
}

/**
 * Whether one language's markdown holds nothing.
 *
 * Core's own check answers the state an editor was opened in and nothing was
 * typed, a tree holding one empty paragraph, and a required field is refused
 * for an empty tree as well, so both count.
 */
export function holdsNoMarkdown(content: unknown): boolean {
  if (isMarkdownTree(content) === false) {
    return true;
  }
  return content.children.length === 0 || isEmptyParagraphOnly(content);
}

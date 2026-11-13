import type { MarkdownNode } from '@milkdown/kit/transformer';
import { $command, $nodeSchema } from '@milkdown/kit/utils';

export interface EntryReferenceAttrs {
  collectionId: string;
  entryId: string;
  label: string;
}

const chipClass =
  'inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm';

// Core's entryReference carries phrasing children as its label. The editor
// flattens them to plain text (an accepted v1 simplification), so the label
// is a single attribute here and serializes back as one text child.
function plainText(node: MarkdownNode): string {
  if (Array.isArray(node.children)) {
    return node.children.map((child) => plainText(child)).join('');
  }
  return typeof node['value'] === 'string' ? node['value'] : '';
}

/**
 * Inline atom for Core's custom entryReference mdast node. Like the asset
 * reference it has no markdown text syntax.
 */
export const entryReferenceSchema = $nodeSchema('entry_reference', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: true,
  marks: '',
  attrs: {
    collectionId: { default: '' },
    entryId: { default: '' },
    label: { default: '' },
  },
  parseDOM: [
    {
      tag: 'span[data-type="entry-reference"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) {
          return false;
        }
        return {
          collectionId: dom.getAttribute('data-collection-id') ?? '',
          entryId: dom.getAttribute('data-entry-id') ?? '',
          label: dom.getAttribute('data-label') ?? '',
        };
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      'data-type': 'entry-reference',
      'data-collection-id': String(node.attrs['collectionId']),
      'data-entry-id': String(node.attrs['entryId']),
      'data-label': String(node.attrs['label']),
      class: chipClass,
    },
    `🔗 ${String(node.attrs['label']) !== '' ? String(node.attrs['label']) : 'Entry'}`,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'entryReference',
    runner: (state, node, type) => {
      state.addNode(type, {
        collectionId:
          typeof node['collectionId'] === 'string' ? node['collectionId'] : '',
        entryId: typeof node['entryId'] === 'string' ? node['entryId'] : '',
        label: plainText(node),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'entry_reference',
    runner: (state, node) => {
      state.openNode('entryReference', undefined, {
        collectionId: node.attrs['collectionId'] as string,
        entryId: node.attrs['entryId'] as string,
      });
      state.addNode('text', undefined, node.attrs['label'] as string);
      state.closeNode();
    },
  },
}));

export const insertEntryReferenceCommand = $command(
  'InsertEntryReference',
  (ctx) => (payload?: EntryReferenceAttrs) => (state, dispatch) => {
    if (payload === undefined) {
      return false;
    }
    const node = entryReferenceSchema.type(ctx).create({ ...payload });
    dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  }
);

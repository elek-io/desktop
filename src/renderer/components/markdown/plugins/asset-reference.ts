import { $command, $nodeSchema } from '@milkdown/kit/utils';

export interface AssetReferenceAttrs {
  assetId: string;
  alt: string;
  title: string | null;
}

const chipClass =
  'inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm';

/**
 * Inline atom for Core's custom assetReference mdast node. It has no markdown
 * text syntax, the parseMarkdown/toMarkdown runners move it between the
 * ProseMirror document and the mdast tree directly.
 */
export const assetReferenceSchema = $nodeSchema('asset_reference', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: true,
  marks: '',
  attrs: {
    assetId: { default: '' },
    alt: { default: '' },
    title: { default: null },
  },
  parseDOM: [
    {
      tag: 'span[data-type="asset-reference"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) {
          return false;
        }
        return {
          assetId: dom.getAttribute('data-asset-id') ?? '',
          alt: dom.getAttribute('data-alt') ?? '',
          title: dom.getAttribute('data-title'),
        };
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      'data-type': 'asset-reference',
      'data-asset-id': String(node.attrs['assetId']),
      'data-alt': String(node.attrs['alt']),
      class: chipClass,
    },
    `🖼 ${String(node.attrs['alt']) !== '' ? String(node.attrs['alt']) : 'Asset'}`,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'assetReference',
    runner: (state, node, type) => {
      state.addNode(type, {
        assetId: typeof node['assetId'] === 'string' ? node['assetId'] : '',
        alt: typeof node['alt'] === 'string' ? node['alt'] : '',
        title: typeof node['title'] === 'string' ? node['title'] : null,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'asset_reference',
    runner: (state, node) => {
      state.addNode('assetReference', undefined, undefined, {
        assetId: node.attrs['assetId'] as string,
        alt: node.attrs['alt'] as string,
        title: node.attrs['title'] as string | null,
      });
    },
  },
}));

export const insertAssetReferenceCommand = $command(
  'InsertAssetReference',
  (ctx) => (payload?: AssetReferenceAttrs) => (state, dispatch) => {
    if (payload === undefined) {
      return false;
    }
    const node = assetReferenceSchema.type(ctx).create({ ...payload });
    dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  }
);

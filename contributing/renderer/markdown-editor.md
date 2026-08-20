# Markdown editor

How the client edits `markdown` field Values. Core stores these as a typed mdast tree per language (never a markdown string) with custom `assetReference` / `entryReference` nodes and per-field feature toggles - see Core's `docs/markdown-content.md` for the storage model.

Everything lives in [`src/renderer/components/markdown/`](../../src/renderer/components/markdown/).

## Why Milkdown, and why it is assembled from parts

The editor is [Milkdown](https://milkdown.dev) (`@milkdown/kit` + `@milkdown/react`, exact-pinned). Milkdown was picked because it is mdast-native: its internal pipeline is markdown string → remark → **mdast** → ProseMirror document (and the reverse), and every node plugin declares its parsing/serialization in terms of mdast nodes. Core stores the middle step of that pipeline.

The editing experience - document model, cursor behavior, input rules, commands, keymaps, history, clipboard, the parse/serialize machinery - is stock Milkdown. What the client deliberately does **not** use are Milkdown's two convenience layers, each for a specific reason from Core's contract:

1. **Not the pre-composed bundles** (Crepe, or the `commonmark`/`gfm` presets as a whole). Crepe's feature flags gate UI widgets, not node types, so it cannot express a field that allows "lists and H2/H3 but no tables". The presets are literally `[...slices].flat()` - one array registering every node type, which would let users author content the field's features forbid, failing only at save time. [`plugin-assembly.ts`](../../src/renderer/components/markdown/plugin-assembly.ts) builds the plugin array from the exact same official slice exports the presets are made of, but conditionally per feature: a disabled node type does not exist in the editor's schema, so invalid content cannot be typed or pasted in the first place.
2. **Not the string-based value API** (`defaultValueCtx` in, `getMarkdown()` out). Core stores mdast and deliberately ships no string serialization, because the reference nodes have no markdown text syntax. The bridge enters Milkdown's own pipeline one step in - trees instead of strings - so nothing lossy ever happens in between.

The trade-off: the bridge depends on exported-but-not-headline APIs (`ParserState`, `SerializerState`). That is why the Milkdown versions are exact-pinned and the bridge is quarantined in one module - a Milkdown upgrade is a deliberate event with one file to re-verify.

## The mdast bridge

[`mdast-bridge.ts`](../../src/renderer/components/markdown/mdast-bridge.ts), the only place trees cross between Core and Milkdown:

```
LOAD:  MdAstRoot ──structuredClone──▶ remarkCtx.runSync(tree)   (Milkdown's remark
       transformers: list numbering, line breaks, markers)
       ──▶ new ParserState(schema).next(tree).toDoc() ──▶ ProseMirror document

EDIT:  listener `updated` (debounced 200ms) + `blur` (immediate flush)
       ──▶ new SerializerState(schema).run(doc).build() ──▶ loose mdast
       ──▶ normalize to Core's node shapes ──▶ mdAstRootSchema.parse()
       ──▶ empty or empty-paragraph-only? null : MdAstRoot ──▶ field.onChange
```

The normalizer exists because Core's mdast schemas are stricter than remark's: fields like `list.ordered`, `code.lang` or `image.title` are required (possibly null) in Core but optional in remark output. It constructs typed Core nodes explicitly, and the final `mdAstRootSchema.parse` guarantees only Core-valid trees leave the module (also stripping `position` data by construction). Unknown node types throw a `MdastBridgeError` that renders as an error under the editor - fail loud, never lose content silently.

Rules the bridge enforces:

- **Empty is `null`.** Core rejects a root with no children and the "one empty paragraph" tree an empty ProseMirror editor naturally holds (checked with Core's `isEmptyParagraphOnly`). The editor normalizes both to `null` before they reach the form.
- **No markdown strings.** Content never round-trips through a string, so reference nodes and marker styles survive unchanged.

## Feature gating

`buildEditorPlugins(features)` maps the field's feature toggles to per-node plugin slices (schema + input rules + commands + keymap), plus the remark plugins each node's parser depends on:

| Feature                                                | Extra dependencies pulled in                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `lists`                                                | `remarkAddOrderInListPlugin` (ordered item numbering), `syncListOrderPlugin`                  |
| `taskListItems`                                        | `extendListItemSchemaForTask` **replaces** `listItemSchema` (same node id), `remarkGFMPlugin` |
| `hardLineBreaks`                                       | `remarkLineBreak` (splits text on newlines into break nodes)                                  |
| `emphasis` / `strong`                                  | `remarkMarker` (preserves `*` vs `_` on round trip)                                           |
| `externalLinks` / `externalImages`                     | `remarkInlineLinkPlugin` (reference-style to inline form)                                     |
| `rawHtml`                                              | `remarkHtmlTransformer`, `remarkPreserveEmptyLinePlugin`                                      |
| any GFM node (tables, strikethrough, footnotes, tasks) | `remarkGFMPlugin`                                                                             |

Heading depths are restricted at every authoring path: the toolbar offers only `features.headings` depths, and [`plugins/restricted-heading.ts`](../../src/renderer/components/markdown/plugins/restricted-heading.ts) replaces Milkdown's stock input rule and keymap (both of which always accept 1-6) with versions built from the configured depths, so `#### ` and `Mod-Alt-4` do nothing in a field that disallows depth 4. A _pasted_ disallowed depth still rides through the shared heading schema and is caught by the generated entry schema at save. Pasting markdown text that uses a disabled feature degrades to plain text - if that ever proves too disruptive, the documented fallback is to register the full schema and gate only input rules and toolbar, letting zod reject at save.

## Reference nodes

[`plugins/asset-reference.ts`](../../src/renderer/components/markdown/plugins/asset-reference.ts) and [`plugins/entry-reference.ts`](../../src/renderer/components/markdown/plugins/entry-reference.ts) define inline atom nodes for Core's custom mdast types, rendered as chips. They ride through the parser/serializer the same way stock nodes do (their `parseMarkdown`/`toMarkdown` runners match the mdast `type` directly), so no text syntax is ever invented for them. Insertion happens through single-select picker dialogs ([`asset-reference-picker.tsx`](../../src/renderer/components/markdown/asset-reference-picker.tsx), [`entry-reference-picker.tsx`](../../src/renderer/components/markdown/entry-reference-picker.tsx)) filtered by the definition's `ofAssetMimeTypes` / `ofCollections`.

One v1 simplification: Core's `entryReference` carries phrasing children as its label, the editor flattens them to plain text (see [not-yet-implemented.md](../not-yet-implemented.md)).

## The editor component

[`markdown-editor.tsx`](../../src/renderer/components/markdown/markdown-editor.tsx) is uncontrolled-with-synchronization:

- Edits flow out through the debounced `updated` listener plus a `blur` flush, so the form always holds the final tree before a submit button click lands.
- An external value change (for example the update route's async `form.reset`) is detected by comparing against the last tree the editor emitted itself, and re-hydrates the document without touching the undo history (`addToHistory: false`, which also keeps the listener from echoing it back).
- Validation comes for free: the entry form's generated schema (`getCreateEntrySchemaFromFieldDefinitions`) validates the tree against the field's features, min/max block counts and `ofCollections`.

## Security note

Core does **not** sanitize `rawHtml` content. The editor itself renders html nodes as inert atoms (not via `innerHTML`), but any future preview or rendering path in the client must sanitize raw HTML before displaying it.

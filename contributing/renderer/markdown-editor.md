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
       transformers: list numbering, line breaks)
       ──▶ new ParserState(schema).next(tree).toDoc() ──▶ ProseMirror document

EDIT:  listener `updated` (debounced 200ms) + `blur` (immediate flush)
       ──▶ new SerializerState(schema).run(doc).build() ──▶ loose mdast
       ──▶ normalize to Core's node shapes ──▶ mdAstRootSchema.parse()
       ──▶ empty or empty-paragraph-only? null : MdAstRoot ──▶ field.onChange
```

The normalizer exists because Core's mdast schemas are stricter than remark's: fields like `list.ordered`, `code.lang` or `image.title` are required (possibly null) in Core but optional in remark output. It constructs typed Core nodes explicitly, and the final `mdAstRootSchema.parse` guarantees only Core-valid trees leave the module (also stripping `position` data by construction). Unknown node types throw a `MdastBridgeError`, and the editor says so below itself rather than passing a partial tree on - fail loud, never lose content silently, see [when a stored Value cannot be read](#when-a-stored-value-cannot-be-read).

Only transformers that work on a tree alone may run on the load. A remark plugin that reads the markdown text a tree was parsed from has none to read here, which is why Milkdown's `remarkMarker` is in no plugin list this module builds.

Rules the bridge enforces:

- **Empty is `null`.** Core rejects a root with no children and the "one empty paragraph" tree an empty ProseMirror editor naturally holds (checked with Core's `isEmptyParagraphOnly`). The editor normalizes both to `null` before they reach the form.
- **No markdown strings.** Content never round-trips through a string, so a reference node survives unchanged. Which marker an author typed does not: Core stores no marker, so each mark takes the default its own Milkdown schema sets, which is what text copied out of the editor carries.

## When a stored Value cannot be read

A tree the bridge cannot turn into a document is one the editor has no node for, which is what a Project written by another client, by hand or by a later version of elek.io can hold. The field then keeps that Value rather than replacing it:

- **Nothing is emitted.** The editor only sends a tree to the form once it has taken a Value in, so the empty box a failed load leaves behind never reaches `field.onChange`. Without that, leaving the field would flush an empty document, which the bridge turns into `null`, and the next save would store nothing in place of the text.
- **The box takes no edit.** ProseMirror is told the document is not editable and the element says `aria-readonly`, so nothing typed can look like it will be saved. It keeps a `tabindex`, which a document that is no longer editable would otherwise lose, so the sentence below can still be reached and heard.
- **One sentence from the catalog says what it means for the text and for the Entry**, named in the editable element's `aria-describedby` and carrying `role="alert"`, since it appears after the page was presented rather than with it. What was thrown says nothing an editor asked about, so it goes to the log file instead, the way a pane's boundary writes one, but without its message: Milkdown's parser puts the whole node it could not match into what it throws, and for a markdown Value that node is the text somebody wrote. So this one record logs through `errorLogAttributesWithoutMessage`, which keeps the type, the Core type and the frames of the stack, see [error-handling.md](../error-handling.md#what-the-cause-carries-and-what-it-does-not).
- **The save is refused rather than silent.** The form still holds the stored tree, so the generated entry schema refuses it and the field says so in its own words, see [forms.md](./forms.md#the-words-a-refused-value-is-explained-in).

A document the bridge cannot serialize is answered the same way, with a sentence of its own: the form keeps the last tree that crossed, rather than a partial one. Its message is kept out of the log file too, because Milkdown's serializer stringifies its node exactly as the parser does.

## Feature gating

`buildEditorPlugins(features)` maps the field's feature toggles to per-node plugin slices (schema + input rules + commands + keymap), plus the remark plugins each node's parser depends on:

| Feature                                                | Extra dependencies pulled in                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `lists`                                                | `remarkAddOrderInListPlugin` (ordered item numbering), `syncListOrderPlugin`                  |
| `taskListItems`                                        | `extendListItemSchemaForTask` **replaces** `listItemSchema` (same node id), `remarkGFMPlugin` |
| `hardLineBreaks`                                       | `remarkLineBreak` (splits text on newlines into break nodes)                                  |
| `externalLinks` / `externalImages`                     | `remarkInlineLinkPlugin` (reference-style to inline form)                                     |
| `rawHtml`                                              | `remarkHtmlTransformer`, `remarkPreserveEmptyLinePlugin`                                      |
| any GFM node (tables, strikethrough, footnotes, tasks) | `remarkGFMPlugin`                                                                             |

Heading depths are restricted for typed input, the toolbar and keyboard shortcuts: the toolbar offers only `features.headings` depths, and [`plugins/restricted-heading.ts`](../../src/renderer/components/markdown/plugins/restricted-heading.ts) replaces Milkdown's stock input rule and keymap (both of which always accept 1-6) with versions built from the configured depths, so `#### ` and `Mod-Alt-4` do nothing in a field that disallows depth 4. A _pasted_ disallowed depth still rides through the shared heading schema and is caught by the generated entry schema at save. Pasting markdown text that uses a disabled feature degrades to plain text - if that ever proves too disruptive, the documented fallback is to register the full schema and gate only input rules and toolbar, letting zod reject at save.

## Reference nodes

[`plugins/asset-reference.ts`](../../src/renderer/components/markdown/plugins/asset-reference.ts) and [`plugins/entry-reference.ts`](../../src/renderer/components/markdown/plugins/entry-reference.ts) define inline atom nodes for Core's custom mdast types, rendered as chips. They ride through the parser/serializer the same way stock nodes do (their `parseMarkdown`/`toMarkdown` runners match the mdast `type` directly), so no text syntax is ever invented for them. Insertion happens through [`asset-reference-picker.tsx`](../../src/renderer/components/markdown/asset-reference-picker.tsx) and [`entry-reference-picker.tsx`](../../src/renderer/components/markdown/entry-reference-picker.tsx), filtered by the definition's `ofAssetMimeTypes` / `ofCollections`. Each is the matching field's own dialog from [`components/pickers/`](../../src/renderer/components/pickers/) with one choice, so an Asset or an Entry is listed here exactly as the Asset and Entry fields list it, with a radio button each, see [dynamic-form-field-generation.md](./dynamic-form-field-generation.md#reference-fields-asset-and-entry).

One v1 simplification: Core's `entryReference` carries phrasing children as its label, the editor flattens them to plain text (see [not-yet-implemented.md](../not-yet-implemented.md)).

## The toolbar

[`markdown-toolbar.tsx`](../../src/renderer/components/markdown/markdown-toolbar.tsx) draws only the affordances the field's features enable.

- **A button for an inline format is a `Toggle`**, pressed while that format is on at the cursor or over the selection. ci gives a pressed button the muted surface and a 1 px ring in the input color, so it is never color alone, and the toggle carries `aria-pressed`. The four are strong, emphasis, inline code and strikethrough. A button that inserts something or changes a block, such as Heading or Table, is a plain button with no pressed state, because it is not a two-state thing. Both kinds are the same square, since ci gives every button of the bar one size.
- **Which formats are on comes from ProseMirror**, through [`plugins/mark-formats.ts`](../../src/renderer/components/markdown/plugins/mark-formats.ts): a `$prose` plugin whose view reports the active marks whenever that answer changes. It compares the reading rather than the document and the selection, because turning a format on at a collapsed cursor changes neither of those, only the marks the next typed text takes. It is handed the field's features, since a format the field disallows registers no mark schema and so has no mark type to ask about. Each format's mark type comes from its own Milkdown schema export, so no mark name is written out a second time.
- **Every button runs on click and prevents the default of the mouse press before it.** The click is what the keyboard reaches, and the prevented mouse press is what keeps the editor's own selection while the pointer goes to the toolbar.

## What the field tells the editor

The markdown field's control props reach the editable element through ProseMirror's `attributes` prop, which Milkdown takes in `editorViewOptionsCtx`, so nothing reaches into the `contenteditable` by hand:

- `role="textbox"` with `aria-multiline`, which is what makes `aria-required` and `aria-invalid` allowed there, plus the field's `id`, its `aria-label` and its `aria-describedby`. The element that takes focus is therefore the one a screen reader reads the field's name, its rules, its description and its error from, which is why the markdown module answers `acceptsAriaRequired` with yes. A message of the editor's own is named in front of the field's parts, and a Value the editor could not read adds `aria-readonly` and a `tabindex` with it.
- `attributes` is handed as a function over a ref, so a render never leaves a stale value behind. ProseMirror only recomputes it on a state update, so the editor also asks for one with `view.setProps({})` whenever the props change, which is what puts an error on the element that was not typed into.

## The editor component

[`markdown-editor.tsx`](../../src/renderer/components/markdown/markdown-editor.tsx) is uncontrolled-with-synchronization:

- Edits flow out through the debounced `updated` listener plus a `blur` flush, so the form always holds the final tree before a submit button click lands. Both are held until the editor has taken a Value in, so a Value it could not read is never answered with the empty box in its place, see [when a stored Value cannot be read](#when-a-stored-value-cannot-be-read).
- An external value change (for example the update route's async `form.reset`) is detected by comparing against the last tree the editor emitted itself, and re-hydrates the document without touching the undo history (`addToHistory: false`, which also keeps the listener from echoing it back).
- Validation comes for free: the entry form's generated schema (`getCreateEntrySchemaFromFieldDefinitions`) validates the tree against the field's features, min/max block counts and `ofCollections`.

## Security note

Core does **not** sanitize `rawHtml` content. The editor itself renders html nodes as inert atoms (not via `innerHTML`), but any future preview or rendering path in the client must sanitize raw HTML before displaying it.

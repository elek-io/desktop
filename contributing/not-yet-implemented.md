# Not Yet Implemented

A running list of things `@elek-io/core` already supports but the client has no working UI for yet. The goal is to make the gap visible and to give whoever picks it up a head start.

When you find a Core capability that the client cannot use yet (a field type with no form, an option Core validates but no input exposes, a value shape the renderer cannot draw), add an entry here. Keep each entry short and include:

- **Core support** - what Core provides (schema, type, or function).
- **Client today** - what the client does instead, including any crash or silent fallback.
- **Where to start** - the files and functions a contributor would touch first.
- **Notes** - gotchas, product decisions, or links.

Remove an entry once the feature works end to end.

## Field types

Core's `fieldTypeSchema` defines 18 field types. The client implements a subset.

- **Working end to end** (17): `text`, `textarea`, `number`, `range`, `toggle`, `asset`, `entry`, `date`, `datetime`, `time`, `email`, `url`, `telephone`, `ipv4`, `select`, `slug`, `markdown`.
- **Not yet implemented** (1): `dynamic`. It is shown **disabled** in the "Add Field" picker so it cannot be authored, and any that still reaches the client (through Core, the API, or a migration) renders as a muted placeholder instead of crashing (see [Rendering unsupported field types](#rendering-unsupported-field-types)).

Two things are the source of truth for "what is implemented", one per side (authoring and rendering). Keep them current when adding a type:

- `FIELD_DEFINITION_REGISTRY` in [`field-definition-registry.tsx`](../src/renderer/components/forms/field-definition-registry.tsx) - the exhaustive `Record<FieldType, ...>` of authoring forms. A type that cannot be authored yet still needs an entry (a short note) plus a listing in `unauthorableFieldTypes` beside it, which is what disables it in the "Add Field" picker.
- `RENDER_REGISTRY` in [`ui/form.tsx`](../src/renderer/components/ui/form.tsx) - the exhaustive `Record<FieldType, RenderSpec>` of leaf inputs `FormComponentFromFieldDefinition` can draw. A type that cannot be rendered yet still needs an entry (`dynamic` draws the muted placeholder and is marked `translatable: false`).

### What the missing type needs

- **Core support**: `dynamicFieldDefinitionSchema` (`valueType: 'component'`, `ofComponents` referencing Component ids, min/max item counts) and the Component object type (`componentFileSchema`, `makeComponentsContext`, `resolveOfComponents`). A dynamic Value's content is a flat array of `ComponentItem`s, not a per-language record.
- **Client today**: the client has no Components support at all - no queries, no IPC surface, no routes, no CRUD UI. A dynamic field is disabled in the picker and renders the muted placeholder. `defaultEntryValue()` ([`lib/entry.ts`](../src/renderer/lib/entry.ts)) still throws for `valueType: 'component'`, so an entry form for a Collection that already contains a dynamic field (via Core or the API) crashes.
- **Where to start**: Components come first - list/read queries plus routes and CRUD UI, mirroring how Collections are wired. Then the dynamic definition form (an `ofComponents` picker) and a polymorphic block editor in the entry form. Note the `TranslatableField` wrapper in [`ui/form.tsx`](../src/renderer/components/ui/form.tsx) assumes per-language content and does not fit dynamic Values, which is why the `dynamic` `RenderSpec` is `translatable: false`.

### To implement a type

Authoring and rendering are two independent sides; a type can gain one before the other.

1. **Authoring**: add a `DefinitionSpec` for the type. A trivial scalar is pure data (resolver + `makeDefaults` + optional `Extras`) added in [`field-definition-registry.tsx`](../src/renderer/components/forms/field-definition-registry.tsx); a complex type gets its own `<type>-field-definition.tsx`. Register it in `FIELD_DEFINITION_REGISTRY` (an exhaustive `Record<FieldType, ...>`, so it will not compile until you do) and remove it from `unauthorableFieldTypes` so the picker enables it.
2. **Rendering**: add a `RenderSpec` entry (a `renderInput` leaf plus `translatable`) to `RENDER_REGISTRY` in [`ui/form.tsx`](../src/renderer/components/ui/form.tsx). The exhaustive `Record<FieldType, RenderSpec>` will not compile until you do.
3. Confirm Core's `fieldTypeSchema` includes it.

### Rendering unsupported field types

`RENDER_REGISTRY` ([`ui/form.tsx`](../src/renderer/components/ui/form.tsx)) is exhaustive over `FieldType`, and the `dynamic` entry draws a muted "can't be displayed yet" placeholder. So rendering a not-yet-renderable field (from Core, the API, or a migration) in the collection editor or a diff does not crash. The entry create and update forms are the exception: they seed defaults through `defaultEntryValue` ([`lib/entry.ts`](../src/renderer/lib/entry.ts)), which throws for a value type it does not build, so a Collection carrying an unsupported field still fails to initialize its entry form. That failure reaches the error boundary rather than degrading in place. The actual renderer components are still missing (see above).

## Field definition editing

- **Core support**: `CollectionService.update` accepts any valid `fieldDefinitions` array, so definitions can be changed after creation at the data level.
- **Client today**: definitions are add-only. The Edit pencil button `FormFieldFromDefinition` renders in the collection editor has no `onClick` ([`ui/form.tsx`](../src/renderer/components/ui/form.tsx)), and the per-type definition forms have no update mode. Only adding, reordering (drag) and deleting work.
- **Where to start**: wire the Edit button to open the sheet with the matching per-type form hydrated from the existing definition, and replace via the field array on submit.
- **Notes**: `select` (options lists) and `markdown` (feature toggles) raise the priority - those are the definitions users will want to revise. Editing also raises data questions Core should answer first, like what happens to stored Values referencing a removed select option.

## Markdown: v1 simplifications

- **Definition `defaultValue` stays null**: Core allows a default mdast tree applied to every language of a new Entry, but the definition form does not offer an editor for it. Authoring one would couple a mounted editor to the feature toggles being edited in the same form, and definitions cannot be edited afterwards anyway (see [Field definition editing](#field-definition-editing)).
- **Entry reference labels flatten to plain text**: Core's `entryReference` node carries phrasing children, the editor stores them as a single text child. Rich formatting inside a reference label (authored via the API) is flattened to plain text when such content is edited.
- **Deep validation errors show without detail**: min/max block counts and feature violations surface as a message under the field, but zod issues addressed at nested tree paths may only mark the field invalid without a per-node explanation.

See [`renderer/markdown-editor.md`](./renderer/markdown-editor.md) for the editor's architecture.

## Field definition groups: authoring

- **Core support**: `fieldDefinitionGroupSchema` and `FieldDefinitionOrGroup`. Groups can be created, nested members added, and reordered at the data level.
- **Client today**: groups are display only. The entry form and collection editor render existing groups as a `FieldSet`, but there is no UI to create a group, move fields into or out of one, or reorder groups.
- **Where to start**: the state layer is already in place. `collection-form.tsx` binds `fieldDefinitions` as a single `Controller`-bound `FieldDefinitionOrGroup[]` value, edited through typed `appendDefinition` / `removeDefinition` / `moveDefinition` helpers, which replaced the opaque `{ id }` rows that did not scale to authoring. Group authoring means adding helpers alongside those (create a group, move a definition into or out of one) and the UI to drive them. Do not move the array out to a `useReducer` outside react-hook-form: it would sit outside the resolver, so the Collection schema's refinements would not run and `formState.isDirty` would not flip. See [`forms.md`](./renderer/forms.md#why-it-is-built-this-way) and [`dynamic-form-field-generation.md`](./renderer/dynamic-form-field-generation.md).

## Entry table: value columns render empty

- **Client today**: `EntryTable` ([`entry-table.tsx`](../src/renderer/components/entry-table.tsx)) computes a display value per field slug but the value columns define no `cell` renderer, so those cells render empty. Only the fixed columns show data.
- **Where to start**: add a `cell` renderer per column that formats the value by field type (text, reference count, toggle, date).

## Range field: fixed step

- **Core support**: pending. The range field has `min` and `max` but no `step`.
- **Client today**: `FormComponentFromFieldDefinition` hardcodes `step={1}` with a `@todo`.
- **Where to start**: add `step` to Core's range field definition first, then expose it in the range definition form and pass it through.

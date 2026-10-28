# Not Yet Implemented

A running list of things `@elek-io/core` already supports but the client has no working UI for yet. The goal is to make the gap visible and to give whoever picks it up a head start.

When you find a Core capability that the client cannot use yet (a field type with no form, an option Core validates but no input exposes, a value shape the renderer cannot draw), add an entry here. Keep each entry short and include:

- **Core support** - what Core provides (schema, type, or function).
- **Client today** - what the client does instead, including any crash or silent fallback.
- **Where to start** - the files and functions a contributor would touch first.
- **Notes** - gotchas, product decisions, or links.

Remove an entry once the feature works end to end.

## Reporting a bug or feedback to Cloud

The Desktop and Core halves are both done. The dialog, both forms, the header
button, the error boundary's "Report this problem", the IPC channel
`core:cloud:reports:create` and `core.cloud.reports.create()` all work, and
[`tests/specs/reports.spec.ts`](../tests/specs/reports.spec.ts) drives a real
send end to end. What is left is on the other side of the wire.

- **Core support**: complete. See
  [`reporting.md`](../node_modules/@elek-io/core/docs/reporting.md) in the Core
  package for the contract, what a log tail holds, and the error mapping.
- **Cloud support**: dev only. `POST /management/v1/reports` is live on
  `https://api.dev.elek.io`, which every build except a release talks to (see
  [Which elek.io Cloud a build talks to](./build-and-packaging.md#which-elekio-cloud-a-build-talks-to)),
  so `pnpm dev` shows the success path. Production, `https://api.elek.io`, is
  not up yet. Until it is, every send from a release build fails as
  `PreconditionFailed`, which is the failure the dialog is built to survive:
  the alert appears and the user's text stays.
- **Where to start**: bring the endpoint up on production against
  `reportRequestSchema`, answering `reportResponseSchema` (`201 { id }`). No
  Desktop change follows, and this entry goes away.

Two things about the endpoint, since they are decisions rather than details:

- **No credential today.** Core holds no Cloud session, and requiring an account
  would leave the button dead for the whole alpha, which is exactly when the
  feedback matters. Rate limit per IP. Everything in the body is self-declared:
  whether a sender is who they claim is a question a credential answers, never a
  question the body answers, which is why there is no `isVerified` field to set.
- **When Cloud sign-in lands**, the same endpoint accepts
  `Authorization: Bearer <session>`. A request either carries a session or it
  does not, so nothing in the body changes and neither does Desktop.

Caps are 5000 characters of message and 2 MB of total body, both of which Core
enforces before sending.

## Preview Releases

A full Release works end to end. The Releases page, the Release dialog, the IPC
channels `core:releases:list`, `core:releases:prepare` and
`core:releases:create` and
[`tests/specs/releases.spec.ts`](../tests/specs/releases.spec.ts) cut one
through the UI against a local bare remote. A preview Release does not.

- **Core support**: `core.releases.createPreview()`. It tags a pre-release
  snapshot such as `1.1.0-preview.3` on `draft` and pushes `draft` and the tag,
  without promoting anything into `main`. See
  [`releases.md`](../node_modules/@elek-io/core/docs/releases.md) in the Core
  package.
- **Client today**: no UI and no `core:releases:createPreview` channel. A
  preview made elsewhere does show in the Releases list, marked Preview, so it
  is never read as the version a site builds from.
- **Where to start**: a second outcome in the Release dialog or a control of its
  own, plus the channel in [`index.d.ts`](../src/index.d.ts), the preload bridge
  and the main process channel map. What a preview is for in elek.io Desktop is
  undecided, so the product question comes before the code.

## Field types

Core's `fieldTypeSchema` defines 18 field types, and all 18 work end to end:
`text`, `textarea`, `number`, `range`, `toggle`, `asset`, `entry`, `date`,
`datetime`, `time`, `email`, `url`, `telephone`, `ipv4`, `select`, `slug`,
`markdown` and `dynamic`.

Two things are the source of truth for "what is implemented", one per side (authoring and rendering). Keep them current when adding a type:

- `FIELD_DEFINITION_REGISTRY` in [`field-definition-registry.tsx`](../src/renderer/components/forms/field-definition-registry.tsx) - the exhaustive `Record<FieldType, ...>` of authoring forms. A type that cannot be authored yet still needs an entry (a short note) plus a listing in `unauthorableFieldTypes` beside it, which is what disables it in the "Add Field" picker. That set is empty today.
- `RENDER_REGISTRY` in [`ui/form.tsx`](../src/renderer/components/ui/form.tsx) - the exhaustive `Record<FieldType, RenderSpec>` of leaf inputs `FormComponentFromFieldDefinition` can draw. A type that cannot be rendered yet still needs an entry.

### To implement a type

Authoring and rendering are two independent sides; a type can gain one before the other.

1. **Authoring**: add a `DefinitionSpec` for the type. A trivial scalar is pure data (resolver + `makeDefaults` + optional `Extras`) added in [`field-definition-registry.tsx`](../src/renderer/components/forms/field-definition-registry.tsx); a complex type gets its own `<type>-field-definition.tsx`. Register it in `FIELD_DEFINITION_REGISTRY` (an exhaustive `Record<FieldType, ...>`, so it will not compile until you do) and remove it from `unauthorableFieldTypes` so the picker enables it.
2. **Rendering**: add a `RenderSpec` entry (a `renderInput` leaf plus `translatable`) to `RENDER_REGISTRY` in [`ui/form.tsx`](../src/renderer/components/ui/form.tsx). The exhaustive `Record<FieldType, RenderSpec>` will not compile until you do.
3. Confirm Core's `fieldTypeSchema` includes it.
4. If the type brings a `valueType` Core did not have before, add a default Value for it in `defaultEntryValue` ([`lib/entry.ts`](../src/renderer/lib/entry.ts)), which the entry create and update forms seed from. Nothing fails to compile for a missing one, unlike the two registries above: the function's `default` branch throws instead, and that throw reaches the root error boundary when the form initializes. Most field types bring no new `valueType`, so this step is usually nothing.

## Field definition editing

- **Core support**: `CollectionService.update` accepts any valid `fieldDefinitions` array, except a change that deletes stored content. Removing a field definition Entries hold Values for, and narrowing a `dynamic` field's `ofComponents` or an `entry` field's `ofCollections`, are refused with a `Conflict` until the same update is sent again carrying `acceptedContentLoss` (see Core's [schema-changes doc](../node_modules/@elek-io/core/docs/schema-changes.md)). Everything else can be changed after creation at the data level.
- **Client today**: one part of one definition can be edited, and the rest is add-only, for a Collection and for a Component alike.
  - **Editable**: which Components a `dynamic` field allows, and only by allowing more. The Edit button on such a field opens [`allow-components-sheet.tsx`](../src/renderer/components/forms/allow-components-sheet.tsx), which offers the Components the field does not allow yet, lists the ones it does, and hands the definition back with its id and everything else untouched. A field whose `ofComponents` is empty already allows every Component of the Project, so it offers nothing to add: switching one on would narrow the field to that one, which is a content loss. Growing is the one change that costs nothing, since Core strips no Component item.
  - **Add-only**: everything else. No other field type carries an Edit button at all, and the per-type definition forms have no update mode, so a label, a slug, a type, a bound or an option list is fixed once the field is added. Only adding, reordering (by dragging or with the Move up / Move down buttons) and deleting work, and a delete only while it drops no stored Value. The editor's section description says all of this on the screen, so an editor learns it before building a field with a typo in it. The client sends no `acceptedContentLoss`, so Core's refusal surfaces through the save-blocked dialog (see [`error-handling.md`](./error-handling.md)) and nothing is written. Accepting a loss needs a dialog that first shows what would go, which is not built yet.
- **Where to start**: give the per-type definition forms an update mode, hydrated from the existing definition, and replace through the editor's `replaceDefinition` helper on submit, which the grow sheet already uses. Taking an allowed Component away waits for the dialog that shows what would go first.
- **Notes**: `select` (options lists) and `markdown` (feature toggles) raise the priority - those are the definitions users will want to revise. Editing also raises data questions Core should answer first, like what happens to stored Values referencing a removed select option.

## Markdown: v1 simplifications

- **Definition `defaultValue` stays null**: Core allows a default mdast tree applied to every language of a new Entry, but the definition form does not offer an editor for it. Authoring one would couple a mounted editor to the feature toggles being edited in the same form, and a markdown definition cannot be edited afterwards anyway (see [Field definition editing](#field-definition-editing)).
- **Entry reference labels flatten to plain text**: Core's `entryReference` node carries phrasing children, the editor stores them as a single text child. Rich formatting inside a reference label (authored via the API) is flattened to plain text when such content is edited.
- **Deep validation errors show without detail**: min/max block counts and feature violations surface as a message under the field, but zod issues addressed at nested tree paths may only mark the field invalid without a per-node explanation.

See [`renderer/markdown-editor.md`](./renderer/markdown-editor.md) for the editor's architecture.

## Field definition groups: authoring

- **Core support**: `fieldDefinitionGroupSchema` and `FieldDefinitionOrGroup`. Groups can be created, nested members added, and reordered at the data level.
- **Client today**: groups are display only. The entry form and collection editor render existing groups as a `FieldSet`, but there is no UI to create a group, move fields into or out of one, or reorder groups.
- **Where to start**: the state layer is already in place. `field-definitions-editor.tsx` binds `fieldDefinitions` as a single `Controller`-bound `FieldDefinitionOrGroup[]` value, edited through typed `appendDefinition` / `removeDefinition` / `moveDefinition` helpers, which replaced the opaque `{ id }` rows that did not scale to authoring. Group authoring means adding helpers alongside those (create a group, move a definition into or out of one) and the UI to drive them. Only a Collection takes a group at all, since Core's `componentFileSchema` holds a flat `FieldDefinition[]`. Do not move the array out to a `useReducer` outside react-hook-form: it would sit outside the resolver, so the Collection schema's refinements would not run and `formState.isDirty` would not flip. See [`forms.md`](./renderer/forms.md#why-it-is-built-this-way) and [`dynamic-form-field-generation.md`](./renderer/dynamic-form-field-generation.md).

## Entry table: value columns render empty

- **Client today**: `EntryTable` ([`entry-table.tsx`](../src/renderer/components/entry-table.tsx)) computes a display value per field slug but the value columns define no `cell` renderer, so those cells render empty. Only the fixed columns show data.
- **Where to start**: add a `cell` renderer per column that formats the value by field type (text, reference count, toggle, date).

## Range field: fixed step

- **Core support**: pending. The range field has `min` and `max` but no `step`.
- **Client today**: `FormComponentFromFieldDefinition` hardcodes `step={1}` with a `@todo`.
- **Where to start**: add `step` to Core's range field definition first, then expose it in the range definition form and pass it through.

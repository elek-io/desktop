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
button, the error screen's Report an issue, the IPC channel
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
channels `core:releases:list`, `core:releases:changes`, `core:releases:prepare`
and `core:releases:create` and
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

One thing is the source of truth for "what is implemented": the registry in [`fields/index.ts`](../src/renderer/components/fields/index.ts), a mapped type over Core's `FieldType`. A field type Core adds fails to compile until it has a folder of its own, and the message names the types whose folder is missing.

### To implement a type

1. Add a folder under [`components/fields/`](../src/renderer/components/fields/) and a module that implements `FieldTypeModule` for the type, see [dynamic-form-field-generation.md](./renderer/dynamic-form-field-generation.md). The contract itself is the compile error: every member has to be answered, so a type cannot be half built by accident.
2. Register the module in `fields/index.ts`, without which nothing compiles.
3. Confirm Core's `fieldTypeSchema` includes it.
4. Every type Core defines can be built and changed in a Collection's settings, since the registry is a mapped type over Core's `FieldType` and a type without a folder fails to compile.

## Filling in the Value a Component field change needs

- **Core support**: `CollectionService.update` and `ComponentService.update` accept any valid `fieldDefinitions` array, except a change that leaves an Entry without a Value it now needs or deletes a Value it holds. Each of those is refused with a `Conflict` that names every Entry at once, and the same update goes through once it carries `resolutions` for the Entries that need a Value and `acceptedContentLoss` for the field definitions whose Values would go (see Core's [schema-changes doc](../node_modules/@elek-io/core/docs/schema-changes.md)). A `components.update` resolution is keyed by the Entry, then the Component item, then the field's new slug, and Core applies it to the item the issue names, at any depth.
- **Client today**: a Collection's field change is settled in the dialog of a refused change ([`refused-change-dialog.tsx`](../src/renderer/components/refused-change-dialog.tsx)): it says what the save would delete, takes the Values the change needs, and sends both back, see [error-handling.md](./error-handling.md#example-a-field-change-core-cannot-carry-out). A Component's is settled halfway. Its loss is accepted there the same way, and the Values its Entries need are written nowhere yet, in the dialog or in the Entry: the Entry's editor draws the fields the stored Component holds, and the refused change is the one that would add the field asking for a Value, so there is no control to fill it in. The dialog lists each Entry that needs one by its title, with a link to it, its section and its Collection, says that the Value cannot be filled in yet and what there is to do instead, which is to change the field until the sections are allowed as they are or to remove the section from the Entry, and its button waits until every one of them holds a Value.
- **Where to start**: `neededValuesWithFields` in the dialog, which keeps the rows a Value can be written in, and the `resolvable` prop the two routes pass it. A Component's row binds `resolutions.<entryId>.<componentItemId>.<fieldSlug>.content` rather than leaving the item id out, and says which item it is by its place, the way the rows of a loss already do.
- **Notes**: a `unique_collision` is shaped like the refusal a single Entry's save answers with, so one surface can read both.

## Markdown: v1 simplifications

- **Definition `defaultValue` stays null**: Core allows a default mdast tree applied to every language of a new Entry, but a markdown field's settings offer no editor for it. Authoring one would couple a mounted editor to the blocks being allowed in the same pane, and the recursive tree is deeper than react-hook-form's path type walks, so it is left out of the keys those settings can bind.
- **Entry reference labels flatten to plain text**: Core's `entryReference` node carries phrasing children, the editor stores them as a single text child. Rich formatting inside a reference label (authored via the API) is flattened to plain text when such content is edited.
- **Deep validation errors show without detail**: min/max block counts and feature violations surface as a message under the field, but zod issues addressed at nested tree paths may only mark the field invalid without a per-node explanation.

See [`renderer/markdown-editor.md`](./renderer/markdown-editor.md) for the editor's architecture.

## Field definition groups: authoring

- **Core support**: `fieldDefinitionGroupSchema` and `FieldDefinitionOrGroup`. Groups can be created, nested members added, and reordered at the data level.
- **Client today**: groups are display only. The entry form and collection editor render existing groups as a `FieldSet`, but there is no UI to create a group, move fields into or out of one, or reorder groups.
- **Where to start**: the state layer is already in place. `useDefinitionsEditor` binds `fieldDefinitions` as a single `Controller`-bound `FieldDefinitionOrGroup[]` value, edited through typed `add` / `changeType` / `remove` / `move` helpers, which replaced the opaque `{ id }` rows that did not scale to authoring. Group authoring means adding helpers alongside those (create a group, move a definition into or out of one) and the UI to drive them. Only a Collection takes a group at all, since Core's `componentFileSchema` holds a flat `FieldDefinition[]`. Do not move the array out to a `useReducer` outside react-hook-form: it would sit outside the resolver, so the Collection schema's refinements would not run and `formState.isDirty` would not flip. See [`forms.md`](./renderer/forms.md#why-it-is-built-this-way) and [`dynamic-form-field-generation.md`](./renderer/dynamic-form-field-generation.md).

## A Collection's icon

- **Core support**: `supportedIconSchema` takes any icon name in Lucide's spelling, at most 64 characters, and Core holds no list of Lucide's own names.
- **Client today**: nothing offers it and nothing draws it. A Collection is stored with the one name in `DEFAULT_COLLECTION_ICON` ([`lib/collectionIcons.ts`](../src/renderer/lib/collectionIcons.ts)), a Collection that already holds another name keeps it, and every Collection shows the same icon in the sidebar. ci's settings page draws no icon field, so the settings offer none rather than offering a choice nothing reads.
- **Where to start**: a picker over Lucide's own catalog, which `lucide-react` already ships, and the chosen icon drawn where a Collection is named. Both halves belong to one change: a choice nothing draws is worth nothing.

## Range field: fixed step

- **Core support**: pending. The range field has `min` and `max` but no `step`.
- **Client today**: the range control steps by one.
- **Where to start**: add `step` to Core's range field definition first, then expose it in the range field's own settings and pass it through.

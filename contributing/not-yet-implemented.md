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
- **Since Desktop signs in**, Core sends a signed in person's report with
  `Authorization: Bearer <session>`. A request either carries a session or it
  does not, so nothing in the body changed and neither did the report dialog.
  A report with a session that ended is answered 401, which also pauses sync,
  see [Signing in to elek.io Cloud](./cloud-account.md#what-the-renderer-sees).

Caps are 5000 characters of message and 2 MB of total body, both of which Core
enforces before sending.

## elek.io Cloud in Desktop

Signing in, signing up, signing out and a session that ended work end to end,
see [Signing in to elek.io Cloud](./cloud-account.md). What the designs in the
`ci` repository's `docs/desktop.md` add on top waits for Core or for Cloud.

### Codes and a new password

- **Core support**: none yet. elek.io Cloud sends no code, and Core has no call
  to confirm an address with one, send it again, or reset a password.
- **Client today**: placeholders without a function, as Nils decided on
  2026-10-19. "Forgot your password?" stands disabled on Sign in and Sign in
  again, and Create account's Email address says "You get a code there to
  confirm it." A sign up answering `verification` and a sign in answering
  `Conflict` say this version of Desktop can't confirm an address.
- **Where to start**: `ForgotPasswordLink`, `failureCopy` and the `@todo`s in
  [`cloud-account-forms.tsx`](../src/renderer/components/cloud-account-forms.tsx).
  The code step and Reset password are designed in `ci`'s `docs/desktop.md`
  under Signing in, with mockups at `?page=account&step=code`, `reset` and
  `reset-code`.

### The wait after too many attempts

- **Core support**: `RateLimited` carries no `Retry-After` yet.
- **Client today**: the button waits a fixed 10 seconds,
  `RATE_LIMIT_WAIT_SECONDS` in
  [`cloud-account-forms.tsx`](../src/renderer/components/cloud-account-forms.tsx).
- **Where to start**: count down what Cloud sends once Core passes it on.

### Projects on elek.io Cloud

- **Core support**: pending. The calls that list, create, move and download
  Projects on elek.io Cloud, and an organization's step, are not released.
- **Client today**: none of it. The Projects page is one grid, Create Project
  keeps Projects on this computer, and the Clone dialog takes a Git address.
  "Sync paused" shows in the header only, since Desktop cannot tell which
  Projects are on elek.io Cloud. The Welcome line for a signed in person, the
  card listing what they can download, is not built either.
- **Where to start**: `ci`'s `docs/desktop.md` under Screens and Sync, and
  `plans/desktop-cloud.md` for what is still open there.

### git to elek.io Cloud's hosts

- **Core support**: pending. Core's credential helper comes in a later release
  with dugite 3.2.3. It runs Desktop's own binary with `ELECTRON_RUN_AS_NODE=1`.
- **Client today**: git reaches only remotes the machine can already reach.
- **Notes**: keep Electron's `RunAsNode` fuse on, see
  [build-and-packaging.md](./build-and-packaging.md#electron-fuses).

### A Release

- **Core support**: `core.releases`. Since Core 0.25 a Release refuses a `draft`
  that lacks the remote's commits, and pushes `main`, `draft` and its tag in one
  atomic push without a fallback.
- **Client today**: no Release UI and no `core:releases:*` channel.
- **Where to start**: when a Release lands, synchronize first whenever the
  Project has a remote, so the version and the changes it shows are what gets
  released. `ci`'s `plans/desktop-cloud.md` proposes doing that when the
  Release dialog opens.

### The Terms of Service and the Privacy Policy

- **Client today**: the sign up notice links to `https://elek.io/terms` and
  `https://elek.io/privacy`, which answer 404 until the website has them.
- **Where to start**: nothing in Desktop, unless the addresses change.

### Renaming the account

- **Client today**: a cloud User's name and address are read-only on the
  profile. Whether Desktop may rename the account is an open question in
  Cloud's plans.

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

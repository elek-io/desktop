# Dynamic Form Field Generation

## Overview

Static forms with predefined fields are straightforward to implement. However, elek.io allows users to define their own content structures through Collections, which means forms must be generated dynamically based on user-defined schemas.

**Why Dynamic Forms?**

Users need the flexibility to create custom content types without modifying code. For example:

- A blog might need: title (text), content (textarea), published (boolean)
- A product catalog might need: name (text), price (number), inStock (boolean), images (file)
- An event calendar might need: title (text), date (date), location (text)

We can't hardcode these forms since they are user-defined, instead we use **field definitions** to describe each field's properties, allowing the UI to render appropriate form controls dynamically.

## Before you start

This document covers the layer that is specific to user-defined fields: field definitions, the two registries keyed on Core's `FieldType`, and how an Entry form is rendered from them.

The shared form layer that every form in the app uses is in [forms.md](./forms.md): `AppForm` and `SubmitButton`, detached submit buttons, view-only mode, `useAppMutation`, form typing, and the typed field wrappers with their value contracts. **Read its [form invariants](./forms.md#form-invariants) first.** Two of the five are about the registries below, and each is enforced by a compile error, a lint error or a test, so breaking one fails CI.

## Field Definitions

A field definition is a JSON object that contains all necessary information to render and validate a form field.

**Example field definition for a blog post title:**

```typescript
{
  id: '467e57ea-e04a-44a7-b34b-684ed3ba6f49',
  slug: 'title',              // Unique key used as the field's name in an Entry
  valueType: 'string',        // Data type for validation
  fieldType: 'text',          // UI component to render
  label: {                    // Label with translations
    en: 'Title',
    de: 'Titel',
  },
  description: {              // Description with translations
    en: 'A short title for the Entry',
    de: 'Ein kurzer Titel für den Eintrag',
  },
  min: null,                  // Min length (text) or numeric bound (number/range)
  max: 100,                   // Max length or numeric bound
  defaultValue: null,         // Default value when creating a new Entry
  inputWidth: '12',           // Grid column width, one of '3' | '4' | '6' | '12'
  isDisabled: false,          // Whether field is read-only
  isRequired: true,           // Whether field must be filled
  isUnique: false,            // Whether value must be unique across Entries
}
```

**Key Properties:**

Depending on the field type, definitions may include different properties, but common ones are:

- `id`: Unique identifier for this field
- `slug`: Unique, machine-readable key used as the field's name within an Entry
- `valueType`: The underlying data type (`string`, `number`, `boolean`, `reference`, etc.) - used for validation
- `fieldType`: The UI component type (`text`, `textarea`, `number`, `toggle`, `date`, `asset`, etc.)
- `label` / `description`: Translatable strings for multiple languages that help users understand the field's purpose
- `min` / `max`: Validation constraints (character length for text fields, numeric bounds for `number` and `range` fields)
- `isRequired`: Whether the field must have a value
- `inputWidth`: Grid column width, one of `'3'`, `'4'`, `'6'` or `'12'` (a 12-column grid)

## Field definition groups

A Collection's `fieldDefinitions` is a `FieldDefinitionOrGroup[]`. Besides plain field definitions it can contain presentational **groups**: `{ isGroup: true, label, description, fieldDefinitions }`, where the nested `fieldDefinitions` is a flat list of member field definitions (groups do not nest).

Groups are rendered, not authored, in the client today. Wherever field definitions are shown to a user (the entry form and the collection editor) a group is rendered as a labeled `FieldSet` ([`components/ui/field.tsx`](../../src/renderer/components/ui/field.tsx)) that wraps its members. Narrow the union with `'isGroup' in fieldDefinition`.

Where grouping carries no meaning - generating an Entry's Zod schema, the create-Entry defaults, and the Entry table columns - flatten the union first with Core's `flattenFieldDefinitions(fieldDefinitions)`, which drops the groups and hoists their members into a flat `FieldDefinition[]`.

## Creating Field Definitions via a Collection

When users create or update a Collection, they use a visual editor to define the fields for that Collection type.

**Location:** Collection forms are in [`components/forms/collection-form.tsx`](../../src/renderer/components/forms/collection-form.tsx) and used in routes like [`routes/projects/$projectId/collections/create.tsx`](../../src/renderer/routes/projects/$projectId/collections/create.tsx) and [`routes/projects/$projectId/collections/$collectionId/update.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/update.tsx)

**Features:**

- Add, remove, and reorder fields via drag-and-drop
- Select field type (text, textarea, number, toggle, date, asset, entry, etc.)
- Set labels and descriptions with multi-language support
- Configure validation rules (min/max length, required, unique)
- Set default values and input width
- Preview how the form will look to content editors

### Field Definition Form Architecture

Field-definition authoring is driven by a **registry** keyed on Core's `FieldType`, not a per-type form file plus a central dispatcher. One `AppForm` is mounted for the field type being added, and submission is native through a detached `SubmitButton` (`form={id}`), not an imperative ref. The pieces:

- **`FIELD_DEFINITION_REGISTRY`** ([`forms/field-definition-registry.tsx`](../../src/renderer/components/forms/field-definition-registry.tsx)) is the table: an exhaustive `Record<FieldType, (props) => ReactElement>`. Because it is exhaustive, adding a field type to Core is a compile error here until it has an entry. The trivial scalar types (`text`, `textarea`, `number`, `toggle`, `email`, `date`, `datetime`, `time`, `url`, `telephone`, `ipv4`, `range`) are pure data: each is a `DefinitionSpec` (the Core schema that validates it, a fresh draft via `makeDefaults`, and an optional `Extras` for the type-specific controls) rendered through the shared `DefinitionDraft`. The complex types (`select`, `slug`, `asset`, `entry`, `markdown`) live in their own `<type>-field-definition.tsx` file, referenced from the table. `dynamic` cannot be authored yet: its entry renders a short note, and it is listed in `unauthorableFieldTypes` next to the registry, which is what the picker uses to disable it.
- **`DefinitionDraft`** ([`forms/field-definition-draft.tsx`](../../src/renderer/components/forms/field-definition-draft.tsx)) is the shared engine. Given a `DefinitionSpec` it builds one real `AppForm`: it calls `useForm()` with the spec's resolver and defaults, rejects duplicate slugs, wraps `DefaultFieldDefinitionForm`, and renders the spec's `Extras` as children. This replaces the per-type wrapper file and its dedicated `useForm` instance, so there is one live form, remounted when the picker changes type, not 18 always-mounted ones. Its value-typed helpers (`DefaultValueInputField`, `MinMaxRow`) let a spec's `Extras` compose the common controls without a bespoke file.
- **`DefaultFieldDefinitionForm`** ([`forms/default-field-definition-form.tsx`](../../src/renderer/components/forms/default-field-definition-form.tsx)) renders the fields every definition shares (label, slug, description, `inputWidth`, `isRequired`, `isUnique`, `isDisabled`) and takes the type-specific inputs as `children`. It also auto-generates the slug from the label until the user edits the slug manually.

### Writing a `DefinitionSpec`

A spec ([`field-definition-draft.tsx`](../../src/renderer/components/forms/field-definition-draft.tsx)) is four things: the `authorableFieldType`, a `resolver` built from Core's per-type schema, a `makeDefaults` that returns a fresh draft, and an optional `Extras` component for the controls beyond the shared base. Three rules govern what may go in one.

**Type-specific context arrives through `DefinitionExtrasProps`, and it is shared.** Every `Extras` receives `form`, `currentLanguage`, `supportedLanguages` and the Collection's current `fieldDefinitions`, whether it needs them or not. Only `select` reads the languages (its option labels are translatable) and only `slug` reads the sibling definitions (to offer non-slug string fields as slug sources, whose real ids Core's `slugSourceReferencesSuperRefinement` then validates). When a new type needs context the others do not, widen this one shared type rather than branching in the shared base or the sheet.

**A type's data fetching lives inside its own `Extras`.** The `entry` spec's `ofCollections` picker is backed by a Collections list query, and both the query and its `projectId` hook stay in the `Extras` component. The shared engine never learns that a query exists, which is what keeps `DefinitionDraft` free of per-type knowledge.

**One spec may diverge between its form values and its resolver output.** `markdown` is the only case. Its recursive `defaultValue` mdast tree blows react-hook-form's path-type instantiation, and the form never edits it (v1 keeps markdown defaults null), so its form values pin `defaultValue` to null while the resolver still yields a full `MarkdownFieldDefinition`. That divergence is the single `as unknown as Resolver` cast in the authoring layer, and it lives at that one seam. Do not reach for it elsewhere.

One field type is special: Core backs `select` with two schemas, one for text options and one for number options. The select authoring file ([`select-field-definition.tsx`](../../src/renderer/components/forms/select-field-definition.tsx)) holds a `DefinitionSpec` for each variant (`stringSelect` / `numberSelect`) and a value-type picker that mounts the matching one. The shared base form receives the resolved variant as its `fieldType`, which is why that prop is the widened `AuthorableFieldType` instead of Core's `FieldType`.

The **Add Field sheet** ([`forms/add-field-sheet.tsx`](../../src/renderer/components/forms/add-field-sheet.tsx)) renders the field-type picker, looks the selected type up in the registry, renders that one entry in its body, and submits it with a single detached `SubmitButton` in its footer. `CollectionForm` ([`forms/collection-form.tsx`](../../src/renderer/components/forms/collection-form.tsx)) embeds `<AddFieldSheet>` and receives each new definition through an `onAppend` callback.

> [!NOTE]
> The type `Select` lists every Core `fieldType`. To add authoring for a new one, add a `DefinitionSpec` (and, for a complex type, a `<type>-field-definition.tsx` file), register it in `FIELD_DEFINITION_REGISTRY`, and remove it from `unauthorableFieldTypes`. The `Record<FieldType, ...>` type makes this non-optional: the registry does not compile until the new type has an entry. Confirm Core's `fieldTypeSchema` includes it.

## Rendering Dynamic Forms

When rendering a form to create or edit an Entry, we iterate over the Collection's field definitions and render appropriate form controls for each field.

**Location:** Entry forms are in [`components/forms/entry-form.tsx`](../../src/renderer/components/forms/entry-form.tsx) and used in routes like [`routes/projects/$projectId/collections/$collectionId/create.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/create.tsx) and [`routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx)

### Component Architecture

The dynamic form rendering system is built with layered components, each adding functionality:

#### Base UI Components and typed field wrappers

The base controls in [`components/ui/`](../../src/renderer/components/ui/) (**`Input`**, **`Textarea`**, **`Switch`**, **`Slider`**, **`Select`**) and the typed wrappers over them in [`components/ui/form.tsx`](../../src/renderer/components/ui/form.tsx) (`FormInputField`, `FormDatetimeField`, `FormSelectField` and the rest) are shared with every hand-written form, so they are documented in [forms.md](./forms.md#typed-field-wrappers-and-their-value-contracts) together with the value contracts they carry. Do not hand-roll a raw `<Input>` in a field renderer.

Two things about them matter specifically here:

- The leaf wrappers are **value-typed**: they receive the already-bound `field` (value/onChange/onBlur/ref) plus a `controlProps` bag (`id`, `aria-describedby`, `aria-invalid`, and `aria-required` on the controls that accept it) to place on the real input. They do not know or build a form path. The path lives at the single `Controller` in `FormFieldFromDefinition`, which is what lets one wrapper serve both a static form and a generated one.
- `FormSlugField` resolves its source ids through `useFieldDefinitions()` ([`hooks/useFieldDefinitions.ts`](../../src/renderer/hooks/useFieldDefinitions.ts)), provided by the `FieldDefinitionsProvider` ([`providers/FieldDefinitionsProvider.tsx`](../../src/renderer/providers/FieldDefinitionsProvider.tsx)) that `EntryForm` wraps its fields in. Outside of it (for example the Collection editor preview) the input is simply manual.

`TranslatableFormInputField` / `TranslatableFormTextareaField` are thin presets over the shared `TranslatableField` (see below) for the static string / textarea cases.

#### The render registry

Rendering is driven by a **registry** keyed on Core's `FieldType`, the RENDER facet that shares the `FieldType` spine with the authoring `FIELD_DEFINITION_REGISTRY`. It replaced the old 18-case switch, the hand-synced `renderableFieldTypes` set, and the three near-identical translatable wrappers. Everything below lives in [`components/ui/form.tsx`](../../src/renderer/components/ui/form.tsx).

- **`RENDER_REGISTRY`** is an exhaustive `Record<FieldType, RenderSpec>`. Because it is exhaustive, adding a field type to Core is a compile error here until it has an entry. Each `RenderSpec` has:
  - `renderInput(props)` - the value-typed leaf described above. It receives `{ field, fieldDefinition, disabled, controlProps }` and renders the matching typed wrapper.
  - `translatable` - whether the Value is per-language. Core stores every value type except `component` as a per-language record (see Core's `docs/fields.md`), so every rendered type is translatable; only the `dynamic` placeholder is not.

  The `dynamic` entry keeps the record exhaustive and draws the muted "can't be displayed yet" placeholder so a Collection carrying an unsupported type (via Core, the API, or a migration) does not crash (see [`not-yet-implemented.md`](../not-yet-implemented.md)).

- **`FormComponentFromFieldDefinition`** (internal) is now a one-line `RENDER_REGISTRY[fieldType].renderInput(...)` lookup.

- **The registry emits no native constraint attributes.** zod (through react-hook-form) is the only validator and the form is `noValidate`, so the leaves never set `required` / `min` / `max` / `minLength` / `maxLength`. The one exception is the range `Slider`'s `min` / `max`, which are its functional value domain, not HTML constraints. A test asserts a required field renders with no `required` attribute. Required-ness is still exposed to assistive tech, but through `aria-required` (an ARIA state, not a native constraint that could block submit), not native `required`: `FormComponentFromFieldDefinition` sets `aria-required` on the control for the string and number scalars plus select, the controls whose role accepts it (`ariaRequiredFor`). The range slider, toggle, reference and markdown fields do not accept it and convey required through their label.

- **`ControlledLeaf`** (internal) reads the surrounding `FormItem` / `FormField` ids through `useFormField` and hands them to the leaf as `controlProps`, so `id` and `aria-*` land on the real focusable input **by construction**. This replaced wrapping the leaf in a `<FormControl>` Radix `Slot`, which could only reach the leaf's outermost element - a wrapper `<div>` or a non-DOM Radix root for select and reference fields.

- **`TranslatableField`** (internal) is the single per-language wrapper. With one Project language it renders the leaf directly; with more it renders the leaf plus a dialog that edits every supported language. It owns the multi-field name convention (the name's last dot-segment is the language, so the sibling paths derive from it) and the `hasErrorsInTranslations` traversal that flags the dialog trigger when a hidden translation is invalid.

- **`FormFieldFromDefinition`** (exported, the entry point) owns the single `FormField` / `Controller` at `name` and composes the label (which marks optional fields with an "- optional" suffix; the control carries `aria-required` for the required state), the registry leaf (through `TranslatableField` when translatable), the description and the validation message. Use it when rendering an Entry's fields.

- **`FormFieldDefinitionPreview`** (exported) is the collection editor's non-editable preview. It draws the same label / leaf / description plus the drag / edit / delete chrome, but is **not** bound to a form: the leaf holds a static, disabled Value, so there are no phantom form paths and the label associates with a real (disabled) input (so the previews are addressable by `getByLabel`).

### Example Usage

```typescript
import { AppForm } from '@renderer/components/ui/app-form';
import { FormFieldFromDefinition } from '@renderer/components/ui/form';

// In your component (see entry-form.tsx):
const project = /* ... current Project ... */;
const collection = /* ... Collection with fieldDefinitions ... */;

// AppForm is the only place a <form> element is written (see forms.md).
return (
  <AppForm form={form} onSubmit={onSubmit} id={id}>
    {collection.fieldDefinitions.map((fieldDefinition) => (
      <FormFieldFromDefinition
        key={fieldDefinition.id}
        fieldDefinition={fieldDefinition}
        form={form}
        name={`values.${fieldDefinition.slug}.content.${project.settings.language.default}`}
        supportedLanguages={project.settings.language.supported}
      />
    ))}
  </AppForm>
);
```

`FormFieldFromDefinition` takes the form via the `form` prop (not `control`) and a required `name`: the path to the field's default-language content in the form values. The translatable dialog derives the other languages from this path, so the `name` must end in `.<language>`.

### Reference fields (asset and entry)

The `asset` and `entry` field types differ from scalar fields. Their `valueType` is `reference`, and their value is an array of references (`{ id, objectType }`), not a single value.

Their inputs fetch data from within the form. `FormAssetField` and `FormEntryField` (in [`form.tsx`](../../src/renderer/components/ui/form.tsx)) load the selectable Assets or Entries with TanStack Query (the entry field uses `useQueriesNoError` to load Entries across several Collections), render a selection UI, and enforce `fieldDefinition.max` directly in the UI (further selection is disabled once the limit is reached).

Their definition forms add type-specific options:

- The asset definition form ([`asset-field-definition.tsx`](../../src/renderer/components/forms/asset-field-definition.tsx)) exposes `min` / `max` (how many Assets may be selected) plus `ofAssetMimeTypes` through its spec's `Extras`.
- The entry definition form ([`entry-field-definition.tsx`](../../src/renderer/components/forms/entry-field-definition.tsx)) adds an `ofCollections` list that restricts which Collections can be referenced (backed by a Collections query), plus `min` / `max`.

`ofAssetMimeTypes` is authored through the shared [`asset-mime-type-picker.tsx`](../../src/renderer/components/forms/asset-mime-type-picker.tsx), used by both the asset spec and the markdown spec (where it constrains `assetReference` targets and only shows while `features.assetReferences` is on). It offers the distinct MIME types of the Project's own Assets rather than a hardcoded universe, and an empty selection means "any type".

> [!IMPORTANT]
> A reference value's stored shape is not symmetric. An asset reference is `{ id, objectType: 'asset' }`, but Core's `valueContentReferenceToEntrySchema` also requires `collectionId` on an **entry** reference, and refines it against the definition's `ofCollections`. `FormEntryField` therefore takes the collection from the selected Entry's own collection at the point of selection. Do not reintroduce a cast over `field.onChange` here: the missing `collectionId` was invisible to `tsc` for exactly that reason, and it made every entry-reference field unsaveable.

## Validation with Zod

All user input validation uses [Zod](https://zod.dev/), a TypeScript-first schema validation library.

### Schema Generation

**Source:** [@elek-io/core](https://github.com/elek-io/core)

Core provides utilities to convert field definitions into Zod schemas:

- **`getValueSchemaFromFieldDefinition()`**: Generates a Zod schema for a single field
- See [schema generation utilities](https://github.com/elek-io/core/blob/main/src/schema/schemaFromFieldDefinition.ts) for more functions

**Example:**

```typescript
import { getValueSchemaFromFieldDefinition } from '@elek-io/core';

const fieldDefinition = {
  valueType: 'string',
  min: 5,
  max: 100,
  isRequired: true,
  // ...
};

// Generated schema validates:
// - Type is string
// - Length between 5-100 characters
// - Field is required (not null/undefined)
// The second argument is the Project's supported languages (ProjectLanguages)
const schema = getValueSchemaFromFieldDefinition(
  fieldDefinition,
  project.settings.language.supported
);
```

### Form Validation

Use the generated Zod schema with [React Hook Form's Zod resolver](https://react-hook-form.com/get-started#SchemaValidation):

```typescript
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  flattenFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
} from '@elek-io/core';

const collection = /* ... */;

// Generate schema from all field definitions
// fieldDefinitions is a FieldDefinitionOrGroup[], and grouping does not affect the
// generated schema, so flatten it first (see "Field definition groups").
// The second argument is the Project's supported languages.
const schema = getUpdateEntrySchemaFromFieldDefinitions(
  flattenFieldDefinitions(collection.fieldDefinitions),
  project.settings.language.supported
);

// Create form with validation. Do NOT pass an explicit useForm generic here, see
// "Form typing" below.
const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { /* ... */ }
});

// Form validates automatically and shows error messages via FormMessage component
```

### Submitting the form

Entry forms submit like every other form in the app, through `AppForm` and a detached `SubmitButton`. That layer, along with `useAppMutation` for handling an expected `CoreError` in place (the Entry unique-value `Conflict` is the canonical case) and the [form typing rules](./forms.md#form-typing) that the generated schemas make necessary, is documented in [forms.md](./forms.md).

One typing point is specific to this side. The Collection editor binds its `fieldDefinitions` as a single `Controller`-bound value, edited through typed append / remove / move helpers, not as a `useFieldArray` of opaque `{ id }` rows. react-hook-form cannot type a field array whose element is the deep `FieldDefinitionOrGroup` union, and the opaque rows previously overwrote the definitions' real ids, which was the latent slug-source id bug. See [`collection-form.tsx`](../../src/renderer/components/forms/collection-form.tsx).

**Benefits:**

- Type-safe form data (inferred from generated Zod schema)
- Automatic validation based on field definitions
- Consistent validation between frontend and backend
- User-friendly error messages
- Prevents invalid data from reaching Core

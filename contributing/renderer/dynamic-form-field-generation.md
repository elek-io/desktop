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

This document covers the layer that is specific to user-defined fields: field definitions, the one folder per Core field type, the registry they are assembled into, and how an Entry form is rendered from them.

The shared form layer that every form in the app uses is in [forms.md](./forms.md): `AppForm` and `SubmitButton`, detached submit buttons, view-only mode, `useAppMutation`, form typing, the field shell and the shared controls with their value contracts. **Read its [form invariants](./forms.md#form-invariants) first.** Two of them are about the registry below, and each is enforced by a compile error, a lint error or a test, so breaking one fails CI.

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

Groups are rendered, not authored, in the client today. Wherever field definitions are shown to a user (the entry form and the collection editor) a group is rendered as a labeled `FieldSet` ([`components/ui/field.tsx`](../../src/renderer/components/ui/field.tsx)) that wraps its members. Narrow the union with `'isGroup' in fieldDefinition`, which asks whether something is a group rather than what field type it is.

Where grouping carries no meaning - generating an Entry's Zod schema, the create-Entry defaults, and the Entry table columns - flatten the union first with Core's `flattenFieldDefinitions(fieldDefinitions)`, which drops the groups and hoists their members into a flat `FieldDefinition[]`.

## Components

A **Component** is a reusable group of field definitions a Collection's `dynamic` field embeds by reference. Its Values are the sections of a page: one flat, ordered array of Component items, each naming the Component it is built from plus that Component's own Values.

Components have the same shape of screens as Collections, and reuse their parts:

- The list, the create form and the configure form are in [`routes/projects/$projectId/components/`](../../src/renderer/routes/projects/$projectId/components/), and the shared form body in [`components/forms/component-form.tsx`](../../src/renderer/components/forms/component-form.tsx).
- Its field definitions are authored by the same editor a Collection's are, see below.
- Its queries are in [`options/componentOptions.ts`](../../src/renderer/queries/options/componentOptions.ts), and reach Core through the `core:components:*` channels.
- [`components/component-impact.tsx`](../../src/renderer/components/component-impact.tsx) says before a save which Collections reach the Component and how many of their Entries hold a section built from it, because Core cascades a field definition change into every Entry holding the Component and commits the lot at once. The Entries are counted from the Values the Collection's own list already returned, since the list total counts every Entry file of the Collection rather than the ones a save rewrites.
- [`components/component-diff.tsx`](../../src/renderer/components/component-diff.tsx) draws one commit's change with the same form, read-only, as `collection-diff.tsx` does.

Two restrictions are Core's and reach the authoring UI through the editor's `owner` prop: a Component holds no `slug` field and none of its fields can be unique, because uniqueness is enforced over a Collection's top level fields only. Both are read off `fieldTypesForbiddenInComponents` and the `owner` the base form receives, so neither is offered and then refused on save.

## Creating field definitions for a Collection or a Component

When users create or update a Collection or a Component, they use one visual editor to define its fields.

**Location:** [`components/forms/field-definitions-editor.tsx`](../../src/renderer/components/forms/field-definitions-editor.tsx) holds that editor, and `collection-form.tsx` and `component-form.tsx` each render it with their own `owner`. It is what owns the Add Field sheet, the sheet that grows a `dynamic` field, the previews, the reordering and the typed edit helpers, so a change to any of them reaches both object types at once.

**Features:**

- Add, remove, and reorder fields, by dragging or with the Move up and Move down buttons each preview carries. Dragging alone would fail WCAG 2.1.1 and 2.5.7, so both exist wherever one does
- Allow more Components on a `dynamic` field that already exists, the one part of a definition that can be edited after it was added, see [Growing a dynamic field](#growing-a-dynamic-field)
- Select field type (text, textarea, number, toggle, date, asset, entry, etc.)
- Set labels and descriptions with multi-language support
- Configure validation rules (min/max length, required, unique)
- Set default values and input width
- Preview how the form will look to content editors

### Field Definition Form Architecture

Field-definition authoring is part of the type's folder: each type's own `DefinitionSpec` sits beside its control, and the registry reaches it as `DefinitionDraft`. One `AppForm` is mounted for the field type being added, and submission is native through a detached `SubmitButton` (`form={id}`), not an imperative ref. The pieces:

- **A type's `DefinitionSpec`** lives in its folder, in `index.tsx` for a scalar type and in `definition.tsx` where the authoring form is a file of its own (`select`, `slug`, `asset`, `entry`, `markdown`, `dynamic`). A spec is the Core schema that validates the definition, a fresh draft via `makeDefaults`, an optional `Extras` for the type-specific controls, and the notes below. The module exposes it as `DefinitionDraft`, and a type whose authoring is not built leaves that member off, which is what the Add Field picker reads to offer the type as unavailable.
- **`DefinitionDraft`** ([`forms/field-definition-draft.tsx`](../../src/renderer/components/forms/field-definition-draft.tsx)) is the shared engine. Given a `DefinitionSpec` it builds one real `AppForm`: it calls `useAppForm()` with the spec's resolver and defaults, rejects duplicate slugs, wraps `DefaultFieldDefinitionForm`, and renders the spec's `Extras` as children. This replaces the per-type wrapper file and its dedicated form, so there is one live form, remounted when the picker changes type, not 18 always-mounted ones. Its value-typed helpers (`DefaultValueInputField`, `MinMaxRow`) let a spec's `Extras` compose the common controls without a bespoke file. Pass `DefaultValueInputField` the HTML input type the field type's own control uses, not Core's field type.
- **`DefaultFieldDefinitionForm`** ([`forms/default-field-definition-form.tsx`](../../src/renderer/components/forms/default-field-definition-form.tsx)) renders the fields every definition shares (label, slug, description, `inputWidth`, `isRequired`, `isUnique`, `isDisabled`) and takes the type-specific inputs as `children`. It also auto-generates the slug from the label until the user edits the slug manually. It reads no field type: where Core pins `isRequired` or `isUnique` to a literal, the spec carries a `requiredNote` or a `uniquenessNote`, and the presence of that note is what locks the switch and says why. Inside a Component uniqueness is answered for every type at once, which is Core's rule rather than a type's, so that sentence lives in the shared base.

### Writing a `DefinitionSpec`

A spec ([`field-definition-draft.tsx`](../../src/renderer/components/forms/field-definition-draft.tsx)) is Core's per-type `schema` with the `resolver` built from it, a `makeDefaults` that returns a fresh draft, an optional `Extras` component for the controls beyond the shared base, and the optional `requiredNote` and `uniquenessNote` that lock those two switches. The schema stands beside the resolver because the draft's `AppForm` hands it to its fields, which read their own rules off it, and because one type's form values and its schema's output diverge, which a single member could not type for every type at once. Three rules govern what may go in one.

**Type-specific context arrives through `DefinitionExtrasProps`, and it is shared.** Every `Extras` receives `form`, `currentLanguage`, `supportedLanguages` and the Collection's current `fieldDefinitions`, whether it needs them or not. Only `select` reads the languages (its option labels are translatable) and only `slug` reads the sibling definitions (to offer non-slug string fields as slug sources, whose real ids Core's `slugSourceReferencesSuperRefinement` then validates). When a new type needs context the others do not, widen this one shared type rather than branching in the shared base or the sheet.

**A type's data fetching lives inside its own `Extras`.** The `entry` spec's `ofCollections` picker is backed by a Collections list query, and both the query and its `projectId` hook stay in the `Extras` component. The `dynamic` spec's `Extras` keeps its Components list query one level further down, inside the `OfComponentsPicker` it shares with the sheet that grows an existing field. Either way the shared engine never learns that a query exists, which is what keeps `DefinitionDraft` free of per-type knowledge.

**One spec may diverge between its form values and its resolver output.** `markdown` is the only case. Its recursive `defaultValue` mdast tree blows react-hook-form's path-type instantiation, and the form never edits it (v1 keeps markdown defaults null), so its form values pin `defaultValue` to null while the resolver still yields a full `MarkdownFieldDefinition`. That divergence is the single `as unknown as Resolver` cast in the authoring layer, and it lives at that one seam. Do not reach for it elsewhere.

One field type is special: Core backs `select` with two schemas, one for text options and one for number options. The select folder's authoring file ([`fields/select/definition.tsx`](../../src/renderer/components/fields/select/definition.tsx)) holds a `DefinitionSpec` for each variant and a value-type picker that mounts the matching one, and each variant carries its own notes, which is how a number select locks uniqueness while a text select does not. The folder is one field type either way, so the registry stays keyed on Core's own `FieldType`.

The **Add Field sheet** ([`forms/add-field-sheet.tsx`](../../src/renderer/components/forms/add-field-sheet.tsx)) renders the field-type picker, asks the registry for the selected type's `DefinitionDraft`, renders that one in its body, and submits it with a single detached `SubmitButton` in its footer. It offers a type unless the type's folder carries no authoring form, or the object it would be added to cannot hold it, which the type's own `forbiddenInComponent` says. `CollectionForm` ([`forms/collection-form.tsx`](../../src/renderer/components/forms/collection-form.tsx)) embeds `<AddFieldSheet>` and receives each new definition through an `onAppend` callback.

### Growing a dynamic field

A definition is add-only with one exception: a `dynamic` field can be given more Components after it was added, so a page can gain a new kind of section without losing the sections it has. Everything else about a definition is fixed once it is added, see [not-yet-implemented.md](../not-yet-implemented.md#field-definition-editing).

- The Edit button in a preview's chrome opens it, and the editor passes `onEdit` for a `dynamic` field alone, so no other type renders that control at all.
- [`fields/dynamic/allow-components-sheet.tsx`](../../src/renderer/components/fields/dynamic/allow-components-sheet.tsx) is the sheet, which the `dynamic` module exposes as its `EditSheet`: one `AppForm` over Core's `dynamicFieldDefinitionSchema`, seeded with the stored definition, whose submit hands the definition back to the editor's `replaceDefinition` helper. The id and everything but `ofComponents` come back untouched, which is what keeps the sections Entries hold, since Core matches definitions by `id`.
- **Only growing is offered, which is a limit on what the screen offers rather than a rule of its own.** Narrowing `ofComponents` strips every Component item no longer allowed, which Core refuses until the update accepts that loss, and showing what would go is not built yet. So the Components already allowed are listed in words instead of as a control that could be switched off, and a field whose `ofComponents` is empty already allows every Component of the Project and therefore offers nothing to add. Core stays the guard either way.
- `OfComponentsPicker` ([`fields/dynamic/definition.tsx`](../../src/renderer/components/fields/dynamic/definition.tsx)) is the one picker both paths render: the Add Field sheet through the dynamic `Extras`, and this sheet with `lockedComponentIds` set to what the field allows already. What either offers is decided there rather than twice.

> [!NOTE]
> To add authoring for a field type, add a `DefinitionSpec` to its folder (in `definition.tsx` where it needs a file of its own) and expose it as the module's `DefinitionDraft`. The picker reads the registry, so nothing else has to learn about it.

## Rendering Dynamic Forms

When rendering a form to create or edit an Entry, we iterate over the Collection's field definitions and render appropriate form controls for each field.

**Location:** Entry forms are in [`components/forms/entry-form.tsx`](../../src/renderer/components/forms/entry-form.tsx) and used in routes like [`routes/projects/$projectId/collections/$collectionId/create.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/create.tsx) and [`routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx)

### Component Architecture

The dynamic form rendering system is built with layered components, each adding functionality:

#### One folder per field type

Everything the app knows about one field type lives in that type's own folder under [`components/fields/`](../../src/renderer/components/fields/), and everything else asks the registry. That replaced the old 18-case switch and, after it, the seven places a single type was described in: two registries, two helper tables, the list of Entries, the preview and the Entry's title.

A folder holds a module ([`fields/module.ts`](../../src/renderer/components/fields/module.ts) is the contract), and `FieldTypeModule<T>` is generic over the field type, so **every member sees only its own narrowed field definition and no member checks its type again**:

| Member                 | Answers                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `Control`              | The control, with this type's Value contract                   |
| `translatable`         | Whether the Value is per-language                              |
| `acceptsAriaRequired`  | Whether the control's role takes `aria-required`               |
| `label`                | Not a member: the field's label, handed to `Control` as a prop |
| `rules`                | What a field of this type says it needs, beside its label      |
| `defaultContent`       | The Value's content for a new Entry                            |
| `previewContent`       | The static content the Collection's preview shows              |
| `listCell`             | What a row of the list of Entries shows for this Value         |
| `titleText`            | This Value's text where an Entry is named by one of its Values |
| `coreRefusalText`      | This type's words for a refusal Core wrote its own English for |
| `DefinitionDraft`      | The authoring form for a new definition of this type           |
| `forbiddenInComponent` | That Core refuses this type inside a Component                 |
| `allowedComponentIds`  | Which Components a definition allows as a section              |
| `withoutDefinition`    | How a definition forgets another one the editor removed        |
| `EditSheet`            | The sheet that edits a definition of this type after it exists |

The last four are optional, because exactly one type answers each: `slug` is forbidden in a Component and is the one definition that points at siblings, and `dynamic` is the one that embeds Components and the one that can be edited at all. `coreRefusalText` is optional too, and three types carry one: `slug`, `entry` and `markdown` are where the refusals Core words itself land, see [Where a refusal's words come from](#where-a-refusals-words-come-from). `DefinitionDraft` is optional too, for a type Core defines and the client cannot author yet, and every type carries one today.

**The registry** ([`fields/index.ts`](../../src/renderer/components/fields/index.ts)) is a mapped type over Core's `FieldType`, so a field type Core adds **fails to compile until it has a folder**, and the message names the types whose folder is missing. That mapped type is exported as `FieldTypeRegistry`, so the type test can name it rather than write it out again, see [forms.md](./forms.md#guardrails). Reach a module through `fieldModule(fieldDefinition)`, which is generic over the field type so the module and the definition stay correlated: every member of what comes back takes exactly the definition that was passed in. Always read the module from the definition it is about, never pair one definition's module with another definition.

```typescript
import { fieldModule } from '@renderer/components/fields';

// What this Value looks like in a row of the list of Entries.
const cell = fieldModule(fieldDefinition).listCell({
  content: value.content,
  fieldDefinition,
  language: project.settings.language.default,
  formatInUserLocale,
});
```

**Nothing outside a type's folder branches on `fieldType` or `valueType`**, and a lint rule says so in every shape the read takes. Where something needs a set of types, the set is derived from the registry (`authorableFieldTypes`, `fieldTypesForbiddenInComponents`) rather than written out again. A branch written by hand is a backstop away from slipping through, so the rule is a guardrail and not a proof, see [forms.md](./forms.md#guardrails).

Two derived helpers sit beside the registry, because each walks a Collection's definitions and asks their folders:

- **`defaultEntryValue` / `defaultEntryValues`** ([`fields/value-defaults.ts`](../../src/renderer/components/fields/value-defaults.ts)) build the Values a new Entry holds.
- **`entryTitle`** ([`fields/entry-title.ts`](../../src/renderer/components/fields/entry-title.ts)) is the one way the app names an Entry: the list of Entries, the Entry field, the Entry picker the field and the markdown editor share, and the breadcrumb all call it. An Entry has no title of its own yet, so it is named by the first of its Collection's fields that holds text, in the language the screen shows and otherwise in any language that holds something, and by the start of its id where nothing does.

The contracts more than one type shares, such as "a per-language record holding the same default" or "the text of a text-like Value", are plain functions in [`fields/value-contracts.ts`](../../src/renderer/components/fields/value-contracts.ts) that a module opts into. Nothing there reads a type either: a module picks the contract that describes its Value.

#### The controls

A type's control is value-typed: it receives the already-bound `field` (value/onChange/onBlur/ref) plus a `controlProps` bag (`id`, `aria-describedby`, `aria-invalid`, and `aria-required` on the controls that accept it) to place on the real input, and the field's `label` as text. The shell offers `aria-required` to every control of a required field and `FieldFromDefinition` drops it again where the type's `acceptsAriaRequired` says its role does not take it, so required is said in one place and emitted only where it is allowed. It does not know or build a form path. The path lives at the single `Controller` in `FieldFromDefinition`, which is what lets one control serve both a hand-written form and a generated one.

`label` is there for a control whose element takes no name from a `<label>`: a group of radio buttons, a combobox, the markdown editor's editable element and each button of a picker all say it themselves, with `aria-label`. Inside the translations dialog it is the language being edited, so two controls of one field never read alike.

The controls more than one type shares are in [`components/ui/field-controls.tsx`](../../src/renderer/components/ui/field-controls.tsx) with their value contracts, see [forms.md](./forms.md#the-shared-controls-and-their-value-contracts). A control a single type owns is in that type's folder, as `control.tsx` where it is more than a few lines. Do not hand-roll a raw `<Input>` in a control.

- **No control emits a native constraint attribute.** zod (through react-hook-form) is the only validator and the form is `noValidate`, so no control sets `required` / `min` / `max` / `minLength` / `maxLength`. The one exception is the range `Slider`'s `min` / `max`, which are its functional value domain rather than HTML constraints. A test asserts a required field renders with no `required` attribute. Required-ness still reaches assistive tech, through `aria-required`, which `FieldFromDefinition` keeps where the type's `acceptsAriaRequired` says its role takes it. These types answer no, see [forms.md](./forms.md#what-a-field-says-it-needs):
  - The **range slider** and the **toggle** always hold a Value, so they show no rule at all and say nothing about required either way. Core marks them required because they can never be empty, which is not a rule anybody in front of the field can break.
  - The **Asset**, **Entry** and **dynamic** fields are several controls rather than one, and a button's role takes no `aria-required`. The container the label points at names the rules in `aria-describedby`, every button of the field names them too, so they are read out with whichever one has focus, and the buttons that fill the field carry the word in their accessible name as well, such as "Choose Cover, Required".
  - The **markdown** field answers yes. Its editable element carries `role="textbox"`, which takes `aria-required`, and the control props reach it through ProseMirror's own `attributes` prop rather than by reaching into Milkdown's `contenteditable`, see [markdown-editor.md](./markdown-editor.md#what-the-field-tells-the-editor).

- **`SlugControl` resolves its source ids** through `useFieldDefinitions()` ([`hooks/useFieldDefinitions.ts`](../../src/renderer/hooks/useFieldDefinitions.ts)), provided by the `FieldDefinitionsProvider` ([`providers/FieldDefinitionsProvider.tsx`](../../src/renderer/providers/FieldDefinitionsProvider.tsx)) that `EntryForm` wraps its fields in. Outside of it (for example the Collection editor preview) the input is simply manual.

#### Drawing a field from a definition

- **`FieldFromDefinition`** ([`fields/field-from-definition.tsx`](../../src/renderer/components/fields/field-from-definition.tsx)) is the entry point: one `AppField` built from a field definition and bound to any path, so the same field fills an Entry and a section of a dynamic field. It owns the single `Controller` at `name`, reaches the type's folder for the control, and decides `disabled`, which is the definition's `isDisabled` OR the field's own disabled state OR the enclosing `AppForm`'s view mode. Folding the mode in here rather than per type is what keeps a non-native control, the markdown `contenteditable`, from staying editable in a diff, see [forms.md](./forms.md#view-only-forms-and-diffs).
- **`FieldDefinitionPreview`** ([same file](../../src/renderer/components/fields/field-from-definition.tsx)) is the Collection and Component editors' non-editable preview. It draws the one field shell with no form behind it (`FieldShell`) plus the drag, edit and delete chrome: the control holds a static Value from the type's `previewContent`, so there are no phantom form paths and the label still names a real, disabled control, which is what makes those previews addressable by `getByLabel`. Its edit control is rendered only where the caller passes `onEdit`, which the editor does for a type whose folder carries an `EditSheet`, see [Growing a dynamic field](#growing-a-dynamic-field). A `dynamic` definition draws its sections editor rather than one input, so its preview carries no labelled form control and the `id` lands on that editor's group instead.
- **`TranslatableField`** ([`components/ui/translatable-field.tsx`](../../src/renderer/components/ui/translatable-field.tsx)) is the single per-language wrapper. With one Project language it renders the control directly; with more it adds a dialog that edits every supported language. It owns the multi-field name convention (the name's last dot-segment is the language, so the sibling paths derive from it) and the `hasErrorsInTranslations` traversal that flags the dialog trigger when a hidden translation is invalid. `TranslatableFormInputField` and `TranslatableFormTextareaField` are thin presets over it for the hand-written string and textarea cases.

### Example Usage

```typescript
import { FieldFromDefinition } from '@renderer/components/fields/field-from-definition';
import { AppForm } from '@renderer/components/ui/app-form';

// In your component (see entry-form.tsx):
const project = /* ... current Project ... */;
const collection = /* ... Collection with fieldDefinitions ... */;

// AppForm is the only place a <form> element is written (see forms.md).
return (
  <AppForm form={form} onSubmit={onSubmit} id={id}>
    {collection.fieldDefinitions.map((fieldDefinition) => (
      <FieldFromDefinition
        key={fieldDefinition.id}
        fieldDefinition={fieldDefinition}
        form={form}
        name={`values.${fieldDefinition.slug}.content`}
        language={project.settings.language.default}
        supportedLanguages={project.settings.language.supported}
      />
    ))}
  </AppForm>
);
```

`FieldFromDefinition` takes the form via the `form` prop (not `control`), a required `name` and the `language` being edited, see below.

### The path a Value is bound to

`name` is the path to the field's `content`, without a language, and `language` is the language being edited. `FieldFromDefinition` appends the language itself when the type's folder says the Value is translatable, so no call site has to know which types are. That matters because the one type that is not, `dynamic`, binds to `content` itself: its Value is a flat array of Component items and has no language to end at, while `TranslatableField` derives the sibling languages from the last segment of the path and so needs one for every other type.

### The sections of a page: the dynamic field

`DynamicControl` ([`fields/dynamic/control.tsx`](../../src/renderer/components/fields/dynamic/control.tsx)) is the dynamic field's control. It lists the sections, adds one from the Components the field allows (Core's `resolveOfComponents` answers which, and an empty `ofComponents` means every Component of the Project), removes one, moves one up or down, and renders each section's own fields through `FieldFromDefinition` again, so a Component holding a dynamic field nests. Whether a Value holds a section built from a given Component is the same folder's `sections.ts`, which the Component impact view reads.

Three things about it are load bearing:

- **A section is reordered with buttons, not by dragging.** A section can hold a dynamic field of its own, so a drag context here would nest inside itself, and WCAG 2.1.1 asks for a move that works without dragging either way.
- **The list is read from the form, not from `field.value`.** `useController` subscribes to its own exact name, so the dynamic field's Controller does not re-render when somebody types into a field inside a section. `field.value` is current for the shape of the list and stale for the Values inside it, so every edit reads the list back with `form.getValues(field.name)` first. Building a new list from `field.value` dropped what had been typed.
- **Each section is keyed by its own item id.** For the same reason, a mounted Controller inside a section does not re-read when the array above it changes, so after an add, a remove or a move the inputs would keep showing the old order's Values. Keying by the item id is what answers that: React moves the whole section rather than rebuilding it, every field inside it is bound one index further along, and a Controller does re-read when its own `name` changes. It is also what keeps a move usable from the keyboard, since the button that was pressed travels with its section and pressing it again moves the same section on.

### Reference fields (asset and entry)

The `asset` and `entry` field types differ from scalar fields. Their `valueType` is `reference`, and their value is an array of references (`{ id, objectType }`), not a single value.

**The field shows what it holds, and a dialog chooses more.** An Asset field draws a row per chosen Asset with its preview, its name, its type and size, Replace and Remove. An Entry field draws a row per chosen Entry with its title, its Collection by that Collection's own plural, which is how every list of the app names one, and Remove. Below the rows stands Choose, while the field allows another, so a field holding its maximum shows its rows alone. With nothing chosen the field says so in a row of its own.

**A reference the field cannot resolve keeps its row**, saying that the Asset no longer exists or that the Entry is no longer available, with Remove. A rebase during a synchronize can leave such a reference behind (Core refuses the push and the sidebar says to point the field elsewhere or clear it), and an Entry reference also stops resolving when its Collection is dropped from `ofCollections`. Drawing it is what makes it repairable: the row is counted against the field's maximum like any other, so Choose comes back once it is removed, while the picker opens on the references that do resolve, which is what it can hand back.

The field is therefore **several controls rather than one**. The control-association props land on their container, which is what the label points at, and every button inside names the same `aria-describedby`, so the rules, the description and the error are read out with whichever button has focus. The accessible name of every Choose, Replace and Remove button includes the field's label, as ci asks: "Choose Cover", "Replace Cover", "Remove Mara Klein from Authors". The Supported languages field of the Project form shares the container half of this pattern: it is several controls too, so the control-association props land on its container there as well, with `aria-required` dropped. Its own buttons name neither the field nor that container's description.

**Both pickers are one dialog each**, in [`components/pickers/`](../../src/renderer/components/pickers/) rather than in a field type's folder, because they are about Assets and Entries rather than about a field type: the Asset field, the Entry field and the markdown editor's two reference pickers all open them. Each has a filter above a list that scrolls below it, draws the Assets as ci's grid of four ruled columns and the Entries as its ruled rows, and carries a radio button per item where the field takes one and a checkbox where it takes several. What is chosen is marked by that control alone, so no row or card takes a surface or a border of its own. Its one line below the title says what the field takes, such as "Images only." or "Up to 2 Entries.", and the dialog adds how many are ticked right now, so an item disabled at the maximum says why. What is ticked stays inside the dialog until Choose is pressed, so Cancel changes nothing, and the field's maximum holds there: an item that is not ticked is disabled once the maximum is. Add Asset, which ci draws beside the filter, belongs to the Assets screen's own pane and is built with it.

Their controls fetch data from within the form. `AssetControl` and `EntryControl` (each in its own folder) load the Assets or Entries with TanStack Query (the entry field uses `useQueriesNoError` to load Entries across several Collections). Both pickers name each Entry with `entryTitle`, the one way the app names one.

Their definition forms add type-specific options:

- The asset definition form ([`fields/asset/definition.tsx`](../../src/renderer/components/fields/asset/definition.tsx)) exposes `min` / `max` (how many Assets may be selected) plus `ofAssetMimeTypes` through its spec's `Extras`.
- The entry definition form ([`fields/entry/definition.tsx`](../../src/renderer/components/fields/entry/definition.tsx)) adds an `ofCollections` list that restricts which Collections can be referenced (backed by a Collections query), plus `min` / `max`.
- The dynamic definition form ([`fields/dynamic/definition.tsx`](../../src/renderer/components/fields/dynamic/definition.tsx)) is modelled on it: an `ofComponents` list restricting which Components may be added as a section, backed by a Components query, plus the `min` / `max` section counts. Each toggle carries its Component's name as its accessible name, so a Component is never shown by its id.

`ofAssetMimeTypes` is authored through the shared [`asset-mime-type-picker.tsx`](../../src/renderer/components/forms/asset-mime-type-picker.tsx), used by both the asset folder's spec and the markdown folder's (where it constrains `assetReference` targets and only shows while `features.assetReferences` is on). It offers the distinct MIME types of the Project's own Assets rather than a hardcoded universe, and an empty selection means "any type".

### The select field's options

A select field takes one Value out of a named list, and ci draws that list rather than a menu. `OptionChoice` ([`fields/select/control.tsx`](../../src/renderer/components/fields/select/control.tsx)) is the one control for it:

- **Up to seven options are a list of radio buttons**, named by the field's label through `aria-label`, since a radio group takes no name from the buttons inside it. Its role is one of those that do take `aria-required`.
- **More than seven are a combobox with a filter**, because ci's own example of a long list is 86 Entries. ci sets no bound for a long list, so this one is Desktop's.
- **None leads the list wherever the Value may stay empty**: an optional field, and a Default Value in a field's settings, which is the same control.

An option is keyed by its place in the list, because an option's own value can be the empty string, which no item value may be. What the field stores is the option's own string or number, unchanged from what the menu stored before.

> [!IMPORTANT]
> A reference value's stored shape is not symmetric. An asset reference is `{ id, objectType: 'asset' }`, but Core's `valueContentReferenceToEntrySchema` also requires `collectionId` on an **entry** reference, and refines it against the definition's `ofCollections`. `EntryControl` therefore takes the collection from the selected Entry's own collection at the point of selection. Do not reintroduce a cast over `field.onChange` here: the missing `collectionId` was invisible to `tsc` for exactly that reason, and it made every entry-reference field unsaveable.

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

import { useAppForm } from '@renderer/hooks/useAppForm';

import {
  flattenFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
} from '@elek-io/core';

const collection = /* ... */;

// Generate schema from all field definitions
// fieldDefinitions is a FieldDefinitionOrGroup[], and grouping does not affect the
// generated schema, so flatten it first (see "Field definition groups").
// The second argument is the Project's supported languages, the third Core's
// ComponentResolver: a dynamic field's Values are checked against the field
// definitions of the Components it embeds, and Core raises `Internal` for one
// reaching schema generation without a resolver. `useComponentResolver`
// (hooks/useComponentResolver.ts) builds it from the Project's Components.
const schema = getUpdateEntrySchemaFromFieldDefinitions(
  flattenFieldDefinitions(collection.fieldDefinitions),
  project.settings.language.supported,
  componentResolver
);

// Create form with validation. Do NOT pass an explicit useAppForm generic here,
// see "Form typing" in forms.md.
const form = useAppForm({
  resolver: zodResolver(schema),
  defaultValues: { /* ... */ }
});

// Form validates automatically and each AppField shows its own error
```

### Where a refusal's words come from

The generated schema decides what is refused. It does not decide what the editor
reads: one zod error map words every refusal zod raises, keyed by the issue code
and by what that code measures, and the field type a refusal Core wrote its own
English for words that one through its `coreRefusalText`. `FieldFromDefinition`
reads it off the type's module and hands it to `AppField`, so no form branches on
a field type to word anything.

Where the message lands is the field's to show. Core measures a part of a Value
where the Value is a tree or a list, so a markdown field's blocks are refused at
`content.en.children` and one reference of an Entry field at `content.en.0`,
below the path the field binds. `AppField` shows the first message at its path
or below it, see
[When an error has no field to land on](./forms.md#when-an-error-has-no-field-to-land-on).
The whole mechanism, the one sentence for a refusal nothing knows included, is
in [forms.md](./forms.md#the-words-a-refused-value-is-explained-in).

### Submitting the form

Entry forms submit like every other form in the app, through `AppForm` and a detached `SubmitButton`. That layer, along with `useAppMutation` for handling an expected `CoreError` in place (the Entry unique-value `Conflict` is the canonical case) and the [form typing rules](./forms.md#form-typing) that the generated schemas make necessary, is documented in [forms.md](./forms.md).

One typing point is specific to this side. The field definitions editor binds `fieldDefinitions` as a single `Controller`-bound value, edited through typed append / replace / remove / move helpers, not as a `useFieldArray` of opaque `{ id }` rows. react-hook-form cannot type a field array whose element is the deep `FieldDefinitionOrGroup` union, and the opaque rows previously overwrote the definitions' real ids, which was the latent slug-source id bug. Keeping the real ids is also what makes a Component's update safe: Core matches field definitions by `id`, so a new one would read as a removal plus an addition and drop the content of every Entry holding the Component. See [`field-definitions-editor.tsx`](../../src/renderer/components/forms/field-definitions-editor.tsx).

**Benefits:**

- Type-safe form data (inferred from generated Zod schema)
- Automatic validation based on field definitions
- Consistent validation between frontend and backend
- User-friendly error messages
- Prevents invalid data from reaching Core

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

**Components is one screen**: a list of 296 px with every Component, next to the chosen one's settings, which are laid out like a Collection's with the chosen field's settings in a third pane. The layout route [`components.tsx`](../../src/renderer/routes/projects/$projectId/components.tsx) draws the list and holds whatever opens beside it, so the list keeps its scroll and its marked row while one Component opens after another.

- The list pane is [`components/component-list.tsx`](../../src/renderer/components/component-list.tsx). Each row says how many Entries use the Component and how many fields it has, and Create Component stands in the list's head. The rows stand in the order of the names they show, compared in the language the app is read in, because Core answers in the order the uuid folders sit on disk. A Project with no Component at all gets ci's empty state over the whole panel, and the route beside the list says that none is chosen.
- The settings and the create form are in [`routes/projects/$projectId/components/`](../../src/renderer/routes/projects/$projectId/components/) and share one form body, [`components/forms/component-form.tsx`](../../src/renderer/components/forms/component-form.tsx). Create Component opens that same screen empty. Delete Component sits in the settings' More menu and asks first, and a Component a Collection or another Component still uses says in place why it cannot go. See [A Component's settings](./forms.md#a-components-settings).
- Its field definitions are authored by the same editor a Collection's are, see below.
- Its queries are in [`options/componentOptions.ts`](../../src/renderer/queries/options/componentOptions.ts), and reach Core through the `core:components:*` channels.
- [`hooks/useComponentUsage.ts`](../../src/renderer/hooks/useComponentUsage.ts) answers how many Entries use each Component, which is what a row of the list says. An Entry uses a Component when it holds a section built from it at any depth, which the `dynamic` folder's `sections.ts` reads off the Values. Only a Collection whose fields embed a Component at all can hold such a section, and which those are is each field type's `allowedComponentIds`, so the Entries of the others are never read for it.
- Those reads of Entries are reads the hook answers itself, which is the one exception on this screen: a row says it cannot tell how many Entries use the Component, and the list stays a list, since the Components were read and it is the only way to one. See [Error Handling](../error-handling.md#the-other-read-a-screen-catches-how-many-entries-use-a-component).
- [`components/component-diff.tsx`](../../src/renderer/components/component-diff.tsx) draws one commit's change with the same form, read-only, as `collection-diff.tsx` does.

Two restrictions are Core's and reach the authoring UI through the editor's `owner` prop: a Component holds no `slug` field and none of its fields can be unique, because uniqueness is enforced over a Collection's top level fields only. Both are read off `fieldTypesForbiddenInComponents` and the `owner` the base form receives, so neither is offered and then refused on save. A Component's own slug does have to be unique in the Project, which Core enforces where it saves, so the Slug field says so among its rules and a taken one lands below that field.

## Creating and editing field definitions

A Collection's and a Component's fields are defined in one editor, which is what the pane of 296 px beside those fields is.

**Location:** [`components/forms/field-definitions-editor.tsx`](../../src/renderer/components/forms/field-definitions-editor.tsx) holds two halves of it, and `collection-form.tsx` and `component-form.tsx` each render both with their own `owner`, so a change to either reaches both object types at once.

- `FieldDefinitionsList` draws every field as editors see it, at its own width, with Add field below them. The whole row of a field is one control that opens its settings, so a pointer hits it wherever it lands, and the chosen row takes the muted surface, the bar and the grip for whoever drags.
- `FieldDefinitionsPane` draws the pane: every field type in ci's groups while a field is being added, and otherwise the settings of the chosen field.

**What it does:**

- Adds a field by choosing its type, which appends the field and opens its settings at once
- Changes a field after it exists: its label, its type, its slug, its description, its width, the rules its type takes, a Default Value where Core takes one, Required, Unique and Disabled
- Moves a field up or down from the More menu of its settings, and by dragging its grip. Dragging alone would fail WCAG 2.1.1 and 2.5.7, so both exist wherever one does
- Removes a field from the same More menu
- Shows every field as content editors will see it, so the settings and an Entry draw one field the same way

### One form, one unsaved state

The page has one Save, and the pane beside the fields edits the same form the page is saved from. So:

- **`useDefinitionsEditor`** ([`hooks/useDefinitionsEditor.ts`](../../src/renderer/hooks/useDefinitionsEditor.ts)) binds `fieldDefinitions` as one `Controller` value and holds which field is open. Its helpers (`add`, `changeType`, `remove`, `moveBy`, `move`) each write a new array, which is what dirties the page and draws the preview again. The route calls it and hands the state to both halves of the editor, since the two live in different panes of the screen but belong to one form.
- **Every control of a field's settings is an `AppField`** bound at `fieldDefinitions.<index>.<key>` of that form. That is what puts a refusal Core answers the save with below the field it is about, and what makes the preview follow each keystroke.
- **A field keeps its id**, through every edit and through a type change, because Core matches field definitions by `id` and a new one would read as a removal plus an addition, see Core's [schema-changes doc](../../node_modules/@elek-io/core/docs/schema-changes.md).

### A type's own settings

Everything one field type knows about its own settings lives in its folder, as three members of its module:

- **`definitionSchema(fieldDefinition)`** is the Core schema one definition of that type is checked against. The settings put it in scope through `FieldSchemaScopeContext` ([`hooks/useFieldSchemaScope.ts`](../../src/renderer/hooks/useFieldSchemaScope.ts)), and every `AppField` inside reads the rules beside its label off it, with its path taken relative to the chosen definition. The Collection's own schema cannot answer there: it describes the array as a union of every field type and a group, which the walk over a schema cannot see into. `select` is the one type that answers per definition, because Core backs it with a schema per option value type.
- **`newDefinition({ id, supportedLanguages })`** is the definition choosing the type adds. The id comes in rather than being minted there, which is what lets a type change keep it.
- **`DefinitionEditor`** draws the settings below the ones every definition shares. It is a component, not a function the shared editor calls, so the hooks a type needs belong to it and changing a field's type cannot reorder anybody else's. It receives a `DefinitionBinding`: the page's `form`, the `fieldDefinition` as that form holds it now, `path` to name one of its own keys, `set` to write one back, the `owner`, its `siblings` and the `language` the switch above the page shows.

`path` is typed against that type's own definition, so a key the type does not hold is a compile error where it is written. It is the one place a path on the page's form is asserted, see [forms.md](./forms.md#form-typing). A markdown field's Default Value is left out of those keys, because Core's recursive mdast tree is deeper than react-hook-form's path type walks and no field's settings bind a path inside a Default Value.

Where Core pins `isRequired` or `isUnique` to a literal, the module answers `requiredNote` or `uniquenessNote` with the sentence that says why, and that sentence is what locks the control. A type change carries both over only where the new type leaves either a choice. Inside a Component uniqueness is answered for every type at once, which is Core's rule rather than a type's, so that sentence lives in the shared settings.

**A type's data fetching lives inside its own editor.** The `entry` editor's Collections list query, the `dynamic` editor's Components list query and the file types of `mime-type-rows.tsx` all sit at that level, so the shared settings never learn that a query exists.

**Every list a type takes is rows with Add and Remove**, which is how ci draws each of them: a select's options, the Collections an `entry` field allows, the Components a `dynamic` field allows, the blocks and the inline marks a `markdown` field allows, the file types an `asset` and a `markdown` field allow, and the fields a `slug` is written from. `DefinitionChoiceRows` ([`forms/definition-controls.tsx`](../../src/renderer/components/forms/definition-controls.tsx)) is that control: the rows are what the field holds, and Add offers what it does not hold yet. `DefinitionBounds` beside it is a type's Minimum and Maximum under one sentence, which both controls name, as ci draws them.

### Taking a Component away from a dynamic field

Narrowing `ofComponents` strips every Component item no longer allowed, and Core refuses the update until that loss is accepted. The editor offers the Remove anyway and Core stays the guard: such a save asks before it goes in, in [the dialog of a refused change](#the-dialog-of-a-refused-field-definition-change).

> [!NOTE]
> A field type Core adds fails to compile until its folder answers `Icon`, `group`, `definitionSchema`, `newDefinition` and `DefinitionEditor`, because the registry is a mapped type over Core's `FieldType`. Nothing else has to learn about it.

### The dialog of a refused field definition change

A save that would delete stored Values, or leave an Entry without a Value it now needs, is refused by Core with every issue of that one call. [`RefusedChangeDialog`](../../src/renderer/components/refused-change-dialog.tsx) is the one dialog that answers it, over a Collection's settings and over a Component's, in the two groups ci draws:

| Group              | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost when you save | One row per Value the change would delete, by the Entry's own title with a link to it and the field's label, with the Value struck through. The words "Would be lost" stand beside the line for a screen reader, so neither the color nor the line carries it alone                                                                                                                                                                                                                 |
| Needs a Value      | The field as editors see it under its new rules, to fill in right there: one `FieldFromDefinition` per Entry, bound at `resolutions.<entryId>.<fieldSlug>.content`. A Component's rows are a list instead, each by the Entry's title with a link to it, its section and its Collection, under one line saying what there is to do while no such Value can be filled in, see [not-yet-implemented.md](../not-yet-implemented.md#filling-in-the-value-a-component-field-change-needs) |

- **It shows what Core's refusal names and sends back what Core takes.** Nothing in it works out a loss or a resolution of its own: the ids and the Value that would go come from the refusal (`entryIssuesOf` in [`lib/schemaChange.ts`](../../src/renderer/lib/schemaChange.ts)), and what goes back is `acceptedContentLoss` and `resolutions`, see [error-handling.md](../error-handling.md#example-a-field-change-core-cannot-carry-out).
- **The Value that would go is read by its field type**, through `renderValue` of the field definition the object still holds, since a removed field is gone from the save. A narrowed `dynamic` or `entry` field reads as how many sections or Entries would go, which is what that type says of a Value.
- **It is a form of its own**, with the Values it needs as its fields and the red button as its `SubmitButton`, so the button waits while one of them is missing exactly as Save does, see [forms.md](./forms.md#saves-block). Its reason stands at the field as ci draws it, "Missing, so the changes can't be saved yet", and below the button as every other form says it.
- **One switch above its rows** takes them into another language where the Project has more than one, because Core takes a resolution only once every language holds the Value, the same rule an Entry is saved under. It is the dialog's own switch, since the one above the settings takes names and labels into another language rather than Values.
- **Each Entry it names is read through its Collection's list of Entries**, which is the query the list beside an Entry's editor fills, and named by `entryTitle`, the one way the app names an Entry. A Component's issue also names the item its field sits in, and ci gives an item no name, so the row says which section it is by its place, as the section's own head does.
- **Following a link keeps the settings behind it**, see [forms.md](./forms.md#leaving-unsaved-changes).

## Rendering Dynamic Forms

When rendering a form to create or edit an Entry, we iterate over the Collection's field definitions and render appropriate form controls for each field.

**Location:** Entry forms are in [`components/forms/entry-form.tsx`](../../src/renderer/components/forms/entry-form.tsx) and used in routes like [`routes/projects/$projectId/collections/$collectionId/create.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/create.tsx) and [`routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx)

### Component Architecture

The dynamic form rendering system is built with layered components, each adding functionality:

#### One folder per field type

Everything the app knows about one field type lives in that type's own folder under [`components/fields/`](../../src/renderer/components/fields/), and everything else asks the registry. That replaced the old 18-case switch and, after it, the seven places a single type was described in: two registries, two helper tables, the list of Entries, the preview and the Entry's title.

A folder holds a module ([`fields/module.ts`](../../src/renderer/components/fields/module.ts) is the contract), and `FieldTypeModule<T>` is generic over the field type, so **every member sees only its own narrowed field definition and no member checks its type again**:

| Member                 | Answers                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `Control`              | The control, with this type's Value contract                     |
| `translatable`         | Whether the Value is per-language                                |
| `acceptsAriaRequired`  | Whether the control's role takes `aria-required`                 |
| `label`                | Not a member: the field's label, handed to `Control` as a prop   |
| `rules`                | What a field of this type says it needs, beside its label        |
| `defaultContent`       | The Value's content for a new Entry                              |
| `previewContent`       | The static content a field's preview shows                       |
| `Icon`                 | The icon ci draws for the type                                   |
| `group`                | Which of ci's groups the type is offered in                      |
| `definitionSchema`     | The Core schema one definition of this type is checked against   |
| `newDefinition`        | The definition choosing the type adds                            |
| `DefinitionEditor`     | The type's own settings, below the shared ones                   |
| `isEmpty`              | Whether one language's content of this Value holds nothing       |
| `renderValue`          | This Value in one language as text, where it is shown not edited |
| `titleText`            | This Value's text where an Entry is named by one of its Values   |
| `coreRefusalText`      | This type's words for a refusal Core wrote its own English for   |
| `requiredNote`         | Why Required is fixed for this field, where Core pins it         |
| `uniquenessNote`       | Why Unique is fixed for this field, the same way                 |
| `forbiddenInComponent` | That Core refuses this type inside a Component                   |
| `allowedComponentIds`  | Which Components a definition allows as a section                |
| `withoutDefinition`    | How a definition forgets another one the editor removed          |

The last three are optional, because exactly one type answers each: `slug` is forbidden in a Component and is the one definition that points at siblings, and `dynamic` is the one that embeds Components. `coreRefusalText` is optional too, and three types carry one: `slug`, `entry` and `markdown` are where the refusals Core words itself land, see [Where a refusal's words come from](#where-a-refusals-words-come-from). The two notes are optional for the same reason: a type Core leaves both switches free answers neither.

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

`label` is there for a control whose element takes no name from a `<label>`: a group of radio buttons, a combobox, the markdown editor's editable element and each button of a picker all say it themselves, with `aria-label`.

The controls more than one type shares are in [`components/ui/field-controls.tsx`](../../src/renderer/components/ui/field-controls.tsx) with their value contracts, see [forms.md](./forms.md#the-shared-controls-and-their-value-contracts). A control a single type owns is in that type's folder, as `control.tsx` where it is more than a few lines. Do not hand-roll a raw `<Input>` in a control.

- **No control emits a native constraint attribute.** zod (through react-hook-form) is the only validator and the form is `noValidate`, so no control sets `required` / `min` / `max` / `minLength` / `maxLength`. The one exception is the range `Slider`'s `min` / `max`, which are its functional value domain rather than HTML constraints. A test asserts a required field renders with no `required` attribute. Required-ness still reaches assistive tech, through `aria-required`, which `FieldFromDefinition` keeps where the type's `acceptsAriaRequired` says its role takes it. These types answer no, see [forms.md](./forms.md#what-a-field-says-it-needs):
  - The **range slider** and the **toggle** always hold a Value, so they show no rule at all and say nothing about required either way. Core marks them required because they can never be empty, which is not a rule anybody in front of the field can break.
  - The **Asset**, **Entry** and **dynamic** fields are several controls rather than one, and a button's role takes no `aria-required`. The container the label points at names the rules in `aria-describedby`, every button of the field names them too, so they are read out with whichever one has focus, and the buttons that fill the field carry the word in their accessible name as well, such as "Choose Cover, Required".
  - The **markdown** field answers yes. Its editable element carries `role="textbox"`, which takes `aria-required`, and the control props reach it through ProseMirror's own `attributes` prop rather than by reaching into Milkdown's `contenteditable`, see [markdown-editor.md](./markdown-editor.md#what-the-field-tells-the-editor).

- **`SlugControl` resolves its source ids** through `useFieldDefinitions()` ([`hooks/useFieldDefinitions.ts`](../../src/renderer/hooks/useFieldDefinitions.ts)), provided by the `FieldDefinitionsProvider` ([`providers/FieldDefinitionsProvider.tsx`](../../src/renderer/providers/FieldDefinitionsProvider.tsx)) that `EntryForm` wraps its fields in. Outside of it (for example the Collection editor preview) the input is simply manual.

#### Drawing a field from a definition

- **`FieldFromDefinition`** ([`fields/field-from-definition.tsx`](../../src/renderer/components/fields/field-from-definition.tsx)) is the entry point: one `AppField` built from a field definition and bound to any path, so the same field fills an Entry, a section of a dynamic field and a row of [the dialog of a refused change](#the-dialog-of-a-refused-field-definition-change). That row is why it takes two optional props: a `label`, where one field stands for one Entry and the label says which, as text for the control and as a node for what stands above it, and a `missingWarning`, where what a missing Value means is something other than the language it is missing in. It owns the single `Controller` at `name`, reaches the type's folder for the control, and decides `disabled`, which is the definition's `isDisabled` OR the field's own disabled state OR the enclosing `AppForm`'s view mode. Folding the mode in here rather than per type is what keeps a non-native control, the markdown `contenteditable`, from staying editable in a diff, see [forms.md](./forms.md#view-only-forms-and-diffs).
- **`FieldDefinitionPreview`** ([same file](../../src/renderer/components/fields/field-from-definition.tsx)) is the Collection and Component editors' non-editable preview. It draws the one field shell with no form behind it (`FieldShell`) plus the drag, edit and delete chrome: the control holds a static Value from the type's `previewContent`, so there are no phantom form paths and the label still names a real, disabled control, which is what makes those previews addressable by `getByLabel`. Its edit control is rendered only where the caller passes `onEdit`, which the editor does for a type whose folder carries an `EditSheet`, see [Growing a dynamic field](#growing-a-dynamic-field). A `dynamic` definition draws its sections editor rather than one input, so its preview carries no labelled form control and the `id` lands on that editor's group instead.
- **No field opens a dialog for its translations**, generated or hand-written. One switch above the whole form sets the language every translatable field is bound to, and a field reads it from `useFormLanguage()`, see [internationalization.md](./internationalization.md#one-language-at-a-time). The hand-written name and description fields of a Collection, a Component and a field definition bind the language that switch holds, so no per-field dialog is left anywhere: `grep -rn "TranslatableField" src/renderer` answers nothing.

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
      />
    ))}
  </AppForm>
);
```

`FieldFromDefinition` takes the form via the `form` prop (not `control`) and a required `name`. The language it edits comes from the form around it rather than from a prop, see below.

### The path a Value is bound to

`name` is the path to the field's `content`, without a language. `FieldFromDefinition` appends the language the form is in when the type's folder says the Value is translatable, so no call site has to know which types are. That matters because the one type that is not, `dynamic`, binds to `content` itself: its Value is a flat array of Component items and has no language to end at.

The language comes from `useFormLanguage()` ([`hooks/useFormLanguage.ts`](../../src/renderer/hooks/useFormLanguage.ts)), which `EntryForm` provides from the switch above the fields, so one switch takes a whole Entry into another language and every field of it stays bound to the same one. A generated field outside such a form is a programming error rather than a case with a default, which is why the hook throws instead of falling back to a language of its own.

Each field also watches the same Value in the Project's default language, which is what stands below a Value the language on screen is still missing, as "In English: ...". A field that cannot be translated from anything, which is the default language itself and the `dynamic` type, watches the path it already draws, so no field carries a second subscription it has no use for.

### A Value that holds nothing

Whether one language's content of a Value holds nothing is the field type's own answer, `isEmpty`, which every folder takes from one of the contracts in [`fields/empty-values.ts`](../../src/renderer/components/fields/empty-values.ts): nothing at all, an empty text or an empty list for most types, and Core's own `isEmptyParagraphOnly` for markdown. Nothing there reads a field type either.

One function over the field definitions, the Values and the Project's languages answers how many required Values each language is still missing, in [`fields/missing-values.ts`](../../src/renderer/components/fields/missing-values.ts). It is what Save's block reads for its reason, what the language switch marks a language by and what puts the Missing badge on a row of the list of Entries, so those three can never disagree. `missingResolutionValues` beside it answers the same for the Values a refused field definition change needs, which sit per Entry rather than per field, through the same `isMissingValue` each row marks itself with. It walks a dynamic field's sections as well, through the Components they are built from, because Core demands each required Value of a section in every language too. [`tests/specs/missing-values.spec.ts`](../../tests/specs/missing-values.spec.ts) holds it against Core's own schema for every field type, both ways: what it calls empty Core refuses, and what it calls filled Core takes.

**A field asks that question of its own Value alone.** `FieldFromDefinition` watches the one path it is bound to, with `exact`, and asks `isMissingValue` from what it gets, so it draws itself again when its own mark changes rather than when anything in the Entry does. Without `exact` a watch is also handed every change below its path, and the field that holds the sections is bound to the list itself, so it was handed every keystroke typed inside any of its sections and drew the whole list again on each: in an Entry of ten sections one keystroke inside one of them cost about ten times what it costs in an Entry of three fields. The page's own count goes through `useMissingValues`, see [forms.md](./forms.md#saves-block).

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

The field is therefore **several controls rather than one**. The control-association props land on their container, which is what the label points at, and every button inside names the same `aria-describedby`, so the rules, the description and the error are read out with whichever button has focus. The accessible name of every Choose, Replace and Remove button includes the field's label, as ci asks: "Choose Cover", "Replace Cover", "Remove Mara Klein from Authors". The Supported languages field of the Project form shares the container half of this pattern: it is several controls too, so the control-association props land on its container there as well, with `aria-required` dropped. Its own buttons name neither the field nor that container's description. Either container is a `group` named by the field's label, which is also the last place the focus lands once a row is removed, see [Keeping focus after a row is removed](./forms.md#keeping-focus-after-a-row-is-removed).

**Both pickers are one dialog each**, in [`components/pickers/`](../../src/renderer/components/pickers/) rather than in a field type's folder, because they are about Assets and Entries rather than about a field type: the Asset field, the Entry field and the markdown editor's two reference pickers all open them. Each has a filter above a list that scrolls below it, draws the Assets as ci's grid of four ruled columns and the Entries as its ruled rows, and carries a radio button per item where the field takes one and a checkbox where it takes several. What is chosen is marked by that control alone, so no row or card takes a surface or a border of its own. Its one line below the title says what the field takes, such as "Images only." or "Up to 2 Entries.", and the dialog adds how many are ticked right now, so an item disabled at the maximum says why. What is ticked stays inside the dialog until Choose is pressed, so Cancel changes nothing, and the field's maximum holds there: an item that is not ticked is disabled once the maximum is.

The Asset picker's grid is the Assets screen's own, from [`components/asset-card.tsx`](../../src/renderer/components/asset-card.tsx), so an Asset reads here the way it reads there: its preview, the file name it is stored under and its type and size. Beside the filter stands Add Asset, as ci draws it, through [`components/add-asset-button.tsx`](../../src/renderer/components/add-asset-button.tsx): it opens the system's file dialog and then asks for the name and the description Core requires, in a dialog of its own, because a picker has no pane to ask in. What it adds lands in the grid the picker is showing, since the create writes the new Asset into the same list the picker reads.

Their controls fetch data from within the form. `AssetControl` and `EntryControl` (each in its own folder) load the Assets or Entries with TanStack Query (the entry field uses `useQueriesNoError` to load Entries across several Collections). Both pickers name each Entry with `entryTitle`, the one way the app names one.

Their definition forms add type-specific options:

- The asset definition form ([`fields/asset/definition.tsx`](../../src/renderer/components/fields/asset/definition.tsx)) exposes `min` / `max` (how many Assets may be selected) plus `ofAssetMimeTypes` through its spec's `Extras`.
- The entry definition form ([`fields/entry/definition.tsx`](../../src/renderer/components/fields/entry/definition.tsx)) adds an `ofCollections` list that restricts which Collections can be referenced (backed by a Collections query), plus `min` / `max`.
- The dynamic field's own settings ([`fields/dynamic/definition.tsx`](../../src/renderer/components/fields/dynamic/definition.tsx)) are modelled on it: the Components a section may be built from as rows with Add and Remove, backed by a Components query, plus the `min` / `max` section counts. Each row carries its Component's name, so a Component is never shown by its id.

`ofAssetMimeTypes` is edited through the shared [`mime-type-rows.tsx`](../../src/renderer/components/forms/mime-type-rows.tsx), which the asset field's settings and the markdown field's both take (where it restricts `assetReference` targets and only shows while `features.assetReferences` is on). Add offers the distinct MIME types of the Project's own Assets rather than a hardcoded universe, and an empty list means "any type".

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

One typing point is specific to this side. `useDefinitionsEditor` binds `fieldDefinitions` as a single `Controller`-bound value, edited through typed add / change / remove / move helpers, not as a `useFieldArray` of opaque `{ id }` rows. react-hook-form cannot type a field array whose element is the deep `FieldDefinitionOrGroup` union, and the opaque rows previously overwrote the definitions' real ids, which was the latent slug-source id bug. Keeping the real ids is also what makes a Component's update safe: Core matches field definitions by `id`, so a new one would read as a removal plus an addition and drop the content of every Entry holding the Component. A field's own settings bind a path inside that value, which is how a refusal of one key lands on the control it is about, see [one form, one unsaved state](#one-form-one-unsaved-state).

**Benefits:**

- Type-safe form data (inferred from generated Zod schema)
- Automatic validation based on field definitions
- Consistent validation between frontend and backend
- User-friendly error messages
- Prevents invalid data from reaching Core

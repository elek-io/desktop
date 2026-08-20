# Forms

Forms are the largest surface of this app. Every create, update and view flow the
user has is a form, and they all share one submission model, one submit control,
one way to handle expected errors, and one set of typed field wrappers that carry
the value contracts Core expects.

This document covers that shared layer, which every form uses. Forms whose fields
are generated at runtime from a Collection's field definitions have a second layer
on top, documented in [dynamic-form-field-generation.md](./dynamic-form-field-generation.md).

The four shared form components live in [`components/forms/`](../../src/renderer/components/forms/)
(project, collection, entry and asset), and the field-definition authoring engine
adds a fifth in the same folder. The remaining forms are written inline in their
route. To find every form in the app, `grep -rn "<AppForm" src/renderer`.

## Form invariants

Read these before touching any form. Each is enforced (a compile error, a lint
error, or a test), so a change that breaks one fails CI rather than shipping. Why
they exist is in [Why it is built this way](#why-it-is-built-this-way).

- **Every form is an `AppForm`.** It is the only place a `<form>` element is
  written. It owns `noValidate`, the `handleSubmit` wiring, the `id` a detached
  button associates with, `stopPropagation` (so a nested form cannot cross-submit
  its parent), and the view-only `mode`. A lint rule bans a raw `<form>` anywhere
  else.
- **Every submit control is a `SubmitButton`.** It sets `type="submit"` and the
  form association structurally, so a submit button can never silently do nothing.
  `SubmitButtonProps` omits `type` and `asChild`, so neither can be passed, and
  the caller's props are spread before the structural ones rather than after. A
  lint rule bans a literal `type="submit"` outside `app-form.tsx`.
- **A failed submit is never silent.** `AppForm` passes `handleSubmit` an
  `onInvalid` that reports any validation error no mounted message covers, and
  routes a rejection thrown after the awaited `onSubmit` to the root error
  boundary. See [When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
- **Every field type has a `DefinitionSpec` and a `RenderSpec`.** Both
  `FIELD_DEFINITION_REGISTRY` (authoring) and `RENDER_REGISTRY` (rendering) are
  exhaustive `Record<FieldType, ...>`, so adding a Core field type is a compile
  error until both have an entry. No hand-synced "which types are supported" set
  exists. See [dynamic-form-field-generation.md](./dynamic-form-field-generation.md).
- **The registry emits no native constraint attributes.** No `required` / `min` /
  `max` / `minLength` / `maxLength` reaches an input, and zod through
  react-hook-form is the sole validator. The one exception is the range `Slider`'s
  `min` / `max`, which is its functional value domain. A test asserts a required
  field renders without them. Required-ness still reaches assistive tech through
  `aria-required`, an ARIA state that never blocks submit.
- **By-type `CoreError` handling goes through `useAppMutation`.** Its `handled`
  map is the single source of the "expected" set, never a blanket
  `throwOnError: false`. Unhandled failures reach the root error boundary. See
  [error-handling.md](../error-handling.md).

## Writing a form

Form state lives in the route or component that owns the mutation, not inside
`AppForm`. `AppForm` takes the form object as a prop, so calling `useForm` at the
call site is correct and expected.

A form has four parts:

1. A `useForm` with a zod resolver built from a Core schema.
2. A mutation, usually `useMutation` with the matching
   [`queryOptions`](../../src/renderer/queries/options/), or `useAppMutation` when
   a specific `CoreError` should be handled on the page.
3. An `id`, from `useId`, shared between the form and its submit button.
4. An `AppForm` wrapping the fields, and a `SubmitButton` inside a `FormActions`.

[`routes/projects/create.tsx`](../../src/renderer/routes/projects/create.tsx) is
the smallest complete example:

```tsx
const createProjectForm = useForm<CreateProjectProps>({
  resolver: zodResolver(createProjectSchema),
  defaultValues: { name: '', description: '', ... },
});
const { mutateAsync: createProject, isPending } = useMutation(
  queryOptions.projects.create
);
const formId = useId();

const onCreate: SubmitHandler<CreateProjectProps> = async (project) => {
  const newProject = await createProject(project);
  await router.navigate({ to: '/projects/$projectId', params: { projectId: newProject.id } });
};

// The submit button, rendered in the Page header (outside the form).
<FormActions form={createProjectForm} id={formId}>
  <SubmitButton Icon={Check}>Create Project</SubmitButton>
</FormActions>

// The form itself, rendered in the Page body.
<ProjectForm id={formId} projectForm={createProjectForm} onFormSubmit={onCreate} />
```

`ProjectForm` renders an [`AppForm`](../../src/renderer/components/ui/app-form.tsx),
which owns the policies that used to be pasted at each call site:

- **`noValidate`** is always set. It is not a prop, so it cannot be forgotten. Zod
  through react-hook-form is the single validator, so the browser's native
  constraint check must never run first and block `handleSubmit`. This is only
  safe because the field layer emits no native constraint attributes, so there is
  nothing for the browser to reject.
- **`handleSubmit`** is always wired.
- **The submit event is always `stopPropagation`d**, so an `AppForm` rendered
  inside another form's React subtree cannot cross-submit its parent. This is not
  theoretical. A Sheet or Dialog is portaled out of the outer form's DOM, but React
  still bubbles the synthetic submit event up the React tree, so the Add Field
  sheet used to create the whole Collection when you added a field to it.
- **`mode="view"`** renders the form read-only through a disabled `<fieldset>` and
  makes submit a no-op. It also reaches the render registry through the
  `AppFormContext`, see [View-only forms and diffs](#view-only-forms-and-diffs).

## Detached submit buttons

A form's primary action usually lives in the `Page` header or a dialog or sheet
footer, outside the `<form>` subtree. That is the normal case, not the exception.

`SubmitButton` is the only submit control. It sets `type="submit"` and associates
back with `form={id}`, the HTML form-association mechanism, so a click in the
header fires a real submit event on the form in the body. Because both the `type`
and the association are structural, a submit button can never silently do nothing.

A detached button sits outside the form's provider, so it cannot read `formState`
there. **`FormActions`** bridges that gap. Wrap the header or footer area in
`<FormActions form={form} id={formId}>` and the enclosed `SubmitButton` gets the
form id plus reactive gating:

- **Pending gating is always on.** The button disables and shows a loading state
  while `isSubmitting` is true, which spans the awaited `mutateAsync` inside the
  submit handler.
- **Dirty gating is opt-in** per form, through `requireDirty` on the button.
  Update forms use it so Save stays disabled until something changes. Create forms
  do not, so the button is available immediately and validation happens on click.

Do not disable a submit button to express "the form is invalid". Validation runs
on submit and reports through `FormMessage` and `aria-invalid`.

## View-only forms and diffs

The history and diff views reuse the same form components rather than a second
read-only rendering path. Pass `isViewOnly` (which the shared components map to
`AppForm`'s `mode="view"`), and the whole form renders inside a disabled
`<fieldset>` with submit turned off.

A disabled `<fieldset>` only turns off native form controls, so it does nothing
for a leaf that is not one. The markdown field is the case: it is a Milkdown
`contenteditable`, which stayed typable in a diff. `AppForm` therefore publishes
its `mode` on the `AppFormContext`
([`hooks/useAppFormContext.ts`](../../src/renderer/hooks/useAppFormContext.ts)),
and `FormComponentFromFieldDefinition` reads it with `useAppFormMode()` and ORs it
into the `disabled` it hands the registry leaf. Every leaf already takes
`disabled`, so this is one fold at the dispatch rather than a per-type opt-in, and
a new field type inherits it. That context is a separate module because
`app-form.tsx` imports `form.tsx`, so the dependency has to run the other way.

[`components/collection-diff.tsx`](../../src/renderer/components/collection-diff.tsx)
does this: one view-mode form for a create or a delete, and a before/after pair
for an update. Because it is the same component the editor uses, a field added to
the editor shows up in the diff with no extra work.

## When an error has no field to land on

A form is only honest if pressing Save either saves or says why not. Two paths
used to end nowhere, and `AppForm` closes both.

**A validation error with no mounted message.** zod validates the whole form
value, so an error can land on a path that no field renders. The Collection
editor is the standing case: its `fieldDefinitions` array is one
`Controller`-bound value drawn as previews, so a Core refinement reporting
`fieldDefinitions.0.label.de` had no `FormMessage` to appear in and no input to
focus. Save simply did nothing.

`AppForm` now passes `handleSubmit` an `onInvalid`. Every component that renders
messages claims the paths it covers through `useErrorTarget(name)` (`FormMessage`
claims its own path, `TranslatableField` claims its base path because the dialog
trigger flags a hidden language). On a failed submit `AppForm` flattens
`formState.errors`, subtracts everything a claimed path covers, and renders what
is left in a focused `role="alert"` at the top of the form, plus an error through
Core's logger so it is loud in a dev run. That surface is a backstop for a bug,
not a design: an error that reaches it should get a real home.

Giving one a real home is what `FormSubtreeMessage` is for. Point it at a value
that is bound as a single `Controller` but rendered as something else, and it
renders every message at or below that path and claims the subtree:

```tsx
<FormSubtreeMessage form={collectionForm} name="fieldDefinitions" />
```

A plain `FormMessage` cannot serve there, because it only shows the message
sitting at its own exact path, and a nested refinement never leaves one there.

The UX follows the rest of the app: nothing is disabled to express "invalid",
validation runs on the submit click, and the error appears then.

**A rejection thrown after the awaited `onSubmit`.** `handleSubmit` re-throws
whatever `onSubmit` rejected with, after awaiting it. By then the submit event is
long over, so a floated call left an unhandled rejection that reached no React
boundary. `AppForm` catches it and re-throws it during render, where the root
error boundary takes it.

This does not disturb the `useAppMutation` recipe below, whose `catch` sits
inside `onSubmit`: a handled `CoreError` never rejects out of the handler, so it
stays in place. What reaches the boundary is what nothing chose to handle.

## Handling submit errors by type

A form's `onSubmit` awaits a TanStack Query mutation. Most failures should reach
the root error boundary, but some expected `CoreError` types should be handled in
place instead of taking over the screen. An Entry that collides with another Entry
on a unique field is the canonical case.

[`useAppMutation`](../../src/renderer/hooks/useAppMutation.ts) is the single home
for that. Pass a `handled` map from `CoreError` type to an in-place handler. The
hook derives both the mutation's `throwOnError` predicate (false only for the
handled types) and its `onError` (suppressed for the handled types, delegated to
the wrapped options for every other) from that one map, so the predicate and the
dispatch can never drift. It returns a `handleError(error)` to call from the
`catch` of `await mutateAsync(...)`:

```tsx
const { mutateAsync, handleError } = useAppMutation(queryOptions.entries.create, {
  handled: {
    Conflict: (error) => {
      setConflictError(error);
      setIsConflictDialogOpen(true);
    },
  },
});

try {
  await mutateAsync(props);
  await router.navigate({ ... });
} catch (error) {
  handleError(error);
}
```

Keep the success path inside the `try`, so a handled failure skips it. Every other
failure still propagates to the boundary. Never opt a whole mutation out with a
blanket `throwOnError: false`. The full recipe, including how to map a type to
user-facing copy, is in [error-handling.md](../error-handling.md).

Most forms do not need this. A plain `useMutation` sends every failure to the
boundary, which is the right default.

## Form typing

Core's generated entry and collection schemas transform a loose input into a
strict `*Props` output (their `values` is a `z.pipe`, and Collections carry
recursive mdast), so their `z.input` differs from their `z.output`. Two rules
follow:

- **Do not pass an explicit `useForm<...>()` generic** when the resolver comes
  from a generated or recursive Core schema. Let react-hook-form infer from
  `zodResolver(schema)`: the form values become the schema input and
  `handleSubmit` yields the typed output. What breaks is passing the `*Props`
  output type as the sole generic, which makes the resolver unassignable and, for
  the recursive Collection schema, produces a "two unrelated types" error. A
  static schema like `createProjectSchema` has no such divergence, so
  `useForm<CreateProjectProps>` is fine there.
- **Shared form components are generic over the schema input shape**, not the
  `*Props` union, so a concrete caller (create, update, or a view-only diff) is
  assignable without variance errors. They take
  `UseFormReturn<TFieldValues, unknown, TTransformedValues>`.

### Resolve against Core's language-aware schema, not the wire schema

Core exports two flavours of each Collection/Component/Entry schema. The bare
one (`updateCollectionSchema`) is the wire schema, where
`partialTranslatableStringSchema` makes every language key optional. The
language-aware factory (`getUpdateCollectionSchemaFromLanguages(languages)` and
its create/component/entry siblings, from Core's `strictEntitySchema.ts`) adds
the rule Core enforces on the way in: a non-empty string for every Project
language.

Resolve a form against the factory, not the wire schema, so client validation
matches what Core will accept. The gap the wire schema leaves open is real: a
Collection written when the Project had one language has no key for a language
added later, and the wire schema permits that while Core rejects it. The factory
flags the missing language on its own field (Core reports the nested path, e.g.
`fieldDefinitions.0.fieldDefinitions.1.label.de`, since 0.22.0).

Build the schema each render from the loaded Project's languages, falling back
to an empty set until it loads, exactly as the Entry routes do:

```typescript
const schema =
  isReadingProject === false
    ? getUpdateCollectionSchemaFromLanguages(
        project.settings.language.supported
      )
    : getUpdateCollectionSchemaFromLanguages([]);
const form = useForm({ resolver: zodResolver(schema) /* ... */ });
```

This keeps Core the single source of truth: the form needs no compensating
pre-seed and no refinement of its own.

`ProjectForm` and `CollectionForm` each view their generic form as a concrete
`Update*Props` internally, because react-hook-form's `FieldPath` cannot resolve a
literal path for an unresolved generic. Those two
`as unknown as UseFormReturn<...>` casts are the one documented exception to the
cast guardrail below, each carrying an inline comment and a `@todo`. `AssetForm`
avoids even that by staying generic and casting only field names
(`as FieldPath<T>`).

`EntryForm` used to be a third. Its cast changed no field values at all: it only
erased the third generic, because `FormFieldFromDefinition` declared its `form`
as `UseFormReturn<TFieldValues>`. Carrying a defaulted
`TTransformedValues extends FieldValues = TFieldValues` through
`FormFieldFromDefinition` and `FormField` removed the need for it, and the generic
is never read, since only `control` and `formState.errors` are used and both are
typed by `TFieldValues` alone. That is the shape of the fix for a cast that only
erases a generic, as opposed to the two above, which genuinely re-view the value
type.

## The form primitives

[`components/ui/form.tsx`](../../src/renderer/components/ui/form.tsx) holds the
primitives every form composes:

- **`FormField`** is the react-hook-form `Controller` plus the context the pieces
  below read.
- **`FormItem`** mints the ids that tie a label, description and error message to
  the input.
- **`FormLabel`**, **`FormDescription`** and **`FormMessage`** render those parts.
  `FormLabel` takes `isRequired` and appends a " - optional" suffix when it is
  false, so required fields are the unmarked default.
- **`FormSubtreeMessage`** renders every message at or below one path, for a value
  bound as a single `Controller` but drawn as something other than a field. See
  [When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
- **`FormControl`** is a Radix `Slot` that lands `id` and the `aria-*` attributes
  on its single child. Use it in hand-written forms whose leaf is a plain DOM
  input. The dynamic field path does not use it, because a `Slot` can only reach
  the leaf's outermost element, which is a wrapper `div` or a non-DOM Radix root
  for several field types. That path uses `ControlledLeaf` instead, described in
  [dynamic-form-field-generation.md](./dynamic-form-field-generation.md#the-render-registry).

### Typed field wrappers and their value contracts

The wrappers below bind a base control to react-hook-form and own the value
transformation Core expects. Do not hand-roll a raw `<Input>` in a form, because
these contracts are easy to get subtly wrong and Core validates tightly:

- They return `null` for an empty value instead of an empty string. Core schemas
  use `.nullable()`, so `''` fails validation.
- `FormInputField` with `type="number"` coerces the string input to a number.
- `FormInputField` maps Core field types that have no HTML input type of the same
  name: `telephone` to `tel`, `ipv4` and `slug` to `text`, `datetime` to
  `datetime-local`. Pass the Core field type, not a hand-rolled HTML one.
- `FormDateField` stores a `YYYY-MM-DD` string, not a `Date`.
- `FormDatetimeField` converts between the ISO UTC datetime Core stores and the
  local time a `datetime-local` input speaks.
- `FormSelectField` keys its options by index, because Radix forbids an empty item
  value and an option's value may be an empty string. It maps back on change, so
  the stored value keeps its string or number type.
- `FormRangeField` bridges the Radix `Slider`'s `number[]` and the single number
  the Value holds.
- `FormAssetField` and `FormEntryField` hold an array of `{ id, objectType }`
  references, fetch their selectable objects with TanStack Query from inside the
  form, and enforce the definition's `max` in the UI.
- `FormSlugField` derives the slug live from its source fields while the value is
  empty or still equals the last derived value, so a stored slug is never
  rewritten. Manual input is made canonical on blur.
- `markdown` fields render the Milkdown based editor through a thin adapter, see
  [markdown-editor.md](./markdown-editor.md).

Each wrapper places the control props on its real focusable element (the `input`
for the scalars, the `SelectTrigger` for select, the dialog trigger button for the
reference fields), so a label, description and error always point at something a
user can focus.

## Guardrails

These make the fixed bug classes hard to reintroduce. Each lint rule was proven to
fire on an intentional violation.

- **A raw `<form>` outside `app-form.tsx` is a lint error.** Kills layout-only
  `<form>` elements and stray submission paths. Blunt by design, since it matches
  the literal element.
- **A literal `type="submit"` outside `app-form.tsx` is a lint error.** A computed
  `type={variable}` slips through, which is acceptable. It is a backstop, and
  submit controls should be `SubmitButton` anyway.
- **The whole-form laundering casts `as unknown as UseFormReturn` and
  `as unknown as Control` are a lint error** across the whole renderer, so a new
  one is caught anywhere and not only in the form files. `ProjectForm` and
  `CollectionForm` are exempted by a file-scoped override as a documented, tracked
  exception (see [Form typing](#form-typing)). Banning globally while those exist
  would have left a red baseline, which is not a guardrail. It is a backstop, not
  a proof, since an aliased or single-step cast still slips through.
- **Both registries are exhaustive `Record<FieldType, ...>`**, so adding a Core
  field type fails to compile until both have an entry.
- **`SubmitButton` sets `type="submit"` structurally** and `AppForm` owns
  `noValidate`, the `id` and `stopPropagation`. None of these are props a caller
  can get wrong: `SubmitButtonProps` omits `type` and `asChild` outright, so
  passing either is a compile error rather than a button that renders as a submit
  control and does not submit.
- **A test asserts no native constraint attributes.** An E2E spec in
  [`tests/specs/entries.spec.ts`](../../tests/specs/entries.spec.ts) checks that a
  rendered required text and number field carry no `required` / `min` / `max` /
  `minLength` / `maxLength`, that they do carry `aria-required`, that an optional
  field does not, and that the range slider keeps its `aria-value*` domain.

All three lint rules live in [`eslint.config.mjs`](../../eslint.config.mjs). Note
that a rule's options replace rather than merge with an earlier config block's, so
every renderer block that touches `no-restricted-syntax` re-lists the shared enum
ban.

One rule was deliberately **not** written: "forbid `useForm` outside
`components/forms`". It is self-contradictory, because `AppForm` takes the form
object as a prop, so every route legitimately calls `useForm` and hands it in.
Centralize the policies in `AppForm`, not the `useForm` call.

## Why it is built this way

The root cause of the bugs this layer fixes was a missing abstraction, not the
wrong library. Every cross-cutting policy used to be applied per call site, so
each rollout took a sweep of 7 to 16 files and at least one follow-up regression.
Adding one place that owns a form's behavior fixes the class, not the instance.

**Why react-hook-form and zod stayed.** The library was not the problem. The two
hardest constraints, recursive-type instantiation depth and `z.input`/`z.output`
divergence, are not solved by any alternative, so a migration would have risked a
green E2E suite to fix the least important problem.

**Why not TanStack Form.** Its `createFormHook` composition is a genuinely better
answer to the generic-component path problem. But it has the same open recursion
defect (issues #1484 and #1553), and its `onSubmit` receives raw input rather than
the schema's parsed output, so the input/output divergence becomes manual. It
would have cost a full rewrite of the form layer to fix the least important
requirement.

**Why not React 19 form actions or Conform.** Both are built around FormData and
uncontrolled inputs, and the action model targets server functions rather than a
client-only IPC mutation. FormData cannot round-trip this app's value shapes, an
mdast tree, an array of references, or a per-language record, without a bespoke
codec per field. The useful insight, that native submission is safe when the form
always sets `noValidate` and never emits native constraint attributes, was adopted
without the rest.

**Why not JSONForms, RJSF or uniforms.** Core emits zod, and its schemas carry
`.pipe`, `.transform` and recursion that make a JSON Schema conversion lossy, so
we would be converting away from the source of truth. Their core pattern, a
registry keyed by field type where each entry has a uniform value contract, is
exactly right, and is what the two registries adopt bespoke on top of
react-hook-form.

**Why `fieldDefinitions` is `Controller`-bound and not a `useFieldArray`.**
react-hook-form cannot type a field array whose element is the deep
`FieldDefinitionOrGroup` union, which forced opaque `{ id }` rows and casts. Worse,
react-hook-form overwrites each row's `id` with its own render key, so the slug
source picker stored render keys instead of the definitions' real ids, which Core
then rejected. A `Controller` holds one opaque value react-hook-form never
introspects, so it sidesteps the depth limit and keeps the real ids.

**Why not a `useReducer` for the same array.** It would sit outside the resolver,
so the Collection schema's refinements would not run, `formState.isDirty` would
not flip on a definition-only edit, and `reset()` would not hydrate it. Keeping
the array inside form state avoids a second source of truth.

**Why `CoreError` handling sits at the mutation layer.** Folding it into
`AppForm.onSubmit` is tempting but is a layer confusion. In-place handling
requires overriding the mutation's `throwOnError` predicate and its `onError`,
both of which belong to the `useMutation` call that `AppForm` does not own.
`useAppMutation` puts the policy where the mutation is.

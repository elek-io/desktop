# Forms

Forms are the largest surface of this app. Every create, update and view flow the
user has is a form, and they all share one submission model, one submit control,
one way to handle expected errors, and one set of typed field wrappers that carry
the value contracts Core expects.

This document covers that shared layer, which every form uses. Forms whose fields
are generated at runtime from a Collection's field definitions have a second layer
on top, documented in [dynamic-form-field-generation.md](./dynamic-form-field-generation.md).

The shared form components live in [`components/forms/`](../../src/renderer/components/forms/)
(project, collection, component, entry and asset), and the field-definition
authoring engine plus the one field definitions editor both Collection and
Component forms render sit in the same folder. The remaining forms are written inline in their
route, except the two in
[`report-dialog.tsx`](../../src/renderer/components/report-dialog.tsx), which are
reached from the header and from the root error boundary rather than from a route.
To find every form in the app, `grep -rn "<AppForm" src/renderer`.

Everything the app knows about a single field type lives in that type's own
folder under [`components/fields/`](../../src/renderer/components/fields/),
never here, see
[dynamic-form-field-generation.md](./dynamic-form-field-generation.md).

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
  `SubmitButtonProps` omits `type` and `render`, so neither can be passed, and
  the caller's props are spread before the structural ones rather than after. A
  lint rule bans a literal `type="submit"` outside `app-form.tsx`.
- **A failed submit is never silent.** `AppForm` passes `handleSubmit` an
  `onInvalid` that reports any validation error no mounted message covers, and
  routes a rejection thrown after the awaited `onSubmit` to the root error
  boundary. See [When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
- **Every field is an `AppField`.** It is the only thing that draws a label, a
  description and an error, and it draws them in shadcn's `Field`. A field with
  no form behind it, the Collection editor's previews, uses the same shell
  through `FieldShell`. `name` is typed against the form passed in, so a path
  that form does not hold is a compile error at the call site. See
  [The field shell](#the-field-shell).
- **Every field type has a folder, and the registry is exhaustive over Core's
  `FieldType`.** A field type Core adds fails to compile until it has one, and
  nothing outside a type's folder branches on a field type or a value type,
  which a lint rule holds. See
  [dynamic-form-field-generation.md](./dynamic-form-field-generation.md).
- **Every form is built with `useAppForm` and filled through `values`.** A lint
  rule keeps react-hook-form's own `useForm` to that one wrapper and refuses a
  `reset()` inside an effect. See
  [loading-and-updating-data.md](./loading-and-updating-data.md#filling-a-form-from-its-query).
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
`AppForm`. `AppForm` takes the form object as a prop, so calling `useAppForm` at
the call site is correct and expected.

A form has four parts:

1. A `useAppForm` with a zod resolver built from a Core schema, and `values` and
   `disabled` where it is filled from a query, see
   [loading-and-updating-data.md](./loading-and-updating-data.md#filling-a-form-from-its-query).
2. A mutation, usually `useMutation` with the matching
   [`queryOptions`](../../src/renderer/queries/options/), or `useAppMutation` when
   a specific `CoreError` should be handled on the page.
3. An `id`, from `useId`, shared between the form and its submit button.
4. An `AppForm` wrapping the fields, and a `SubmitButton` inside a `FormActions`.

[`routes/projects/create.tsx`](../../src/renderer/routes/projects/create.tsx) is
the smallest complete example:

```tsx
const createProjectForm = useAppForm<CreateProjectProps>({
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
  makes submit a no-op. It also reaches the generated fields through the
  `AppFormContext`, see [View-only forms and diffs](#view-only-forms-and-diffs).
  A form that is only still loading is not this: it carries `disabled` instead,
  see [loading-and-updating-data.md](./loading-and-updating-data.md#filling-a-form-from-its-query).
- **`fieldsetClassName`** styles that inner `<fieldset>`. It exists because the
  fieldset sits between the `<form>` and its content, so a caller laying the form
  out cannot reach it, and its default sizing breaks any containment the caller
  set up. The report dialog is the case: `DialogContent` is a three-row grid whose
  middle row scrolls while the footer stays put, and without a
  `flex min-h-0 flex-1 flex-col` fieldset the scroll area is unbounded and the
  footer is pushed off. Style it through this prop rather than working around it
  at the call site, since `AppForm` owns that element.

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
on submit and reports through the field's own error and `aria-invalid`. A form
that is still filling from its query is the one other thing that disables Save,
see [loading-and-updating-data.md](./loading-and-updating-data.md#filling-a-form-from-its-query).

## View-only forms and diffs

The history and diff views reuse the same form components rather than a second
read-only rendering path. Pass `isViewOnly` (which the shared components map to
`AppForm`'s `mode="view"`), and the whole form renders inside a disabled
`<fieldset>` with submit turned off.

A disabled `<fieldset>` only turns off native form controls, so it does nothing
for a control that is not one. The markdown field is the case: it is a Milkdown
`contenteditable`, which stayed typable in a diff. `AppForm` therefore publishes
its `mode` on the `AppFormContext`
([`hooks/useAppFormContext.ts`](../../src/renderer/hooks/useAppFormContext.ts)),
and `FieldFromDefinition` reads it with `useAppFormMode()` and ORs it into the
`disabled` it hands the type's control. Every control already takes `disabled`,
so this is one fold rather than a per-type opt-in, and a field type Core adds
inherits it. [`tests/specs/history.spec.ts`](../../tests/specs/history.spec.ts)
drives it on the markdown field.

[`components/collection-diff.tsx`](../../src/renderer/components/collection-diff.tsx)
does this: one view-mode form for a create or a delete, and a before/after pair
for an update. Because it is the same component the editor uses, a field added to
the editor shows up in the diff with no extra work.
[`components/component-diff.tsx`](../../src/renderer/components/component-diff.tsx)
is the same shape for a Component.

## When an error has no field to land on

A form is only honest if pressing Save either saves or says why not. Two paths
used to end nowhere, and `AppForm` closes both.

**A validation error with no mounted message.** zod validates the whole form
value, so an error can land on a path that no field renders. The field
definitions editor is the standing case: its `fieldDefinitions` array is one
`Controller`-bound value drawn as previews, so a Core refinement reporting
`fieldDefinitions.0.label.de` had no field message to appear in and no input to
focus. Save simply did nothing.

`AppForm` now passes `handleSubmit` an `onInvalid`. Every component that renders
messages claims the paths it covers through `useErrorTarget(name)` (`AppField`
claims its own path, `TranslatableField` claims its base path because the dialog
trigger flags a hidden language). On a failed submit `AppForm` flattens
`formState.errors`, subtracts everything a claimed path covers, and renders what
is left in a focused `role="alert"` at the top of the form, plus an error through
Core's logger so it is loud in a dev run. That surface is a backstop for a bug,
not a design: an error that reaches it should get a real home.

Giving one a real home is what `FieldSubtreeError` is for. Point it at a value
that is bound as a single `Controller` but rendered as something else, and it
renders every message at or below that path and claims the subtree:

```tsx
<FieldSubtreeError form={form} name="fieldDefinitions" />
```

An `AppField` cannot serve there, because it only shows the message sitting at
its own path, and a nested refinement never leaves one there.

One case looks nested and is not. `@hookform/resolvers` moves an error reported
on an array itself under `root` as soon as any path inside that array is a
registered field name, which a dynamic field's sections are the moment one has
been mounted. So a required dynamic field whose last section was just removed
reported `values.sections.content.root`, which the field's own message did not
show and `AppForm`'s backstop counted as covered, and the submit said nothing at
all. `AppField` reads that `root` error as the field's own, so the message lands
on the field it belongs to. A nested error object without a
`root` is left alone, so a field holding only errors below it still renders no
message of its own.

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

- **Do not pass an explicit `useAppForm<...>()` generic** when the resolver comes
  from a generated or recursive Core schema. Let react-hook-form infer from
  `zodResolver(schema)`: the form values become the schema input and
  `handleSubmit` yields the typed output. What breaks is passing the `*Props`
  output type as the sole generic, which makes the resolver unassignable and, for
  the recursive Collection schema, produces a "two unrelated types" error. A
  static schema like `createProjectSchema` has no such divergence, so
  `useAppForm<CreateProjectProps>` is fine there.
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
const form = useAppForm({ resolver: zodResolver(schema) /* ... */ });
```

This keeps Core the single source of truth: the form needs no compensating
pre-seed and no refinement of its own.

No form views its form as something else. The whole-form laundering cast is a
lint error everywhere, with no exemption left.

`ProjectForm` is concrete instead: it takes a `UseFormReturn<ProjectFormValues>`,
where `ProjectFormValues` is every key of a Project a person edits. An update
carries the Project's id beside the save rather than in a field, so the create
and the update form are the same shape and check against the same Core schema.
Prefer that shape for a shared form body.

A body that genuinely has to stay generic over its caller's values, because the
create and the update shapes diverge in a key it edits, asserts only the field
name (`as FieldPath<T>`), never the whole form. `AssetForm`, `ComponentForm`,
`CollectionForm` and `FieldDefinitionsEditor` do that, each at the one line that
names the path. The report dialog's `ContactFields` needs no assertion at all:
its callers pass the field paths in, where the form type is concrete, so a wrong
path is a compile error at the call site.

`FieldDefinitionsEditor` does not constrain its `TFieldValues` to a shape holding
`fieldDefinitions` either, although it reads exactly that key. A generated Core
schema's **input** type for the array is not `FieldDefinitionOrGroup[]` itself, so
such a constraint rejects every real caller.

A cast that only erases the third generic needs none either. `EntryForm` used to
carry one, because `FieldFromDefinition` declared its `form` as
`UseFormReturn<TFieldValues>`. Carrying a defaulted
`TTransformedValues extends FieldValues = TFieldValues` through
`FieldFromDefinition` and `AppField` removed the need for it, and the generic is
never read, since only `control` and `formState.errors` are used and both are
typed by `TFieldValues` alone.

## The field shell

Every field of every form is one `AppField`
([`components/ui/app-form.tsx`](../../src/renderer/components/ui/app-form.tsx)):
react-hook-form's `Controller` drawn in the one shell. Nothing else in the app
draws a label, a description or an error.

```tsx
<AppField
  form={assetForm}
  name="name"
  label={<Trans>Asset name</Trans>}
  required
  description={<Trans>What this Asset is called in your Project.</Trans>}
>
  {({ field, controlProps }) => (
    <TextControl field={field} type="text" {...controlProps} />
  )}
</AppField>
```

- **The shell is shadcn's `Field`**, holding the label, the control, the
  description and the error in that order, which is the order ci draws a field
  in. `orientation="horizontal"` puts the words beside the control instead,
  which is what the switches of the field definition forms are.
- **It mints its own ids** with `useId` and hands them to the control through
  `controlProps`, so the label's `htmlFor` names the real focusable element by
  construction rather than by a caller remembering to wire it.
- **`aria-describedby` names only the parts that are on screen.** A field with
  no description and no error says nothing, instead of pointing at elements that
  are not there. `aria-invalid` is always said, since a control that was valid
  and then is not has to change rather than gain the state.
- **`name` is typed against the form that is passed in.** A path the form does
  not hold is a compile error at the call site. A shared form body that stays
  generic over its caller's values asserts only the name (`as FieldPath<T>`),
  never the whole form, see [Form typing](#form-typing).
- **The error it shows is the one at its own path**, or the one react-hook-form
  nested under `root`, see
  [When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
  It claims that path as an error target whether a message is on screen or not,
  so `AppForm`'s backstop never reports an error this field would show.
- **The words of the error sit in a paragraph inside the alert**, so one message
  and a list of them read the same. That paragraph's slot is what
  [`branding.spec.ts`](../../tests/specs/branding.spec.ts) measures the error
  color on.
- **`required` only marks the label.** It suppresses the " - optional" suffix
  `Label` appends otherwise. A generated field's `aria-required` comes from its
  field type's folder instead, see
  [dynamic-form-field-generation.md](./dynamic-form-field-generation.md).

**`FieldShell`** is the same shell without a form, for a field that has no form
state behind it. The Collection editor's previews are the case: the control
holds a static Value from its type's folder, so there are no phantom form paths
and the label still names a real, disabled control.

**`FieldSubtreeError`** renders every message at or below one path, for a value
bound as a single `Controller` but drawn as something other than a field (the
field definitions array). See
[When an error has no field to land on](#when-an-error-has-no-field-to-land-on).

### The shared controls and their value contracts

A control is value-typed: it takes the already-bound `field` plus the
`controlProps` to place on the real input, and owns no form path. That is what
lets one control serve a hand-written form and a generated one alike.

The controls more than one field type or more than one form shares live in
[`components/ui/field-controls.tsx`](../../src/renderer/components/ui/field-controls.tsx),
and everything a single field type owns lives in that type's folder, see
[dynamic-form-field-generation.md](./dynamic-form-field-generation.md). Do not
hand-roll a raw `<Input>` in a form, because these contracts are easy to get
subtly wrong and Core validates tightly:

- **`TextControl`** is a text input bound to one Value. An empty input is
  `null`, never an empty string, because Core's schemas are `.nullable()` and
  refuse `''`. Pass the HTML input type the field type uses, not Core's field
  type: a numeric input yields a number, every other one text. Where Core
  declares a plain, non-nullable string, such as a field definition's slug or a
  select option's value, pass `transform={rawTextFromInput}`.
- **`TextareaControl`** is the same contract over several lines.
- **`SwitchControl`** binds a `Switch` to a boolean.
- The transforms themselves are in
  [`lib/fieldValues.ts`](../../src/renderer/lib/fieldValues.ts), so a form that
  needs one does not reach into a control.

Each control places the props on its real focusable element (the `input` for the
scalars, the trigger for a select or a picker), so a label, a description and an
error always point at something a user can focus.

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
  `as unknown as Control` are a lint error** across the whole renderer, with no
  exemption: no form views its form as something else, see
  [Form typing](#form-typing). It is a backstop, not a proof, since an aliased or
  single-step cast still slips through.
- **A branch on a field type or a value type outside that type's folder is a
  lint error**, in every shape the read takes: a member, an optional chain, a
  computed key, a destructured name and a switch. A set of types built by hand
  elsewhere still slips through, so it is a backstop.
  [`tests/specs/field-registry.spec.ts`](../../tests/specs/field-registry.spec.ts)
  drives each shape.
- **The registry is exhaustive over Core's `FieldType`**, so a field type Core
  adds fails to compile until it has a folder. The same spec drives that.
- **react-hook-form's own `useForm` may only be imported by
  [`hooks/useAppForm.ts`](../../src/renderer/hooks/useAppForm.ts), and a
  `reset()` inside an effect is a lint error.** Both are how a form used to lose
  what somebody was typing, see
  [loading-and-updating-data.md](./loading-and-updating-data.md#filling-a-form-from-its-query).
- **`SubmitButton` sets `type="submit"` structurally** and `AppForm` owns
  `noValidate`, the `id` and `stopPropagation`. None of these are props a caller
  can get wrong: `SubmitButtonProps` omits `type` and `render` outright, so
  passing either is a compile error rather than a button that renders as a submit
  control and does not submit.
- **A test asserts no native constraint attributes.** An E2E spec in
  [`tests/specs/entries.spec.ts`](../../tests/specs/entries.spec.ts) checks that a
  rendered required text and number field carry no `required` / `min` / `max` /
  `minLength` / `maxLength`, that they do carry `aria-required`, that an optional
  field does not, and that the range slider keeps its `aria-value*` domain.
- **A test asserts every field sits in the shell.**
  [`tests/specs/forms.spec.ts`](../../tests/specs/forms.spec.ts) reads every
  label of an Entry's generated fields and of a Collection's hand-written ones
  and previews, and checks that each sits in a `Field`, names a control that
  exists, points at no part that is not shown, and that the slots the old form
  primitives drew appear nowhere.

Every lint rule lives in [`eslint.config.mjs`](../../eslint.config.mjs). Note
that a rule's options replace rather than merge with an earlier config block's, so
every renderer block that touches `no-restricted-syntax` re-lists the shared enum
ban, and the block that exempts a field type's folder re-lists everything else.

One rule was deliberately **not** written: "forbid `useAppForm` outside
`components/forms`". It is self-contradictory, because `AppForm` takes the form
object as a prop, so every route legitimately calls `useAppForm` and hands it in.
Centralize the policies in `AppForm` and in `useAppForm`, not in where they are
called.

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

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
  its parent), the view-only `mode`, a blocked submit and the guard that asks
  before unsaved changes are lost. A lint rule bans a raw `<form>` anywhere
  else.
- **A form that cannot be saved says why, and ignores the submit.** While a page
  passes `blockedBy`, Save is `aria-disabled` with the reason below it rather
  than `disabled`, so it keeps its place in the tab order, and `AppForm` ignores
  a submit however it was raised, so Enter in a field saves nothing either. See
  [Save's block](#saves-block).
- **A page form that edits something asks before changes are lost.** It passes
  its own title as `unsavedChangesTitle`, and one dialog asks for leaving the
  page, closing the window and quitting alike. The form's own Save never asks,
  nor does a way out the page takes on purpose. See
  [Leaving unsaved changes](#leaving-unsaved-changes).
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
  rule, a warning, a description and an error, and it draws them in shadcn's
  `Field`. A field with no form behind it, the Collection editor's previews,
  uses the same shell through `FieldShell`. `name` is typed against the form
  passed in, so a path that form does not hold is a compile error at the call
  site. See [The field shell](#the-field-shell).
- **A field's rules come from Core, never from a form.** A generated field
  takes them from its field definition, through its type's `rules`, and a
  hand-written field reads them off the Core schema its `AppForm` is given. A
  limit Core sets is therefore never written out in a form. Where no schema can
  answer, `required` is a prop with no default. See
  [What a field says it needs](#what-a-field-says-it-needs).
- **No input carries placeholder text.** A lint rule bans the attribute across
  the renderer, with one exception: a filter keeps its name inside its field,
  through `FilterInput` above a list and `ComboboxInput` inside a popup. See
  [Placeholder text](#placeholder-text).
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
  `aria-required`, an ARIA state that never blocks submit. A numeric input does
  carry `step="any"`, which is the opposite of a constraint: without it the
  browser steps by whole numbers and marks a decimal as a step mismatch, while
  Core's number Values take any number.
- **By-type `CoreError` handling goes through `useAppMutation`.** Its `handled`
  map is the single source of the "expected" set, never a blanket
  `throwOnError: false`. Unhandled failures reach the root error boundary. See
  [error-handling.md](../error-handling.md).
- **No validator's own words reach an Entry's fields.** One zod error map words
  every refusal zod raises, and the field type a refusal Core worded itself
  lands on words that one. An issue code without words fails the type check. A
  Collection's and a Component's settings are the exception, where a
  hand-written field shows a refusal of a field definition as Core wrote it. See
  [The words a refused Value is explained in](#the-words-a-refused-value-is-explained-in).

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

- **Pending gating is always on.** The button blocks and shows a loading state
  while `isSubmitting` is true, which spans the awaited `mutateAsync` inside the
  submit handler.
- **Dirty gating is opt-in** per form, through `requireDirty` on the button.
  Update forms use it so Save stays blocked until something changes. Create forms
  do not, so the button is available immediately and validation happens on click.
- **A reason the form cannot be saved** comes in through `blockedBy`, see
  [Save's block](#saves-block). It is the only one of the four that puts words on
  screen.

Do not block a submit button to express "the form is invalid". Validation runs
on submit and reports through the field's own error and `aria-invalid`. What
blocks Save is the three facts above plus a form still filling from its query,
see [loading-and-updating-data.md](./loading-and-updating-data.md#gating-save).

## Save's block

A form that cannot be saved yet says so, rather than letting somebody press Save
and find out. ci's rule is one line under the button in the warning color, which
Save points at, and the button blocked but still reachable.

Both halves are passed the same string, because the button sits outside the
form's own subtree and the two things that have to happen are on either side of
that line:

```tsx
const blockedBy = missing === 0 ? undefined : t`...`;

// In the page header, where Save is.
<FormActions form={form} id={formId} blockedBy={blockedBy}>
  <SubmitButton requireDirty Icon={Check}>Update Article</SubmitButton>
</FormActions>

// In the page body, where the form is.
<EntryForm id={formId} entryForm={form} blockedBy={blockedBy} ... />
```

- **`FormActions` draws the line** below the button, as a `FieldWarning` with the
  id Save names in `aria-describedby`. A form with no reason gains no element at
  all here, so every other form's row of buttons is laid out as before.
- **`SubmitButton` is `aria-disabled`, never `disabled`.** An `aria-disabled`
  control keeps its place in the tab order, so it can be reached and read out
  together with the reason it points at, which a `disabled` button cannot be.
  That is why the pending and the `requireDirty` gates say it the same way,
  though neither of them has words. The look comes from `aria-disabled:opacity-50`
  in `buttonVariants`, where every variant's hover color and the press animation
  are guarded with `not-aria-disabled:`, so a blocked control does not answer the
  pointer the way an available one does.
- **The click is stopped in `SubmitButton`** and **`AppForm` ignores a blocked
  submit**, because a control that still takes a click still raises one, and
  Enter in a field raises a submit of the form itself. So nothing reaches the
  mutation however the submit arrived, and the validator does not even run: a
  blocked form shows no field error from a press, which is what tells it apart
  from a form that is checked on submit.
- **The words are the page's**, never the form layer's. What is missing is
  something only the page knows, and ci's example is a required Value a language
  does not hold: `missingRequiredValues` in
  [`components/fields/missing-values.ts`](../../src/renderer/components/fields/missing-values.ts)
  answers that per language of the Project, without a validator, so it is cheap
  on every change.

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

## The words a refused Value is explained in

Core's schemas stay the only judge of what is valid. What a field shows is not
their English: zod writes "Too small: expected string to have >=3 characters",
which names a type, a comparison sign and an internal measure, none of which an
editor asked about.

[`lib/refusedValueText.ts`](../../src/renderer/lib/refusedValueText.ts) holds one
sentence per zod issue code, keyed by the code and by what the code measures: a
length for text, a count for a list, the number itself for a number, and the
format a field type asks of its text.
[`app.tsx`](../../src/renderer/app.tsx) installs it once as zod's global
`customError`, which reaches every schema the renderer parses with, Core's
generated ones included, because the renderer loads one copy of zod. Each
sentence is read from the message catalog at the moment an issue is raised, so a
change of language reaches the next refusal. `RefusalWords` is a mapped type
over zod's own union of codes, so a code zod adds fails to compile until it has
words, which `refusal-words.spec.ts` drives with a probe.

One refusal the map cannot reach: zod lets a message that arrives with an issue
outrank every error map, and Core raises several of its own with their own
English. Those are worded by the field type they land on, through
`FieldTypeModule.coreRefusalText`, which `FieldFromDefinition` passes to
`AppField` and `AppField` applies to the message it shows where that message
arrives under zod's `custom` code, at the field's own path or below it. Core gives them no code, so a module matches the opening of the text,
which [`components/fields/core-refusals.ts`](../../src/renderer/components/fields/core-refusals.ts)
holds in one place. A refusal no module knows gets one sentence of its own, so a
message a Core release rewords falls to that rather than showing Core's English
in the field.
`refusal-words.spec.ts` triggers each of them against the installed Core, so a
reword fails there instead, and `entries.spec.ts` drives one of each type
through a field and reads what that field says.

The map is global, so a refusal zod raises reads the same under a hand-written
field as under a generated one. What a hand-written field does not pass is
`coreRefusalText`, so a refusal Core worded itself stands there as Core wrote
it. A Collection's and a Component's settings are where that shows, since Core
words its refusals of a field definition itself, and the rebuild of those forms
words them.

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
`formState.errors`, subtracts everything a claimed path covers, and says one
sentence in a focused `role="alert"` at the top of the form where anything is
left, plus an error through Core's logger so it is loud in a dev run.

**The sentence carries no path, and the log record carries every one of them.**
An internal path says nothing to the person reading it, while it is the one
thing of use to whoever has to fix the bug behind it, and that is the log file.
`FieldSubtreeError` follows the same rule: it renders each message and not the
path it sits at. That surface is a backstop for a bug, not a design: an error
that reaches it should get a real home.

Giving one a real home is what `FieldSubtreeError` is for. Point it at a value
that is bound as a single `Controller` but rendered as something else, and it
renders every message at or below that path and claims the subtree:

```tsx
<FieldSubtreeError form={form} name="fieldDefinitions" />
```

An `AppField` cannot serve there, because the field definitions are drawn as
previews rather than as one field, so there is no field shell for a message to
sit in, and a refinement on the array reports several at once.

**A field shows a refusal of a part of its own Value.** `AppField` reads the
errors at its path and below it and shows the first one, because Core measures a
part of a Value where the Value is a tree or a list: the blocks of a markdown
field land on `content.en.children` and one reference of an Entry field on
`content.en.0`, neither of which is the path the field binds. Before that they
sat where nothing read them, so Save did nothing and no field said why.
[`lib/formErrors.ts`](../../src/renderer/lib/formErrors.ts) holds the rule, and
`@hookform/resolvers`' `root` needs no case of its own: an error reported on an
array itself moves under `root` as soon as any path inside that array is a
registered field name, which a dynamic field's sections are the moment one has
been mounted, and `root` is then a key below the field like any other.

**A nested error marks only the field it belongs to.** What a field leaves alone
is a message an error target mounted below it renders, so a required field left
empty inside a section is answered by that field and the dynamic field around it
says nothing, since pointing at the list of sections would not say which field
to fill. [`entries.spec.ts`](../../tests/specs/entries.spec.ts) drives both
halves of that.

The UX follows the rest of the app: nothing is blocked to express "invalid",
validation runs on the submit click, and the error appears then. What does block
Save is a reason the page gives it, which is on screen before anything is
pressed, see [Save's block](#saves-block).

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
place instead of taking over the screen. An Entry whose Value another Entry
already holds is the canonical case.

[`useAppMutation`](../../src/renderer/hooks/useAppMutation.ts) is the single home
for that. Pass a `handled` map from `CoreError` type to an in-place handler. The
hook derives both the mutation's `throwOnError` predicate (false only for the
handled types) and its `onError` (suppressed for the handled types, delegated to
the wrapped options for every other) from that one map, so the predicate and the
dispatch can never drift. It returns a `handleError(error)` to call from the
`catch` of `await mutateAsync(...)`:

```tsx
const refusals = useEntryRefusals(createEntryForm);
const { mutateAsync, handleError } = useAppMutation(queryOptions.entries.create, {
  handled: refusals,
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

**A refusal that belongs on a field is marked on it, with `setError`.** An
Entry's two forms share one map,
[`useEntryRefusals`](../../src/renderer/hooks/useEntryRefusals.ts), so both
answer the same refusals the same way, and the Value another Entry holds, a
reference that points at nothing and an Asset of a type the field does not take
each land below their own field, in their section and their language. That is
where ci's Messages table puts a field that is wrong, and it replaced the dialog
both forms used to open.

**A handler whose refusal names no place in this form throws the error on.** The
same `Conflict` Core raises for a taken Value also stands for refusals that name
nothing a form holds, and a `BadRequest` does too. A place is the field, the
sections around it and its language together, so a refusal on a field the
Collection no longer has, on a section somebody removed while the save was in
flight, or on a language the form holds no slot for is each one of these. The
handler runs inside the submit's `catch`, so throwing there leaves
`handleSubmit` rejecting, which `AppForm` re-throws during render and the root
error boundary takes, see
[When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
Swallowing it instead would leave a save that said nothing and wrote nothing to
the log.

Most forms do not need this. A plain `useMutation` sends every failure to the
boundary, which is the right default.

## Leaving unsaved changes

A page form that edits something asks before what was typed into it is lost:
leaving the page, closing the window, or quitting the app. It is one question in
one dialog, "Discard your changes to \<title\>?", with Keep editing as a ghost
button and a red Discard, which is the pair ci draws for an answer that cannot be
taken back. Dismissing the dialog any other way keeps editing.

A page opts in by passing its own title:

```tsx
<AppForm form={form} onSubmit={onSave} unsavedChangesTitle={title}>
```

The five page forms that edit something do: the Entry, a Collection's settings, a
Component, the Project's settings and the Profile. A form that passes no title
asks nothing, which is every dialog, sheet and create form.

**The parts**

| Where                                                                               | What it does                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppForm`                                                                           | Owns the guard per form: `useBlocker` with `withResolver`, and the claim that this page holds something unsaved while it is dirty                                                                  |
| [`UnsavedChangesProvider`](../../src/renderer/providers/UnsavedChangesProvider.tsx) | Mounted above the route in `__root.tsx`. Holds the dirty forms by their page's title, renders the one dialog, tells the main process whether anything is unsaved, and answers the question it asks |
| [`lib/leaveGuard.ts`](../../src/renderer/lib/leaveGuard.ts)                         | Which navigations count as leaving the page                                                                                                                                                        |
| `src/main/index.ts`                                                                 | Holds the window's own `close` while the renderer says something is unsaved, and closes or quits once Discard is pressed                                                                           |

**What does not ask**

- **The form's own Save.** `AppForm` sets a ref before it submits and the guard
  reads it when the router asks, because the navigation a submit ends in happens
  inside the awaited handler, before React has rendered `isSubmitting`.
- **A way out the page takes on purpose**, such as Delete. Those navigations pass
  TanStack Router's own `ignoreBlocker: true`, since the page and everything
  typed into it are gone either way.
- **A change of nothing but the search params.** The router runs its blockers on
  every push and replace, and a form keeps the language it edits in the search
  params, so `isLeavingThePage` compares the route rather than the address.
- **A reload.** It is not a close, so nothing holds it, which is what lets the
  error screen's Reload work and what most of the suite arranges a route with.

**Why the main process holds the close**

A renderer cannot stop its own window from closing, and a native box could draw
neither ci's buttons nor the page's name. So the window's `close` event is held
in the main process while the renderer says there is something unsaved, over
`electron:window:setUnsavedChanges`, and the renderer is asked for the question
over `electron:window:askBeforeClose`. It answers `discard` or `keep` over
`electron:window:answerClose`, and on `discard` the main process closes the
window, or quits where a quit is what was closing it.

Three things follow from holding `close` rather than the document's
`beforeunload`:

- **TanStack Router's `enableBeforeUnload` stays off.** `close` is emitted before
  the document's unload events, so a `beforeunload` that cancels would stop the
  close again after the main process let it through, and with no
  `will-prevent-unload` handler nobody would be told. The window would silently
  stay open.
- **A close is only ever held on the renderer's own claim**, which only a living
  renderer makes and which it withdraws when it unmounts. A crashed renderer can
  show no question, so `webContents.isCrashed()` holds nothing either, and a
  fresh document starts with nothing unsaved.
- **A test that leaves a form changed needs a teardown that destroys the window**,
  since a held close cannot be answered by one. The `electronApp` fixture and
  `relaunchApp` both go through `destroyWindows`.

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
name (`as FieldPath<T>`), never the whole form. `CollectionForm`,
`ComponentForm`, `EntryForm` and `FieldDefinitionsEditor` do that, each at the
one line that names the path. An assertion there still compiles for a path the
form does not hold, so prefer taking the path in from the caller, where the form
type is concrete: the report dialog's `ContactFields` and `AssetForm` do that,
and a wrong path is a compile error at their call sites.

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
draws a label, a rule, a warning, a description or an error.

```tsx
<AppField
  form={assetForm}
  name="name"
  label={<Trans>Asset name</Trans>}
  description={<Trans>What this Asset is called in your Project.</Trans>}
>
  {({ field, controlProps }) => (
    <TextControl field={field} type="text" {...controlProps} />
  )}
</AppField>
```

- **The shell is shadcn's `Field`**, holding the label with the field's rules at
  its top right, then the control, the warning, the description and the error,
  which is the order ci draws a field in. `orientation="horizontal"` puts the
  words beside the control instead, which is what the switches of the field
  definition forms are.
- **It mints its own ids** with `useId` and hands them to the control through
  `controlProps`, so the label's `htmlFor` names the real focusable element by
  construction rather than by a caller remembering to wire it.
- **`aria-describedby` names only the parts that are on screen**, in the order
  they stand in: the rules, the warning, the description, the error. A field
  with none of them says nothing, instead of pointing at elements that are not
  there. `aria-invalid` is always said, since a control that was valid and then
  is not has to change rather than gain the state.
- **`name` is typed against the form that is passed in.** A path the form does
  not hold is a compile error at the call site. A shared form body that stays
  generic over its caller's values asserts only the name (`as FieldPath<T>`),
  never the whole form, see [Form typing](#form-typing).
- **The error it shows is the first one at its own path or below it** that no
  error target mounted deeper renders, see
  [When an error has no field to land on](#when-an-error-has-no-field-to-land-on).
  It claims its path as an error target whether a message is on screen or not,
  so `AppForm`'s backstop never reports an error this field would show.
- **The words of the error sit in a paragraph inside the alert**, so one message
  and a list of them read the same. That paragraph's slot is what
  [`branding.spec.ts`](../../tests/specs/branding.spec.ts) measures the error
  color on.
- **The rules say whether the field is required**, and the shell offers
  `aria-required` to every control of a required field. A control whose role
  does not take the attribute drops it, see
  [What a field says it needs](#what-a-field-says-it-needs).
- **A field takes the width its definition asks for**, through `fieldWidth`
  ([`lib/utils.ts`](../../src/renderer/lib/utils.ts)), as a container query
  rather than a viewport one: a field that would get less than 160 px stacks at
  full width, measured against the area it sits in. The grid that lays fields
  out is the container, which is why each of those grids carries `@container`.
  [`forms.spec.ts`](../../tests/specs/forms.spec.ts) drives it at the smallest
  window.

**`FieldShell`** is the same shell without a form, for a field that has no form
state behind it. The Collection editor's previews are the case: the control
holds a static Value from its type's folder, so there are no phantom form paths
and the label still names a real, disabled control.

**`FieldSubtreeError`** renders every message at or below one path, for a value
bound as a single `Controller` but drawn as something other than a field (the
field definitions array). See
[When an error has no field to land on](#when-an-error-has-no-field-to-land-on).

### What a field says it needs

A field states its rules at the top right of its label before anybody presses
Save, such as "Required, up to 200 characters". They wrap below the label when
they do not fit beside it, and the control names them in `aria-describedby`, so
they are read out with it rather than left to somebody who can see them.

Nothing in a form writes a rule out. Each of the two kinds of field has one
source:

- **A generated field** asks its type's folder, through `rules(fieldDefinition)`
  ([`components/fields/rules.ts`](../../src/renderer/components/fields/rules.ts)
  holds the ones more than one type shares). A type that always holds a Value, a
  toggle or a slider, answers with none: Core marks it required because it can
  never be empty, so saying so would name a rule nobody can break.
- **A hand-written field** reads the Core schema its `AppForm` is given, through
  [`lib/fieldRules.ts`](../../src/renderer/lib/fieldRules.ts) and the walk in
  [`lib/schemaConstraints.ts`](../../src/renderer/lib/schemaConstraints.ts).
  Pass the same schema the resolver was built from, as every form does. The walk
  reads zod's own API, so a limit Core changes reaches the label with no change
  here.

Two answers the walk deliberately does not give, because Core asking for a key
is not a rule the person in front of the field could break: a list is never
reported as required, and neither is a boolean, whether Core takes either value
or pins it to one with `z.literal(true)` or `z.literal(false)`, as it does for
the Unique switch of a slug and the Required switch of a range. A list that
really has to hold something says so through the `required` prop, which carries
no default, and a field nothing can answer for shows no rule rather than
claiming it is optional. The prop is read on top of what the schema said rather
than instead of it, so a list keeps the bounds the schema carries and only ever
gains the word: a Core schema stays the authority on what Core refuses, and a
Project's supported languages are the case, where Core takes no empty list and
zod's public API carries no minimum for an array.
That is the way round ci asks for: the app marks what is needed, where the old
" - optional" suffix marked what is not.

Required also reaches assistive tech as the state, `aria-required`, on every
control whose role takes it, which the field type's `acceptsAriaRequired`
answers. Where a role does not, the word stands in the rules the control names
in `aria-describedby`, and the buttons of an Asset or an Entry field carry it in
their accessible name too, such as "Choose Cover, Required", since a button
shows no rule of its own.

### Placeholder text

No input carries placeholder text. It makes an empty field look filled and
rarely adds anything the label does not already say, and a lint rule holds it
across the renderer.

The one exception is a filter, which keeps its name inside itself because no
label stands above it and what somebody types in it is never read back as a
Value. Two components draw one, and the rule is dropped in those two files and
nowhere else:

- [`components/ui/filter-input.tsx`](../../src/renderer/components/ui/filter-input.tsx)
  is the filter above a list, such as the Entries of a Collection.
- [`components/ui/combobox.tsx`](../../src/renderer/components/ui/combobox.tsx)
  is the filter inside a combobox's popup, such as the one that adds a language
  to a Project or the one a select field with a long list of options opens. Its
  name is a required prop, so a combobox cannot be drawn with
  an unnamed field.

Both put the name on `aria-label` as well, rather than leaving the accessible
name to the placeholder, which is only the last thing a field's name is
computed from.
[`field-registry.spec.ts`](../../tests/specs/field-registry.spec.ts) drives the
rule on every spelling of the attribute and on both components.

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
- **`OptionChoice`** ([`fields/select/control.tsx`](../../src/renderer/components/fields/select/control.tsx)) is the choice between named options: a list of radio buttons up to seven of them and a combobox with a filter beyond that, with None leading wherever the Value may stay empty. The select field's control and the Default Value of a select's own settings are both it, see [dynamic-form-field-generation.md](./dynamic-form-field-generation.md#the-select-fields-options). It lives in the select folder rather than here, because the select field is what it is about.
- The transforms themselves are in
  [`lib/fieldValues.ts`](../../src/renderer/lib/fieldValues.ts), so a form that
  needs one does not reach into a control.

Each control places the props on its real focusable element (the `input` for the
scalars, the group for a list of radio buttons, the editable element for the
markdown editor), so a label, a description and an error always point at
something a user can focus. A field whose control is several controls, such as
the Asset and Entry fields and the Project form's Supported languages, puts them
on their container and hands its `aria-describedby` to each button inside, so
the parts are read out with whichever one has focus. A control whose element
takes no name from a `<label>` says the field's label itself with `aria-label`,
which is what the shell hands every control as text.

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
  adds fails to compile until it has a folder. The same spec drives that, with a
  probe annotated `FieldTypeRegistry`, which
  [`fields/index.ts`](../../src/renderer/components/fields/index.ts) exports for
  it, so what refuses an incomplete registry is this registry's own type rather
  than a mapped type written out again in the test.
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
- **A test asserts the shell's order, after a refused submit.** The same spec
  reads a described required field's `aria-describedby` once before a submit and
  once after one the resolver refused, and checks that the label leads the
  control, that the ids name the rules, the description and then the error, and
  that the last two sit after the control while the rules do not. The order is
  only observable with an error on screen, which is why a refused submit is what
  drives it.
- **A test asserts a loading form is disabled.** The same spec hangs the Entry's
  own read, so the window a form fills in is stable, and checks that the field
  is on screen, cannot be written into, and that Save is held with it.
- **A test asserts what each kind of field says it needs.** The same spec reads
  the rules of a generated field per shape of rule, and of the Profile's
  hand-written ones, whose character limits exist only in Core's own User
  schema, so a number on screen there proves the walk reads the real schema.
- **Placeholder text is a lint error**, in every shape the attribute is written
  in, with the one exception of a filter, which `FilterInput` and
  `ComboboxInput` draw.
  [`field-registry.spec.ts`](../../tests/specs/field-registry.spec.ts) drives
  all of them, see [Placeholder text](#placeholder-text).
- **A test asserts a blocked Save saves nothing and stays reachable.**
  [`unsaved-changes.spec.ts`](../../tests/specs/unsaved-changes.spec.ts) empties
  the one required Value of an Entry, then presses Save and Enter in a field
  with the `core:entries:update` channel recorded, and checks that neither
  reached it, that no field was marked either (so the submit was ignored rather
  than run), and that Save carries `aria-disabled` and names the reason while
  carrying no `disabled`.
- **A test asserts each question before changes are lost.** The same spec drives
  leaving with Keep editing and with Discard, a save that asks nothing, a Delete
  that asks nothing, all five page forms, and closing the window and quitting
  the app both ways. A reload and a run that ends with a form left changed are
  in there too, since both go through the close the main process holds.
  [`leave-guard.spec.ts`](../../tests/specs/leave-guard.spec.ts) drives which
  navigations count as leaving, including the search-only change a language
  switch makes, which no route takes yet.

Every lint rule lives in [`eslint.config.mjs`](../../eslint.config.mjs). A
rule's options replace rather than merge with an earlier config block's, so the
renderer's whole `no-restricted-syntax` list is declared once as
`rendererRestrictedSyntax` and each blessed file reads it back through
`exceptFor`, naming only what it drops: `app-form.tsx` drops the raw `<form>`
and the literal `type="submit"`, a field type's folder drops the two field-type
bans, `useAppForm.ts` drops the raw-`useForm` ban, and `filter-input.tsx` drops
the placeholder ban. Add a new ban to that one list, so it reaches those files
too.

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

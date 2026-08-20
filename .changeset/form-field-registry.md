---
'@elek-io/desktop': patch
---

Rework the renderer's form layer around one schema-driven field registry and a single blessed form primitive.

Every form now renders through `AppForm`, the only place a `<form>` element is written. It owns `noValidate`, submit wiring, submit `stopPropagation` so a nested form cannot cross-submit its parent, the detached submit-button id, and the view-only mode. Every submit control is a `SubmitButton` that sets `type="submit"` and its form association structurally. Each of Core's field types has one `DefinitionSpec` and one `RenderSpec` in exhaustive `Record<FieldType, ...>` registries that drive both the entry renderer and the field-definition authoring forms, so a new Core field type is a compile error until both registries have an entry. This collapses the 18 near-duplicate `*-value-definition-form.tsx` files, their two 18-case switches and the imperative dispatcher into one form plus a data table.

The registry emits no native constraint attributes, so zod through react-hook-form stays the sole validator (the range slider's value domain is the one exception). By-type `CoreError` handling moves into a `useAppMutation` helper instead of per-call-site handling or a blanket `throwOnError: false`. Collection `fieldDefinitions` are now bound through a single `Controller`, which removes three casts and fixes a slug-source id bug. Lint rules and a test enforce these invariants so breaking one fails CI.

Accessibility: required fields expose `aria-required`, the field picker label is associated with its control, the collection-editor preview buttons are named, and the range slider thumb has an accessible name.

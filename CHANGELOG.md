# @elek-io/desktop

## 0.3.5

### Patch Changes

- 7c939d4: Make Core the single validator for every form, and fix the mismatches found by cross-checking each form against Core's field definitions.

  Entry reference fields could not be saved at all: the stored reference was missing the `collectionId` Core requires, and a cast hid it from the type checker. References now carry the collection of the selected Entry, and an end-to-end test drives the picker so the write path stays covered.

  Field-definition authoring now matches what Core accepts. Types whose required or unique flag is fixed (a range is always required, a number, reference, markdown or slug field can never be unique) lock those switches instead of offering a choice that Core would reject, and a unique field can no longer be given a default value. Deleting a field also clears it from any slug field that used it as a source. Asset reference fields and markdown asset references can now be restricted to file types, and the picker only offers allowed types. Markdown heading depths are limited to the configured set while typing, not only in the toolbar.

  A Field's description is optional, as Core defines it, so a Field can be added without one. An empty description is stored as no description rather than an empty string Core rejects, and a description filled in one language must be filled in all, matching Core's rule.

  Read-only fields are now fully read-only. A disabled date, datetime or slug field can no longer be changed through its calendar or regenerate button, and a slug is not rewritten when its source fields change.

  Collections validate every project language on the field itself, so a Collection written before a language was added surfaces the missing translation in place rather than failing on save. A collection slug already used by another Collection is shown in a dialog instead of taking over the screen. Removing a project language now warns first, since Core applies the change without checking for content that still uses it.

  Updates `@elek-io/core` to 0.22.0, which moves the unique-and-default rule onto each field schema, reports language errors on the correct nested field, and requires a project's default language to be one of its supported languages. With Core enforcing these, the renderer's own compensating refinements and pre-seeding are removed, so the app no longer validates anything Core does not.

- fb49564: Add an end-to-end Playwright test suite and the fixes it surfaced.

  Errors from Core now carry their type across IPC, so the renderer handles the ones it can act on in place and lets the rest reach the root error boundary. Force-deleting a project with local changes and resolving a sync conflict now show a specific message per reason, and the Core origin stack is forwarded to Sentry so those crashes stay symbolicated. The error boundary shows the decoded stack instead of the raw sentinel.

  Accessibility: buttons default to type "button" so they no longer submit their form by accident, forms carry explicit ids so a submit button placed outside the form still targets it, and native validation is replaced by zod through react-hook-form. Single-language translatable fields regained their id, aria-describedby and aria-invalid, and back and forward navigation got proper labels.

  Hardening: the custom file protocol rejects path traversal and symlink escapes, long paths no longer overflow the Windows 260 character limit, and IPC handlers are registered before the renderer loads so early calls cannot race.

  Fixes: the entry table pagination total is correct and no longer strands an empty last page, the dialog footer stays visible while a long body scrolls, and deleting a collection warns before it cascades to its entries or explains why a delete is blocked.

- 7c939d4: Rework the renderer's form layer around one schema-driven field registry and a single blessed form primitive.

  Every form now renders through `AppForm`, the only place a `<form>` element is written. It owns `noValidate`, submit wiring, submit `stopPropagation` so a nested form cannot cross-submit its parent, the detached submit-button id, and the view-only mode. Every submit control is a `SubmitButton` that sets `type="submit"` and its form association structurally. Each of Core's field types has one `DefinitionSpec` and one `RenderSpec` in exhaustive `Record<FieldType, ...>` registries that drive both the entry renderer and the field-definition authoring forms, so a new Core field type is a compile error until both registries have an entry. This collapses the 18 near-duplicate `*-value-definition-form.tsx` files, their two 18-case switches and the imperative dispatcher into one form plus a data table.

  The registry emits no native constraint attributes, so zod through react-hook-form stays the sole validator (the range slider's value domain is the one exception). By-type `CoreError` handling moves into a `useAppMutation` helper instead of per-call-site handling or a blanket `throwOnError: false`. Collection `fieldDefinitions` are now bound through a single `Controller`, which removes three casts and fixes a slug-source id bug. Lint rules and a test enforce these invariants so breaking one fails CI.

  Accessibility: required fields expose `aria-required`, the field picker label is associated with its control, the collection-editor preview buttons are named, and the range slider thumb has an accessible name.

- 751fdf9: Fix Linux window association. Set desktopName in package.json and linux.syncDesktopName in electron-builder.yml so the installed .desktop filename, its StartupWMClass and the app_id Electron reports at runtime all agree on io.elek.desktop. A running window now shows the app's own icon and groups with its launcher in the dock instead of falling back to a generic icon, and the electron-builder window-association warning is gone.
- 9edf08a: Show date, datetime and time field values in the user's locale, and load date-fns locales on demand.

  Entry table cells for date, datetime and time fields now render a localized value (for example `07/09/2026`) instead of the raw stored ISO string. This is done by a new `formatTemporalFieldValue` helper on the user and project providers. Every other field type is shown unchanged. Date values are anchored to local midnight before formatting so the shown day cannot shift in a negative UTC offset timezone.

  The date-fns locales are now loaded through per-language dynamic imports instead of a single static map, so only the active language is fetched at runtime. This keeps roughly 400 kB of locale data out of the renderer startup chunk. As a result the first render after the user data resolves briefly uses date-fns's en-US default until the active locale chunk arrives, then re-renders in the user's locale.

- 7c939d4: Make a blocked save say why instead of doing nothing.

  A validation error that landed on a Collection's Fields rather than on one of the form's own inputs had nowhere to appear, so pressing Save simply did nothing. The Fields area now reports such an error, and any form whose save is blocked by a problem no field shows says so on the form itself rather than leaving the button looking broken. A failure raised after a save was already under way now reaches the error screen instead of being dropped.

  Markdown fields are now read-only where the rest of the form is. In the history and diff views the editor could still be typed into and did not look disabled, because turning a form read-only only reaches ordinary inputs and the markdown editor is not one.

  An unexpected failure on a page that handles some errors in place is logged and reported again. Silencing was applied to the whole page rather than to the specific errors it handles, so anything unforeseen lost its log entry and its notification on the way to the error screen.

- ec0d91c: Upload source maps to Sentry during CD so production crashes are symbolicated. The build now passes SENTRY_AUTH_TOKEN to @sentry/vite-plugin, and the renderer build emits source maps and runs the plugin alongside the main process, so both processes report readable stack traces instead of minified ones. The renderer maps are deleted after upload so they do not ship inside the app.

## 0.3.4

### Patch Changes

- afeae99: Rework the release pipeline and harden CI/CD.

  CD now produces a single draft GitHub Release per version with the changelog as its body, replacing the several empty drafts a release used to create. A new prepare-release job creates that one draft up front, and the build only runs for a genuinely new version, so an ordinary changeset-free push to main no longer rebuilds or overwrites an existing release. macOS publishes per-architecture update channels (latest-x64-mac.yml and latest-arm64-mac.yml) so the Intel and Apple Silicon runners no longer overwrite each other's update metadata.

  CI cancels superseded runs, uses a read-only token, and runs on reopened pull requests. Dependabot moves to weekly grouped updates and now also updates GitHub Actions. Workflow permissions are scoped per job, a combined "pnpm check" script replaces the duplicated lint, type and format commands, the CD jobs are renamed to say what they do (prepare-release and build-and-upload), and the contributor docs are updated to match.

## 0.3.3

### Patch Changes

- b5100bd: Added README.md and more developer documentation
- de46666: Add Playwright E2E tests that build the unpacked app and run against it in CI, across the same platforms as Core, with an isolated Electron userData directory and Core 0.21's ELEK_IO_DATA_DIR for test data. Modernize the toolchain to Electron 43 with electron-vite 5 on the Node 24 runtime, TypeScript 6, eslint 10, pnpm 11 supply-chain policies, and refreshed dependencies including lucide-react 1.x and react-day-picker 10. CD now publishes build artifacts to a draft GitHub Release.
- 3b5ff2c: Small visual improvements
- aa6d4f9: Adopt @elek-io/core 0.20.0 and align on a single zod 4.4.3. Core now declares zod as a peer dependency and re-exports z, so the app supplies the shared zod copy. This dedupes zod to one physical version and clears the zodResolver type errors.
- 31b87d5: Render field-definition groups and finish adapting the dynamic form system to @elek-io/core 0.20.0. Groups in a Collection's fieldDefinitions are shown as labeled fieldsets in the Entry form and Collection editor, field definitions are flattened where grouping is irrelevant, and a Project's commit history now comes from a dedicated projects.history query instead of the Project read. Form typing was reworked to infer react-hook-form types from the generated Zod schemas.
- adfcb0e: Shrink the packaged app and broaden Linux packaging. Renderer-only dependencies and @sentry/vite-plugin now live in devDependencies so only true runtime dependencies are bundled, and contributor docs, tests, changesets and dev configs are kept out of the asar. The Linux build drops the snap target, which electron-updater cannot auto-update, and adds rpm and pacman alongside AppImage and deb, so every Linux artifact keeps in-app updates working.
- 24520ae: Updated to latest Core
- 95241d7: Fixed Shadcn init and components
- b741e09: Using new provider for breadcrumbs to allow for static and dynamic page labels in conjuction with Tanstack router and query.
- b741e09: Using Tanstack query as a wrapper around IPC calls for cache handling. Improved perceived performance since we do not wait for data to load before rendering pages and components.

## 0.3.2

### Patch Changes

- 9493e23: Fix CD pipeline

## 0.3.1

### Patch Changes

- 2ff6e9b: Fixed CD pipeline

## 0.3.0

### Minor Changes

- fadeaad: Added local API for developers to be able to recieve Project data locally e.g. for usage in websites during a build step. The local API is based on the OpenAPI specification. Meaning there is a swagger UI available locally when enabled in the users profile. The API can be used to query the data manually or use the [OpenAPI Generator CLI](https://openapi-generator.tech/) like so: `openapi-generator-cli generate -i ./openapi.json -g typescript-fetch -o ./src/api-client --openapi-normalizer SET_TAGS_FOR_ALL_OPERATIONS=elek-io`, where `SET_TAGS_FOR_ALL_OPERATIONS=elek-io` merges the tagged APIs into one for ease of use.
- d488af9: Added basic diff view for changes that happen

## 0.2.0

### Minor Changes

- 3c5d46b: Re-added GUI - instead of using the old UI repository where we created completely custom UI components with headlessui for accessibility, I've switched to shadcn (which uses Radix UI) base components with custom changes. Currently all components exist inside this repository. Once "finished" I'll extract them into the elek-io/ui component library to use them for the website and docs too.

  Also switched from electron-forge to electron-vite and use ESM wherever possible - which is everywhere except the preload.

  There is still some UI isses especially when creating a collection - where the dialog is closing whenever the user inputs something into the modal.
  This can also be seen when the clone Project dialog is used.
  Also buttons sometimes need two clicks to work.

- a9adf5d: Initial setup - pre GUI

  - [x] Debugging main & renderer in VSCode. See https://www.electronforge.io/advanced/debugging
  - [x] CI/CD with lint, test & build
  - [x] Custom file protocol handler to access Assets on disk
  - [x] Working IPC calls
  - [x] Working IPC call to Core with git command execution with included dugite binary
  - [x] Using react inside renderer
  - [x] Typesafe routing working with data loading. See https://tanstack.com/router/latest
  - [x] Sentry.io
    - [x] Error monitoring in renderer, main & preload
    - [x] Replays on error
    - [x] Performance monitoring
    - [x] Profiling
    - [x] Creating releases incl. sourcemap upload
  - [x] First security & best practice audit. See https://github.com/doyensec/electronegativity & https://www.electronjs.org/docs/latest/tutorial/security
  - [x] Automatic updates working. See https://www.electronforge.io/advanced/auto-update (Should work but needs certificates I do not have for not - need to test later)
  - [x] Using an custom app icon
  - [x] Custom borderless window with draggable area

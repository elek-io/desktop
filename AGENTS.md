# AGENTS.md

Guidance for AI agents and contributors working on `@elek-io/desktop`.

`@elek-io/core` handles file IO and git version control for elek.io Projects, a headless, git-backed CMS. It is published as a TypeScript library with Node, Browser, Astro and CLI entry points.

`@elek-io/desktop` uses `@elek-io/core` and provides a UI on top of that business logic, packaged with Electron as a cross-platform desktop application.

## Documentation

Documentation is split by what you are working on:

- [`contributing/`](./contributing/) - contributor and design docs for the desktop app: the Electron process architecture, the IPC security model, TanStack Query data loading, and the dynamic form system. Start at [`contributing/README.md`](./contributing/README.md). The desktop app ships packaged, not as an npm package, so these docs are never shipped and may link anywhere.
- **Core's behavior** is documented inside the `@elek-io/core` package itself. After `pnpm install`, read it under [`node_modules/@elek-io/core/docs/`](./node_modules/@elek-io/core/docs/index.md) (content export, the local API, API client generation, fields, storage layout, and more). This is the reference for anything the desktop app delegates to Core.
- To **contribute to Core** itself, use the [`@elek-io/core` repository](https://github.com/elek-io/core). Core's own contributor docs are not part of its published package, so they live only there.

Two rules follow:

- **Read before you change.** Before working on an area, read its doc first so you change behavior on purpose, not by guesswork. For desktop app behavior that is the matching doc in `contributing/`; for behavior that comes from Core, read Core's docs in the package.
- **Write after you change.** When you change desktop app behavior a user or contributor should know about, update the matching doc in `contributing/` in the same change. Changes to Core itself do not belong in this repo - make them in the separate [`@elek-io/core`](https://github.com/elek-io/core) repository and document them there.

## Commands

- `pnpm install` - install dependencies (use pnpm, not npm)
- `pnpm dev` - start the app in development with HMR (electron-vite)
- `pnpm start` - preview the built app (electron-vite preview)
- `pnpm build` - clean, build and package for the current platform (electron-vite then electron-builder)
- `pnpm build:unpack` - build without packaging, faster for local testing
- `pnpm build:win` / `pnpm build:mac` / `pnpm build:linux` - package for a specific platform
- `pnpm check-types` - type-check both processes with tsc, no emit (`check-types:node` and `check-types:web` cover one process each)
- `pnpm lint` - run eslint
- `pnpm i18n:extract` - write the message catalogs from the code, after adding or rewording a string
- `pnpm i18n:check` - fail when a catalog is out of step with the code, or a translation is missing
- `pnpm format` - format with prettier
- `pnpm check` - run lint, check-types, check-format and i18n:check together, the same set CI runs
- `pnpm test` - build the unpacked app, then run the Playwright E2E tests against it (`test:ui`, `test:debug` and `test:report` variants exist, `pnpm exec playwright test` skips the rebuild)

## Conventions

- Prefer a library's built-in feature over hand-rolled code.
- Avoid type casts. Shape the types so a cast is not needed.
- Keep comments short and put deeper detail in the docs. Avoid em-dashes and semicolons, use simple sentences for readability.
- Handle errors by type. When a handler catches some errors but not all, catch only the `CoreError` types you can act on in place and let the rest reach the root error boundary, which logs to Core. Never opt a whole mutation out with a blanket `throwOnError: false`. The one mutation that handles every type is the report dialog's, because it can be mounted inside the error boundary's own fallback and so cannot rely on it, and it logs each failure explicitly to make up for the suppressed one. See [`contributing/error-handling.md`](./contributing/error-handling.md).
- Every word a person reads comes from the message catalog, in the renderer and in the main process. `pnpm lint` fails on one that does not, and `pnpm i18n:check` fails on a catalog out of step with the code. A string that reads the same in every language, such as a product name or a unit symbol, carries an `eslint-disable-next-line` with its reason. See [`contributing/renderer/internationalization.md`](./contributing/renderer/internationalization.md).
- Log an error with `errorLogAttributes` from [`shared/logError.ts`](./src/shared/logError.ts), never by hand, in either process. It writes the flat dotted `error.type`, `exception.*` names Core also uses, so one grep finds every stack in a log file. A log record must never carry mutation `variables` (an Entry's is the content the user wrote) or anything unclonable like the QueryClient, which would fail the structured clone and lose the record silently.

## Form invariants

Read these before touching any form. Each is enforced (a compile error, a lint error, or a test), so breaking one fails CI. Full detail, including the rationale, is in [`contributing/renderer/forms.md`](./contributing/renderer/forms.md). The registry and everything specific to user-defined fields are in [`contributing/renderer/dynamic-form-field-generation.md`](./contributing/renderer/dynamic-form-field-generation.md), and how a form is filled from its query is in [`contributing/renderer/loading-and-updating-data.md`](./contributing/renderer/loading-and-updating-data.md).

- Every form is an `AppForm` (the only place a `<form>` element is written; it owns `noValidate`, submit wiring, `stopPropagation`, the detached-button `id`, and the view-only `mode`).
- Every submit control is a `SubmitButton` (sets `type="submit"` and the form association structurally, and does not accept `type` or `render`).
- A failed submit is never silent. `AppForm` surfaces a validation error no mounted message covers, and routes a post-await submit rejection to the root error boundary.
- Every field is an `AppField`, the only thing that draws a label, a rule, a warning, a description and an error, in shadcn's `Field`. A field with no form behind it uses the same shell through `FieldShell`. A field's `name` is typed against the form passed in, and no form views its form as something else.
- A field's rules come from Core: a generated field from its field definition, a hand-written one from the Core schema its `AppForm` is given. No form writes out a limit Core sets, and no input carries placeholder text, which a lint rule holds.
- Every form is built with `useAppForm` and filled from its query through `values` and `disabled`, never by calling `reset()` in an effect. Both are lint errors otherwise.
- Everything the app knows about one field type lives in that type's folder under `components/fields/`. The registry is a mapped type over Core's `FieldType`, so a new Core type is a compile error until it has a folder, and nothing outside a folder branches on a field type or a value type.
- No control emits a native constraint attribute (`required`/`min`/`max`/`minLength`/`maxLength`); zod is the sole validator. The only exception is the range `Slider`'s value domain.
- No validator's own words reach an Entry's fields. One zod error map, set once when the renderer starts, words every refusal zod raises through the catalog, and the field type a refusal Core worded itself lands on words that one. An issue code without words fails the type check. The exception is a Collection's and a Component's settings, where Core words its refusals of a field definition itself and a hand-written field shows them as Core wrote them, see [`contributing/renderer/forms.md`](./contributing/renderer/forms.md#the-words-a-refused-value-is-explained-in).
- By-type `CoreError` handling goes through `useAppMutation`, never a blanket `throwOnError: false`. Its suppression of the wrapper's toast and log is per handled type, not per mutation.

## Testing notes

- Playwright E2E tests live in `tests/` and run against the packaged app. See [`contributing/testing.md`](./contributing/testing.md) for how the fixtures, isolation and CI work. Run `pnpm test` to verify a change end to end, and make sure `pnpm check` passes before considering it done.
- Playwright is the only runner. Most specs drive the packaged app, and a few run in Node for what needs no window, see [`contributing/testing.md`](./contributing/testing.md). Verify behavior neither covers by running the app with `pnpm dev` and telling the user to exercise the affected flows.
- All Core file and git operations run in the main process and are reached from the renderer only through `window.ipc`. Exercise them through the running app, not in isolation.

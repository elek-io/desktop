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
- `pnpm format` - format with prettier
- `pnpm check` - run lint, check-types and check-format together, the same set CI runs
- `pnpm test` - build the unpacked app, then run the Playwright E2E tests against it (`test:ui`, `test:debug` and `test:report` variants exist, `pnpm exec playwright test` skips the rebuild)

## Conventions

- Prefer a library's built-in feature over hand-rolled code.
- Avoid type casts. Shape the types so a cast is not needed.
- Keep comments short and put deeper detail in the docs. Avoid em-dashes and semicolons, use simple sentences for readability.
- Handle errors by type. When a handler catches some errors but not all, catch only the `CoreError` types you can act on in place and let the rest reach the root error boundary, which logs to Core and reports to Sentry. Never opt a whole mutation out with a blanket `throwOnError: false`. See [`contributing/error-handling.md`](./contributing/error-handling.md).

## Form invariants

Read these before touching any form. Each is enforced (a compile error, a lint error, or a test), so breaking one fails CI. Full detail, including the rationale, is in [`contributing/renderer/forms.md`](./contributing/renderer/forms.md). The registries and everything specific to user-defined fields are in [`contributing/renderer/dynamic-form-field-generation.md`](./contributing/renderer/dynamic-form-field-generation.md).

- Every form is an `AppForm` (the only place a `<form>` element is written; it owns `noValidate`, submit wiring, `stopPropagation`, the detached-button `id`, and the view-only `mode`).
- Every submit control is a `SubmitButton` (sets `type="submit"` and the form association structurally, and does not accept `type` or `asChild`).
- A failed submit is never silent. `AppForm` surfaces a validation error no mounted message covers, and routes a post-await submit rejection to the root error boundary.
- Every field type has a `DefinitionSpec` and a `RenderSpec`; both registries are exhaustive `Record<FieldType, ...>`, so a new Core type is a compile error until both have an entry.
- The registry emits no native constraint attributes (`required`/`min`/`max`/`minLength`/`maxLength`); zod is the sole validator. The only exception is the range `Slider`'s value domain.
- By-type `CoreError` handling goes through `useAppMutation`, never a blanket `throwOnError: false`. Its suppression of the wrapper's toast and log is per handled type, not per mutation.

## Testing notes

- Playwright E2E tests live in `tests/` and run against the packaged app. See [`contributing/testing.md`](./contributing/testing.md) for how the fixtures, isolation and CI work. Run `pnpm test` to verify a change end to end, and make sure `pnpm check` passes before considering it done.
- There is no unit test runner. Verify behavior without E2E coverage by running the app with `pnpm dev` and telling the user to exercise the affected flows.
- All Core file and git operations run in the main process and are reached from the renderer only through `window.ipc`. Exercise them through the running app, not in isolation.

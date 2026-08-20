# E2E Testing

The client is tested end to end with [Playwright](https://playwright.dev/docs/api/class-electron) driving the packaged Electron app. Playwright labels its Electron support experimental, but it is the best fit for this project. It runs over the Chrome DevTools Protocol, Microsoft tests VS Code through the same path, and breakages with new Electron versions have historically been fixed within days. The main alternative, [WebdriverIO's electron service](https://webdriver.io/docs/desktop-testing/electron), is listed first in [Electron's testing docs](https://www.electronjs.org/docs/latest/tutorial/automated-testing) and would be the fallback if Playwright's Electron support ever goes away. Only the small launch surface in the fixture is Playwright-Electron specific, so the specs themselves would port.

There is no unit test setup yet. Everything below is about E2E tests.

The suite is currently 83 specs across 16 files, and it covers each object type end to end (Projects, Collections, Entries, Assets, User) plus the cross-cutting surfaces: navigation and breadcrumbs, empty states, history and diffs, git sync, persistence across a reload, the root error boundary and not-found route, the main process security policy, the IPC guards, the local API and accessibility. `tests/specs` is the map, and each spec's name says what it pins.

New tests are written where a change lands rather than from a standing list. What earns one is the desktop app's own responsibility (see [What a desktop test verifies](#what-a-desktop-test-verifies)): a flow that drives Core, a failure the UI has to surface, or a form invariant that would otherwise regress silently. Build the shared helper in `tests/helpers` before its first consumer, and extend an existing helper rather than inlining a second copy of a UI drive.

## Running tests

Tests run against the unpacked build in `dist`. The test scripts build it first, so they always test the current code:

```sh
pnpm test           # build unpacked, then run all tests
pnpm test:ui        # build unpacked, then open Playwright's UI mode
pnpm test:debug     # build unpacked, then run with the Playwright inspector
pnpm test:report    # open the HTML report of the last run
```

When iterating on test code only, skip the rebuild by invoking the runner directly:

```sh
pnpm exec playwright test
```

CI does the same, since its build step already produced the packaged app. Note that reruns inside UI or debug mode also do not rebuild, only the initial invocation does.

## Why the packaged build

Playwright's own Electron examples launch the source entry with the bundled dev binary, `electron.launch({ args: ['main.js'] })`. This project launches the packaged build instead. That is a deliberate choice. It runs what users actually run, so the tests cover the Content Security Policy, the custom `elek-io-local-file:` protocol and the electron-builder output layout, none of which a source launch exercises.

The cost is that tests only see a change after a rebuild, which is why the `pnpm test` scripts build first and CI builds before the suite. Iterating on test code alone with `pnpm exec playwright test` reuses the existing build (see [Running tests](#running-tests)).

Launching a packaged build shapes the fixture in two ways that differ from the Playwright examples:

- It finds the built executable with `parseElectronApp` from `electron-playwright-helpers` and passes it as `executablePath`, instead of relying on the dev binary in `node_modules`. This is the only reason that dependency is here.
- It passes no main script argument. A packaged build bundles and loads its own entry, so the argument is unnecessary. It was also a suspect in a Windows launch hang, so it is left off on purpose.

## How the fixtures work

Specs live in `tests/specs` and import `test` from [`tests/fixtures/electronApp.ts`](../tests/fixtures/electronApp.ts) instead of `@playwright/test`. The fixtures provide:

- `electronApp` launches the unpacked build for the current platform from `dist`.
- `mainWindow` is the app's first window as a Playwright `Page`.

The launch does a few important things:

- **Isolation**: each test gets its own empty data directories under `test-results`, so tests never touch real user data and always start clean. Two stores are redirected: Core's project data via the `ELEK_IO_DATA_DIR` environment variable, which Core reads at startup (see Core's usage docs), and Electron's own userData (the Chromium profile, localStorage and caches) via Chromium's `--user-data-dir` launch switch, which Electron honors without any test-only code in the app. An earlier version redirected the OS home directory instead, but on Windows a redirected `USERPROFILE` stalls Electron's boot before Chromium starts, so these two targeted redirects are both cleaner and avoid that hang.
- **Short data paths**: `testDataDirs` in the fixture puts those two directories under a short hashed path (`test-results/d/<hash>`) instead of the test's own long-named output folder. Core runs git inside `<dataDir>/projects/<uuid>`, and on Windows a `git show <rev>:<path>` in the history diff resolves that arg against the project dir and overflows the 260-char MAX_PATH once the path gets deep. The long test-title folder tips CI over the limit, so the short hash keeps every test's project path well under it. Because these dirs sit outside `testInfo.outputPath()`, Playwright's `preserveOutput` does not sweep them, so the fixture removes a passed test's dirs itself and leaves a failed test's in place for the artifact. A future Core that enables `core.longpaths` lifts the 260-char limit, and this can move back under `testInfo.outputPath()`.
- **`NODE_ENV=test`**: both the main process and the renderer disable Sentry when they see this, so test runs do not report errors, traces or replays. A disabled Sentry client also never sets up its integrations, so profiling and replay stay dormant.
- **`ELECTRON_RUN_AS_NODE` is removed**: Electron based terminals like the one in VSCode set it, which would turn the launched app into a plain Node process and fail the launch with `Process failed to launch!`.

Playwright disables the Chromium sandbox on Linux itself (it adds `--no-sandbox` unless `chromiumSandbox: true`), so unpacked builds without the SUID sandbox helper run fine on GitHub's Ubuntu runners without the fixture passing anything.

A `ViaIpc` seed can run immediately after the window opens because the main process registers its IPC handlers before it loads the renderer (see the Application Lifecycle section in [`overview.md`](./overview.md)). An earlier ordering registered them after the load, so a seed racing that gap flaked with "No handler registered"; fixing the order in the app removed the race for the suite and for real launches, so no test-side readiness wait is needed.

When a test passes, the `mainWindow` fixture asserts that no console errors or warnings occurred and runs an axe accessibility scan, which does not assert on violations yet until the existing ones are resolved. The scan uses axe legacy mode, since otherwise axe opens a blank aggregation page via `context.newPage()`, which Electron does not support. Both checks are skipped when the test already failed, so they do not bury the real failure.

That console assertion is strict by default, so a spec that legitimately provokes console output can opt out per message with the `allowedConsoleErrors` fixture option. It holds a list of `patterns` (strings or RegExps); before asserting, the teardown drops every collected error or warning that includes one of the string patterns or matches one of the RegExp patterns, and asserts only the remainder is empty. A spec opts in with `test.use({ allowedConsoleErrors: { patterns: [/expected copy/, 'other expected'] } })`, scoped to that spec (or `describe`). The default is `{ patterns: [] }`, so every existing spec stays strict and unchanged, and an opt-in list should stay tight so unrelated regressions still fail. The patterns live behind a `patterns` object key rather than as a bare array on purpose: Playwright reads an array-valued option override as its own `[value, options]` fixture tuple when the second element is an object, so a bare `[/a/, /b/]` would silently collapse to its first element, while an object override never can.

The hatch was added for the root error-boundary spec (P2-09b), but that spec turned out not to need it: in the packaged (production React) build the boundary is console-clean. The renderer installs a custom `onCaughtError` (Sentry's `reactErrorHandler`, dormant under `NODE_ENV=test`) that replaces React's default caught-error `console.error`, and the app routes its own error logging over IPC to the main process (`core:logger:error`), not the renderer console. So a boundary takeover, whether from a failed route read or a failed UI mutation, emits nothing to the renderer console. The hatch therefore stands ready for a spec that provokes non-React console output (a third-party widget warning, a CSP notice), not for the error boundary. Do not opt a not-found or error-boundary spec into it just because it renders an error surface, since that would mask a real regression.

Per-route assertions now opt in ahead of that fixture-wide check via `expectNoAxeViolations(page)`, starting with the Projects list (`#/projects`) in `accessibility.spec.ts`. That route enforces every rule except the app-wide `color-contrast` issue, so a nameless button or missing label there fails a test. More routes join as they are cleaned, and once every route is clean the `@todo` fixture-wide assertion replaces the opt-in list.

## What a desktop test verifies

All business logic, validation, file IO and git live in `@elek-io/core`, a separate library with its own test suite. Core validates tightly, so a corrupt file should never be written. The desktop suite does not re-verify Core's output, and the same assertion should not be written on both sides of the Core and desktop seam.

A desktop test covers only the desktop app's own responsibilities:

- It drives Core correctly, so the right form maps to the right IPC call with the data the user entered.
- Whether Core threw or not is observed. Success shows through the UI as a redirect, the rendered result or a success toast. Failure shows through the UI as an error surface, or for a guard with no UI path through the IPC call rejecting.
- The UI reflects Core's result, so created, updated and deleted state renders and Core's errors are surfaced.

A desktop test does not assert Core's on disk file contents or location, exact commit trailers or message format, or Core's validation and error codes. Those belong to Core's own tests. In practice: prefer UI assertions for UI driven flows (create a Project, then see its card in the list), observe a bare throw or no-throw for guard paths, and do not read `project.json` or inspect commit trailers.

When a mutation handles some `CoreError` types in place and lets the rest propagate (the default, see [`error-handling.md`](./error-handling.md)), assert both sides of that split. Drive the handled `type` and assert its in place surface, the reason specific dialog, and where practical drive an unhandled failure and assert it reaches the root boundary instead of that dialog. Asserting only the handled path lets a regression back to a blanket `throwOnError: false` pass unnoticed, since the in place assertion still holds.

Follow the arrange, act, assert split. Arrange preconditions over IPC (the `ViaIpc` helpers, see the naming convention below) since that is fast and does not depend on unrelated UI. Act through the UI for the flow under test. Assert on the surface that proves the desktop app's responsibility, usually the UI.

## Writing tests

Reusable page interactions belong in `tests/helpers` as plain functions that take the `Page` first. Prefer role and label based locators over CSS selectors, and auto-retrying assertions like `toHaveURL` over one-shot reads, since route redirects happen client side. `getByLabel(text, { exact: true })` addresses form fields, including the translatable ones, since their inputs carry the label association. Scope it to an open dialog (`dialog.getByLabel(...)`) to disambiguate a label that also appears on the page behind it.

Because the suite is end to end, a helper drives the UI by default and its name carries no marker (`createProject`, `fillProjectForm`). A helper that reaches Core directly over IPC instead is suffixed `ViaIpc` (`setUserViaIpc`, `createProjectViaIpc`), so the faster path, which bypasses the renderer and its query cache, stands out at a glance. Only mark the data verbs that could go either way (create, update, delete, set). A verb that already implies the UI (`fill`, `reload`, `navigate`) or an assertion helper stays unmarked.

The `ViaIpc` helpers reach Core by wrapping `window.ipc` in a `page.evaluate` call. `window.ipc` is globally typed through `src/index.d.ts`, but specs type-check under the Node config which has no DOM lib, so `window` is declared once in `tests/global.d.ts`. There is no generic `ipc(page, path)` helper, since a string path cannot be typed without a cast. Write a small typed wrapper per operation instead.

The `tests` folder is type-checked by `pnpm check-types:node` under the strictest settings. That config resolves modules with `nodenext`, so relative imports need explicit `.js` extensions, which Playwright resolves to the `.ts` files. `pnpm lint` also applies the type-aware ESLint rules to `tests`, so `no-floating-promises` flags an unawaited assertion, which type-checking alone does not catch.

### Accessibility as a testing contract

An element a test drives must expose a proper accessible role and name, so a role and name locator finds it. When an interactable has no accessible name (a bare icon button, an icon-only toggle), fix the source rather than reaching for a brittle structural locator. Give it an `sr-only` label or an `aria-label`, mirroring the icon buttons in [`asset-teaser.tsx`](../src/renderer/components/asset-teaser.tsx) (`<span className="sr-only">…</span>` inside the button). One fix serves screen-reader users and stable tests at once, and it chips away at the axe violations blocking the fixture's deferred assertion. This is how the language-chip remove button became `getByRole('button', { name: 'Remove en' })`.

The translatable-field dialog triggers in [`form.tsx`](../src/renderer/components/ui/form.tsx) got the same treatment. In a multi-language Project every translatable field renders a `LanguagesIcon` button that opens the per-language translations dialog, and all three variants (`FormComponentFromFieldDefinitionTranslatable`, which the Entry form uses, plus `TranslatableFormInputField` / `TranslatableFormTextareaField` for the Collection forms) rendered that button with no accessible name. Each now carries `<span className="sr-only">Edit translations for {label}</span>`, named per field, so a test opens a specific field's dialog with `getByRole('button', { name: 'Edit translations for Title' })`. This is what lets `fillEntryForm` fill both languages of a translatable field (P2-15).

## CI

CI builds and then runs the tests on the same four platforms as Core (Linux, Windows, macOS on Intel and ARM). Linux has no display server on the runners, so the tests run under `xvfb-run`. The Playwright HTML report is uploaded as an artifact for every run. When a test fails the raw `test-results` folder is uploaded too, which holds each failed test's Core data directory plus a runner-level trace on the retry (the step timeline, stdio and attachments). Playwright does not record screenshots or videos for Electron windows, nor DOM or network in the trace, since those come from its built-in browser fixtures, which these tests do not use.

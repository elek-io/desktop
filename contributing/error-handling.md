# Error Handling

This is the single reference for how elek.io Desktop handles errors end to end: where they come from, how a `CoreError` keeps its meaning across the IPC boundary, how errors surface in the UI, where and when things are logged both locally and to Sentry, and how to handle a specific expected error in place. For what the errors themselves mean (the `CoreError` types and when Core raises them), read Core's own [error-handling doc](../node_modules/@elek-io/core/docs/error-handling.md).

## Where errors come from

Two kinds of error reach the renderer, and the difference drives everything below.

- **`CoreError`** is thrown by a Core operation and travels to the renderer through an IPC channel. It is the app's expected failure shape. Core raises a `CoreError` with a `type` (`NotFound`, `BadRequest`, `Unauthorized`, `Conflict`, `PreconditionFailed`, `UpgradeFailed`, `Internal`) and a matching `statusCode`. The `type` is the stable, machine readable contract, like an HTTP status code. See Core's [error-handling doc](../node_modules/@elek-io/core/docs/error-handling.md) for the full table.
- **Renderer errors** are ordinary JavaScript or React errors: a route that fails to load, a render that throws, a bug. These are not `CoreError`s and carry no `type`.

## Preserving `CoreError.type` across IPC

The main and renderer processes are separate, so an error thrown by a handler does not travel to the renderer as itself. Electron reconstructs it on the renderer side, and that reconstruction **drops the `CoreError` subclass along with its `type` and `statusCode`, and carries no stack frames** (verified: the renderer-side rejection is a plain `Error` whose `message` is `Error invoking remote method '<channel>': <original message>` and whose `stack` has zero `at ...` frames). Without help the renderer sees only a message string, cannot tell a `Conflict` from a `PreconditionFailed`, and has no origin stack.

To keep all three, the main and renderer sides cooperate through one small cross process module, [`src/shared/ipcError.ts`](/src/shared/ipcError.ts). It imports `CoreErrorType` type only, so it carries no runtime dependency on Core and bundles into both processes.

1. **Encode in main.** The single `ipcMain.handle` wrapper in [`src/main/index.ts`](/src/main/index.ts) (the one loop that registers every channel) try/catches the handler call. A thrown `CoreError` is re-thrown as `new Error(serializeCoreError(error.type, error.message, error.stack))`, which packs the `type`, message and Core's own origin `stack` into the message behind a sentinel string. Anything that is not a `CoreError` propagates unchanged.
2. **Decode in the renderer.** `parseIpcError(error)` returns `{ type?, message, stack? }`. It finds the sentinel by substring, so it is robust to Electron prefixing the message, validates the decoded `type` against the known `CoreErrorType` values, and returns the clean message plus Core's stack. For a non `CoreError`, or a malformed payload, it returns just the raw message and `type`/`stack` are absent.

Because the sentinel is located by substring and the type is validated, decoding never throws and always degrades to the raw message. This is why the renderer can safely call `parseIpcError` on any caught value, `CoreError` or not.

The `stack` is what powers a readable Sentry event (see [Sentry](#sentry-remote)). It matters because the reconstructed renderer error is frameless, so without forwarding, a CoreError that reaches Sentry would carry no stack at all.

## How errors surface in the UI

### Unexpected errors: the root error boundary

By default, query and mutation failures are meant to be fatal to the current view. `throwOnError: true` is set app wide, by [`useQueryNoError`](/src/renderer/hooks/useQueryNoError.ts) for queries and by `customMutationOptions` ([`util.ts`](/src/renderer/queries/util.ts)) for mutations. The error is re-thrown during render and caught by the only `errorComponent` in the app, the root `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx). It replaces the whole view with a friendly error page whose only exits are Back to Projects and Reload.

`ErrorComponent` runs the caught error through `parseIpcError`, so it shows and logs the clean message and never the raw sentinel payload. It uses the decoded stack too: for a CoreError that is Core's origin stack, and a non-Core error falls back to its own stack, so the technical detail block and the log never leak the encoded form either.

This full view takeover is the right default for an unexpected error but the wrong response to an expected, recoverable one. Those are handled in place instead.

### Expected errors: handled in place

Some `CoreError`s are raised by normal user actions and are recoverable. A `409`/`412` guard on a delete or a sync is not a crash, it is information the user can act on. For those, a mutation opts out of the boundary **for that specific `type` only** and drives the UI itself, while every other failure still propagates to the boundary. See the guide below.

**The default, in one line: catch only the `CoreError` types you have a specific handling for, and let everything else propagate.** A blanket `throwOnError: false` is a mistake. It routes every failure into the in-place `catch`, so an unexpected `Internal` gets shown through a dialog built for one specific reason, and because the in-place pattern also silences the wrapper toast and log, that unexpected error reaches neither Core's log nor Sentry. Discriminate by `type` so the reason you know about gets its dialog and everything you do not know about stays loud, logged and reported. This applies to any handler that catches some errors but not all, not just deletes and syncs.

## Handling expected errors in place

Use the [`useAppMutation`](/src/renderer/hooks/useAppMutation.ts) hook when a specific Core guard should stay on the page instead of hitting the boundary. It is the single home for this pattern, so the "expected" set is defined once and the boundary opt-out can never drift from the in-place dispatch.

1. **Declare the handled `type`s with their in-place handlers.** Give `useAppMutation(options, { handled })` a `handled` map from each `CoreError` `type` to the callback that drives its UI. From that map the hook sets `throwOnError` to a predicate returning `false` only for the handled `type`s (so just those reach the caller's `catch` and every other failure still hits the boundary) plus an `onError` that suppresses the wrapper's toast and log **for the handled `type`s only** and delegates to the wrapped options' `onError` for everything else. Suppression is per type, not per mutation: an unexpected failure on an in-place mutation keeps its `{ method, objectType }` log, exactly like on a plain `useMutation`. Never a blanket `throwOnError: false`.

   ```tsx
   const { mutateAsync, handleError } = useAppMutation(
     queryOptions.entries.create,
     {
       handled: {
         Conflict: (error) => {
           setConflictError(error);
           setIsConflictDialogOpen(true);
         },
       },
     }
   );
   ```

2. **Await inside try/catch, and dispatch in the catch.** `await mutateAsync(...)` still rejects on failure regardless of `throwOnError`, so the `catch` runs. Call `handleError(error)` there: it reads the `type` and runs the matching `handled` callback, or does nothing for an unhandled type (which `throwOnError` has already routed to the boundary, so touching state for it would fight it). Keep the success path (e.g. `router.navigate`) inside the `try`, so a handled failure skips it.

   ```tsx
   try {
     await mutateAsync(props);
     await router.navigate({ ... });
   } catch (error) {
     handleError(error);
   }
   ```

3. **Map the type to copy.** Use `describeCoreError(type, overrides?, fallback?)` from [`lib/coreErrorText.ts`](/src/renderer/lib/coreErrorText.ts). A matching per type `override` wins, then the consumer's `fallback` (its own generic sentence), then an app wide generic per type, then a default for an unknown type. Read the `type` with `parseIpcError(error)` on the held error state. These components use hardcoded English today, so the maps are plain strings. When i18n lands, `describeCoreError` is the single seam that maps `type` to a localized string.

Because the predicate and the dispatch both read the same `handled` map, they cannot fall out of sync, which is the whole point of the helper: the "expected" set lives in one place.

Keep dialog titles and button labels stable, since the E2E specs assert them. Only the description changes with the `type`. Assert the copy you wrote in specs, never Core's raw message, which belongs to Core's own tests.

A `type` handled this way is intentionally invisible to the standard logging and to Sentry (see [Logging](#logging-where-what-and-when)): only the in place UI reacts. The `type`s you did not handle are unaffected, they still propagate to the boundary and are logged, toasted and reported as usual, because the suppression is keyed on the same `handled` map. If you also want a handled `type` tracked, log it explicitly in the `catch`.

All the sites below build their mutation with `useAppMutation`, so the "predicate returns false only for X" behavior described in each is what the helper derives from that site's `handled` map.

### Example: sync conflict

[`components/project-sidebar.tsx`](/src/renderer/components/project-sidebar.tsx) catches a failed `synchronize`, most notably Core's sync time integrity gate rejecting a rebase that would push a dangling reference. The Synchronize mutation `handles` `Conflict` and `PreconditionFailed` in place, so `useAppMutation`'s predicate returns false only for those two. The `onClick` catches the rejection and calls `handleError(error)`, which for those two reasons stores it with `setSyncError(error)` and opens the "Could not synchronize this Project" dialog; any other failure propagates to the boundary. The dialog description calls `describeCoreError` with a small overrides map (`Conflict` explains the remote conflict, `PreconditionFailed` explains the remote could not be reached) and the previous generic sentence as the fallback. The title stays generic, so it still covers the handled reasons, while the description is now reason specific.

### Example: force delete a Project

[`settings/general.tsx`](/src/renderer/routes/projects/$projectId/settings/general.tsx) catches Core's delete guard. A normal delete of a local only Project (`PreconditionFailed`) or one with unpushed commits (`Conflict`) is blocked. The delete mutation `handles` those two `type`s, both opening the "Force delete this Project?" dialog, whose description uses `describeCoreError` to explain why the normal delete was blocked (`PreconditionFailed` says the Project only exists on this device, `Conflict` says it has unpushed changes). The normal delete's `catch` calls `handleError` to open it. Confirming re-issues the delete with `{ force: true }` through a **separate** delete mutation that handles no `type`. A force delete bypasses the guard, so any failure of the forced call is unexpected, and because that separate mutation handles nothing, `throwOnError` routes every failure to the boundary. Reusing the guard-handling mutation would intercept a `Conflict` or `PreconditionFailed` from the forced call and, with no `handleError` in the forced `catch`, swallow it silently. The forced `catch` therefore only closes the dialog so it is not left in front of the boundary.

### Example: delete an Asset still in use

[`components/asset-teaser.tsx`](/src/renderer/components/asset-teaser.tsx) catches Core's asset delete guard. Deleting an Asset that an Entry still references is blocked with a `Conflict` that lists the referring Entries (see Core's [asset-management doc](../node_modules/@elek-io/core/docs/asset-management.md)). The delete mutation `handles` only `Conflict`. The teaser's own "You are about to delete this Asset" alertdialog is the confirm step, not the error surface: its confirm action fires the delete, and on rejection the `catch` calls `handleError`, which for a `Conflict` opens a separate controlled "Could not delete this Asset" dialog. So the alertdialog closes and the in-use dialog opens in its place, keeping the failure on the Assets page. A non-`Conflict` failure propagates to the boundary instead. The description uses `describeCoreError` with a `Conflict` override that tells the user to remove or repoint the references first. Nothing is deleted, so the teaser stays on the page.

### Example: entry unique-value collision (P2-10)

The Entry create and update forms ([`collections/$collectionId/create.tsx`](/src/renderer/routes/projects/$projectId/collections/$collectionId/create.tsx) and [`$entryId/update.tsx`](/src/renderer/routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx)) are the two form-submit sites that handle in place, not deletes or syncs. Core rejects an Entry whose value collides with another Entry on a unique field with a `Conflict` (see Core's [fields doc](../node_modules/@elek-io/core/docs/fields.md#uniqueness)). Each form's create/update mutation `handles` only `Conflict`; the submit handler awaits `mutateAsync` inside try/catch and calls `handleError`, which opens a controlled "Could not save this Entry" dialog whose description uses `describeCoreError` with a `Conflict` override explaining the collision. The submit does not navigate, so the form stays on the create/update route with its values intact to edit and retry. Any other failure propagates to the boundary, which the "routes an unexpected create failure to the root error boundary" spec guards against a regression to a blanket opt-out.

## Logging: where, what, and when

The app logs to two independent sinks. Do not confuse them.

- **Core logger (local).** `window.ipc.core.logger.*` sends over the `core:logger:*` IPC channels to Core's own logger, which writes to the console and to Core's log files. This is local diagnostics and is always on, including under test.
- **Sentry (remote).** Error, tracing, profiling and session replay events sent to sentry.io. Sentry is initialized twice, once per process, both at 100% sampling. Both inits are disabled when `NODE_ENV=test`, so test runs never report. A disabled Sentry client also never sets up its integrations.

### Local logging (Core logger)

| When                                     | Where                                                                               | What                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Every route navigation                   | `router.subscribe('onBeforeLoad')` in [`renderer/index.ts`](/src/renderer/index.ts) | info: "Desktop navigating from ... to ..."          |
| A mutation succeeds                      | `customMutationOptions` onSuccess ([`util.ts`](/src/renderer/queries/util.ts))      | info: "Successfully ...ed ..." plus a success toast |
| A mutation fails (not handled in place)  | `customMutationOptions` onError                                                     | error: "Failed to ..." plus an error toast          |
| An error reaches the root boundary       | `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx)                 | error: "Uncaught route error: {decoded message}"    |
| A React error not caught by any boundary | `onUncaughtError` in [`app.tsx`](/src/renderer/app.tsx)                             | error: "Uncaught React error"                       |
| Main process security events             | main handlers in [`src/main/index.ts`](/src/main/index.ts)                          | error: blocked external or internal navigation      |

### Sentry (remote)

**Main process** ([`src/main/index.ts`](/src/main/index.ts), `@sentry/electron/main`):

- Automatic capture of uncaught exceptions and unhandled rejections in the main process, through the SDK's default integrations.
- Manual `captureException` at: app initialization failure (followed by a `flush` and `app.exit(1)`), a blocked external navigation, a blocked internal navigation, the custom file protocol running without Core, and a file requested from outside the Projects directory. The two navigation cases also write a local Core logger error.

**Renderer process** ([`src/renderer/index.ts`](/src/renderer/index.ts), `@sentry/electron/renderer` plus `@sentry/react`):

- Automatic capture of unhandled errors and rejections, plus tracing, profiling and session replay integrations.
- React root error handlers wired in [`app.tsx`](/src/renderer/app.tsx) through `reactErrorHandler`: `onUncaughtError` (also logs locally), `onCaughtError` (the usual path, since the root boundary catches query, mutation and route errors), and `onRecoverableError`.

**Readable `CoreError`s in Sentry.** Both inits share a `beforeSend` hook, `decodeCoreErrorForSentry` from [`src/shared/sentryCoreError.ts`](/src/shared/sentryCoreError.ts). When a captured error carries a serialized `CoreError`, it rewrites the message to the readable form, relabels the exception `Error` as `CoreError`, adds a `core_error_type` tag for filtering, and **rebuilds the stacktrace from Core's forwarded origin stack**. It is a no-op for any other event. This reuses the same `parseIpcError` decode the UI uses, so Sentry and the UI agree.

Rebuilding the stack matters because, as noted above, the reconstructed renderer error is frameless, so an unmodified CoreError event would carry no stack at all. The renderer's `beforeSend` passes Sentry's own `defaultStackParser` (from `@sentry/react`) into `decodeCoreErrorForSentry`, which parses Core's forwarded stack string into `exception.values[0].stacktrace.frames`. The helper stays free of any Sentry import by taking the parser as an argument (typed generically), so it still bundles into both processes. The main-process init passes no parser, since a `CoreError` is returned over IPC and never captured in main.

> [!NOTE]
> Those rebuilt frames point at Core's shipped build (`@elek-io/core/.../index.node.mjs`) with function names and line and column numbers, which is enough to locate the failure. They are **not** symbolicated to Core's TypeScript source yet, because the Sentry build plugin uploads source maps for our own bundles, not for `node_modules`. Core already ships a self-contained node source map (its original sources are embedded), so resolving these frames to Core's `.ts` is a later, our-side-only step: upload Core's node map to the Sentry release. It needs no change to Core. It is deliberately deferred because matching a main-process node frame on a renderer event relies on release plus path matching (Core's files carry no Sentry debug id), which wants its own verification against a real event.

**What is not sent to Sentry.** A `CoreError` `type` handled in place (its `throwOnError` predicate returns false for that `type`, and `onError` is suppressed for it) never reaches the React error handlers, so it produces no Sentry event and no standard toast or log. That is intended. A `type` the predicate does not handle is not opted out, so it still propagates to the boundary and is reported normally.

### What one unexpected mutation failure produces

A single failed mutation that is not handled in place fans out on purpose:

1. A `toast.error` from the wrapper's `onError`.
2. A local Core logger error "Failed to ..." from the same `onError`, carrying the mutation meta.
3. `throwOnError` re-throws into the root boundary, so `ErrorComponent` writes a second local Core logger error "Uncaught route error: ..." with the decoded message and stack.
4. React's `onCaughtError` sends one Sentry event, decoded and tagged by `beforeSend`.

The two local logs are not a bug. They carry different context, the mutation meta and the fatal route surface, and both help when reading a session's logs.

A mutation using the in-place pattern drops steps 1 and 2 **for its handled `type`s**, which is the whole point of handling them in place. An unexpected `type` on the same mutation is not suppressed: it fans out exactly as above, boundary and Sentry included. Suppressing per mutation instead of per type is the bug this shape avoids, since it silently costs an unexpected failure its `{ method, objectType }` log.

## Testing implications

The E2E fixture asserts zero console errors or warnings on a passing test (see [testing.md](./testing.md)). Because an unexpected failure reaches the root boundary, which logs through `console.error` and `core:logger:error`, a UI driven negative path that hits the boundary needs the console escape hatch. A flow handled in place never reaches the boundary and never trips the assertion, which is one reason the expected error pattern above is preferred for recoverable guards. Assert the reason specific copy you wrote, not Core's raw message.

## Quick reference

| Scenario                                 | UI surface              | Local log                                            | Sentry                              |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------- | ----------------------------------- |
| Unexpected query error                   | Root error boundary     | Boundary error log                                   | Yes (`onCaughtError`)               |
| Unexpected mutation error                | Root error boundary     | Wrapper error log plus boundary error log, one toast | Yes (`onCaughtError`)               |
| Handled `CoreError` `type` (in place)    | Dialog on the same page | None by default                                      | No                                  |
| Unhandled `type` on an in-place mutation | Root error boundary     | Wrapper error log plus boundary error log, one toast | Yes (`onCaughtError`)               |
| Route not found                          | `NotFoundComponent`     | None                                                 | No                                  |
| Main process security block              | Denied, no window       | Core logger error                                    | Yes (`captureException`)            |
| App init failure                         | App exits               | console.error only                                   | Yes (`captureException` then flush) |

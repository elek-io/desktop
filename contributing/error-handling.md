# Error Handling

This is the single reference for how elek.io Desktop handles errors end to end: where they come from, how a `CoreError` keeps its meaning across the IPC boundary, how errors surface in the UI, where and when things are logged, and how to handle a specific expected error in place. For what the errors themselves mean (the `CoreError` types and when Core raises them), read Core's own [error-handling doc](../node_modules/@elek-io/core/docs/error-handling.md).

> [!NOTE]
> Nothing here reports anywhere. Desktop sends no error data off the machine on its own, and there is no remote error tracker. An error is only ever written to Core's local log files, and it only reaches us if the user chooses to tell us.

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

The `stack` is what fills the technical detail block on the error screen and the `meta` of the log written beside it. It matters because the reconstructed renderer error is frameless, so without forwarding, a `CoreError` that reaches the boundary would show and log no stack at all.

## How errors surface in the UI

### Unexpected errors: the root error boundary

By default, query and mutation failures are meant to be fatal to the current view. `throwOnError: true` is set app wide, by [`useQueryNoError`](/src/renderer/hooks/useQueryNoError.ts) for queries and by `customMutationOptions` ([`util.ts`](/src/renderer/queries/util.ts)) for mutations. The error is re-thrown during render and caught by the only `errorComponent` in the app, the root `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx). It replaces the whole view with a friendly error page whose only exits are Back to Projects and Reload.

`ErrorComponent` runs the caught error through `parseIpcError`, so it shows and logs the clean message and never the raw sentinel payload. It uses the decoded stack too: for a CoreError that is Core's origin stack, and a non-Core error falls back to its own stack, so the technical detail block and the log never leak the encoded form either.

This full view takeover is the right default for an unexpected error but the wrong response to an expected, recoverable one. Those are handled in place instead.

### Expected errors: handled in place

Some `CoreError`s are raised by normal user actions and are recoverable. A `409`/`412` guard on a delete or a sync is not a crash, it is information the user can act on. For those, a mutation opts out of the boundary **for that specific `type` only** and drives the UI itself, while every other failure still propagates to the boundary. See the guide below.

**The default, in one line: catch only the `CoreError` types you have a specific handling for, and let everything else propagate.** A blanket `throwOnError: false` is a mistake. It routes every failure into the in-place `catch`, so an unexpected `Internal` gets shown through a dialog built for one specific reason, and because the in-place pattern also silences the wrapper toast and log, that unexpected error never reaches Core's log at all. Discriminate by `type` so the reason you know about gets its dialog and everything you do not know about stays loud and logged. This applies to any handler that catches some errors but not all, not just deletes and syncs.

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

A `type` handled this way is intentionally invisible to the standard logging (see [Logging](#logging-where-what-and-when)): only the in place UI reacts. The `type`s you did not handle are unaffected, they still propagate to the boundary and are logged and toasted as usual, because the suppression is keyed on the same `handled` map. If you also want a handled `type` recorded, log it explicitly in the `catch`.

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

There is one sink. `window.ipc.core.logger.*` sends over the `core:logger:*` IPC channels to Core's own logger, which writes to the console and to Core's log files. It is local diagnostics, always on, including under test, and nothing it writes leaves the machine.

| When                                     | Where                                                                                | What                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Every route navigation                   | `router.subscribe('onBeforeLoad')` in [`renderer/index.ts`](/src/renderer/index.ts)  | info: "Desktop navigating from ... to ..."            |
| A mutation succeeds                      | `customMutationOptions` onSuccess ([`util.ts`](/src/renderer/queries/util.ts))       | info: "Successfully ...ed ..." plus a success toast   |
| A mutation fails (not handled in place)  | `customMutationOptions` onError                                                      | error: "Failed to ..." plus an error toast            |
| An error reaches the root boundary       | `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx)                  | error: "Uncaught route error: {decoded message}"      |
| A React error not caught by any boundary | `onUncaughtError` in [`app.tsx`](/src/renderer/app.tsx)                              | error: "Uncaught React error"                         |
| A React error caught by a boundary       | `onCaughtError` in [`app.tsx`](/src/renderer/app.tsx)                                | error: "React error caught by a boundary"             |
| React recovers from an error             | `onRecoverableError` in [`app.tsx`](/src/renderer/app.tsx)                           | warn: "React recovered from an error"                 |
| A rejected floated promise (renderer)    | `unhandledrejection` listener in [`renderer/index.ts`](/src/renderer/index.ts)       | error: "Unhandled promise rejection: ..."             |
| An uncaught renderer error outside React | `error` listener in [`renderer/index.ts`](/src/renderer/index.ts)                    | error: "Uncaught error: ..."                          |
| An uncaught throw in the main process    | winston, through Core's logger                                                       | error: winston's own uncaught exception record        |
| A failed report send                     | `useSendReport` in [`report-dialog.tsx`](/src/renderer/components/report-dialog.tsx) | error: "Failed to send a report: ..."                 |
| Main process security events             | main handlers in [`src/main/index.ts`](/src/main/index.ts)                           | error: blocked navigation, or a rejected file request |

### The two global renderer listeners

React's root callbacks only see errors thrown during render. A rejected floated promise (the app is full of `void window.ipc.core.*` calls) or a throw inside a plain event handler reaches none of them. Sentry's browser SDK used to install `onerror` and `onunhandledrejection` itself, so removing it left those with no sink at all, and they would have been missing from the log tail a bug report attaches. [`renderer/index.ts`](/src/renderer/index.ts) now installs both at module scope.

**The main process needs no equivalent.** Core's logger builds its winston transport with `handleExceptions: true` and `handleRejections: true`, so winston installs the matching `process.on` handlers and an uncaught throw there already lands in Core's log files. That was true before Sentry was removed too.

**Everything these handlers send over IPC is flattened to plain strings first.** A structured clone failure would lose the log silently, which is the one thing a last-resort sink must not do. Two values would cause one: React's `onCaughtError` also passes `errorBoundary`, the boundary's class instance (TanStack Router's `CatchBoundaryImpl` extends `React.Component`, so it carries `updater` and `_reactInternals`), and a thrown value is `unknown`, so it need not be cloneable at all. Both go through `parseIpcError` and only `componentStack` is forwarded. For the same reason each of these logs ends in `.catch(() => undefined)` rather than a bare `void`: a rejection raised from inside the rejection handler would come straight back to it.

### Why all three React root handlers are defined

[`app.tsx`](/src/renderer/app.tsx) defines `onUncaughtError`, `onCaughtError` and `onRecoverableError`, even where the body is thin. Defining one **replaces** React's own default, which writes the error to the renderer console. The E2E fixture asserts a console-clean run and this app logs over IPC to Core instead, so leaving a handler out would hand that surface back to React's `console.error` and break the assertion. See [testing.md](./testing.md).

### The main process cannot always use Core's logger

Two main-process paths log through `console.error` behind an `eslint-disable-next-line no-console` instead: the app initialization failure handler, and the custom file protocol's "Core is not initialized" guard. In both, Core is either what failed or not there yet, so its logger is not available. Every other main-process path uses `this.core.logger.error`.

### What one unexpected mutation failure produces

A single failed mutation that is not handled in place fans out on purpose:

1. A `toast.error` from the wrapper's `onError`.
2. A local Core logger error "Failed to ..." from the same `onError`, carrying the mutation meta.
3. `throwOnError` re-throws into the root boundary, so `ErrorComponent` writes a second local Core logger error "Uncaught route error: ..." with the decoded message and stack.
4. React's `onCaughtError` writes a third, carrying the component stack.

The three local logs are not a bug. They carry different context, the mutation meta, the fatal route surface and the React component stack, and all three help when reading a session's logs.

A mutation using the in-place pattern drops steps 1 and 2 **for its handled `type`s**, which is the whole point of handling them in place. An unexpected `type` on the same mutation is not suppressed: it fans out exactly as above, boundary included. Suppressing per mutation instead of per type is the bug this shape avoids, since it silently costs an unexpected failure its `{ method, objectType }` log.

## User-initiated reports

Because nothing is reported automatically, an error only reaches us if the user sends it. [`components/report-dialog.tsx`](/src/renderer/components/report-dialog.tsx) is the only thing in the app that sends anything off the machine, and it only ever does so because the user typed it and pressed send.

It holds two independent forms behind one dialog. A bug report and a suggestion ask for genuinely different things, so a single schema covering both would validate neither properly. Each mode owns its own `useForm` and `AppForm` and is mounted with a `key`, so switching starts clean rather than carrying the other's state.

**Two entry points.**

- **The header.** A "Feedback" button in [`user-header.tsx`](/src/renderer/components/user-header.tsx), which renders on every normal route. It sits outside the `user === null` check on purpose: a broken first run is exactly the thing worth reporting, so reporting must not depend on having finished onboarding. It opens on the bug form with the log switch **off**.
- **The root error boundary.** `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx) offers "Report this problem" as its primary action, opening the same dialog in bug mode with the decoded message and stack already in the message, and the log switch **on**. A crash is the moment a report is worth most and the moment a user is least likely to go hunting for a header button, and the logs are the point of a crash report. This screen replaces `RootComponent` outright, so it mounts its own `Toaster` (otherwise a sent report closes its dialog and leaves no evidence it worked, and the user sends it again) and writes its own log from an effect rather than the render body (otherwise opening and closing the dialog rewrites the same entry, inflating the very log tail the report attaches).

**The dialog must not depend on `UserProvider`.** The boundary renders outside it, so `useUser()` would throw there. The contact prefill reads the User from the query **cache** instead of fetching, which also avoids the worse failure: `useQueryNoError` carries `throwOnError: true`, so a fetch that failed while the boundary was already rendering an error would take the boundary down with it.

**What is sent.** Only what the user typed, plus a `desktop` block naming the app version and the Electron, Chromium and Node versions under it, which Core cannot know. Core fills in the two things it owns: its own version and the machine it runs on, and, when the switch is on, a tail of its own log files. Desktop never reads a log file, which keeps all file IO in Core.

**The contact is a whole User or nothing.** Core's `user` field takes a `User` or `null` and [reads neither for you](/node_modules/@elek-io/core/docs/reporting.md), so what the dialog holds is exactly what is sent. `reportContactSchema` prefills it from the cached User, leaves the name and email editable so somebody can be reached at an address their commits are not signed with, and folds an untouched block back to `null` on the way out. Half a contact is a validation error rather than a silent drop, because there is no shape between a whole User and nobody. `includeLogs` is consent, so Core answers it with what `logs` holds and never sends it on.

The log switch is the one field that sends data the user did not type, so its description says plainly what a tail holds: the ids of Projects, Collections and Entries, the files they live in and the actions taken, but never the content written or the names given. Keep that in step with [Core's own account of a tail](/node_modules/@elek-io/core/docs/reporting.md), since it is what the consent rests on.

**Failure handling, and the one exception to the rule above.** This mutation handles **every** `CoreError` type in place, through an exhaustive `Record<CoreErrorType, ...>` so a new type in Core is a compile error rather than a silent escalation. That is deliberate, and it is the only mutation in the app allowed to do it:

- The in-place surface is not built for one specific reason. It is a generic "could not send this report" alert driven by `describeCoreError`, which has copy for every type, so an unexpected type still reads sensibly. Showing an unexpected failure through a dialog meant for one reason is what the rule exists to prevent, and that does not apply here.
- **The boundary is not a valid destination for it.** One of the two mount points is inside the root error boundary's own fallback. React cannot catch an error thrown there with the same boundary, so it escapes to TanStack Router's global catch boundary, which replaces the crash screen with its bare fallback and takes the report the user just wrote with it. A mutation that can be mounted inside a boundary's fallback must not depend on that boundary.

Handling a type suppresses the wrapper's toast and log, and here that would mean no record at all, so `useSendReport` logs every failure explicitly, without what the user wrote. What is still not covered is an error carrying no type (a bug in our own IPC plumbing rather than a Core failure), which `useAppMutation` routes to the boundary by design.

**The failure to design around is `PreconditionFailed`**, which is what a send answers with while Cloud cannot be reached, and what every send answers with today because `POST /management/v1/reports` does not exist yet. It keeps the dialog open with the text intact. `RateLimited` is its own type rather than a borrowed one, `BadRequest` covers a rejected body, and `Unauthorized` and `Internal` fall back to the same in-place alert. Core never retries, since a retry after a timeout can duplicate a report Cloud already accepted, so sending again is the user's decision.

> [!NOTE]
> The E2E fixture points `ELEK_IO_CLOUD_URL` at a closed loopback port, so a spec can press Send and assert the `PreconditionFailed` path without a report ever leaving the machine. See [testing.md](./testing.md).

## Testing implications

The E2E fixture asserts zero console errors or warnings on a passing test (see [testing.md](./testing.md)). A UI driven negative path that hits the boundary may need the console escape hatch, though the boundary itself is console-clean in the packaged build, because all three React root handlers are defined and the app logs over IPC rather than to the renderer console. A flow handled in place never reaches the boundary at all, which is one reason the expected error pattern above is preferred for recoverable guards. Assert the reason specific copy you wrote, not Core's raw message.

## Quick reference

| Scenario                                  | UI surface              | Local log                                                             |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| Unexpected query error                    | Root error boundary     | Boundary error log plus the `onCaughtError` log                       |
| Unexpected mutation error                 | Root error boundary     | Wrapper error log, boundary error log, `onCaughtError` log, one toast |
| Handled `CoreError` `type` (in place)     | Dialog on the same page | None by default                                                       |
| Unhandled `type` on an in-place mutation  | Root error boundary     | Wrapper error log, boundary error log, `onCaughtError` log, one toast |
| Report send fails (unreachable, rejected) | Alert inside the dialog | None by default                                                       |
| Route not found                           | `NotFoundComponent`     | None                                                                  |
| Main process security block               | Denied, no window       | Core logger error                                                     |
| App init failure                          | App exits               | console.error only, since Core may be what failed                     |

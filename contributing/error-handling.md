# Error Handling

This is the single reference for how elek.io Desktop handles errors end to end: where they come from, how a `CoreError` keeps its meaning across the IPC boundary, how errors surface in the UI, where and when things are logged, and how to handle a specific expected error in place. For what the errors themselves mean (the `CoreError` types and when Core raises them), read Core's own [error-handling doc](../node_modules/@elek-io/core/docs/error-handling.md).

> [!NOTE]
> Nothing here reports anywhere. Desktop sends no error data off the machine on its own, and there is no remote error tracker. An error is only ever written to Core's local log files, and it only reaches us if the user chooses to tell us.

## Where errors come from

Two kinds of error reach the renderer, and the difference drives everything below.

- **`CoreError`** is thrown by a Core operation and travels to the renderer through an IPC channel. It is the app's expected failure shape. Core raises a `CoreError` with a `type` (`NotFound`, `BadRequest`, `Unauthorized`, `Conflict`, `PreconditionFailed`, `UpgradeFailed`, `VersionSkew`, `RateLimited`, `Internal`) and a matching `statusCode`. The `type` is the stable, machine readable contract, like an HTTP status code. See Core's [error-handling doc](../node_modules/@elek-io/core/docs/error-handling.md) for the full table.
- **Renderer errors** are ordinary JavaScript or React errors: a route that fails to load, a render that throws, a bug. These are not `CoreError`s and carry no `type`.

Where one surfaces depends on what it was doing rather than on what it is: a read that failed stays in its pane, and everything else is fatal to the view. See [how errors surface in the UI](#how-errors-surface-in-the-ui).

## Preserving `CoreError.type` across IPC

The main and renderer processes are separate, so an error thrown by a handler does not travel to the renderer as itself. Electron reconstructs it on the renderer side, and that reconstruction **drops the `CoreError` subclass along with its `type` and `statusCode`, and carries no stack frames** (verified: the renderer-side rejection is a plain `Error` whose `message` is `Error invoking remote method '<channel>': <original message>` and whose `stack` has zero `at ...` frames). Without help the renderer sees only a message string, cannot tell a `Conflict` from a `PreconditionFailed`, and has no origin stack.

To keep all three, plus the structured `cause` Core attaches to some of them, the main and renderer sides cooperate through one small cross process module, [`src/shared/ipcError.ts`](/src/shared/ipcError.ts). It imports `CoreErrorType` type only, so it carries no runtime dependency on Core and bundles into both processes.

1. **Encode in main.** The single `ipcMain.handle` wrapper in [`src/main/index.ts`](/src/main/index.ts) (the one loop that registers every channel) try/catches the handler call. A thrown `CoreError` is re-thrown as `new Error(serializeCoreError(error.type, error.message, error.stack, error.cause))`, which packs the `type`, the message, Core's own origin `stack` and the forwardable part of the `cause` into the message behind a sentinel string. Anything that is not a `CoreError` propagates unchanged.
2. **Decode in the renderer.** `parseIpcError(error)` returns `{ type?, message, stack?, cause? }`. It finds the sentinel by substring, so it is robust to Electron prefixing the message, validates the decoded `type` against the known `CoreErrorType` values, and returns the clean message plus Core's stack and cause. A non `CoreError` has no `type`, and keeps its own `stack`, which is the only one it has. A malformed payload degrades to the raw message with neither, because `error.stack` still holds the encoded form there and returning it would leak the sentinel.

Because the sentinel is located by substring and the type is validated, decoding never throws and always degrades to the raw message. This is why the renderer can safely call `parseIpcError` on any caught value, `CoreError` or not.

The `stack` is what fills the technical detail block on the error screen and the `meta` of the log written beside it. It matters because the reconstructed renderer error is frameless, so without forwarding, a `CoreError` that reaches the boundary would show and log no stack at all.

### What the `cause` carries, and what it does not

`serializeCoreError` forwards a `cause` only when it is an array or a plain object, meaning one whose prototype is `Object.prototype`. The cause exists for a screen to branch on, not to show, so everything else is dropped, and two shapes are worth naming:

- **An `Error`**, a `ZodError` included. JSON keeps none of an Error's own fields, so what would arrive is an empty object, and its message is already the `CoreError`'s message.
- **A primitive.** Core passes git's raw stderr and stdout as the cause of a push it refuses, and a remote URL there can carry a credential, so no primitive cause crosses.

Anything with a prototype of its own goes the same way, because it does not survive JSON as structured data either: a `Date` would arrive as a string, a `Map` or a `Set` as `{}`.

Two causes are left, and both are arrays of ids, with one typed reader each that validates what arrives rather than trusting the payload:

- **The issue list Core attaches to a `Conflict` it raises for a field definition change it cannot carry out alone** (see Core's [schema-changes doc](../node_modules/@elek-io/core/docs/schema-changes.md)). Each element of an array cause that carries Core's `issue` key crosses as the four fields a screen needs and nothing else, `forwardedIssueKeys` in `ipcError.ts`. `transformedValues` and `currentValue` stay in the main process, because those are the content somebody wrote: `transformedValues` holds every Value of the Entry, so a refused change in a large Collection would otherwise pack the content of each affected Entry into one message. Read by `entryIssuesOf` in [`lib/schemaChange.ts`](/src/renderer/lib/schemaChange.ts).
- **The dangling references Core attaches to the `Conflict` it raises for a sync it would integrate them with.** Those elements carry no `issue` key, so they cross as Core wrote them, which is ids only: the Collection, the Entry, the field's slug, which carrier held the id, the chain of Components down to it, and what the missing target was. Read by `syncConflictReferencesOf` in [`lib/sync.ts`](/src/renderer/lib/sync.ts), which keeps what the sync dialog shows: the Collection, the Entry, the field's slug, and the Component of the chain's innermost hop, which is where a field inside a Component item is defined.

**No cause reaches a log record.** `errorLogAttributes` ([`shared/logError.ts`](/src/shared/logError.ts)) reads the decoded `type`, `message` and `stack` and nothing else, which is what keeps a cause's own fields, such as an Entry's content or a git remote's URL, out of a log file. Nothing renders a cause raw either.

**A message is not safe by itself.** An error whose own message carries content somebody wrote logs through `errorLogAttributesWithoutMessage` from the same module, which leaves the message out and keeps the frames of the stack only, since a stack starts with the message it was thrown with. Milkdown's parser and serializer are such an error: each puts the whole node it could not match into what it throws, and for a markdown Value that node is the text itself, see [markdown-editor.md](./renderer/markdown-editor.md#when-a-stored-value-cannot-be-read).

An error Core raised without a cause encodes and decodes exactly as it did before the cause was carried: `JSON.stringify` omits the key, so the decoded result has no `cause` and the message is unchanged.

## How errors surface in the UI

### Unexpected errors: the root error boundary

By default, a mutation failure and a render error are meant to be fatal to the current view. `throwOnError: true` is set app wide, by [`useQueryNoError`](/src/renderer/hooks/useQueryNoError.ts) for queries and by `customMutationOptions` ([`util.ts`](/src/renderer/queries/util.ts)) for mutations. The error is re-thrown during render and caught by the root `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx). It replaces the whole view with a friendly error page whose only exits are Back to Projects and Reload, plus Report this problem, which opens the report dialog on top of it.

`ErrorComponent` runs the caught error through `parseIpcError`, so it shows and logs the clean message and never the raw sentinel payload. It uses the decoded stack too: for a CoreError that is Core's origin stack, and a non-Core error falls back to its own stack, so the technical detail block and the log never leak the encoded form either.

This full view takeover is the right default for an unexpected failure but the wrong response to two other things: a read a pane could not make, which the pane answers itself, and an expected, recoverable guard, which is handled in place.

### A read that failed: the pane says so

A query failure is not fatal to the view. It belongs to the one pane that read it, so [`Pane`](/src/renderer/components/pane.tsx) puts a boundary of its own around what it holds: TanStack Router's `CatchBoundary` inside Query's `QueryErrorResetBoundary`. The pane keeps its place in the window and shows one sentence and Try again, while the header, the sidebar and every other pane carry on. Try again clears the query's error and then the boundary, so the read runs again, and navigating away clears it too, since the router's location is the boundary's reset key.

**Every pane names what it holds**, and the sentence reads with that name: `<Pane name="the changes of this Project">` says "Desktop can't read the changes of this Project." when that read fails. The prop is required, so a pane cannot ship saying only that it cannot read what belongs here, and a pane that holds whatever screen is open takes the broadest name of what can be open in it.

**It logs what it caught the way the root boundary does**, through `errorLogAttributes`, with the message `Uncaught pane error: ...`. That is the point of a boundary rather than an `isError` branch: a read that failed is in the log file with its type, message and stack, whichever pane it happened in. An `isError` branch or a blanket `throwOnError: false` would show the same sentence and write nothing.

**A pane's boundary takes a failed read and nothing else.** A React boundary catches everything thrown below it and cannot tell a failed read from a failed save, because both arrive as the same `CoreError`. So the query cache marks every read that failed, in [`client.ts`](/src/renderer/queries/client.ts), and `PaneReadFailed` re-throws anything without that mark, which carries it up to the root error screen. The mark is set there rather than in `useQueryNoError`, because `throwOnError: true` makes TanStack Query itself throw during render, before the hook looks at the result. It is kept in a `WeakSet` (see [`readFailure.ts`](/src/renderer/lib/readFailure.ts)), so nothing is added to what the error screen shows, what a log record carries or what crosses IPC.

Two rules follow for a screen:

- **A screen does not catch a failed read.** No `isError` branch, no `throwOnError: false`. The pane the read happens in already answers it. The one exception is the Project card below.
- **A read belongs inside the pane that shows it.** A boundary only catches what is thrown below it, so a read in a layout above two panes takes both of them, which is right when both depend on it and wrong when one does. Read in the component that shows the data.

### The reads a screen catches: a Project card's own

A Project's card answers its own failed reads itself, rather than leaving them to a boundary. What it reads is a state of the Project it has to show, whether the Git repository can be reached at all and which Release it is at, and the sidebar's card stands above every pane anyway. Four places draw such a state and all of them read through [`useProjectState`](/src/renderer/hooks/useProjectState.ts), so none of them writes an `isError` branch of its own:

| Whose state        | Where                                                                                                                          | Shows                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The open Project's | The sidebar, in [`project-sidebar.tsx`](/src/renderer/components/project-sidebar.tsx)                                          | Every state line, plus when it last checked and a sync of its own that failed                                                              |
| One per Project    | Each cell of the Projects page, in [`project-card.tsx`](/src/renderer/components/project-card.tsx)                             | The same state lines, without the check's own line and without a failed sync, which only the open Project has                              |
| The open Project's | The Remove confirm of its Settings, in [`settings/general.tsx`](/src/renderer/routes/projects/$projectId/settings/general.tsx) | What removing cannot bring back: how many changes are not synced, or, where the check failed or has not answered, that changes may be lost |
| The open Project's | The change rows of its Dashboard, in [`dashboard.tsx`](/src/renderer/routes/projects/$projectId/dashboard.tsx)                 | Whether each change has reached the Git repository, and neither state where the check failed or has not answered, see `syncStateOf`        |

Each card runs its own two reads, which is what lets a slow or failing one hold up nothing but its own lines: the Projects page is on screen with every card on it while each one's state line is still a placeholder. It matters most on that page, which draws one card per Project, so a read left to the boundary would empty the page of every Project because one of them could not be read.

- `projects.getChanges` ([`projectOptions.ts`](/src/renderer/queries/options/projectOptions.ts)) is the only query that carries `throwOnError: false` in its own options, and it retries nothing. So a repository that cannot be reached, or one that refused access, becomes a state line in the card at once instead of three retries of waiting and then the root error screen, which is what used to leave the counts blank with no word about it.
- `releases.list` is read by the Releases screen and the sidebar's navigation too, and neither catches a failure: the navigation reads above every pane, so a refused read on a screen of a Project reaches the root error screen, see [Routing](./renderer/routing.md). That is why the card opts out for its own read rather than in the query's options. It keeps the retries, so its line arrives once the read has given up.
- The card reads both with a plain `useQuery`, not `useQueryNoError`, which throws on `isError` by design.
- **It logs what it caught the way a pane's boundary does**, through `errorLogAttributes`, with the message `Project card check error: ...` or `Project card Releases error: ...`, from an effect so a re-render does not write the same record again. So a repository that stopped answering is in the log file with its type, message and stack either way.
- Which line the check shows comes from `checkRefusal` in [`lib/sync.ts`](/src/renderer/lib/sync.ts): `Unauthorized` is a repository that answered and refused, which gets its own line, and everything else is one that could not be reached. Sync and Check now are the retry, so nothing else has to offer one. A failed Releases read says so where the last Release stands.

- **The Remove confirm never says there is nothing to lose when it cannot tell.** A Project whose Git repository cannot be reached is exactly the one whose changes have not left this computer, so a failed check reads as "Changes that aren't synced may be lost", never as a count of zero. The count itself is the check's `ahead`.
- **One failure is one record.** Each effect keeps the errors it has written in a `WeakSet`, so neither a re-render nor a second screen reading the same error writes it again. A read that runs again and fails again is its own failure and its own record, which is what a second reader of a stale query brings about.

Every reader of the check is in the table above. A screen that needs it later shows its failure as a state the same way, through `useProjectState`, rather than catching a read of its own.

### Expected errors: handled in place

Some `CoreError`s are raised by normal user actions and are recoverable. A `409`/`412` guard on a delete or a sync is not a crash, it is information the user can act on. For those, a mutation opts out of the boundary **for that specific `type` only** and drives the UI itself, while every other failure still propagates to the boundary. See the guide below.

**The default, in one line: catch only the `CoreError` types you have a specific handling for, and let everything else propagate.** A blanket `throwOnError: false` is a mistake. It routes every failure into the in-place `catch`, so an unexpected `Internal` gets shown through a dialog built for one specific reason, and because the in-place pattern also silences the wrapper toast and log, that unexpected error never reaches Core's log at all. Discriminate by `type` so the reason you know about gets its dialog and everything you do not know about stays loud and logged. This applies to any handler that catches some errors but not all, not just deletes and syncs.

## Handling expected errors in place

Use the [`useAppMutation`](/src/renderer/hooks/useAppMutation.ts) hook when a specific Core guard should stay on the page instead of hitting the boundary. It is the single home for this pattern, so the "expected" set is defined once and the boundary opt-out can never drift from the in-place dispatch.

1. **Declare the handled `type`s with their in-place handlers.** Give `useAppMutation(options, { handled })` a `handled` map from each `CoreError` `type` to the callback that drives its UI. From that map the hook sets `throwOnError` to a predicate returning `false` only for the handled `type`s (so just those reach the caller's `catch` and every other failure still hits the boundary) plus an `onError` that suppresses the wrapper's toast and log **for the handled `type`s only** and delegates to the wrapped options' `onError` for everything else. Suppression is per type, not per mutation: an unexpected failure on an in-place mutation keeps its `elek.method`/`elek.object.type` log with the error on it, exactly like on a plain `useMutation`. Never a blanket `throwOnError: false`.

   ```tsx
   const { mutateAsync, handleError } = useAppMutation(
     queryOptions.assets.delete,
     {
       handled: {
         Conflict: (error) => {
           setDeleteError(error);
           setIsDeleteErrorDialogOpen(true);
         },
       },
     }
   );
   ```

   A form's submit reads the same map and marks its fields instead of opening a
   dialog, see
   [a Value, a reference or an Asset type an Entry cannot be saved with](#example-a-value-a-reference-or-an-asset-type-an-entry-cannot-be-saved-with).

2. **Await inside try/catch, and dispatch in the catch.** `await mutateAsync(...)` still rejects on failure regardless of `throwOnError`, so the `catch` runs. Call `handleError(error)` there: it reads the `type` and runs the matching `handled` callback, or does nothing for an unhandled type (which `throwOnError` has already routed to the boundary, so touching state for it would fight it). Keep the success path (e.g. `router.navigate`) inside the `try`, so a handled failure skips it.

   ```tsx
   try {
     await mutateAsync(props);
     await router.navigate({ ... });
   } catch (error) {
     handleError(error);
   }
   ```

3. **Map the type to copy.** Use `describeCoreError(type, overrides?, fallback?)` from [`lib/coreErrorText.ts`](/src/renderer/lib/coreErrorText.ts). A matching per type `override` wins, then the consumer's `fallback` (its own generic sentence), then an app wide generic per type, then a default for an unknown type. Read the `type` with `parseIpcError(error)` on the held error state. Every sentence comes from the message catalog: the maps hold `msg` descriptors rather than strings, so a map at module scope is not read before a catalog is active, and `describeCoreError` renders one with `i18n._` at the moment it is shown. It is the single seam that maps a `type` to a localized string, see [internationalization.md](./renderer/internationalization.md).

Because the predicate and the dispatch both read the same `handled` map, they cannot fall out of sync, which is the whole point of the helper: the "expected" set lives in one place.

Keep dialog titles and button labels stable, since the E2E specs assert them. Only the description changes with the `type`. Assert the copy you wrote in specs, never Core's raw message, which belongs to Core's own tests.

**A mutation says its own two sentences.** `customMutationOptions` takes a required `toasts` with a `success` and an `error` function, each reading the catalog when the toast shows, so a mutation without them does not compile. A `success` of `null` is the one way out, for a change the person watches happen: `user.setPreference` writes the app's language and the Local API's switch, and both answer by happening, so a toast would name something nobody did. A failure always has words. Nothing builds a toast from the call any more: a success names what happened to what, where the answer carries its title, and a failure names what did not happen, with no call name, error type, id or git output. The log records beside them are unchanged, and still carry the method and the object type.

`success` is handed the mutation's `context` beside its answer and its variables, so a title stored per language, such as a Collection's or a Component's name, is read in the language the screen reads it in, see [internationalization.md](./renderer/internationalization.md#translating-content-translatecontent). It runs before the mutation's own `onSuccess`, which is what lets a delete name what went: its answer is empty, so the object is read out of the cache as that handler found it. An Entry carries no name, so its toast names the kind of object.

A `type` handled this way is intentionally invisible to the standard logging (see [Logging](#logging-where-what-and-when)): only the in place UI reacts. The `type`s you did not handle are unaffected, they still propagate to the boundary and are logged and toasted as usual, because the suppression is keyed on the same `handled` map. If you also want a handled `type` recorded, log it explicitly in the `catch`.

Every mutation below is built with `useAppMutation`, so the "predicate returns false only for X" behavior described in each is what the helper derives from that site's `handled` map. One read does the same thing in the query layer, where there is no mutation to hold the map, see the Release example.

### Example: a sync that failed

The Project card in [`project-sidebar.tsx`](/src/renderer/components/project-sidebar.tsx) catches a failed `synchronize`. The mutation `handles` the four types in `SYNC_REFUSAL_TYPES` ([`lib/sync.ts`](/src/renderer/lib/sync.ts)), so `useAppMutation`'s predicate returns false only for those four, and every other type still reaches the root error screen. The `onClick` catches the rejection and calls `handleError(error)`, which stores it with `setSyncError(error)` and then answers it in one of two places.

**Where the answer goes depends on where focus is**, which is ci's rule for a failure somebody is waiting for:

- While `document.activeElement` is still the Sync button, the [sync dialog](/src/renderer/components/sync-dialog.tsx) opens. It carries `role="alertdialog"`, takes focus and gives it back to Sync when it closes.
- Once focus has moved on, a toast with Retry answers instead, because a dialog would take the keyboard from whatever the editor moved to.
- Either way the card keeps one "Sync failed" line until a sync succeeds, with Show why, which opens the dialog. A toast disappears and cannot hold a lasting state.

Sync stays focusable while it waits (`focusableWhenDisabled`, so `aria-disabled` rather than `disabled`), which is also what keeps focus on it long enough for the refusal to land there.

The dialog's sentence comes from `describeCoreError` with `SYNC_REFUSALS`, and each one names only what Core raises that type for while synchronizing, read off Core's [git-and-sync doc](../node_modules/@elek-io/core/docs/git-and-sync.md#synchronizing):

- `Conflict` is the integrity scan alone. Core attaches its `DanglingReference[]` as the cause, so the dialog lists every Entry and field it named, read through `syncConflictReferencesOf`. Each row links the Entry by the title `entryTitle` gives it and names the field by its own label, never by the ids Core sent. The label comes from wherever the field is defined: the Collection for a field of its own, and the Component for a field inside a Component item, which Core names with the chain of hops down to it. A field no longer defined at all, which is what a field removed between the write and the sync leaves, keeps the slug a site reads its Value under, since there is no label left to read.
- `PreconditionFailed` has several causes, and the text names the three an editor meets: a repository holding something besides the Project, a repository whose Git LFS endpoint will not take the Assets, and a textual rebase conflict.
- `Unauthorized` is a repository that refused the credentials.
- `Internal` is a git command that failed at all, most often a repository nothing can reach.

Handling `Internal` in place is the exception to make on purpose, the same one the Release dialog makes: every failure of this one call has the same, true, actionable answer, and it is what keeps Core's raw message off the screen, since a Git repository's address can carry a credential.

`synchronize()` pushes nothing until every step before it went through (see Core's [git-and-sync doc](../node_modules/@elek-io/core/docs/git-and-sync.md#synchronizing)), so the dialog says once that nothing was synced and the changes stay on this computer. It does not unwind what it already did locally: a `Conflict` comes after the rebase, and the integrated commits stay local on purpose, which is what lets the editor repair the Entry the dialog links and sync again.

### Example: a download Core refuses

Download from another Git host, the dialog in [`routes/projects/index.tsx`](/src/renderer/routes/projects/index.tsx), is Core's clone. It `handles` only `PreconditionFailed`, which Core raises for a repository without a `draft` branch (see Core's [git-and-sync doc](../node_modules/@elek-io/core/docs/git-and-sync.md#cloning-an-existing-project)). Such a repository holds no Project, or one made before Core 0.25 renamed the branches, so the dialog stays open with the address and one line above its button: "This repository holds no Project, or one made with an older version of elek.io Desktop. Ask whoever set it up." It names no version, because the version an editor would have to compare it against is the one that wrote the repository, which Desktop cannot read without cloning it. Any other failure, a `Conflict` for a Project already on this computer included, still reaches the boundary.

A missing `draft` branch is not the only cause of the type. Core classifies a git command whose dynamic loader failed as `PreconditionFailed` as well, centrally for every command it runs, so a clone of a perfectly good repository shows that same line on a machine whose git cannot load a shared library it needs. Core's [table of git errors](../node_modules/@elek-io/core/docs/git-and-sync.md#errors-during-git-operations) lists both causes under the type. There the line is wrong about the repository, and the dialog still cannot tell the two apart. A `CoreError`'s cause now crosses the boundary, but what Core attaches to a refused git command is the command's own output, which the encoding drops rather than carry a credential into the renderer (see [What the `cause` carries](#what-the-cause-carries-and-what-it-does-not)). So `handled` discriminates on `type` alone here, and splitting the line waits on Core raising something structured for it.

### Example: a new Project its Git repository will not take

Core's create takes no remote, so Create Project ([`routes/projects/create.tsx`](/src/renderer/routes/projects/create.tsx)) puts a Project on another Git host in three calls: the create, then `setRemoteOriginUrl`, then the first `synchronize`. The Project exists on this computer after the first one, so a failure of either call that follows it is not something to send to the error screen: the editor would be left thinking nothing happened, in front of a form that would make a second Project.

Both of those mutations therefore `handle` the four types a sync can be refused with, which [`lib/sync.ts`](/src/renderer/lib/sync.ts) lists, `Internal` among them. Handling `Internal` is the exception made on purpose here, the same one the Release dialog makes: every failure of these two calls has the same true answer, and it keeps Core's own message off the screen, since a Git repository's address can carry a credential. A type outside those four still reaches the boundary.

The answer is a dialog, which is where ci puts a failure somebody is waiting for. It says the Project is on this computer with everything that was entered, names the cause in the words of the page rather than Core's, says where the address can be set again, and opens the Project. The page takes that way out itself, so the guard for unsaved changes does not ask on it.

**The two reads the calls after the create invalidate are primed first.** The create writes the new Project into `projects.read` and `projects.list` rather than reading either, so while the create page is open neither key carries a query function of its own. `setRemoteOriginUrl` and `synchronize` invalidate both with `refetchType: 'all'`, and a query with no function cannot be refetched: the refetch fails, retries with backoff and reaches the root error screen with the Project already made. So the page reads both once before it goes on, which is what gives each key its own query. Each has to be a real read, because the app caches every read forever and a query that already holds data would be handed back without ever being given its function.

### Example: force delete a Project

[`settings/general.tsx`](/src/renderer/routes/projects/$projectId/settings/general.tsx) removes a Project from this computer, and deletes one that has no Git repository to come back from. Core blocks an unforced delete of a Project nothing else holds a copy of (`PreconditionFailed`) or one with unpushed commits (`Conflict`), and that block is a warning rather than a failure: it says the work has not left this computer.

So the warning is given before the call rather than caught after it. The confirm dialog names what goes and, in the warning color, what cannot be brought back, read from the Project's own state (see [the reads a screen catches](#the-reads-a-screen-catches-a-project-cards-own)), and its red button then deletes with `{ force: true }`. Nothing handles a `type`: the one guard Core raises is what the dialog has already said, so any failure that still arrives is unexpected and `throwOnError` routes it to the boundary. The `catch` only closes the dialog, so it is not left in front of the error screen.

### Example: delete an Asset still in use

[`components/asset-teaser.tsx`](/src/renderer/components/asset-teaser.tsx) catches Core's asset delete guard. Deleting an Asset that an Entry still references is blocked with a `Conflict` that lists the referring Entries (see Core's [asset-management doc](../node_modules/@elek-io/core/docs/asset-management.md)). The delete mutation `handles` only `Conflict`. The teaser's own "You are about to delete this Asset" alertdialog is the confirm step, not the error surface: its confirm action fires the delete, and on rejection the `catch` calls `handleError`, which for a `Conflict` opens a separate controlled "Could not delete this Asset" dialog. So the alertdialog closes and the in-use dialog opens in its place, keeping the failure on the Assets page. A non-`Conflict` failure propagates to the boundary instead. The description uses `describeCoreError` with a `Conflict` override that tells the user to remove or repoint the references first. Nothing is deleted, so the teaser stays on the page.

### Example: a Value, a reference or an Asset type an Entry cannot be saved with

The Entry create and update forms ([`collections/$collectionId/create.tsx`](/src/renderer/routes/projects/$projectId/collections/$collectionId/create.tsx) and [`$entryId/update.tsx`](/src/renderer/routes/projects/$projectId/collections/$collectionId/$entryId/update.tsx)) are the two form-submit sites that handle in place, not deletes or syncs. Both read one map, [`useEntryRefusals`](/src/renderer/hooks/useEntryRefusals.ts), so the same refusal reads the same way whichever of them somebody is in, and each refusal that names a field this form holds is marked below that field with `setError`, which is where ci's Messages table puts a field that is wrong. Neither form opens a dialog for one any more.

Three refusals land that way, two `CoreError` types between them:

- **A Value another Entry already holds.** Core rejects an Entry whose Value collides with another Entry's on a unique field with a `Conflict` whose cause lists each collision with its field slug and its language (see Core's [fields doc](../node_modules/@elek-io/core/docs/fields.md#uniqueness)). The message says another Entry already uses this Value.
- **A reference that points at nothing.** An Asset or an Entry that was deleted between being chosen and the save leaves Core refusing the write with a `BadRequest` whose cause carries one issue per reference, with the field, the language, and the sections it sits inside (see Core's [fields doc](../node_modules/@elek-io/core/docs/fields.md)).
- **An Asset of a type the field does not take.** The same `BadRequest`, with an issue of its own kind. Core cannot put the restriction in a schema, because a reference carries only an id, so a field narrowed to one type after an Entry was written refuses that Entry on its next save.

Each shape of cause has one typed reader in [`lib/entryRefusals.ts`](/src/renderer/lib/entryRefusals.ts), which parses it with zod and keeps only what a screen needs, the way [`entryIssuesOf`](/src/renderer/lib/schemaChange.ts) does for a refused field definition change. One helper there turns Core's location into the path of that field on the form: it walks the form's own Values to find the place of each section Core names, since Core names a section by its id while the form binds it by its place, so a section that was moved still gets its own message. It answers nothing where the form holds no such place, which is a field the Collection no longer has, a section somebody removed while the save was in flight, or a language the form holds no slot for.

**A refusal that names no field this form holds is thrown on.** The two types above also stand for refusals that name nothing a form holds, a `Conflict` on another object among them, and the reader answers with an empty list for each of those. The handler then re-throws, which leaves `handleSubmit` rejecting, so `AppForm` re-throws it during render and the root error boundary takes it with its log record (see [forms.md](./renderer/forms.md#when-an-error-has-no-field-to-land-on)). Three specs guard the legs of that: the Value another Entry holds lands on its field, an Asset of the wrong type lands on the field inside its section, and an injected `Conflict` with no cause reaches the error screen.

### Example: a Component change Core cannot carry out

The Component configure route ([`components/$componentId.tsx`](/src/renderer/routes/projects/$projectId/components/$componentId.tsx)) is where `type` alone is not enough. Core raises `Conflict` there for two unrelated reasons: a slug another Component already uses, and a field definition change it cannot carry into the Entries that already hold the Component. The cause tells them apart, and nothing else does.

- With no issues in the cause the slug is taken, so the message lands on the Slug field with `setError`, which is where ci's Desktop rules put a field that is wrong.
- With issues the save-blocked dialog opens and lists them, one line per Entry: the Collection by its name, the Entry by its id, the field by its slug, and what has to happen to it, from `describeEntryIssue`. So an editor is told which Entry to open rather than only that something conflicts.

`BadRequest` is handled in place too, for the one reason an editor meets here: a Component whose dynamic field reaches back into itself, directly or through another Component, which Core refuses. Every other reason a `BadRequest` could carry on this call is already checked by the same schema the form resolves against, so naming the circular reference is naming what the person met, as ci's rule asks. Every other type reaches the boundary, which the "routes an unexpected Component save failure to the root error boundary with its message" spec guards.

The delete handles `Conflict` alone, for a Component a Collection or another Component still references.

### Example: local API port in use

Core's `api.start()` rejects with a `Conflict` when something else holds the port (see Core's [local-api doc](../node_modules/@elek-io/core/docs/local-api.md)). Both places that start the API `handle` only `Conflict`.

- **The Local API switch in the user menu** ([`components/user-dropdown.tsx`](/src/renderer/components/user-dropdown.tsx)) is where it is turned on and off. It has no field to mark, so its handler shows a toast that points to the Profile, where the port is changed. A toast action would not help here, because the open menu blocks pointer events outside itself, while its Profile item sits right above the switch. The switch also writes the preference the main process reads at launch, through `user.setPreference`, which is the one mutation with no success toast: the API's own toast already says it started or stopped, and nothing else in the app sets that preference.
- **The Profile** ([`routes/user/profile.tsx`](/src/renderer/routes/user/profile.tsx)) holds the port. It carries the preference along untouched and starts the API before it saves the User, for the one case where the preference is on while the API is not running, which is a port that was still held at launch. Its handler marks the Port field with `setError`, which is where ci's Messages table puts a field that is wrong, so a busy port saves nothing and the form stays dirty to pick another port and save again.

At launch the main process does the same in its own way: it logs the failure and opens the app with the API off (see [overview.md](./overview.md#application-lifecycle)).

### Example: a Release Core refuses, and one it cannot even read

The Release dialog ([`components/release-dialog.tsx`](/src/renderer/components/release-dialog.tsx)) answers in place on both of its halves, and it is the one site where a read does so too.

**Making the Release.** Its `create` mutation `handles` `PreconditionFailed`, `Unauthorized` and `Internal`, each storing the error so one line above Create Release describes it through `describeCoreError` with `RELEASE_CREATE_REFUSALS` ([`lib/release.ts`](/src/renderer/lib/release.ts)). Three types rather than one, because `create()` commits, fetches and pushes, and Core's [table of git errors](../node_modules/@elek-io/core/docs/git-and-sync.md#errors-during-git-operations) puts a remote that moved on or cannot take a Release under `PreconditionFailed`, refused credentials under `Unauthorized`, and a git command that failed at all, most often an unreachable repository, under `Internal`. All three are recoverable in the same way: Core unwinds every step of a failed Release before the error arrives (see its [releases doc](../node_modules/@elek-io/core/docs/releases.md)), so nothing was released, the dialog says so, and pressing the same button again retries. `Conflict`, `NotFound`, `BadRequest`, `VersionSkew` and `UpgradeFailed` are not handled and reach the boundary. Two specs guard the two legs of the predicate: "routes an unexpected Release failure to the root error boundary" drives a failure carrying no `CoreError` type at all, and "routes a Release failure of an unhandled type to the root error boundary" drives a `Conflict`, which does carry one.

Handling `Internal` in place is the exception to make on purpose, not a habit. It is right here because every failure of this one call has the same, true, actionable answer, and because it is what keeps Core's raw message off the screen: a git failure's message belongs to git, and a Release talks to a remote whose URL may carry a credential.

**Reading what a Release would publish.** `releases.prepare` ([`releaseOptions.ts`](/src/renderer/queries/options/releaseOptions.ts)) is a query, so it has no `handled` map. Its `queryFn` catches the same shape of refusal itself and answers `{ status: 'refused', errorType }` instead, re-throwing every other failure so `throwOnError: true` still routes it to the boundary. The set of caught types is the keys of `RELEASE_READ_REFUSALS`, the map the dialog's copy comes from, so the two cannot drift apart, exactly as `handled` cannot drift from the `throwOnError` predicate.

A refusal is modeled as an outcome of the read rather than a failure of it because it reads like one: Core already answers "nothing to release" with a null bump rather than an error, and "synchronize this Project first" is the same kind of answer. Both leave the dialog open with something the editor can act on.

`PreconditionFailed` covers more causes than either line names, and naming one is on purpose: a refusal says what the person in front of it met and what to do next, in one sentence, not every cause the type could stand for. The read's line is written for a `draft` behind the remote's and the create's for a remote that moved on between the read and the push, which are the two an editor meets. Core's [table of git errors](../node_modules/@elek-io/core/docs/git-and-sync.md#errors-during-git-operations) puts three more under the type on these two calls, and the line is wrong about each:

- A Project not checked out on `draft`, which `prepare()` requires. A Project last written before Core renamed the branches is on `work`, and Core refuses the read with "Not on draft branch". Synchronizing is not the way out either, since Synchronize is disabled for such a Project. Its branches are renamed by hand.
- A remote that does not support the atomic push a Release needs. Core never falls back to separate pushes, because a push that lands `main` without `draft` breaks the rule a Release keeps.
- A git that cannot load a shared library it needs, which is the cause the Download dialog carries as well.

These three are separated by git's own output, which the encoding does not forward, so splitting the lines waits on the same change as the Download dialog's.

## Logging: where, what, and when

There is one sink. `window.ipc.core.logger.*` sends over the `core:logger:*` IPC channels to Core's own logger, which writes to the console and to Core's log files. It is local diagnostics, always on, including under test, and nothing it writes leaves the machine.

| When                                     | Where                                                                                | What                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Every route navigation                   | `router.subscribe('onBeforeLoad')` in [`renderer/index.ts`](/src/renderer/index.ts)  | info: "Desktop navigating from ... to ..."               |
| A mutation succeeds                      | `customMutationOptions` onSuccess ([`util.ts`](/src/renderer/queries/util.ts))       | info: "Successfully ran ... on ..." plus a success toast |
| A mutation fails (not handled in place)  | `customMutationOptions` onError                                                      | error: "Failed to run ... on ..." plus an error toast    |
| An error reaches the root boundary       | `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx)                  | error: "Uncaught route error: {decoded message}"         |
| A read fails inside a pane               | `PaneReadFailed` in [`pane.tsx`](/src/renderer/components/pane.tsx)                  | error: "Uncaught pane error: {decoded message}"          |
| A React error not caught by any boundary | `onUncaughtError` in [`app.tsx`](/src/renderer/app.tsx)                              | error: "Uncaught React error"                            |
| A React error caught by a boundary       | `onCaughtError` in [`app.tsx`](/src/renderer/app.tsx)                                | error: "React error caught by a boundary"                |
| React recovers from an error             | `onRecoverableError` in [`app.tsx`](/src/renderer/app.tsx)                           | warn: "React recovered from an error"                    |
| A rejected floated promise (renderer)    | `unhandledrejection` listener in [`renderer/index.ts`](/src/renderer/index.ts)       | error: "Unhandled promise rejection: ..."                |
| An uncaught renderer error outside React | `error` listener in [`renderer/index.ts`](/src/renderer/index.ts)                    | error: "Uncaught error: ..."                             |
| An uncaught throw in the main process    | winston, through Core's logger                                                       | error: winston's own uncaught exception record           |
| A failed report send                     | `useSendReport` in [`report-dialog.tsx`](/src/renderer/components/report-dialog.tsx) | error: "Failed to send a report: ..."                    |
| Main process security events             | main handlers in [`src/main/index.ts`](/src/main/index.ts)                           | error: blocked navigation, or a rejected file request    |
| The local API fails to start at launch   | `onAppReady` in [`src/main/index.ts`](/src/main/index.ts)                            | error: "Could not start the local API ..."               |
| The app fails to start                   | `onAppReadyFailed` in [`src/main/index.ts`](/src/main/index.ts)                      | error: "Failed to initialize the app", when Core exists  |

### What an error record carries

A log file is the only thing we get from a user who zips their logs instead of sending a report, so the shape of an error record is a contract rather than a detail. Every site that logs an error, in either process, builds its attributes with `errorLogAttributes` from [`shared/logError.ts`](/src/shared/logError.ts), or with its `errorLogAttributesWithoutMessage` where the thrown message itself carries content, so they cannot drift apart. In the main process a CoreError arrives as the instance itself rather than encoded by IPC, so its type is read off it.

Attributes are flat dotted keys, the same convention Core follows for its own records (see Core's `logAttributeNames`). The point is that one query answers a question across both sources: a grep for `exception.stacktrace` finds every stack in a file, whoever wrote it.

| Attribute                         | What it holds                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `error.type`                      | The `CoreError` type. Absent for an error that never came from Core                                       |
| `exception.type`                  | The JavaScript class, which is what tells a `TypeError` from a `RangeError`                               |
| `exception.message`               | The decoded message, never the raw sentinel payload. Absent where that message carries content, see below |
| `exception.stacktrace`            | Core's origin stack for a `CoreError`, the error's own stack otherwise                                    |
| `elek.react.component_stack`      | React's component stack, on the root callbacks only                                                       |
| `elek.method`, `elek.object.type` | Which mutation, on the mutation wrapper's records                                                         |

**A stack is always present.** It used to be absent for anything that was not a `CoreError`, because `parseIpcError` returned the decoded stack or nothing, and only the root boundary fell back to `error.stack`. So an ordinary renderer bug, the one class you cannot reproduce from a description, reached the log with no frames at all. `parseIpcError` now falls back to the error's own stack in its no-sentinel branch. The fallback is deliberately not in the malformed-payload branch, where `error.stack` still holds the encoded form and returning it would leak the sentinel onto the error screen.

**A message is left out where it carries content.** The markdown editor is the one site that logs with `errorLogAttributesWithoutMessage`, so its record holds no `exception.message` and its `exception.stacktrace` holds the frames alone, since a stack starts with the message it was thrown with, see [What the `cause` carries](#what-the-cause-carries-and-what-it-does-not).

**What is deliberately not logged.** The mutation wrapper logs neither `variables` nor `context`. `context` holds the QueryClient, whose functions and circular references would fail the structured clone and lose the log silently. `variables` is the mutation payload, which for an Entry is the content the user wrote, and Core never writes that to a log file. A `CoreError`'s `cause` is left out for the same reason, see [What the `cause` carries](#what-the-cause-carries-and-what-it-does-not).

### Which build wrote a log file

A record's `resource` carries `service.name`, `os.type` and `host.arch`, plus `service.version`. This matters because a chunk name in a component stack is content hashed, so a frame is only resolvable against the exact build that emitted it, and a log file zipped and mailed to us carries no report body to say which that was.

Core stamps its own version on its own records and cannot read ours, so Core takes `log.hostVersion` at construction and writes it on the records we log. [`src/main/index.ts`](/src/main/index.ts) passes `app.getVersion()`, so **every** `desktop` record identifies its build, not just the ones we remember to stamp. Leave it out and those records go back to carrying no version at all.

The runtime underneath is the one thing that cannot ride on the Resource, and a rendering bug is often specific to one Chromium. `logIdentity` writes one `info` record per app start naming the Electron, Chromium and Node versions. They do not change while the app runs, so repeating them per record would be waste. A tail reaches back 24 hours, so a long-running app drops that record out of the window and loses the runtime detail. The version survives regardless.

### The two global renderer listeners

React's root callbacks only see errors thrown during render. A rejected floated promise (the app is full of `void window.ipc.core.*` calls) or a throw inside a plain event handler reaches none of them. Sentry's browser SDK used to install `onerror` and `onunhandledrejection` itself, so removing it left those with no sink at all, and they would have been missing from the log tail a bug report attaches. [`renderer/index.ts`](/src/renderer/index.ts) now installs both at module scope.

**The main process needs no equivalent.** Core's logger builds its winston transport with `handleExceptions: true` and `handleRejections: true`, so winston installs the matching `process.on` handlers and an uncaught throw there already lands in Core's log files. That was true before Sentry was removed too.

**Everything these handlers send over IPC is flattened to plain strings first.** A structured clone failure would lose the log silently, which is the one thing a last-resort sink must not do. Two values would cause one: React's `onCaughtError` also passes `errorBoundary`, the boundary's class instance (TanStack Router's `CatchBoundaryImpl` extends `React.Component`, so it carries `updater` and `_reactInternals`), and a thrown value is `unknown`, so it need not be cloneable at all. Both go through `parseIpcError` and only `componentStack` is forwarded. For the same reason each of these logs ends in `.catch(() => undefined)` rather than a bare `void`: a rejection raised from inside the rejection handler would come straight back to it.

### Why all three React root handlers are defined

[`app.tsx`](/src/renderer/app.tsx) defines `onUncaughtError`, `onCaughtError` and `onRecoverableError`, even where the body is thin. Defining one **replaces** React's own default, which writes the error to the renderer console. The E2E fixture asserts a console-clean run and this app logs over IPC to Core instead, so leaving a handler out would hand that surface back to React's `console.error` and break the assertion. See [testing.md](./testing.md).

### The main process cannot always use Core's logger

Two main-process paths log through `console.error` behind an `eslint-disable-next-line no-console`: the app initialization failure handler, and the custom file protocol's "Core is not initialized" guard. In both, Core may be what failed or not there yet. Every other main-process path uses `this.core.logger.error`.

The initialization failure handler, `onAppReadyFailed`, does more than that, because a packaged app has no console anyone sees. When Core got far enough to exist, it also writes the error to Core's logger and disposes Core, which flushes that record to the log file before the process exits. Then it shows the error in a native box, pointing to GitHub issues since the in-app report needs a running app, and exits.

### What one unexpected mutation failure produces

A single failed mutation that is not handled in place fans out on purpose:

1. A `toast.error` from the wrapper's `onError`.
2. A local Core logger error "Failed to run ... on ..." from the same `onError`, carrying which mutation failed and the error itself.
3. `throwOnError` re-throws into the root boundary, so `ErrorComponent` writes a second local Core logger error "Uncaught route error: ..." with the decoded message and stack.
4. React's `onCaughtError` writes a third, carrying the component stack.

The three local logs are not a bug. They carry different context, which mutation failed, the fatal route surface and the React component stack, and all three help when reading a session's logs.

A mutation using the in-place pattern drops steps 1 and 2 **for its handled `type`s**, which is the whole point of handling them in place. An unexpected `type` on the same mutation is not suppressed: it fans out exactly as above, boundary included. Suppressing per mutation instead of per type is the bug this shape avoids, since it silently costs an unexpected failure its `elek.method`/`elek.object.type` log.

## User-initiated reports

Because nothing is reported automatically, an error only reaches us if the user sends it. [`components/report-dialog.tsx`](/src/renderer/components/report-dialog.tsx) is the only thing in the app that sends anything to elek.io, and it only ever does so because the user typed it and pressed send.

It holds two independent forms behind one dialog. A bug report and a suggestion ask for genuinely different things, so a single schema covering both would validate neither properly. Each mode owns its own `useForm` and `AppForm` and is mounted with a `key`, so switching starts clean rather than carrying the other's state.

**Two entry points.**

- **The header.** Report an issue in the Help menu of [`app-header.tsx`](/src/renderer/components/app-header.tsx), which renders on every route, the error screen included. It sits outside anything that depends on a User: a broken first run is exactly the thing worth reporting, so reporting must not depend on having finished onboarding. It opens on the bug form with the log switch **off**.
- **The root error boundary.** `ErrorComponent` in [`__root.tsx`](/src/renderer/routes/__root.tsx) offers "Report this problem" as its primary action, opening the same dialog in bug mode with an empty message and the log switch **on**. A crash is the moment a report is worth most and the moment a user is least likely to go hunting for a header button. The error and its stack are already in the logs, since the screen writes them when it mounts, so the message is left for what only the user knows: what they did and when. Copying the error into the message would also send it with the logs switched off, which is not what the user chose. This screen replaces `RootComponent` outright, so it mounts its own `Toaster` (otherwise a sent report closes its dialog and leaves no evidence it worked, and the user sends it again) and writes its own log from an effect rather than the render body (otherwise opening and closing the dialog rewrites the same entry, inflating the very log tail the report attaches).

**The dialog must not depend on `UserProvider`.** The boundary renders outside it, so `useUser()` would throw there. The contact prefill reads the User from the query **cache** instead of fetching, which also avoids the worse failure: `useQueryNoError` carries `throwOnError: true`, so a fetch that failed while the boundary was already rendering an error would take the boundary down with it.

**What is sent.** Only what the user typed, plus a `desktop` block naming the app version and the Electron, Chromium and Node versions under it, which Core cannot know. Core fills in the two things it owns: its own version and the machine it runs on, and, when the switch is on, a tail of its own log files. Desktop never reads a log file, which keeps all file IO in Core.

**The contact is a whole User or nothing.** Core's `user` field takes a `User` or `null` and [reads neither for you](/node_modules/@elek-io/core/docs/reporting.md), so what the dialog holds is exactly what is sent. `reportContactSchema` prefills it from the cached User, leaves the name and email editable so somebody can be reached at an address their commits are not signed with, and folds an untouched block back to `null` on the way out. Half a contact is a validation error rather than a silent drop, because there is no shape between a whole User and nobody. `hasLogConsent` is consent, so Core answers it with what `logs` holds and never sends it on.

The log switch is the one field that sends data the user did not type, so its description says plainly what a tail holds: the ids of Projects, Collections and Entries, the files they live in and the actions taken, but never the content written or the names given. Keep that in step with [Core's own account of a tail](/node_modules/@elek-io/core/docs/reporting.md), since it is what the consent rests on.

**Failure handling, and the one exception to the rule above.** This mutation handles **every** `CoreError` type in place, through an exhaustive `Record<CoreErrorType, ...>` so a new type in Core is a compile error rather than a silent escalation. That is deliberate, and it is the only mutation in the app allowed to do it:

- The in-place surface is not built for one specific reason. It is a generic "could not send this report" alert driven by `describeCoreError`, which has copy for every type, so an unexpected type still reads sensibly. Showing an unexpected failure through a dialog meant for one reason is what the rule exists to prevent, and that does not apply here.
- **The boundary is not a valid destination for it.** One of the two mount points is inside the root error boundary's own fallback. React cannot catch an error thrown there with the same boundary, so it escapes to TanStack Router's global catch boundary, which replaces the crash screen with its bare fallback and takes the report the user just wrote with it. A mutation that can be mounted inside a boundary's fallback must not depend on that boundary.

Handling a type suppresses the wrapper's toast and log, and here that would mean no record at all, so `useSendReport` logs every failure explicitly, without what the user wrote. What is still not covered is an error carrying no type (a bug in our own IPC plumbing rather than a Core failure), which `useAppMutation` routes to the boundary by design.

**The failure to design around is `PreconditionFailed`**, which is what a send answers with while Cloud cannot be reached. Until the production Cloud is up, that is every send from a release build. Every other build sends to the dev API (see [build-and-packaging.md](./build-and-packaging.md#which-elekio-cloud-a-build-talks-to)). It keeps the dialog open with the text intact. `RateLimited` is its own type rather than a borrowed one, `BadRequest` covers a rejected body, and `Unauthorized` and `Internal` fall back to the same in-place alert. Core never retries, since a retry after a timeout can duplicate a report Cloud already accepted, so sending again is the user's decision.

**Only the X and Cancel close the dialog.** `Dialog`'s `disablePointerDismissal` turns away a press outside and a focus that leaves, and its `onOpenChange` cancels the change whose `reason` is `escape-key`, because either would throw away what the user wrote. `AlertDialog` was not used for this: it blocks outside clicks the same way, but it still closes on Escape, has no X, and announces itself as an alert rather than a form.

> [!NOTE]
> The E2E fixture points `ELEK_IO_CLOUD_URL` at a closed loopback port, so a spec can press Send and assert the `PreconditionFailed` path without a report ever leaving the machine. A spec that needs Cloud to answer, or to refuse, uses the local stub in `tests/fixtures/cloudStub.ts`. See [testing.md](./testing.md).

## Testing implications

The E2E fixture asserts zero console errors or warnings on a passing test (see [testing.md](./testing.md)). A UI driven negative path that hits a boundary may need the console escape hatch, though the boundaries themselves are console-clean in the packaged build, because all three React root handlers are defined and the app logs over IPC rather than to the renderer console. A flow handled in place never reaches the boundary at all, which is one reason the expected error pattern above is preferred for recoverable guards. Assert the reason specific copy you wrote, not Core's raw message.

## Quick reference

| Scenario                                  | UI surface                                    | Local log                                                             |
| ----------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| A read fails inside a pane                | One sentence and Try again, in the pane       | Pane error log plus the `onCaughtError` log                           |
| A read fails above every pane             | Root error boundary                           | Boundary error log plus the `onCaughtError` log                       |
| A Project card's check of the remote      | A state line in the card, Sync as the retry   | `Project card check error` log                                        |
| A Project card's read of the Releases     | A state line where the last Release stands    | `Project card Releases error` log                                     |
| Unexpected mutation error                 | Root error boundary                           | Wrapper error log, boundary error log, `onCaughtError` log, one toast |
| Handled `CoreError` `type` (in place)     | Dialog, field error or toast on the same page | None by default                                                       |
| Handled `type` whose cause names no field | Root error boundary                           | Boundary error log plus the `onCaughtError` log                       |
| Unhandled `type` on an in-place mutation  | Root error boundary                           | Wrapper error log, boundary error log, `onCaughtError` log, one toast |
| Report send fails (unreachable, rejected) | Alert inside the dialog                       | One error log from `useSendReport`, without what the user wrote       |
| Route not found                           | `NotFoundComponent`                           | None                                                                  |
| Main process security block               | Denied, no window                             | Core logger error                                                     |
| App init failure                          | Native error box, then the app exits          | console.error, plus a Core logger error when Core exists              |

# Loading and Updating Data

## Overview

elek.io Desktop uses [TanStack Query](https://tanstack.com/query/latest) (formerly React Query) for all data fetching and mutations. This provides a consistent, type-safe way to interact with the main process via IPC, with built-in caching, loading states, and error handling.

## Configuration

### Query Client Setup

The base configuration for all queries and mutations is in [`client.ts`](../../src/renderer/queries/client.ts):

**Key Settings:**

- `staleTime: Infinity` - Queries remain "fresh" indefinitely and won't automatically refetch. This is appropriate for local data that only changes through user actions.
- A `QueryCache` whose `onError` marks every read that failed, which is how a pane's error boundary tells a failed read from a failed write (see [A read that fails belongs to its pane](#a-read-that-fails-belongs-to-its-pane)).

### Query and Mutation Options

All `queryOptions` and `mutationOptions` are centrally defined in the [`options/`](../../src/renderer/queries/options/) directory with separate files for each domain (`projectOptions.ts`, `releaseOptions.ts`, `collectionOptions.ts`, `componentOptions.ts`, `entryOptions.ts`, `assetOptions.ts`, `userOptions.ts`, `cloudOptions.ts`, `apiOptions.ts`) and re-exported through [`queries/index.ts`](../../src/renderer/queries/index.ts). These files contain:

- Typed wrappers around IPC calls
- Query keys for cache management
- Automatic cache updates on mutations - Mutations automatically update related queries' cache data. For example, when you create a Project, both the individual Project cache AND the Projects list cache are updated without requiring a refetch.
- Metadata for the log records (method and objectType), and the sentence each of a mutation's two toasts says

### Query Key Structure

Query keys follow a consistent hierarchy so individual items, lists and historical states can be cached and invalidated independently. Each level is followed by a state marker (`'current'` for HEAD or a commit hash for a historical state), list queries end in `'list'` and a count of what a level holds ends in `'count'`:

```typescript
// all projects
['projects', 'list'];

// a project at HEAD / at a specific commit
['projects', projectId, 'current'];
['projects', projectId, commitHash];

// uncommitted git changes of a project
['projects', projectId, 'current', 'changes'];

// commit history of a project
['projects', projectId, 'history'];

// the Releases of a project, and what a Release would publish right now
['projects', projectId, 'current', 'releases', 'list'];
['projects', projectId, 'current', 'releases', 'pending'];

// the Assets of a project, and how many there are
['projects', projectId, 'current', 'assets', 'list'];
['projects', projectId, 'current', 'assets', 'count'];

// components in a project, how many there are, and one Component at HEAD
['projects', projectId, 'current', 'components', 'list'];
['projects', projectId, 'current', 'components', 'count'];
['projects', projectId, 'current', 'components', componentId, 'current'];

// collections in a project
['projects', projectId, 'current', 'collections', 'list'];

// a collection at HEAD
['projects', projectId, 'current', 'collections', collectionId, 'current'];

// entries in a collection
[
  'projects',
  projectId,
  'current',
  'collections',
  collectionId,
  'current',
  'entries',
  'list',
];

// how many Entries a collection holds
[
  'projects',
  projectId,
  'current',
  'collections',
  collectionId,
  'current',
  'entries',
  'count',
];

// an entry at HEAD
[
  'projects',
  projectId,
  'current',
  'collections',
  collectionId,
  'current',
  'entries',
  entryId,
  'current',
];
```

### The counts beside the sidebar's rows

The Project's sidebar says how many things each of its rows leads to, and each
number is Core's rather than the length of a list the renderer happens to hold:

| Row              | Where its number comes from                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Assets           | `assets.count`, one directory read of the sidecars                                                                                 |
| Components       | `components.count`                                                                                                                 |
| Every Collection | `entries.count` of that Collection, one query per row through [`useQueriesNoError`](../../src/renderer/hooks/useQueriesNoError.ts) |
| Releases         | `releases.list`, because Core counts no Releases. It is the query the Releases screen reads, so both show the same number          |

**A count is invalidated, not incremented.** Every mutation that adds or removes
one of the counted things invalidates that count's key from its `onSuccess`,
beside the direct cache update it does for the list, so the number comes back
from Core instead of being guessed from what the renderer knows. That is what
makes a count follow a create and a delete without the Project being opened
again. `tests/specs/navigation.spec.ts` drives it through an Entry create and an
Asset delete, `tests/specs/components.spec.ts` through a Component create and a
Component delete, and `tests/specs/releases.spec.ts` through a Release.

A synchronize and a Release invalidate everything under the Project, so both
carry the counts with them without naming them.

## Querying Data

### Using Context Providers for User and Project Data

For accessing the current user and project data, prefer using the `useUser()` and `useProject()` hooks instead of directly calling `useQuery()` with `queryOptions.user.get()` or `queryOptions.projects.read()`.

**Benefits:**

- Reduces the number of active query observers - the providers create a single query that's shared across all components
- Provides convenient utility methods (`formatDatetime`, `translateContent`) that automatically use the current user/project context
- Ensures consistent data access patterns throughout the application
- Better performance with fewer unnecessary query subscriptions

#### UserProvider and useUser Hook

The [`UserProvider`](../../src/renderer/providers/UserProvider.tsx) wraps the entire application at the root level, in `RootComponent` (see [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx)). It provides:

- `userQuery: UseQueryResultNoError<User | null>` - The current user query result
- `formatDatetime: (props: FormatDatetimeProps) => { relative: string; absolute: string }` - Formats datetime strings according to the user's locale

**Example:** See `HeaderUser` in [`components/app-header.tsx`](../../src/renderer/components/app-header.tsx)

```typescript
import { useUser } from '@renderer/hooks/useUser';

function HeaderUser() {
  const { userQuery, formatDatetime } = useUser();

  // Access user data
  const user = userQuery.data;

  // Format a datetime
  const formattedDate = formatDatetime({ datetime: user?.createdAt });

  return (
    <div>
      <p>{user?.name}</p>
      <p>Joined {formattedDate.relative}</p>
    </div>
  );
}
```

#### ProjectProvider and useProject Hook

The [`ProjectProvider`](../../src/renderer/providers/ProjectProvider.tsx) wraps all project-specific routes, in `ProjectLayout` (see [`routes/projects/$projectId.tsx`](../../src/renderer/routes/projects/$projectId.tsx)). It provides:

- `projectId: string` - The current project ID from the route
- `projectQuery: UseQueryResultNoError<Project>` - The current project query result
- `userQuery: UseQueryResultNoError<User | null>` - The current user query result (inherited from UserProvider)
- `formatDatetime: (props: FormatDatetimeProps) => { relative: string; absolute: string }` - Datetime formatter (inherited from UserProvider)
- `translateContent: (props: TranslateContentProps) => string` - Translates user-defined content to the current user's language, falling back to the project's default language, then English

**Example:** See [`components/project-sidebar.tsx`](../../src/renderer/components/project-sidebar.tsx)

```typescript
import { useProject } from '@renderer/hooks/useProject';

function ProjectSettings() {
  const { projectQuery, translateContent } = useProject();
  const { data: project, isPending: isReadingProject } = projectQuery;

  if (isReadingProject) return <LoadingSkeleton />;

  // project (and its name) is now defined
  const title = translateContent({
    key: 'project.title',
    record: project.name, // TranslatableString object
  });

  return <h1>{title}</h1>;
}
```

#### Reading a Project's history

A Project's commit history is not part of the Project read result. Fetch it with `queryOptions.projects.history({ id })`, which calls `core.projects.history()` through the `core:projects:history` IPC channel (exposed in [`preload/index.ts`](../../src/preload/index.ts), handled in [`main/index.ts`](../../src/main/index.ts), and typed in [`index.d.ts`](../../src/index.d.ts)). It returns a `ProjectHistoryResult` with a `history` array (changes to the Project itself, e.g. its settings) and a `fullHistory` array (every commit in the Project). The commit-detail and diff views, the history sidebar, and the dashboard's latest-changes widget all read `fullHistory` from this query.

```typescript
const { data: history } = useQueryNoError(
  queryOptions.projects.history({ id: projectId })
);
// history?.fullHistory is the full git log, history?.history is Project-only changes
```

### Non-Blocking Page Loads

We prioritize fast, responsive UI by rendering pages immediately without waiting for data to load. Navigation between pages should feel instantaneous.

**Pattern:** Show Skeleton components while data loads, then replace them with actual content when ready.

**Nothing moves while a pane loads.** [`Skeleton`](../../src/renderer/components/ui/skeleton.tsx) is a still placeholder in the muted surface, not a pulse, because the design rules out motion while a page loads. It is the one skeleton: a screen does not write its own `bg-muted` placeholder, and a list uses `SkeletonRows` from the same file, which draws the rows of a list in the geometry of a real row and carries the `aria-busy` label that says what is being read. `tests/specs/panes.spec.ts` drives one loading pane, the History's list of changes, and reads both the computed animation of every skeleton on that screen and whether the document runs any animation at all, so a pulse put back on that screen fails a test. A pulse somewhere no spec drives does not.

**Example:** See [`routes/projects/index.tsx`](../../src/renderer/routes/projects/index.tsx)

```typescript
const { data: projects, isPending: isListingProjects } = useQueryNoError(
  queryOptions.projects.list({ limit: 0 })
);

return (
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {isListingProjects
      ? [1, 2, 3, 4, 5].map((i) => <ProjectCardSkeleton key={i} />)
      : projects.list.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
  </div>
);
```

This ensures the page structure renders immediately, with placeholders that are replaced by real data as it loads.

**Lists load fully and paginate client side.** List queries pass `limit: 0`, so Core returns the whole list into a single cached `'list'` query (kept fresh by `staleTime: Infinity` and updated in place by `mergeListWithObject`, not refetched). Any pagination or filtering a list view offers is therefore applied client side over that already-loaded list, not by refetching a page from Core. The Entry table is the current example: it feeds the full list to TanStack Table with `getPaginationRowModel()` (a fixed page size) and `getFilteredRowModel()` (the filter input drives `state.globalFilter`), resets the page index when the filter changes, and sets `autoResetPageIndex: false` because it rebuilds its `data` array each render (the default auto-reset would read that as a data change and snap the page back to the first one).

### A read that fails belongs to its pane

A query failure is not fatal to the view. The pane that read it keeps its place in the window and says in one sentence that it cannot be read, with Try again, while the header, the sidebar and every other pane carry on. That comes from [`Pane`](../../src/renderer/components/pane.tsx), which puts a `CatchBoundary` inside a `QueryErrorResetBoundary` around whatever it holds, and it is why no screen writes an `isError` branch of its own.

Two rules follow for a screen:

- **Do not catch a failed read.** No `isError` branch and no `throwOnError: false`. Both would show the same sentence and write nothing to the log, while the pane's boundary logs what it caught exactly as the root boundary does.
- **Read inside the pane that shows the data.** A boundary catches only what is thrown below it, so a read in a layout above two panes takes both of them. That is right when both depend on it, and wrong when one does.

A failed write and a component that throws are not a read: they still replace the whole view with the root error screen, which offers Report an issue. How the two are told apart, and what a pane's name in the sentence comes from, is in [Error Handling](../error-handling.md#a-read-that-failed-the-pane-says-so).

### Error Handling - Prefer useQueryNoError

**Always use [`useQueryNoError`](../../src/renderer/hooks/useQueryNoError.ts) instead of `useQuery` for data fetching.**

This hook solves a TypeScript limitation where `data` is typed as `T | undefined` even with `throwOnError: true`. It manually throws errors to the error boundary and returns a narrowed type without error states.

**Example:** See [`routes/projects/$projectId/collections/$collectionId/index.tsx`](../../src/renderer/routes/projects/$projectId/collections/$collectionId/index.tsx)

```typescript
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';

const { data: collection, isPending } = useQueryNoError(
  queryOptions.collections.read({ projectId, id: collectionId })
);

if (isPending) return <LoadingSkeleton />;

// data is now safely typed as defined (no error or loading states)
return <div>{collection.name}</div>;
```

See the hook's JSDoc for implementation details. A failed read is caught by the boundary of the pane it was read in, and by the root `ErrorComponent` in [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx) where it was read above every pane.

For fetching a variable-length list of same-typed queries (for example one `entries.list` per Collection), use the sibling [`useQueriesNoError`](../../src/renderer/hooks/useQueriesNoError.ts) hook, which applies the same error narrowing to an array of query options.

**Naming Conventions:**

When destructuring `useQueryNoError`, follow these patterns based on the query operation:

- `data` → Name it as the resulting object (e.g., `project`, `collection`, `entries`)
- `isPending` → Prefix with the query operation (e.g., `isReadingProject`, `isListingProjects`, `isReadingCollection`)

Always look at the `queryOptions` method used to determine the correct names:

```typescript
// queryOptions.projects.read() → reading a single project
const { data: project, isPending: isReadingProject } = useQueryNoError(
  queryOptions.projects.read({ id: projectId })
);

// queryOptions.projects.list() → listing multiple projects
const { data: projects, isPending: isListingProjects } = useQueryNoError(
  queryOptions.projects.list({ limit: 0 })
);

// queryOptions.collections.read() → reading a single collection
const { data: collection, isPending: isReadingCollection } = useQueryNoError(
  queryOptions.collections.read({ projectId, id: collectionId })
);
```

**Component props vs query state:**

Query state uses `isPending` (TanStack Query's term). The `Button` component, however, accepts an `isLoading` prop for component API consistency. Both are intentional - pass the query's pending state into the button's `isLoading` prop:

```typescript
const { mutateAsync: createProject, isPending: isCreatingProject } = useMutation(
  queryOptions.projects.create
);

<Button isLoading={isCreatingProject}>Create</Button>;
```

## Mutating Data

### Filling a form from its query

A form that edits something that was stored has to show what is stored, and that
comes from a query which may not have answered yet. Every form does it the same
way, through [`useAppForm`](../../src/renderer/hooks/useAppForm.ts):

- **`values`** holds the loaded object. react-hook-form fills the form from it
  whenever it changes, deep-compared, so an answer equal to what the form
  already holds does nothing at all.
- **`resetOptions: { keepDirtyValues: true }`** is pinned by the hook. A field
  somebody has touched keeps what they typed, and every field they have not
  takes the new state, so a read that arrives beside an editor does not replace
  what is being written: a synchronize reads every query of a Project again, and
  before this the open form took the new state without a word. What it keeps is
  the value and not the dirtiness, see
  [Gating Save](#gating-save).
- **`disabled`** holds the query's pending state. The form shows at once with
  its fields disabled, rather than appearing empty and filling in a moment
  later, and `SubmitButton` disables with it, so a form cannot be saved before
  it knows what it holds.

**Example:** see
[`routes/user/profile.tsx`](../../src/renderer/routes/user/profile.tsx)

```typescript
// Source the user from the useUser() hook (see "Using Context Providers" above)
const {
  userQuery: { data: user, isPending: isGettingUser },
} = useUser();

const setUserForm = useAppForm<SetUserProps>({
  resolver: zodResolver(setUserSchema),
  defaultValues: {
    /* every bound key, so each control is controlled from the first render */
  },
  // exactOptionalPropertyTypes forbids passing `values: undefined`, so the key
  // is left off entirely while the query is pending.
  ...(user === null || user === undefined ? {} : { values: user }),
  disabled: isGettingUser,
});
```

Two rules follow:

- **Never call `reset()` in an effect**, which is a lint error. It is what
  overwrote a Value somebody was writing: the effect re-ran on every answer,
  equal or not, and replaced the whole form.
- **Fill exactly the keys the form holds.** react-hook-form infers the form's
  value type from its resolver, and a `values` carrying keys the schema does not
  have takes part in that inference and makes the resolver unassignable. The
  diff views are the case: they pass the handful of keys their form edits rather
  than the whole stored object.

`mode="view"` is a different thing and stays for the read-only diffs: it renders
a form read-only through a disabled `<fieldset>` and makes submit a no-op, see
[forms.md](./forms.md#view-only-forms-and-diffs). A form that is only still
loading is not view-only, it is disabled.

A form that is not filled from a query at all, a create form, needs neither
`values` nor `disabled`, unless its defaults depend on something loaded. The
Collection, Component and Entry create forms do: a translatable key per Project
language, and a default Value per field definition, both of which the Project and
the Collection answer.

[`tests/specs/forms.spec.ts`](../../tests/specs/forms.spec.ts) drives it: an
Entry is changed behind an open form, a synchronize reads it again, and the field
being written keeps what was typed while the field nobody touched takes the new
state.

### Gating Save

Every mutation Save/Update button is a `SubmitButton` inside a `FormActions`,
which blocks it while the form is submitting and while the form is still filling
from its query. `requireDirty` adds the third gate per form: an update form uses
it, so Save stays blocked until something changes, because an unchanged form has
nothing to commit and Core would reject an empty change. Create forms do not, so
the button is available immediately and validation happens on click.

Blocked means `aria-disabled` rather than `disabled`, so Save keeps its place in
the tab order. The fourth gate is a reason the page gives the form, which is the
only one with words on screen, see
[forms.md](./forms.md#saves-block).

This is distinct from validation. Validation is surfaced on click through the
field's own error, not by keeping the button blocked, so an invalid but changed
form still shows its Save button available and reports the errors when submitted.

**A form that stays open after it saved is pristine again.** `isDirty` is what
both `requireDirty` and the guard that asks before unsaved changes are lost
read, so a form that kept it set after a save would offer Save with nothing left
to save and ask about changes that are already stored. Two things clear it: the
state the save brings back, which fills the form through `values`, and the
`form.reset(values)` a submit handler calls after the mutation resolved. The
Project's general settings and its version control settings do the second as
well, so the form is pristine the moment the save is through rather than when
its data comes back.

**`keepDirtyValues` keeps a dirty field's value, not its dirtiness.** Every reset
goes through it, the `reset()` above as much as the one `values` runs, because
react-hook-form merges `useForm`'s own `resetOptions` into both. A refetch
therefore never overwrites what somebody is typing, which is what the option is
pinned for, while `isDirty` comes back as `false` either way unless `keepDirty`
is passed as well. That is why a form takes no edit while its own save runs: one
typed in between would stay on screen while the form counted as clean, so Save
would be unavailable and leaving would ask nothing, see
[forms.md](./forms.md#a-form-is-read-only-while-it-saves).

### Mutation Metadata

Every mutation carries both `meta` and `toasts`, and `customMutationOptions` from [`util.ts`](../../src/renderer/queries/util.ts) is what requires them. It also adds `throwOnError: true`, so a failure propagates to the nearest error boundary, and logs every mutation with Core:

```typescript
customMutationOptions({
  mutationFn: async () => {
    /* ... */
  },
  meta: {
    method: 'create',
    objectType: 'project',
  },
  toasts: {
    success: (createdProject) => {
      const { name } = createdProject;
      return t`Project ${name} created`;
    },
    error: () => t`Could not create the Project`,
  },
  // ...
});
```

`meta` is what the log records carry: `method` and `objectType` go into the record under the names Core uses for them, so one query finds a mutation across both sources.

`toasts` is what the two notifications say. Each sentence is written for the person in front of the app and read from the message catalog when the toast shows, never built from `meta`, so no toast can read as a method and an object. Both are functions, so a mutation with nothing to name takes no argument and still reads the catalog at the moment the toast shows. `success` is handed the answer, the variables and the mutation's `context`, which is how a name stored per language is read in the language the screen reads it in, see [internationalization.md](./internationalization.md#translating-content-translatecontent) and [error-handling.md](../error-handling.md#handling-expected-errors-in-place).

The wrapper awaits the `onSuccess` it is given, so a mutation resolves only once its own cache updates are done. A caller that awaits `mutateAsync` and then closes a dialog or navigates can rely on what it reads next, and a rejection inside `onSuccess` reaches the mutation rather than becoming an unhandled rejection.

## Cache Management

### Automatic Cache Updates

All mutations in the [`options/`](../../src/renderer/queries/options/) directory include `onSuccess` handlers that automatically update the cache. This ensures the UI reflects changes immediately without requiring refetches.

A query that fetches something another query owns writes its answer there too. `releases.prepare` has to fetch `origin` before it diffs, which `prepare()` itself never does, so it calls `fetchProjectChanges` from [`projectOptions.ts`](../../src/renderer/queries/options/projectOptions.ts) and puts the result into the `['projects', projectId, 'current', 'changes']` cache from its `queryFn`'s `client`. That is the count behind the sidebar's Synchronize, which otherwise refreshes only every three minutes and would stay disabled right after the dialog told the editor to synchronize. It is written only when the call succeeded, and the fetch itself stays outside the shared query. A failure belongs to the dialog, which answers it in place, while running the fetch as the shared query retries it three times first and leaves the dialog on its skeleton for the whole schedule.

### The `mergeListWithObject` Helper

Located in [`util.ts`](../../src/renderer/queries/util.ts), this helper function merges individual objects into paginated list caches:

```typescript
function mergeListWithObject<T extends BaseFile>(
  oldList: PaginatedList<T> | undefined,
  object: T,
  method?: 'update' | 'delete'
): PaginatedList<T>;
```

**Behavior:**

- **No list exists:** Creates new list with the object
- **Object doesn't exist in list:** Adds it to the end
- **Object exists + method='update':** Replaces the object
- **Object exists + method='delete':** Removes the object

**Usage in Mutations:**

```typescript
// Create mutation - add to list
onSuccess: (createdProject, _variables, _result, context) => {
  context.client.setQueryData(
    ['projects', createdProject.id, 'current'],
    createdProject
  );
  context.client.setQueryData<PaginatedList<Project>>(
    ['projects', 'list'],
    (oldList) => mergeListWithObject(oldList, createdProject) // Adds to list
  );
};

// Update mutation - update in list
onSuccess: (updatedProject, _variables, _result, context) => {
  context.client.setQueryData(
    ['projects', updatedProject.id, 'current'],
    updatedProject
  );
  context.client.setQueryData<PaginatedList<Project>>(
    ['projects', 'list'],
    (oldList) => mergeListWithObject(oldList, updatedProject, 'update') // Updates in list
  );
};

// Delete mutation - remove from list
onSuccess: (_deletedProject, variables, _result, context) => {
  context.client.setQueryData(['projects', variables.id, 'current'], undefined);
  context.client.setQueryData<PaginatedList<Project>>(
    ['projects', 'list'],
    (oldList) =>
      mergeListWithObject(oldList, { id: variables.id } as Project, 'delete') // Removes from list
  );
};
```

### Individual Cache Population from Lists

List queries automatically populate individual item caches to avoid redundant fetches:

**Example from project options (see [`options/projectOptions.ts`](../../src/renderer/queries/options/projectOptions.ts)):**

```typescript
list: (props?: ListProjectsProps) =>
  queryOptions({
    queryKey: ['projects', 'list'],
    queryFn: async () => {
      const projects = await window.ipc.core.projects.list(props);

      // Cache each project individually too
      // so we can access them directly without refetching later
      projects.list.forEach((project) => {
        queryClient.setQueryData(['projects', project.id, 'current'], project);
      });

      return projects;
    },
    throwOnError: true,
  });
```

**Benefit:** When navigating to a project detail page after viewing the list, the data is already cached - no loading spinner needed.

### Cache Invalidation Strategies

**Two approaches for cache updates:**

#### 1. Direct Cache Updates (Preferred for CRUD)

Use `setQueryData` with `mergeListWithObject` for operations where you know exactly what changed:

```typescript
onSuccess: (updatedItem, variables, _result, context) => {
  // Update both individual and list caches
  context.client.setQueryData(['items', updatedItem.id], updatedItem);
  context.client.setQueryData(['items', 'list'], (oldList) =>
    mergeListWithObject(oldList, updatedItem, 'update')
  );
};
```

**Pros:** Instant UI updates, no network/IPC calls

**Use for:** create, update, delete, user settings, API start/stop

A Component update is the one mutation that also invalidates. Core cascades a field definition change into every Entry holding the Component, in the same commit, and which Entries those are is Core's to know rather than ours, so `componentOptions.update` drops the whole `['projects', projectId, 'current', 'collections']` subtree and lets it be read again. An Entry's query key sits under its Collection's, which is why it invalidates from `collections` down.

#### 2. Query Invalidation (For Unknown Scope)

Use `invalidateQueries` for operations that may affect multiple caches:

```typescript
onSuccess: async (_data, variables, _result, context) => {
  await context.client.invalidateQueries({
    queryKey: ['projects', variables.id],
    refetchType: 'all', // Refetch all matching queries
  });
};
```

**Pros:** Safe when scope is unknown, handles cascading updates

**Cons:** Triggers refetches (slower), may refetch unnecessary data

**Use for:** synchronize (git pull), setRemoteOriginUrl

### Anti-Patterns to Avoid

**Do not use `router.invalidate()` after mutations:**

```typescript
// Invalidates all queries for the route
const onSave = async (data) => {
  await saveMutation(data);
  await router.invalidate(); // Too broad, redundant
};
```

**Let mutations handle their own cache updates:**

Mutations already have `onSuccess` handlers that update the necessary caches. Using `router.invalidate()` is redundant and invalidates unrelated queries.

## Error Handling

Data loading and mutations lean on the app's error handling defaults:

- `throwOnError: true` is set by default, via `useQueryNoError` for queries and `customMutationOptions` for mutations, so a failure bubbles to the nearest error boundary. For a read that is the pane it was read in, and for everything else the root `ErrorComponent` in [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx). A mutation failure also shows a toast through the global handler.
- All mutations and navigations, and any error that reaches the boundary, are logged through the Core logger via `window.ipc.core.logger`. That is the only sink, and nothing it writes leaves the machine.
- An expected, recoverable Core guard (a `409`/`412` from a normal user action) should not take over the whole view. Such a mutation is built with [`useAppMutation`](../../src/renderer/hooks/useAppMutation.ts) and a `handled` map from `CoreError` type to an in-place handler, never a blanket `throwOnError: false`. The force-delete and sync-conflict modals do this today.
- One query does the same in its own layer. `releases.prepare` catches the `CoreError` types the Release dialog can explain inside its `queryFn` and returns them as a `refused` outcome, re-throwing everything else so its `throwOnError: true` still reaches the boundary. The caught set is the same map the dialog's copy comes from, so the two cannot drift apart.

The full picture, including how `CoreError.type` survives IPC, the step-by-step guide to handling an expected error in place with those worked examples, and exactly where and when things are logged, lives in the dedicated [Error Handling](../error-handling.md) doc.

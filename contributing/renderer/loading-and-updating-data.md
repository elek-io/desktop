# Loading and Updating Data

## Overview

elek.io Desktop uses [TanStack Query](https://tanstack.com/query/latest) (formerly React Query) for all data fetching and mutations. This provides a consistent, type-safe way to interact with the main process via IPC, with built-in caching, loading states, and error handling.

## Configuration

### Query Client Setup

The base configuration for all queries and mutations is in [`client.ts`](../../src/renderer/queries/client.ts):

**Key Settings:**

- `staleTime: Infinity` (line 9) - Queries remain "fresh" indefinitely and won't automatically refetch. This is appropriate for local data that only changes through user actions.

### Query and Mutation Options

All `queryOptions` and `mutationOptions` are centrally defined in the [`options/`](../../src/renderer/queries/options/) directory with separate files for each domain (`projectOptions.ts`, `collectionOptions.ts`, `entryOptions.ts`, `assetOptions.ts`, `userOptions.ts`, `apiOptions.ts`) and re-exported through [`queries/index.ts`](../../src/renderer/queries/index.ts). These files contain:

- Typed wrappers around IPC calls
- Query keys for cache management
- Automatic cache updates on mutations - Mutations automatically update related queries' cache data. For example, when you create a Project, both the individual Project cache AND the Projects list cache are updated without requiring a refetch.
- Metadata for toast notifications (method and objectType)

### Query Key Structure

Query keys follow a consistent hierarchy so individual items, lists and historical states can be cached and invalidated independently. Each level is followed by a state marker (`'current'` for HEAD or a commit hash for a historical state), and list queries end in `'list'`:

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

## Querying Data

### Using Context Providers for User and Project Data

For accessing the current user and project data, prefer using the `useUser()` and `useProject()` hooks instead of directly calling `useQuery()` with `queryOptions.user.get()` or `queryOptions.projects.read()`.

**Benefits:**

- Reduces the number of active query observers - the providers create a single query that's shared across all components
- Provides convenient utility methods (`formatDatetime`, `translateContent`) that automatically use the current user/project context
- Ensures consistent data access patterns throughout the application
- Better performance with fewer unnecessary query subscriptions

#### UserProvider and useUser Hook

The [`UserProvider`](../../src/renderer/providers/UserProvider.tsx) wraps the entire application at the root level (see [`routes/__root.tsx:131`](../../src/renderer/routes/__root.tsx)). It provides:

- `userQuery: UseQueryResultNoError<User | null>` - The current user query result
- `formatDatetime: (props: FormatDatetimeProps) => { relative: string; absolute: string }` - Formats datetime strings according to the user's locale

**Example:** See [`components/user-header.tsx`](../../src/renderer/components/user-header.tsx)

```typescript
import { useUser } from '@renderer/hooks/useUser';

function UserHeader() {
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

The [`ProjectProvider`](../../src/renderer/providers/ProjectProvider.tsx) wraps all project-specific routes (see [`routes/projects/$projectId.tsx:32`](../../src/renderer/routes/projects/$projectId.tsx)). It provides:

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

See the hook's JSDoc for implementation details. Errors are caught by the root `ErrorComponent` in [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx).

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

### Form Mutations with Existing Data

When building forms to update existing data, we need to handle the loading state gracefully. Forms need to be populated with current values, but those values come from a query that may not be resolved yet.

**Pattern:** Use `<fieldset disabled={isPending}>` to disable the entire form while data loads, instead of showing loading spinners or skeleton forms.

**Example:** See [`routes/user/profile.tsx`](../../src/renderer/routes/user/profile.tsx)

```typescript
// Source the user from the useUser() hook (see "Using Context Providers" above)
const {
  userQuery: { data: user, isPending: isGettingUser },
} = useUser();

const setUserForm = useForm<SetUserProps>({
  defaultValues: { /* ... */ }
});

// Reset the form with user data once it loads
useEffect(() => {
  if (user) {
    setUserForm.reset(user);
  }
}, [user, setUserForm]);

return (
  <Form {...setUserForm}>
    <form>
      <fieldset disabled={isGettingUser}>
        {/* Form fields here - automatically disabled while loading */}
        <FormField name="name" /* ... */ />
        <FormField name="email" /* ... */ />
      </fieldset>
    </form>
  </Form>
);
```

**Benefits:**

- No need for skeleton components in forms
- Form structure renders immediately
- Native browser styling for disabled state
- Prevents user interaction during loading
- Cleaner code with less conditional rendering

### Gating Save on `formState.isDirty`

Every mutation Save/Update button is disabled until the form is dirty, with `disabled={<form>.formState.isDirty === false}`. An unchanged form has nothing to commit, so submitting it would make Core reject an empty change. The gate is app-wide and consistent across the project, collection, entry, user and version-control update forms, so a form that reset from loaded data starts with Save disabled and enables it the moment the user edits a field.

This is distinct from validation. Validation is surfaced on click through `FormMessage`, not by keeping the button disabled, so an invalid but changed form still shows its Save button enabled and reports the errors when submitted. Only the "nothing changed yet" state disables Save.

### Mutation Metadata

All mutations should include metadata for proper toast notifications and logging. Use the `customMutationOptions` wrapper from [`util.ts`](../../src/renderer/queries/util.ts) to not only make sure the metadata is included, but also to automatically add `throwOnError: true` to propagate errors to the nearest error boundary and log all mutations with Core:

```typescript
customMutationOptions({
  mutationFn: async () => {
    /* ... */
  },
  meta: {
    method: 'create',
    objectType: 'project',
  },
  // ...
});
```

This metadata is used by the query client to automatically display success/error toasts and log all mutations for debugging.

## Cache Management

### Automatic Cache Updates

All mutations in the [`options/`](../../src/renderer/queries/options/) directory include `onSuccess` handlers that automatically update the cache. This ensures the UI reflects changes immediately without requiring refetches.

### The `mergeListWithObject` Helper

Located at [`util.ts:144-195`](../../src/renderer/queries/util.ts), this helper function merges individual objects into paginated list caches:

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

- `throwOnError: true` is set by default, via `useQueryNoError` for queries and `customMutationOptions` for mutations, so a failure bubbles to the root `ErrorComponent` in [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx). A mutation failure also shows a toast through the global handler.
- All mutations and navigations, and any error that reaches the boundary, are logged through the Core logger via `window.ipc.core.logger`. That is the only sink, and nothing it writes leaves the machine.
- An expected, recoverable Core guard (a `409`/`412` from a normal user action) should not take over the whole view. Such a mutation is built with [`useAppMutation`](../../src/renderer/hooks/useAppMutation.ts) and a `handled` map from `CoreError` type to an in-place handler, never a blanket `throwOnError: false`. The force-delete and sync-conflict modals do this today.

The full picture, including how `CoreError.type` survives IPC, the step-by-step guide to handling an expected error in place with those worked examples, and exactly where and when things are logged, lives in the dedicated [Error Handling](../error-handling.md) doc.

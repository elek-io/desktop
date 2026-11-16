# Breadcrumb Navigation

## Overview

The breadcrumb system provides automatic breadcrumb navigation based on TanStack Router's route hierarchy. It displays the navigation path in the application header, allowing users to understand their current location and navigate back through the hierarchy.

**Key Features:**

- **Route-based:** Automatically tracks route matches from TanStack Router
- **Dynamic labels:** Supports both static strings and dynamic content (e.g., project names, entry titles)

## Architecture

The breadcrumb system consists of three main parts:

### BreadcrumbProvider (`src/renderer/providers/BreadcrumbProvider.tsx`)

The provider manages breadcrumb state using a Map and TanStack Router's `useMatches()` hook.
Its `setBreadcrumb()` method adds a new breadcrumb to the map, using path as the key.

When computing the current breadcrumbs, it iterates over the active route matches provided by `useMatches()`. Each match contains (along with other properties) the `routeId` and `pathname`.
E.g. if you are currently at `/projects/32ba1a3c-c775-4ff0-b5cd-08c71edfe18b/dashboard`, the matches would be:

```typescript
[
  { routeId: '__root__', pathname: '/' },
  { routeId: '/projects', pathname: '/projects' },
  {
    routeId: '/projects/$projectId',
    pathname: '/projects/32ba1a3c-c775-4ff0-b5cd-08c71edfe18b',
  },
  {
    routeId: '/projects/$projectId/dashboard',
    pathname: '/projects/32ba1a3c-c775-4ff0-b5cd-08c71edfe18b/dashboard',
  },
];
```

For each match, it looks up the corresponding breadcrumb in its internal map by `pathname` to build the breadcrumb trail, returning an ordered array of breadcrumbs.

**Provider Location:** Rendered inside `RootComponent` in `src/renderer/routes/__root.tsx`, nested within `UserProvider`:

```tsx
<UserProvider>
  <BreadcrumbProvider>
    {/* AppHeader, UserHeader, Outlet, ... */}
  </BreadcrumbProvider>
</UserProvider>
```

### useBreadcrumb Hook (`src/renderer/hooks/useBreadcrumb.ts`)

A hook that registers breadcrumbs for specific routes.

```typescript
export interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumb: (path: string, label: string) => void;
  clearBreadcrumb: (path: string) => void;
}

function useBreadcrumb(
  route?: AnyRoute,
  label?: string | undefined
): BreadcrumbContextValue;
```

The hook takes an optional `route` (the value returned by `createFileRoute()`) and `label`. When both are provided, it finds the active route match whose `routeId` equals `route.id`, then registers that match's resolved `pathname` with the given `label` via the provider's `setBreadcrumb()` method. It does not read `route.pathname` directly, because a parameterized route (for example `$projectId`) has no resolved path on the route object itself. A label of `undefined` or `''` skips registration (useful while data loads), and the breadcrumb is removed again when the route unmounts.

## Usage Patterns

### Static Breadcrumb Label

For routes with fixed labels (e.g., "Settings", "Dashboard"):

```tsx
// src/renderer/routes/projects/$projectId/settings.tsx
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export const Route = createFileRoute('/projects/$projectId/settings')({
  component: ProjectSettingsLayout,
});

function ProjectSettingsLayout(): ReactElement {
  useBreadcrumb(Route, 'Settings');

  return <Outlet />;
}
```

**Result:** Displays "Settings" in the breadcrumb trail

### Dynamic Breadcrumb Label

For routes with data-dependent labels (e.g., project name, entry title):

```tsx
// src/renderer/routes/projects/$projectId.tsx
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';

function ProjectLayoutContent(): React.JSX.Element {
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();

  // Pass undefined while loading
  useBreadcrumb(Route, isReadingProject === false ? project.name : undefined);

  return <Outlet />;
}
```

**Result:** Displays the project name in the breadcrumb trail

### Accessing Breadcrumb Context

To access current breadcrumbs without registering a new one:

```tsx
// src/renderer/components/app-header.tsx
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';

export function HeaderTrail(): ReactElement {
  const { breadcrumbs } = useBreadcrumb();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index, array) => {
          const isPage = array.length === index + 1;

          return (
            <Fragment key={crumb.path}>
              <BreadcrumbItem className={isPage ? 'shrink' : undefined}>
                {isPage ? (
                  <PageCrumb label={crumb.label} />
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.path} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isPage ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

## What the trail holds, and what gives way

The trail names only what opens: Projects, the Project, a page or a Collection, then the item, such as an Entry by its title. A route that opens no page of its own registers no crumb, which is why the layout under Collections and the page that edits an Entry register none: the Collection's own layout names the Collection and the Entry's layout names the Entry.

**A crumb may lead somewhere other than the route it stands for**, through the third argument of `useBreadcrumb`. The one crumb that needs it is the Projects step the Profile's trail starts on: the trail is built from the current route's own matches, and the Profile sits outside the Projects route, so no match of its own carries that step. The layout under the user registers it instead, since `/user` opens no page of its own.

The last crumb is the current page rather than a link, and it is the one crumb that gives way. The trail never wraps, because it sits in a bar of 48 px with the window controls above it and the main panel right below, so a name too long for the header is cut with an ellipsis instead. `PageCrumb` measures its own box with a `ResizeObserver`, and while the name is cut it carries the whole name in its `title` and takes the keyboard, so a pointer sees it on hover and a screen reader reads all of it either way. Only those attributes change with the measurement, never the element, so the observer is never handed a crumb that is no longer on screen.

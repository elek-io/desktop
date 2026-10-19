# Routing

## Overview

elek.io Desktop uses [TanStack Router](https://tanstack.com/router/latest) with file-based routing. Routes live in [`src/renderer/routes/`](../../src/renderer/routes/) and the route tree is auto-generated into `routeTree.gen.ts` by the TanStack Router plugin (configured in `electron.vite.config.ts`) - never edit that file by hand.

**Key settings:**

- **Hash history** - the router uses `createHashHistory()` because Electron serves the app over the `file://` protocol, which is not compatible with browser history.
- **Auto code-splitting** - enabled on routes, so each route is loaded on demand.

## Layout Routes

Files like [`routes/projects/$projectId.tsx`](../../src/renderer/routes/projects/$projectId.tsx) are layout routes that wrap their children. They provide shared context through providers (for example `ProjectProvider` wraps all project routes), render shared chrome like the sidebar, and render their children with `<Outlet />`.

A layout route is also where ancestor route params are first read and passed into the provider. `ProjectProvider` requires a `projectId`, so the layout reads it with `Route.useParams()` and threads it in:

```tsx
function ProjectLayout(): ReactElement {
  const { projectId } = Route.useParams();

  return (
    <ProjectProvider projectId={projectId}>
      <Outlet />
    </ProjectProvider>
  );
}
```

## Route Parameters

Route parameters are accessed in a type-safe way via `Route.useParams()`:

```typescript
const { projectId, collectionId } = Route.useParams();
```

A nested route exposes all of its ancestors' params, so a route under `$projectId/collections/$collectionId` can read both `projectId` and `collectionId`.

## Data Fetching vs Route Guards

Data is fetched in page components with skeleton loading states, not in `beforeLoad` route guards. See [Loading and Updating Data](./loading-and-updating-data.md) for the fetching patterns.

`beforeLoad` is still used, but only for simple route redirects (for example an index route that redirects to a default child), not for loading data. Fetching in components lets errors bubble to the nearest error boundary instead of blocking route access.

## The First start

Before any User exists, the app opens on the First start at `/welcome`, see [Signing in to elek.io Cloud](../cloud-account.md#the-screens). The redirect depends on data, the User, so it is not a `beforeLoad` guard. `FirstStartRedirect` in [`__root.tsx`](../../src/renderer/routes/__root.tsx) reads the User query and renders a `<Navigate>`:

- No User and a route outside `/welcome` goes to `/welcome`, so every route, `/` included, starts there on a fresh data directory.
- A User and a route inside `/welcome` goes to `/projects`, so the First start and its account pages are left once Continue or signing in created one.
- While the User query loads, it renders nothing, so a route never flickers to the First start.

The account pages exist twice, under `/projects` and under `/welcome`, because the breadcrumb is built from the route matches: Sign in reads "Projects > Sign in" from the user menu and "Welcome > Sign in" from the First start. Both routes render the same component from [`cloud-account-forms.tsx`](../../src/renderer/components/cloud-account-forms.tsx), which takes the origin to point its links back the same way.

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

## One sidebar leads to every screen of a Project

[`routes/projects/$projectId.tsx`](../../src/renderer/routes/projects/$projectId.tsx) renders the one sidebar a Project has, in [`components/project-sidebar.tsx`](../../src/renderer/components/project-sidebar.tsx), beside the main panel every screen below it sits in. It holds, in this order:

| Part           | What it is                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Project    | The card: the switcher, what state the Project is in, its last Release, and Sync where the Project has a Git repository                                                                                                 |
| The search     | Disabled until Core can search across a Project, so its place is kept. It carries `aria-disabled` rather than `disabled`, so it stays in the tab order and says why it is disabled                                      |
| The navigation | The Dashboard, Assets and Components, then every Collection by its plural name, then the History, Releases and Settings. Only this part scrolls, at full row height, and a rule marks each edge its list continues past |

Two rules follow for a screen inside a Project:

- **A Collection is reached from the sidebar, not from a list of its own.** `routes/projects/$projectId/collections.tsx` is a layout with nothing but its `Outlet`, so a Collection's Entries take the whole panel, and `collections/index.tsx` is what Collections lands on before one is opened.
- **The sidebar reads above every pane**, so a read it cannot make reaches the root error screen rather than a pane's own sentence, like a read in the layout above every pane. It reads in `$projectId.tsx`, outside the `Panel`, while a layout route below that one, such as `collections/$collectionId.tsx`, renders inside the pane and so reaches that pane's sentence, see [Error handling](../error-handling.md#a-read-that-failed-the-pane-says-so). The one read that does not is the card's check of the Git repository, which the card answers as a state line of its own, see [the reads a screen catches](../error-handling.md#the-reads-a-screen-catches-a-project-cards-own). What the sidebar reads is the Project, its changes, its last Release, its Collections and the counts beside the rows, see [Loading and Updating Data](./loading-and-updating-data.md#the-counts-beside-the-sidebars-rows).

## The first start stands in front of every screen

Nothing in Desktop can be written before a User exists: Core stamps the name and
the email address on every change it commits. So the root route carries the one
gate the app has, in [`routes/__root.tsx`](../../src/renderer/routes/__root.tsx):

- While there is no User, every address settles on `/welcome`, the first start.
- Once there is one, that address settles on `/projects` instead, so the first
  start is reachable exactly while it is needed.

It is a `beforeLoad` rather than a component, so no screen is drawn for a moment
before it gives way, and it is the one place that reads data in a route guard,
see below. The User comes from the same query the whole app reads it through, so
the gate costs one read at the start and nothing after it: `queryClient.query`
hands back what is cached, and the app caches every read forever.

The first start writes the User with the same mutation the Profile uses, which
puts it into that cache, so the navigation right after it is let through.

## Route Parameters

Route parameters are accessed in a type-safe way via `Route.useParams()`:

```typescript
const { projectId, collectionId } = Route.useParams();
```

A nested route exposes all of its ancestors' params, so a route under `$projectId/collections/$collectionId` can read both `projectId` and `collectionId`.

## Data Fetching vs Route Guards

Data is fetched in page components with skeleton loading states, not in `beforeLoad` route guards. See [Loading and Updating Data](./loading-and-updating-data.md) for the fetching patterns.

`beforeLoad` is still used for simple route redirects, such as an index route that redirects to a default child. Fetching in components lets errors bubble to the nearest error boundary instead of blocking route access.

The one exception is the gate above, which reads the User in the root route's `beforeLoad`. It is a redirect that depends on one fact, and reading it in a component would draw a screen that then gives way. It reads through the same query as the rest of the app, so it is one read at the start rather than a read per navigation.

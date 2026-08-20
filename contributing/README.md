# Developer Documentation

Welcome to the elek.io Desktop developer documentation. This guide will help you understand the codebase architecture and development patterns.

> [!NOTE]
> This folder documents how to **contribute to** elek.io Desktop. If instead you want to consume your Projects' content inside your own applications, see the [@elek-io/core documentation](https://github.com/elek-io/core). Core ships its full guides (content export, local API, API client generation) both in its repository and in the package's `docs` folder.

## Prerequisites

- Familiarity with TypeScript and React
- Basic understanding of Electron architecture
- Knowledge of React Hook Form and TanStack Query (helpful but not required)
- Understanding of Git and version control concepts

## Getting Started

**Start with [Overview](./overview.md)** to understand the application architecture, security model, and how the different processes communicate.

Then proceed to the specific topics based on your interests or contribution goals:

- **[Routing](./renderer/routing.md)** - File-based routing, layout routes, hash history, and why data is fetched in components rather than route guards
- **[Loading and Updating Data](./renderer/loading-and-updating-data.md)** - TanStack Query patterns for data fetching and mutations
- **[Error Handling](./error-handling.md)** - how a `CoreError` keeps its `type` across IPC, how errors surface in the UI, the guide to handling expected errors in place, and where things are logged locally and to Sentry
- **[Forms](./renderer/forms.md)** - The shared form layer every form uses: the `AppForm` and `SubmitButton` primitives, detached submit buttons, handling submit errors by type, form typing, the typed field wrappers, and the enforced invariants
- **[Dynamic Form Field Generation](./renderer/dynamic-form-field-generation.md)** - How user-defined forms work with field definitions
- **[Markdown Editor](./renderer/markdown-editor.md)** - The Milkdown based mdast editor for markdown fields: the tree bridge, feature gating, and reference nodes
- **[Breadcrumb Navigation](./renderer/breadcrumb-navigation.md)** - Route-based breadcrumb system for hierarchical navigation
- **[Theming and Styling](./renderer/theming-and-styling.md)** - shadcn/ui components, Tailwind v4 CSS configuration, and dark mode
- **[Internationalization](./renderer/internationalization.md)** - translations, datetime locales, and multi-language form state
- **[Build and Packaging](./build-and-packaging.md)** - how electron-vite and electron-builder turn source into installers, the rule for `dependencies` vs `devDependencies`, and what drives app size
- **[E2E Testing](./testing.md)** - Playwright tests against the packaged app, fixtures, isolation, and CI
- **[Releasing](./releasing.md)** - versioning with changesets and how CD publishes draft GitHub Releases

For a running list of things Core supports but the desktop app cannot use yet, see **[Not Yet Implemented](./not-yet-implemented.md)**. Add to it whenever you find such a gap.

## Contributing

When updating these docs:

- Keep code examples up-to-date with actual implementation
- Include file references with line numbers where relevant
- Add practical examples for complex concepts

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [React Hook Form Documentation](https://react-hook-form.com/get-started)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)
- [@elek-io/core Repository](https://github.com/elek-io/core)

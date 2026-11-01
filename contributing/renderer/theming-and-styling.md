# Theming and Styling

## Overview

The renderer is styled with [Tailwind CSS v4](https://tailwindcss.com/) and uses [shadcn/ui](https://ui.shadcn.com/) components on [Base UI](https://base-ui.com/). Every color, corner, shadow and type role comes from `@elek-io/branding`, the brand package, so the app keeps no palette of its own. Dark, light and system themes are handled by a small hand-rolled `ThemeProvider`. This document covers where the design tokens come from, how to add or restyle a component, which changes the app keeps to a shadcn component and why, and how theming is wired.

## The brand package

`@elek-io/branding` carries the brand as code. The app installs it from the registry like any other package and imports its theme in [`src/renderer/index.css`](../../src/renderer/index.css):

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
@import '@fontsource-variable/geist';
@import '@fontsource-variable/geist-mono';
@import '@elek-io/branding/theme.css';
```

| Import                        | Brings                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwindcss`                 | Tailwind v4 itself, wired through the `@tailwindcss/vite` plugin (see `renderer.plugins` in [`electron.vite.config.ts`](../../electron.vite.config.ts)). There is no `tailwind.config.*` |
| `tw-animate-css`              | The enter and exit animations the shadcn components use                                                                                                                                  |
| `shadcn/tailwind.css`         | The `data-open`, `data-checked` and other custom variants the components key off                                                                                                         |
| The two Geist packages        | Geist and Geist Mono, self-hosted through Fontsource and bundled with the app                                                                                                            |
| `@elek-io/branding/theme.css` | Every design token, the Tailwind theme that maps them onto utilities, and the `dark` variant on the `.dark` class                                                                        |

So `bg-primary`, `text-muted-foreground`, `border-input`, `rounded-md`, `shadow-window`, `text-ui` and the rest resolve to the package's values and switch with the theme. The package also ships the app icons in `build/`, see [build-and-packaging.md](../build-and-packaging.md).

**Do not add a color, a corner or a shadow to `index.css`.** A value the app needs and the package does not carry is a change to the brand package, not a local override. A hardcoded palette step such as `border-zinc-200` is the same mistake in a class name. `tests/specs/branding.spec.ts` reads every token out of the running app and compares it with the package, in both themes, so a local override shows up as a failing test.

What `index.css` still owns is the handful of rules that are about this app rather than about the brand: the base layer below, the draggable window region, and hiding the native date picker button.

### Type

The package's `text-*` classes carry size, line height, letter spacing and weight in one class, named after ci's roles: `text-display`, `text-h1` to `text-h4`, `text-body-lg`, `text-body`, `text-ui`, `text-label`, `text-small`, `text-tag`, `text-code` and `text-code-sm`. The body is set to `font-sans text-ui`, which is the app's 14 px on a 20 px line.

A shadcn component that says `text-sm` or `text-sm font-medium` lands on the same 14 px and 20 px as the `ui` and `label` roles, so the registry's own classes are left alone. Reach for a named role where the size is a decision rather than a default, such as a page title (`text-h3`) or a dialog title (`text-h4`).

### Focus

ci's focus ring is a 2 px solid outline at full opacity, 2 px outside the element, in the ring color. One rule in the base layer of `index.css` gives it to every control, including the ones Base UI brings, so no component opts in:

```css
@layer base {
  :focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}
```

It sits in the base layer, so a utility can still move it:

| Case                                                                                   | Class                                                                                                                               |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A row or a cell that fills its pane, which would clip a ring drawn outside it          | `focus-visible:-outline-offset-2`, which draws the same ring 2 px inside its own edge                                               |
| A control whose wrapper draws the ring for it, such as an input inside an `InputGroup` | `focus-visible:outline-hidden` on the control, and `has-[...:focus-visible]:outline-2 outline-ring outline-offset-2` on the wrapper |

shadcn's own focus affordance, a 50% opacity `ring` plus a `border-ring`, is not used anywhere, and `outline-none` is gone from the components, because under ci the outline _is_ the ring. `tests/specs/branding.spec.ts` reads the window's pixels around a focused control, so a ring that goes back to half opacity fails a test.

## UI components (shadcn/ui on Base UI)

shadcn/ui components are not installed from a package. They are generated into the repository and then owned and edited like any other source file. They live in [`components/ui/`](../../src/renderer/components/ui/).

The generator is configured in [`components.json`](../../components.json):

- `style: "base-vega"`, which is shadcn's current style on [Base UI](https://base-ui.com/), `baseColor: "zinc"`, `cssVariables: true`
- `iconLibrary: "lucide"` (use [lucide-react](https://lucide.dev/), and no other icon set)
- Import aliases: `components` -> `@renderer/components`, `ui` -> `@renderer/components/ui`, `lib` -> `@renderer/lib`, `utils` -> `@renderer/lib/utils`, `hooks` -> `@renderer/hooks`

To add a base component, run the shadcn CLI (for example `pnpm dlx shadcn@latest add tabs`), which writes it into `components/ui/`. After that it is yours, and anything you change about it belongs in the table below.

**Class helpers:**

- `cn(...)` in [`lib/utils.ts`](../../src/renderer/lib/utils.ts) merges class names with `clsx` and `tailwind-merge`. Use it whenever you compose conditional or overridable classes.
- Component variants use [`class-variance-authority`](https://cva.style/) (`cva`), the standard shadcn pattern, from [`lib/variants.ts`](../../src/renderer/lib/variants.ts).

### Composition: `render`, not `asChild`

Base UI composes with a `render` prop instead of Radix's `asChild`. A trigger takes the component it should render, and its children stay on the trigger:

```tsx
<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
```

The rendered component must spread every prop it receives onto its DOM node, which every `ui/` component does. A `data-slot` the rendered component sets is overwritten by the one the wrapper sets, so a selector that has to find a composed control keys off its class or its role, not `data-slot`. Base UI's own guide is in the package: `node_modules/@base-ui/react/docs/react/handbook/composition.md`.

Two more Base UI shapes to know:

- **A select needs `items`.** `Select.Value` shows the raw value unless `Select.Root` is given an `items` map from value to label, so every select passes one.
- **A menu item acts on `onClick`.** `onSelect` is a DOM event, not a menu callback, and would never fire.

### What this app changes about a shadcn component

Every change below is deliberate. Add a row when you change another one, and drop a row when a shadcn release makes one unnecessary.

| Where                                                                              | Change                                                                                                                                                                                                                                | Why                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Every component with a `cva`                                                       | The variant object lives in [`lib/variants.ts`](../../src/renderer/lib/variants.ts)                                                                                                                                                   | A module in `ui/` that exports anything but a component loses its React fast refresh, which `react-refresh/only-export-components` reports |
| Every component                                                                    | `cn` comes from `@renderer/lib/utils`, not from the `cn` package                                                                                                                                                                      | The app has one `cn`, and 100 files import it                                                                                              |
| Every component                                                                    | An explicit return type on each function                                                                                                                                                                                              | `@typescript-eslint/explicit-function-return-type` is on                                                                                   |
| Every component                                                                    | ci's focus ring replaces shadcn's: no `outline-none`, no `focus-visible:border-ring`, no `focus-visible:ring-*`, see [focus](#focus)                                                                                                  | shadcn's ring is 50% opaque, which reaches 1.86:1 on white, and on a cyan fill its solid border disappears into the fill                   |
| `button`, `toggle`                                                                 | `aria-pressed` adds the muted surface and a 1 px ring in the input color                                                                                                                                                              | A pressed button and the chosen segment of a segmented control must differ by more than color                                              |
| `button`                                                                           | The default variant hovers to `primary-hover`, the destructive variant is a solid `destructive` fill with `destructive-foreground` that hovers to `destructive-hover`, and the link variant is the text color with the link underline | ci rules each one. shadcn tints its destructive button and colors its link text, which puts the brand color on text                        |
| `badge`, `alert`, `dropdown-menu`, `field`, `form`                                 | Error text uses `error`, and a tinted destructive badge uses the error message colors                                                                                                                                                 | ci gives `destructive` one job, the fill of a destructive button. As text, red-700 reaches only 3.10:1 on zinc-950                         |
| `input`, `textarea`, `select`, `input-group`, `checkbox`, `radio-group`, `command` | No `bg-input` fill, in either theme                                                                                                                                                                                                   | ci gives the `input` token one job, the border of a field. As a fill it also drops muted text inside a field below 4.5:1                   |
| `button`                                                                           | `isLoading` renders the `Spinner`, decoratively, and `Icon` renders a Lucide icon before the children                                                                                                                                 | Two things a button does in most of the app. The disabled button already says it is busy, so the spinner stays out of the accessible name  |
| `label`                                                                            | `isRequired` appends " - optional" when it is false                                                                                                                                                                                   | The app marks what is optional, not what is required. See [forms.md](./forms.md)                                                           |
| `dialog`, `sheet`                                                                  | A `DialogBody` and a `SheetBody` that scroll, a bordered header and footer, and a maximum height with three grid rows                                                                                                                 | A long dialog or sheet keeps its header and its footer in view                                                                             |
| `sheet`                                                                            | The header and the close button sit below the window's draggable title bar area                                                                                                                                                       | The frameless window would otherwise swallow the click                                                                                     |
| `scroll-area`                                                                      | `overflow-hidden` on the root                                                                                                                                                                                                         | It lets the area shrink below its content inside a column flex box, which is what keeps a dialog's or a sheet's footer in view             |
| `card`                                                                             | A `render` prop, through `useRender` like Badge and Item                                                                                                                                                                              | So a card can be the element its content asks for, such as a `<section>` under a page heading                                              |
| `pagination`                                                                       | `disabled` on Previous and Next                                                                                                                                                                                                       | Pagination renders anchors, which cannot be disabled natively, so the link says so with `aria-disabled` and takes no pointer               |
| `slider`                                                                           | An `aria-label` forwarded to the thumb, and `bg-background` instead of `bg-white` on it                                                                                                                                               | The thumb owns the slider role, so it takes the accessible name. `white` is outside the semantic tokens                                    |
| `sidebar`                                                                          | `Sidebar` is a static `<aside>`, the menu button does not read the sidebar's state, and the context and hook live in [`hooks/useSidebar.ts`](../../src/renderer/hooks/useSidebar.ts)                                                  | The app's sidebar is a pane of the window. It never collapses, never turns into a sheet, and mounts no `SidebarProvider`                   |
| `dropdown-menu`                                                                    | `DropdownMenuShortcut` is named `DropdownMenuAddOn`                                                                                                                                                                                   | The app puts a version or a check mark in that slot, not only a keyboard shortcut                                                          |
| `dropdown-menu`                                                                    | A menu label needs a `DropdownMenuGroup` around it, and nothing interactive goes inside it                                                                                                                                            | `Menu.GroupLabel` marks itself `aria-hidden`, which would take an interactive child out of the accessibility tree with it                  |
| `sonner`                                                                           | No `cn-toast` class, and `theme` falls back to `'system'`                                                                                                                                                                             | The class is defined nowhere, and `exactOptionalPropertyTypes` rules out an undefined theme                                                |
| `useMobile`                                                                        | Imported from [`hooks/useMobile.ts`](../../src/renderer/hooks/useMobile.ts), which takes the breakpoint as a parameter                                                                                                                | The app's hooks are camelCase and the breakpoint is a parameter rather than a constant                                                     |
| Several components                                                                 | Index access on a record (`modifiers['focused']`), named react-day-picker prop types, `cond ? x : null` instead of `cond && x`, and `=== true` on a nullable boolean                                                                  | The repository's lint and `@tsconfig/strictest` are stricter than the registry's                                                           |

Several of the registry's own classes are inert here and are left as they ship: `cn-font-heading` and the other `cn-*` hooks, which this app defines nowhere because it has one type family and is left to right only.

## Theming (dark / light / system)

Theme switching is a small custom context, not [next-themes](https://github.com/pacocoursey/next-themes). The pieces:

- **[`ThemeProvider`](../../src/renderer/components/theme-provider.tsx)** holds the current `Theme` (`'dark' | 'light' | 'system'`), toggles the `light` / `dark` class on `document.documentElement`, and persists the choice to `localStorage` under the key `desktop-theme` (the provider's default `storageKey`). For `'system'` it reads `window.matchMedia('(prefers-color-scheme: dark)')` and subscribes to its `change` event, so the UI follows the OS theme live while set to `'system'`. It is mounted at the top of the tree in [`app.tsx`](../../src/renderer/app.tsx) with `defaultTheme="system"`.
- **[`useTheme()`](../../src/renderer/hooks/useTheme.ts)** reads `{ theme, setTheme }` from the provider.
- The System / Light / Dark switcher UI lives in `components/user-dropdown.tsx`.

```tsx
import { useTheme } from '@renderer/hooks/useTheme';

const { theme, setTheme } = useTheme();
setTheme('dark');
```

The brand package's `theme.css` declares the `dark` variant on the `.dark` class, which is the class the provider sets, so `dark:` utilities and every token's dark value switch together.

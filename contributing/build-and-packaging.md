# Build and Packaging

How the source becomes the installers users download, and the rule for `dependencies` versus `devDependencies` that follows from it. Getting that rule wrong is easy and fails late, so this doc is worth reading before you add a dependency.

## How the app is built

The app is built with [electron-vite](https://electron-vite.org/), configured in [electron.vite.config.ts](../electron.vite.config.ts) with three separate builds. What matters for packaging is whether each build **bundles** its dependencies (inlines them into the output) or **externalizes** them (leaves `require()` calls that resolve from `node_modules` at runtime):

- **Main** externalizes its dependencies. This is the electron-vite 5 default (`build.externalizeDeps`). The built `out/main` keeps `require('some-dep')` calls, so those packages must exist in `node_modules` when the app runs.
- **Preload** bundles its dependencies (`externalizeDeps: false`). A sandboxed preload cannot resolve `node_modules` at runtime, so everything it uses is inlined into `out/preload`.
- **Renderer** is bundled by Vite, like any web app. Its dependencies are tree shaken into `out/renderer`.

## What ships in the packaged app

[electron-builder](https://www.electron.build/) packages the output, configured in [electron-builder.yml](../electron-builder.yml). Into the app's `app.asar` (with binaries split out into `app.asar.unpacked`) it puts two things:

1. The build output in `out/`.
2. The full `node_modules` of the **production `dependencies`** tree.

It prunes `devDependencies`. So the shipped app is the Electron runtime, plus the `out/` bundles, plus the raw `node_modules` of every production dependency and its transitive production dependencies.

### The "duplicate dependency references" log line

During this collection electron-builder prints `duplicate dependency references` with a list of packages (for example `dugite`, `debug`, `semver`). It is an `info` note, not a warning. "Duplicate" means referenced by more than one parent in the production tree, not copied more than once. These are diamond dependencies that pnpm deduped, and electron-builder collapses each to a single node, so every listed package still ships once. You can confirm it with `pnpm why <pkg> --prod`, which reports one version each. A second version in the pnpm store belongs only to `devDependencies` and is pruned before packaging. The line that would matter is `unresolved duplicate dependency references`, which is `warn` level and means a reference electron-builder could not resolve.

## Readable stack traces in a shipped build

A user who hits a bug sends us a log file, and every stack in it points at the bundles above rather than at our source. Two settings decide whether that stack is readable, and both are currently right by inheritance rather than by decision. This section is the decision.

**The renderer ships unminified, on purpose.** electron-vite defaults `minify` to `false` for all three builds and nothing here overrides it, which is why a logged frame still names `useSendReport` and a real line number. Turning it on to shrink the app would save about 2.1 MB of a 4.0 MB renderer bundle, against an Electron runtime of a few hundred MB, and in exchange every frame becomes `chunk.js:1:<offset>` with every identifier renamed. That is a bad trade while a log file is the only thing we get from a user.

**Shipping the source maps would not buy it back.** V8 builds `error.stack` from the script it actually loaded. A map is applied by DevTools when it displays a stack, or by an explicit hook (`Error.prepareStackTrace`, `source-map-support`, Node's `--enable-source-maps`). Chromium has no equivalent for a page script and nothing here installs a hook, so the maps would sit in the asar unread. This is why [electron-builder.yml](../electron-builder.yml) excludes `out/renderer/**/*.map` and why that exclusion costs nothing.

The main process map is kept, at around 30 KB. It is the process we cannot open DevTools on, and while nothing consumes it automatically either, it resolves a frame by hand: `out/main/index.js:324:18` maps to `src/main/index.ts:448:17`.

**If you ever turn `minify` on, archive the renderer maps first.** A chunk name is content hashed, so a frame is only resolvable against the exact build that emitted it, and a minified frame is only resolvable with that build's map. [cd.yml](../../.github/workflows/cd.yml) archives nothing today, which is fine only because nothing is minified. One artifact of around 9 MB per version covers every platform, since the renderer build does not vary by runner. Key it to the version a report carries, and prefer a CI artifact over a public release asset unless this source is already public, because a map is the source.

## The rule for dependencies vs devDependencies

> A package belongs in `dependencies` if and only if the packaged app `require()`s it from `node_modules` at runtime.

That only happens for code that was **externalized**, not bundled. Combined with the build model above:

| Process  | Deps are     | Loaded at runtime from     | So its imports go in |
| -------- | ------------ | -------------------------- | -------------------- |
| Main     | externalized | `node_modules` in the asar | `dependencies`       |
| Preload  | bundled      | `out/preload`              | `devDependencies`    |
| Renderer | bundled      | `out/renderer`             | `devDependencies`    |

Two more cases follow the same "is it required at runtime" test:

- **Peer dependencies of a shipped package.** [`@elek-io/core`](../package.json) declares `dugite` and `zod` as required peers and `require()`s them at runtime in the main process. The client provides them, so they must be `dependencies`. Demote them and the app crashes on launch.
- **Build only tools.** A Vite plugin like `@tailwindcss/vite` or `@tanstack/router-plugin` runs only during the build, so it is a `devDependency` even though it is very much part of shipping the app. Left in `dependencies` it drags itself, its platform binaries and its whole transitive tree into every packaged copy for no runtime benefit.

### Why this fails late

A main process runtime dependency placed in `devDependencies` still installs on every dev machine and in CI, so the build and `check-types` both pass. It only breaks when the **packaged** app runs and `require()` cannot find it, which surfaces in the E2E suite or, worse, for a user.

`electron-updater` is the concrete example. Auto-update is not wired up yet (see [Known Considerations](./overview.md#known-considerations) in the overview), so nothing imports it today. It is kept in `dependencies` anyway, because the moment main starts importing it the externalized `require('electron-updater')` needs it in the packaged app, and we do not want that mistake to slip through build and type checks only to fail at runtime.

### Adding a dependency

- Used by the **main** process at runtime: `dependencies`.
- Used only by the **renderer** or **preload**: `devDependencies` (it gets bundled).
- Used only during the build (plugins, generators, types): `devDependencies`.
- A required peer of something main uses at runtime: `dependencies`.

When in doubt, ask whether the packaged app will `require()` it from disk. The renderer never does (it loads its bundle), so renderer libraries belong in `devDependencies` even though they are obviously part of the running app.

## pnpm side effects cache

[pnpm-workspace.yaml](../pnpm-workspace.yaml) sets `sideEffectsCache: false`. Since pnpm 8.7 the content addressable store keeps files produced by postinstall scripts as plain copies rather than symlinks. `dugite`'s postinstall lays down a git distribution whose `git-core` directory is around 145 symlinks to one binary. Restoring that from a warm store (the CI pnpm cache) flattens those symlinks into 145 full copies, which roughly doubled the packaged macOS app. With the setting off, `dugite` re-extracts git on each install and the symlinks survive. This is reported upstream as [pnpm/pnpm#12859](https://github.com/pnpm/pnpm/issues/12859) and the setting can be removed once that is fixed.

## Where the size goes

An uncompressed app is roughly two halves:

- The **Electron runtime** (Chromium, V8, Node) is a fixed baseline of a few hundred MB that no app level change reduces.
- The **app payload** is what we control: the `out/` bundles plus the production `dependencies`.

The main lever on the payload is the dependency rule above. Because the renderer is already bundled and tree shaken into `out/`, its libraries must not also ship as raw `node_modules`. Keeping them in `devDependencies` is what stops that double shipping. `dugite` is the largest legitimate payload item, since it bundles a full git per platform.

Artifact size differs across platforms mostly because of how many installer formats each one ships, and each format is a full independent copy of the app. The targets are set in [electron-builder.yml](../electron-builder.yml): Windows builds one (`.exe`), macOS two (`.dmg` plus the `.zip` that Squirrel needs for auto-update), and Linux four (`.AppImage`, `.deb`, `.rpm`, `.pacman`, all of which electron-updater can auto-update). snap was dropped because electron-updater cannot update it, only the Snap Store can. Building the pacman target on the Ubuntu runner needs `bsdtar` from the `libarchive-tools` package, which the CI and CD workflows install before the build. Compression method then accounts for the smaller differences between formats.

## Linux window association

On Linux a desktop environment links a running window to its installed `.desktop` entry by matching the window's `app_id` (Wayland) or `WM_CLASS` (X11) to the `.desktop` file name. Electron sets that runtime id from the `desktopName` field in [package.json](../package.json), which we set to `io.elek.desktop.desktop` to match the `appId`. electron-builder writes the same value into the entry's `StartupWMClass` and, with `linux.syncDesktopName: true` in [electron-builder.yml](../electron-builder.yml), names the installed `.desktop` file to match. All three then agree, so the app shows its own icon and groups correctly in the dock. Leave either half out and electron-builder falls back to the executable name while Electron infers its own, the two drift apart, and the window falls back to a generic icon.

### The doubled `.desktop` is intentional

`io.elek.desktop.desktop` looks like a stray extension but is correct, so do not shorten it. The name is `<appId>.desktop`: `io.elek.desktop` is the `appId` (the product is elek.io Desktop, so its id already ends in `desktop`) and the trailing `.desktop` is the freedesktop file extension every entry carries, the same way `org.gnome.Nautilus` installs as `org.gnome.Nautilus.desktop`.

Removing the second `.desktop` breaks it in a way that is easy to miss. Both electron-builder and Electron strip one trailing `.desktop` from `desktopName`, so the value needs that suffix to survive the strip. Set it to `io.elek.desktop` and the strip eats the real end of the id instead: the `app_id` and `StartupWMClass` collapse to `io.elek`. The window still finds its entry, but the app now identifies as `io.elek` everywhere, including its userData directory, out of step with the `appId`.

Changing the `appId` is the only way to drop the doubling for real, but `io.elek.desktop` is the id we want. The product is elek.io Desktop, so `io.elek.desktop` names this specific app. A shorter `io.elek` would name only the vendor and could belong to any elek.io product. The doubling is just what a correct reverse-DNS id and the mandatory `.desktop` extension produce together, not a name to design away.

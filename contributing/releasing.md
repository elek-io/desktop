# Releasing

How a new version of the client is built and published.

## Versioning with changesets

Changes that should end up in a release need a changeset. Run `pnpm changeset` and describe the change. The CD workflow collects pending changesets on every push to `main` and creates or updates a release pull request named `WIP: Release x.x.x`. Merging that pull request bumps the version and removes the consumed changesets.

## What CD does

The [CD workflow](../.github/workflows/cd.yml) runs on every push to `main` in three jobs:

1. `changesets` runs the same checks as CI on a single Linux runner. It then creates or updates the release pull request. Only one runner does this to avoid conflicting pushes.
2. `prepare-release` runs when there are no pending changesets left. That is the push from merging the release pull request, but also any other changeset-free push to main. On a single runner it reads the version from package.json and, if that version is not already published, creates one draft GitHub Release named `vx.x.x` with its body set to that version's section from [CHANGELOG.md](../CHANGELOG.md). If the version is already published it skips the build, so an ordinary push to main does not re-release. It runs before the builds so there is exactly one draft to upload into.
3. `build-and-upload` runs only when `prepare-release` produced a fresh draft, and builds the app on every supported platform. Each runner uploads its installers and update metadata into that draft via electron-builder, configured in [electron-builder.yml](../electron-builder.yml). electron-builder finds the draft by its tag, so the runners share one draft.

The draft release is not public. Review the attached artifacts and publish it manually on GitHub to complete the release. Publishing creates the `vx.x.x` git tag.

Pre-creating the draft solves two earlier problems. The platform runners used to create the release themselves, and running concurrently each one raced to create a draft, so a single version produced several drafts. They were all empty because electron-builder does not write release notes and changesets only creates releases when publishing to npm, which this app never does.

Unlike Core, which publishes its library to npm from a single runner, the client needs one build per platform. That is why `build-and-upload` runs on a matrix while `changesets` and `prepare-release` do not.

## Toolchain versions

CI and CD read the Node.js version from [.node-version](../.node-version) and the pnpm version from the `packageManager` field in [package.json](../package.json). Both are kept in sync with Core. Update those two files to change the toolchain, not the workflows.

`@types/node` follows that Node version rather than its own newest major, so it stays on the major `.node-version` names. Dependabot is told to leave its major alone for the same reason.

## Dependencies that stay behind their newest release

A dependency round takes every package to its newest release that has cleared the release-age cutoff above. These do not come along, and each will when its reason goes away:

- `typescript` stays on 6, because typescript-eslint declares `typescript >=4.8.4 <6.1.0` and refuses to load against 7 with `typescript-eslint does not support TS 7.0`. With it refused, `pnpm lint` cannot run at all, so none of the form guardrails are enforced. Tracked upstream as [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
- `@tanstack/react-table` stays on 8. Version 9 renames the hook and drops the type exports the Entry table is written against, so taking it is a rewrite of that screen rather than a version change.
- `@playwright/test` stays on 1.63, see [Why Playwright is held at 1.63](./testing.md#why-playwright-is-held-at-163).

## Supply-chain policies

pnpm 12 ships two protections that are kept at their defaults, matching Core:

- `minimumReleaseAge` refuses packages published less than a day ago, and every install verifies the whole lockfile against it. If CI fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, the lockfile references releases that are too fresh, usually because it was resolved right after an upstream release. Either wait until the entries are a day old and rerun CI, or delete `pnpm-lock.yaml` and run `pnpm install` so resolution picks the newest allowed versions. When a single dependency is trusted and has to land before it ages out, a scoped `minimumReleaseAgeExclude` entry in [pnpm-workspace.yaml](../pnpm-workspace.yaml) exempts just that version. Keep it temporary and remove it once the version clears the cutoff, so the policy applies to it again.
- `blockExoticSubdeps` refuses transitive dependencies that resolve to git repositories or tarball URLs instead of the registry. If a dependency pulls one in, prefer updating it to a version that resolves from the registry over disabling the policy.

Dependency build script approval lives in [pnpm-workspace.yaml](../pnpm-workspace.yaml) as an `allowBuilds` map, with a comment per entry explaining why it is allowed or denied.

pnpm 12 added a second approval of the same kind for agent skills a dependency ships, which lives in the `permissions` map of the same file. An undecided package makes every install print `awaiting approval`, so each one that asks is answered there. Nothing in this repository reads a dependency's skills, so every answer is `skills: false`. `pnpm permissions list` prints both maps and what still awaits an answer.

## Why Core is not bumped on its own

Dependabot is told to propose no `@elek-io/core` update in [dependabot.yml](../.github/dependabot.yml), and a dependency round leaves Core on the version `main` installs. A Core release brings new screens and new specs with it, so it moves with the feature that needs it rather than on its own. `zod` and `dugite` still move inside the peer ranges the installed Core declares, because the packaged app loads them from `node_modules` on Core's behalf (see [build-and-packaging.md](./build-and-packaging.md#the-rule-for-dependencies-vs-devdependencies)).

## macOS update metadata

macOS builds on two runners, Intel and Apple Silicon. Both the artifact names and the update metadata must stay separate per architecture, otherwise the second upload overwrites the first. The artifact names already include the architecture. For the metadata, electron-builder only adds an architecture suffix to `latest-*.yml` on Linux, so on macOS both runners would otherwise write the same `latest-mac.yml` and break auto-updates for one architecture.

The fix is a per-architecture publish channel in [electron-builder.yml](../electron-builder.yml): `mac.publish.channel` is set to `latest-${arch}`. electron-builder expands the macro per build, so the Intel runner writes `latest-x64-mac.yml`, the Apple Silicon runner writes `latest-arm64-mac.yml`, and each build bakes its own channel into `app-update.yml`. Both architectures keep building and testing natively on their own runner, and no client code is needed to pick the right channel.

A single universal binary (`--universal`) was considered instead. It avoids the metadata problem but roughly doubles the download size and requires every bundled executable, including git from dugite, to be universal. Building both architectures natively and separating their channels avoids both the size cost and any cross building.

Auto-update itself is not wired up yet. When it is, macOS auto-update will also need the app to be code signed, since `mac.notarize` is currently `false` and Squirrel.Mac refuses unsigned updates.

GitHub's Intel macOS runners are planned to last until around fall 2027, and they are what builds the Intel artifact natively. After that date, shipping Intel builds would require cross building from the Apple Silicon runner, which is when the universal or single-run cross build trade-offs would need revisiting.

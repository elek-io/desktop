# Signing in to elek.io Cloud

How Desktop signs in to an elek.io Cloud account through Core's `core.cloud.account`, where it keeps the session, what the renderer may see of it, and what each screen does. Core's own [cloud-account doc](../node_modules/@elek-io/core/docs/cloud-account.md) is the reference for the calls, the endpoints they reach and the errors they throw. This doc covers what Desktop builds on top.

The rules for the screens and their copy come from the `ci` repository's `docs/desktop.md` (Header, Screens, Signing in, Messages and Sync) and `docs/voice.md`. Desktop builds them in its current design. The ci redesign is applied to Desktop all at once later, as Nils decided on 2026-10-19.

## Where the session lives

Core keeps the session's token in memory and never writes it anywhere, so a session ends with the process unless the host keeps the token. Desktop keeps it in the main process, in [`src/main/cloudSession.ts`](../src/main/cloudSession.ts):

- **Encrypted with Electron's `safeStorage`**, written to `cloud-session` under `app.getPath('userData')` with mode `0600`.
- **Never in Core's data directory.** That directory sits in people's backups, and a token there would travel with every copy.
- **Handed back as the `cloud.token` option** when the main process constructs Core. A stored token that does not decrypt, or does not read as one Core accepts (`cloudTokenSchema`), is deleted first, since Core refuses to start with a malformed token.
- **Kept current through `onTokenChange()`.** Core reports every token it keeps or drops, and `null` deletes the file. Nothing else tracks the token.

### Without encryption

When `safeStorage.isEncryptionAvailable()` is false, nothing is written and the token stays in Core's memory. The session lasts until Desktop quits, and the person signs in again after a restart, which the header shows as Sync paused. The main process logs a warning when that happens.

On Linux, Desktop counts Chromium's `basic_text` backend as no encryption, decided by Nils on 2026-10-19. Its key is the same on every machine, so a token "encrypted" with it is as good as plain text in a backup. Electron 43 already reports `basic_text` as unavailable unless an app calls `safeStorage.setUsePlainTextEncryption(true)`, which Desktop never does.

Chromium picks a keyring from `XDG_CURRENT_DESKTOP`, and falls back to `basic_text` on desktops it does not know, such as niri, sway or Hyprland, even while gnome-keyring or KeePassXC runs. So before the app is ready, `preferSecretServiceOnLinux()` appends `--password-store=gnome-libsecret` on Linux, except on KDE, which keeps KWallet, and except when a `--password-store` was passed at launch. Without a Secret Service on D-Bus the backend is then unavailable, and the session is kept in memory only. Each start on Linux logs which backend keeps the session.

On macOS `safeStorage` uses the Keychain, and on Windows DPAPI.

## What the renderer sees

The renderer never sees the token. The password crosses IPC once, from the sign in form into the main process, and nothing the main process answers carries the token back.

| Channel                       | Wraps                          | Answers the renderer                                               |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `core:cloud:account:signUp`   | `core.cloud.account.signUp()`  | `{ outcome: 'session', account }` or `{ outcome: 'verification' }` |
| `core:cloud:account:signIn`   | `core.cloud.account.signIn()`  | `{ account }`                                                      |
| `core:cloud:account:signOut`  | `core.cloud.account.signOut()` | nothing                                                            |
| `core:cloud:account:read`     | `core.cloud.account.read()`    | the account, or `null`                                             |
| `core:cloud:account:hasToken` | `core.cloud.account.hasToken`  | whether Core holds a token                                         |

The wrappers are `cloudAccountHandlers()` in [`src/main/cloudSession.ts`](../src/main/cloudSession.ts), typed by `CloudAccountHandlers` in [`src/shared/cloudAccount.ts`](../src/shared/cloudAccount.ts), so the main process and `ContextBridgeApi` agree on what crosses.

The main process also tells the renderer when the session may have changed, on the one channel that runs from main to renderer, `cloud:account:changed`. It sends it when Core keeps or drops a token, which includes a 401 from any call that carried the session, a report too, and after the check of a stored session at start. The preload exposes it as `window.events.onCloudAccountChanged(listener)`, and [`renderer/index.ts`](../src/renderer/index.ts) subscribes before the app mounts and reads the User and `['cloud', 'account']` again.

## At every start

With a stored token, the main process calls `read()` once Core exists, without awaiting it, since an unreachable Cloud can take 15 seconds to answer and the app must not wait for it.

| Cloud answers        | Token   | User                | The header shows |
| -------------------- | ------- | ------------------- | ---------------- |
| A live session       | kept    | follows the account | elek.io Cloud    |
| No live session      | dropped | stays `cloud`       | Sync paused      |
| Nothing, unreachable | kept    | unchanged           | elek.io Cloud    |

An unreachable Cloud keeps the token, since only Cloud can say a session ended.

## The three states

[`useCloudAccount()`](../src/renderer/hooks/useCloudAccount.ts) derives where the person works from the User's type and `hasToken`:

| State    | User                 | Header line, with its icon           | User menu                   |
| -------- | -------------------- | ------------------------------------ | --------------------------- |
| `local`  | `local`              | On this computer, `hard-drive`       | Sign in to elek.io Cloud    |
| `cloud`  | `cloud` with a token | elek.io Cloud, `cloud`               | Sign out                    |
| `paused` | `cloud` without one  | Sync paused, `triangle-alert`, amber | Sign in again, and Sign out |

The line stands under the name in the header's user menu trigger, in place of the address, so it shows without opening the menu. The menu's label keeps the name and the address. Today's theme has no warning token, so amber stands in for it.

## The screens

| Screen         | Route                                                 | What it does                                                                                                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First start    | `/welcome`                                            | Before any User exists. "Work on this computer" sets a local User with Name and Email address, and Continue is the screen's one primary button. The elek.io Cloud side, marked Optional, leads to Sign in and Create account. The root sends a start without a User here, see [routing](./renderer/routing.md#the-first-start) |
| Sign in        | `/projects/sign-in`, `/welcome/sign-in`               | Email address, filled from a local User, and Password. Only for a local User or none, so a signed in person lands on the Projects page and one whose session ended on Sign in again                                                                                                                                            |
| Create account | `/projects/create-account`, `/welcome/create-account` | Name and Email address, filled from a local User, and Password with its rule "12 to 128 characters". Below the button the notice of the Terms of Service and the Privacy Policy                                                                                                                                                |
| Sign in again  | `/projects/sign-in-again`                             | Only after a session ended. The account shows read-only, and only the password is asked for. Switching to another account goes through Sign out                                                                                                                                                                                |
| Profile        | `/user/profile`                                       | For a cloud User, Full name and Email are read-only with "Your name and email address come from your elek.io Cloud account.", since `read()` brings them back from the account at every start. Language and Local API stay editable, and saving keeps the cloud User and its id. Decided by Nils on 2026-10-19                 |

- Every account page is a narrow card in today's `Page`, its primary button across the form and its links centered below. The breadcrumb names it after Projects, or after Welcome from the First start, which is why the routes nest there.
- A password has a button that shows it, [`FormPasswordField`](./renderer/forms.md#typed-field-wrappers-and-their-value-contracts).
- An empty field says what it asks for, such as "Enter your password.", through `requiredField()` in [`lib/requiredField.ts`](../src/renderer/lib/requiredField.ts). It puts a presence check in front of Core's own field schema, because Core's messages win over an error map, and an empty name would otherwise read as breaking Core's rule against `|`.
- Signing in shows the toast "Signed in to elek.io Cloud", and so does creating an account that signed in. Signing out asks nothing, keeps every copy on this computer and the User's name and address, and shows "Signed out of elek.io Cloud".
- Signed out, the empty Projects page adds "Sign in to open your Projects on elek.io Cloud." below its text, with Sign in as the link.

### Placeholders until Cloud and Core can

elek.io Cloud sends no code yet, and Core has no calls for a code or a new password. Nils decided on 2026-10-19 that the pages show these anyway, without a function, until both can:

- "Forgot your password?" stands at the top right of Password on Sign in and Sign in again, disabled.
- Create account's Email address says "You get a code there to confirm it."

They are listed in [not-yet-implemented](./not-yet-implemented.md#codes-and-a-new-password) to be made to work.

### The Terms of Service and the Privacy Policy

Neither page exists yet. The notice links to the addresses the website will have, `https://elek.io/terms` and `https://elek.io/privacy`, which answer 404 until then, decided by Nils on 2026-10-19. A release build talks to the production Cloud, which is not up yet either, so it cannot create an account before the pages exist. The links open in the browser, since `elek.io` is on the external allow list in [overview.md](./overview.md#external-content-restrictions).

## Errors by type

Every account form builds its mutation with `useAppMutation`, see [error handling](./error-handling.md#example-signing-in-to-elekio-cloud). `Internal` is handled nowhere, so it reaches the root error boundary.

| Type                 | Means                                                | Sign in                                                                                             | Create account                                                                            | Sign in again            |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| `Unauthorized`       | A wrong address or password                          | Under Password: "The email address or the password is wrong."                                       | not expected                                                                              | "The password is wrong." |
| `Conflict`           | Signing in: address not confirmed. Signing up: taken | Above the button: "This account isn't confirmed yet, and this version of Desktop can't confirm it." | Under Email address: "An account uses this email address already." and "Sign in instead." | as Sign in               |
| `RateLimited`        | Too many attempts                                    | The button waits "Try again in 10 seconds", counting down                                           | the same                                                                                  | the same                 |
| `PreconditionFailed` | Cloud can't be reached                               | Above the button: "Can't reach elek.io Cloud. Check your internet connection and try again."        | the same                                                                                  | the same                 |
| `BadRequest`         | Input Core or Cloud refused                          | Above the button: "elek.io Cloud didn't accept this. Check each field and try again."               | the same                                                                                  | the same                 |

- `RateLimited` carries no `Retry-After` from Core yet, so the wait is a fixed 10 seconds, decided by Nils on 2026-10-19.
- A sign up that answers `verification` keeps the form with "Your account needs a confirmed email address, and this version of Desktop can't confirm one yet. Sign in once an update can." It does not happen while Cloud sends no code, and `Conflict` on signing in does not either.
- The copy that `docs/desktop.md` does not word was approved by Nils on 2026-10-19.

## One Desktop at a time

The `Main` constructor calls `app.requestSingleInstanceLock()`, decided by Nils on 2026-10-19. A second launch quits, and the running Desktop restores and focuses its window. Two Desktops would share one session, and each new git token for Cloud's hosts revokes the session's older ones, so they would break each other's sync. They would also write the same data directory.

Electron keeps the lock in the userData directory, so the E2E suite, which gives each test its own `--user-data-dir`, is not affected.

## Not built yet

These wait for Core calls or for elek.io Cloud, see [not-yet-implemented](./not-yet-implemented.md#elekio-cloud-in-desktop):

- The code from the email, "Send the code again", and Reset password.
- The Projects page in two sections, Create Project on elek.io Cloud, Move, Download, and the organization step.
- "Sync paused" on each Project's card and in its sidebar, which needs to know which Projects are on elek.io Cloud.
- git to Cloud's hosts, through Core's credential helper.

## Testing

[`tests/specs/cloud-account.spec.ts`](../tests/specs/cloud-account.spec.ts) drives each screen against the Cloud stub, see [testing](./testing.md#how-the-fixtures-work). Restarting with a stored session needs a keyring on Linux, which CI starts on a private D-Bus.

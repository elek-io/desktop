---
'@elek-io/desktop': minor
---

Remove Sentry, so the app sends no telemetry at all.

elek.io is run by a German business and acts as a processor for its customers' content, and Sentry was the last part of the stack contracted outside the EU. Error, tracing, profiling and session replay reporting are gone from both processes, along with the source map upload during CD and the three `@sentry/*` dependencies. Nothing leaves the user's machine any more.

Local diagnostics are unaffected and are now the only sink. Core's logger keeps writing to the console and to its log files exactly as before, and the main process security checks that previously only reported remotely (a rejected file request from the custom protocol) now write a local log instead.

Two global handlers the Sentry browser SDK used to install are replaced rather than dropped, so an uncaught error or a rejected promise in the interface is still written down. Uncaught throws in the main process were never Sentry's to catch, since Core's logger already registers them with winston.

Renderer source maps are still emitted for local debugging and are now kept out of the packaged app by electron-builder rather than by the Sentry plugin.

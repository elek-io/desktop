---
'@elek-io/desktop': patch
---

Make an error in the logs say what actually went wrong.

When you report a bug and attach your logs, the log is what we work from. Until now an ordinary crash was written down with its message but no stack trace at all, which is the one thing that says where in the app it happened. Only errors that came from Core kept theirs. Every error now records its stack, so a report about a problem we cannot reproduce is still something we can follow.

A failed action used to be logged as little as "Failed to clone project", with the reason recorded separately by Core and only findable by matching timestamps. It now carries the reason and the stack on the same line.

Every log record now names the version of elek.io Desktop that wrote it, and each log file starts with the Electron, Chromium and Node versions underneath it. A log file sent on its own, without a report around it, could not previously be tied to a release at all.

Log records now name the error the same way Core already does, so one search finds everything relevant in a file rather than two.

Nothing about this sends anything anywhere. Logs stay on your machine unless you attach them to a report yourself.

---
'@elek-io/desktop': minor
---

Add an in-app way to report a bug or send feedback.

With no automatic error reporting, a problem only reaches us if you tell us about it. A "Feedback" button now sits in the header on every screen, and the error screen offers to report the problem it is showing, with the message and technical detail already filled in.

A bug report can optionally carry the last 24 hours of this machine's logs. It is off by default everywhere except the error screen, and the form says plainly what a log holds: the ids of your Projects, Collections and Entries, the files they live in and the actions you took, never the content you wrote or the names you gave it. Feedback never carries logs at all.

Your name and email are filled in from your local User and both stay editable, so you can be answered somewhere other than where your commits are signed. Leave them empty to send anonymously. A report still works before you have set up a User at all, which is when a broken first run is worth reporting most.

Reports go to elek.io Cloud through Core. Nothing is sent unless you write it and press send, and no account is needed. If Cloud cannot be reached, the dialog says so and keeps what you wrote so you can try again.

The elek.io menu's "Report an issue" link is gone, replaced by this. Reporting on GitHub is still offered as an alternative from inside the bug report form.

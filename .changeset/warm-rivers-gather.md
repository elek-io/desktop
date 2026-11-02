---
'@elek-io/desktop': minor
---

Read every word the app shows from one catalog, and say in each message what happened rather than which call ran.

Every string elek.io Desktop shows now comes from one English message catalog, in the window and in the native box the app shows when it cannot start. Nothing in the interface is written into the code any more, so the app can be shown in another language by translating that one file, and a language it carries no translation for reads English rather than a code nobody can make sense of. The box shown when the app cannot start follows your system's language, since nothing about you is known at that point, and the window follows the language on your profile. The page now says which language its words are in, so a screen reader pronounces them correctly.

Every message after a change says what happened to what, in your words:

- "Project Autohaus Ebersfelde saved", "Collection deleted", "Changes synced", "Release 1.4.0 created", "Report sent". Until now each of these read as the name of the call that ran and the kind of object it ran on, such as "update project" or "create report", which said nothing to anybody who had not written the app.
- A message after something failed says what did not happen, such as "Could not save the Collection" or "Sync failed". It never shows an error type, an id, the name of a call or what Git wrote.
- A count now reads correctly on its own: "1 Collection" where it is one and "3 Collections" where it is more, rather than one wording for both.

Where each message appears is unchanged, and so is which failure takes you to the error screen. Nothing about your Projects changes, and nothing needs a migration.

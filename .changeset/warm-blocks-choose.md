---
'@elek-io/desktop': minor
---

Open Components as a list beside the one you chose, with its settings laid out like a Collection's.

Components used to be a page of rows, and opening one took you off it to a form of its own. It is now one screen, like Collections and Releases: a list on the left with every Component of the Project, and the one you chose open beside it. Each row says how many Entries use that Component and how many fields it has, so you can tell at a glance which of them a change would reach and which nothing is built from yet. The row you have open is marked, and choosing another one is a single click.

The settings beside it are laid out like a Collection's: the Component's name, its slug and its description, then the fields it defines as editors will see them, with the settings of the field you chose in the pane on the right.

- **The list is in alphabetical order**, by the name you gave each Component, so you find one where you expect it rather than wherever it happens to sit.
- **One Save** for the whole screen, the Component's own fields and the fields it defines alike. While a language is still missing a name, a label or a description, Save says which language misses how many and stays where it is, so you can reach it and read the reason rather than hunting for a button that went away.
- **It asks before changes are lost.** Choosing the next Component in the list, leaving the screen or closing the window with something unsaved asks "Discard your changes to Settings of the Teaser Component?" first. Keep editing changes nothing.
- **Saving keeps you where you are**, with the Component still chosen, instead of dropping you back on the list.
- **Delete Component moved into the More menu** beside Save, where an Entry's and a Collection's already are, and it asks before it deletes. The "Danger Zone" at the end of the page is gone. A Component a Collection or another Component still uses says why it cannot go.
- **Create Component opens that same screen, empty**, beside the list, rather than a page of its own.
- **The Slug field says that it has to be unique** among its rules at the top right, where every other field states its rules, instead of saying it in the sentence below the input.

Nothing about your Projects changes, and nothing needs a migration.

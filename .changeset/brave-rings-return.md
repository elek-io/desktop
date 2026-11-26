---
'@elek-io/desktop': patch
---

Keep the keyboard focus in a list when you take one row out of it.

Removing a row used to drop the focus on the page, because the button you had just pressed went with the row. Working from the keyboard, you then had to tab in from the top of the screen again for every row you wanted gone. The focus now stays in the list you are working in: it goes to the row that takes the removed one's place, else to the row before it, else to the control that adds one, else to the list itself. Where it lands says what it is and carries the focus ring, in light and in dark mode.

Every list whose rows carry their own Remove does it, so all of them behave alike:

- A field of a Collection or a Component, removed from its own pane.
- A field's settings: a select's options, the Collections, Components, blocks, marks, source fields and file types a field allows.
- The Assets and Entries a reference field holds.
- The sections of a page, which already did, and the languages of a Project.

A list, and the row of a select's option, now name themselves to a screen reader as a group, which is what the focus lands on where nothing else can take it. Nothing else about those lists changes, and nothing about your Projects needs a migration.

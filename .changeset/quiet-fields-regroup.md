---
'@elek-io/desktop': patch
---

Keep a Value you are writing when elek.io Desktop reads the same thing again.

Until now, every form filled itself by replacing what it held the moment its data arrived. If that happened while you were writing, which a synchronization does for every Project screen at once, what you had typed and not saved was gone without a word. A form now keeps every field you have changed and takes the new state only for the fields you have not, so a change that arrives beside you never costs you a sentence.

A form you open also appears at once with its fields disabled until its content is there, instead of appearing empty and filling in a moment later. Save stays unavailable for as long as that lasts, so a form cannot be saved before it knows what it holds.

Three smaller things a field got wrong are fixed with it:

- Clearing a date field from its calendar left a Value elek.io Desktop then refused to save, with a message about the field rather than about what you had done.
- West of UTC, a date field's calendar highlighted the day before the one your Entry holds.
- The button that removes one Asset or one Entry from a field now says which one it removes, so a screen reader names it, and it is visible while it has the keyboard focus rather than only under the mouse.

Nothing else about a form changes, and nothing about your Projects needs a migration.

---
'@elek-io/desktop': minor
---

Fill in the Value each section needs when you change a Component's fields.

Changing the type or the rules of a Component's field reaches every section built from it, in every Entry. elek.io Core refuses such a change until each of those sections holds a Value that follows the new field, and a section's Value could be written nowhere: the Entry's editor draws the fields the stored Component holds, and the refused change is the one that would ask for the new Value, so there was no control to fill it in. The way through was to change the field back until the sections were allowed as they were, or to open each Entry and remove the section, which deleted what it held.

The dialog now takes those Values like any other. Each section gets the field as editors see it under its new rules, to fill in without leaving the dialog, and one press carries the change into every section at once. The Value lands in the section whose row you wrote it in, and everything else that section and its Entry hold stays as it was.

Each row says which section it is about, so two sections of one Entry never read alike:

- The field and the Entry, with the Entry's title as a link to it, as the rows of a Collection's change already read.
- Below it the way to the section, from the section outward: "Teaser, section 1 of 3 in Page sections of Blog posts". A section inside another one names every step of the way, such as "Teaser, section 1 of 1 in Cards of Grid, section 2 of 3 in Page sections of Blog posts", because a section's number alone is counted inside the field that holds it and would read the same for both.
- A screen reader reads the whole of it as the row's name, in the words the section's own head uses inside the Entry, so following the link leads to what the row just said.

Where your Project has more than one language, the switch above the rows takes them into another one, because elek.io Core takes the change only once every language holds each Value. The button waits while one is missing and says which language misses how many, as it does for a Collection. Cancel still changes nothing, and a change elek.io Core carries out on its own, such as a looser rule or a new label, still saves with no dialog in the way.

Nothing about your Projects changes, and nothing needs a migration.

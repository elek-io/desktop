---
'@elek-io/desktop': minor
---

Translate an Entry in place, with one switch above its fields, its Collection beside it and its own History on the right.

An Entry now opens in three panes. On the left, every Entry of its Collection, each with its title and when it last changed, with a filter above them and the two ways on at its head: the Collection's settings and a new Entry. In the middle, the Entry itself. On the right, the History of that one Entry, which names the Release each of its changes first went out in, or leaves it unnamed while no Release holds it yet. Close the History and the editor takes its room, and the button in the editor's head brings it back. The next Entry is one click away, and saving keeps you where you are instead of sending you back to a list.

**One switch takes the whole Entry into another language.** Every field used to carry a button that opened a dialog of its own, so translating an Entry of eight fields meant opening eight dialogs and reading each of them next to nothing. Now the switch above the fields sets the language for the whole Entry at once, it stays in the address so coming back opens the language you left open, and no field opens a dialog any more. With more languages than fit side by side the switch is one dropdown instead, which a Project of more than a handful of languages gets at the smallest window.

**What is missing is marked everywhere you look for it.** elek.io Core refuses an Entry until every language of the Project holds each required Value, so Save says which language misses how many rather than offering a save that fails:

- The switch marks each language that misses a Value or holds one that was refused, and says so for a screen reader as well as with the warning mark.
- Choosing that language marks each field that misses its Value, with the Value in the Project's default language below it to translate from, such as "In English: From March 1, the showroom is open until 7 pm on weekdays."
- A row of the list of Entries carries one Missing badge, which is how you find the Entries a language your Project gained has left behind. A screen reader hears what exactly is missing.

**A dynamic field's sections read as the groups they are.** Each section is a ruled group headed by its Component's name and its place in the list, with Move up, Move down and Remove at the right of its head and its own fields inside, errors and missing translations included. Add section lists the Components the field allows. Removing a section leaves the focus on the section that takes its place rather than on the page, so a keyboard keeps its place.

The list of Entries no longer shows a column per field, a page at a time with a column picker above it. It shows one row per Entry and scrolls, which is what leaves room for the Entry beside it.

Nothing about your Projects changes, and nothing needs a migration.

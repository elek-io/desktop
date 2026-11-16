---
'@elek-io/desktop': minor
---

Keep your Assets tidy: a grid of cards, a pane that renames one without touching its file, and a copy you can actually use.

The Assets screen is new. Until now every Asset was a card with four icon buttons on it, and everything you could do with one happened in a dialog: a preview in one, the name and the description in another, the delete confirm in a third.

**The grid.** Your Assets now stand in a ruled grid of four columns, each card with a preview, the file name it is stored under and its type and size. A PDF, an audio file and an archive show an icon of what they are instead of a preview, and a video shows its first frame with a play mark on it. The page head says how many there are, and Filter Assets narrows the grid as you type, by the file name the cards show, so typing `.jpg` leaves the JPGs.

**The pane.** A card opens that Asset beside the grid, and the card it belongs to stays marked while it is open. The pane holds its preview, its type and size, its Name with the file's extension after it, its Description, Replace file, Save a copy, Save, and Delete Asset in its More menu. Which Asset is open is part of the address, so the back button walks through the Assets you looked at.

**A name and a description without a new file.** Saving the pane changes the two of them and leaves the file alone. Replace file picks the new file and waits for Save, so nothing is replaced until you say so, and the name you gave an Asset survives a replacement.

**Add Asset** opens the system's file dialog and then the pane for the file you picked, with its name filled in from the file and the description still to write. Save adds it. The Asset picker of a field has Add Asset beside its filter too, so a file you forgot to add does not send you to another screen: it asks for the name and the description in a dialog there, and what you add stands in the grid you were choosing from.

**Save a copy** offers the Asset's own name with its stored extension, once and whole, and the dialog offers that one type. Until now it offered no type at all, so a JPG could be saved as a `.png`.

**Deleting** moved into the More menu beside the Asset's name, and its confirm names the Asset and says the file goes for everyone on the Project once you sync. An Asset an Entry still uses stays where it is and says why it cannot go. After a delete the keyboard focus stays in the grid, on the card that took the deleted one's place, so you can delete several without tabbing in from the top.

**Save says what is missing.** elek.io Core needs both a name and a description, so Save is blocked with the reason while either is empty, and leaving the pane, opening another Asset or leaving the screen with something unsaved asks before it is lost.

Nothing about your Assets changes, and nothing needs a migration.

---
'@elek-io/desktop': patch
---

Draw every control, menu, dialog, field and header the size and the color the design asks for.

The redesigned screens were measured against the design they were built from, and everything that had drifted from it is corrected. The parts every screen shares are what changed, so the whole app reads the same way:

- Every button, input, select and search field is a step shorter, and none of them carries a shadow any more. A control is as tall as the design draws it, and the app no longer looks heavier than it is.
- A selection is never cyan. A ticked checkbox, a chosen option and a switch that is on are drawn in the text color, and cyan is kept for the one button a screen is about, the focus ring and a link. A switch that is off is an outlined track with a small gray knob instead of a filled gray bar, so it reads as off rather than as a color.
- A field that was refused shows its border in the error color and nothing else, where it used to add a red halo around it.
- Menus and dialogs take the same 8 px corners, hairline border and shadow. A menu opens a little further below its button, and a dialog no longer carries a cross in its corner: every dialog says what its buttons do, and Cancel or Close is one of them.
- A dialog's title, the line below it, and every field's description and error are set in the sizes the design gives them, so a dialog no longer shouts and a field's description no longer competes with its label.
- The header shows only steps that open something. "Collections" and "Update", which opened nothing, are gone, and the Entry you are editing is the last step. That step is the page you are on rather than a link, and a title too long for the header is cut with an ellipsis instead of pushing the trail onto a second line over the screen. Its whole name stays there for a screen reader and appears when you point at it.
- Back and forward are two separate buttons again, and the user button shows your name beside a round avatar instead of your name and your email address in two lines.
- Help lists the versions of Desktop, Core, Electron, Chromium and Node in tighter rows, each version in the monospace typeface and without a "v" in front of it.
- The Project's navigation stands its rows directly on each other, its Collections label is lighter and closer to the first Collection, and the open row keeps the hairline that sets it apart from the ground in light mode.
- A chosen Asset or Entry fills the width of its field instead of shrinking to its content, each with a preview or an icon of the same size, and so does the markdown editor. An Entry says which Collection it comes from by that Collection's own name, so "Team" rather than "Team member".
- The Entry picker lists the Entries a field allows as ruled rows across the dialog, and the Asset picker is as wide as its four columns of previews need, where it used to squeeze four cards into a narrow dialog and cut every name. The filter stands above the list in both of them rather than scrolling away with it, and what you chose is marked by its own checkbox or radio button.
- A slug is set in the monospace typeface, like every other value that is code.
- A pane that cannot be read says so in gray with a smaller Try again, so the sentence reads as a state rather than as content.

Nothing about your Projects changes, and nothing needs a migration.

---
'@elek-io/desktop': patch
---

Open an Entry whose rich text holds bold or italic text, instead of an empty field.

A rich text field that held bold or italic text came back empty, with "The content could not be read from the editor" under it in red, whether you had written the text in the editor or it was already in your Project's files. Everything else in that field was gone from the screen with it, and saving the Entry then stored the empty field in place of the text.

The cause was a Milkdown plugin that reads which character an author typed around bold text, `*` or `_`. It reads that out of the markdown text the content was parsed from, and your content is never parsed from text: elek.io Core stores rich text as a tree of its own, so there was nothing for it to read. It is gone now. Nothing is lost with it, because Core stores no such character either, so bold text has always come back as `**` once it was saved.

Every format the editor's toolbar writes now opens the way it was saved: bold, italic, inline code, strike-through, a link, a heading, a quote, a bullet and a numbered list, a code block, a table, a dividing line, and a referenced Asset or Entry. A field that combines several of them opens with all of them, and saving an Entry you only reopened stores exactly what it held.

**A Value elek.io Desktop cannot read is kept rather than replaced.** Rich text written by a later version of elek.io, by another tool or by hand can hold something this editor has no way to show. The field then says "Desktop can't show this text. It stays saved as it is.", takes no edit, and keeps what is stored: clicking in it, typing, leaving it or saving the Entry no longer replaces the text with an empty field. Saving says in the field's own words that it cannot take what is in it, and the cause goes to the log file rather than onto the screen, where it used to appear as the message of whatever had failed inside.

Nothing about your Projects changes, and nothing needs a migration.

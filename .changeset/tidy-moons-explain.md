---
'@elek-io/desktop': minor
---

Say what a field needs when it refuses a Value, instead of what the validator wrote.

A Value a field would not take is explained below that field in words you use. Until now you were shown the validator's own text, such as "Too small: expected array to have >=1 items" under a field you left empty, or "Invalid input: expected string, received null" under one that needs filling in. Both named a type, a comparison and an internal measure, and neither said what to do.

Every field of an Entry says it now, and the same case reads the same everywhere:

- A Value that is missing says "Fill in this field.", whether the field holds text, a number, a date, rich text, or Assets and Entries to choose.
- A length says "Use at least 3 characters." or "Use up to 200 characters.", and a field that takes several Assets, Entries or sections says how many it needs at least.
- A number says "Use 2 or more." and "Use 8 or less.".
- A format says what it takes, with an example: an email address, a web address, an IPv4 address and a phone number with its country code. A date and a time ask you to choose one.
- A slug says which form it needs, naming the slug to use, and text nothing can be made of says to use letters or numbers.
- A rich text field says how many blocks it needs at least or takes at most, and an Entry it links to that its Collections do not cover says to point it somewhere else.

Every one of these sentences comes from the message catalog, so each language gets its own, with its own plural forms. A refusal elek.io Desktop has no words for says one sentence of its own rather than passing the validator's text on.

A field also says it where only a part of its Value was refused, such as the blocks of a rich text field or one of the Entries a field links to. Pressing Save used to do nothing at all in those cases, with nothing on the screen to say why.

A Collection's and a Component's settings still show the validator's words where elek.io Core refuses a field you are defining. The rebuild of those screens carries them over.

Nothing about your Projects changes, and nothing needs a migration.

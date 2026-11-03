---
'@elek-io/desktop': minor
---

Say what a field needs when it refuses a Value, instead of what the validator wrote.

A Value a field would not take is explained below that field in words you use. Until now you were shown the validator's own text, such as "Too small: expected array to have >=1 items" under a field you left empty, or "Invalid input: expected string, received null" under one that needs filling in. Both named a type, a comparison and an internal measure, and neither said what to do.

Every field says it now, and the same case reads the same everywhere:

- A Value that is missing says "This field needs a Value.", whether the field holds text, a number, a date, rich text, or Assets and Entries to choose.
- A length says "Use at least 3 characters." or "Use up to 200 characters.", and a field that takes several things says how many it needs at least and takes at most.
- A number says "Use 2 or more." and "Use 8 or less.".
- A format says what it takes, with an example: an email address, a web address, an IPv4 address, a date, a time and a phone number with its country code.
- A slug says which form it needs, naming the slug to use, and text nothing can be made of says to use letters or numbers.
- An Entry a field no longer takes says which field it is about and to choose another one.

Every one of these sentences comes from the message catalog, so each language gets its own, with its own plural forms. A refusal elek.io Desktop has no words for says one sentence of its own rather than passing the validator's text on.

A Collection's and a Component's settings still show the validator's words where elek.io Core refuses a field you are defining. The rebuild of those screens carries them over.

Nothing about your Projects changes, and nothing needs a migration.

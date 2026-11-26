---
'@elek-io/desktop': patch
---

Show every keystroke of a long Entry at once, and every toggle in the state it was saved in.

Writing in a long Entry is as quick as writing in a short one. A page like a site's home page, with hundreds of fields across its sections, shows each letter as it is typed, in the Title and in a section's field alike. A keystroke redraws the field being typed in, and the rest of the screen only where something on it changes. What is missing follows the keystroke that changes it: the mark on the field, the line under Save that names the language and how many Values it misses, and the marks on the language switch above the fields.

A toggle opens in the state it was saved in, and announces that state to a screen reader. That holds in every language and however the Entry was opened: from the list of Entries, by its address, after a reload, and inside a section. One click turns a toggle to its other state, and Save stores the state the toggle shows, in the language on screen. The switches of a Collection's settings open as saved as well, so a toggle field whose Default value is on reads on there.

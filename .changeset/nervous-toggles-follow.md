---
'@elek-io/desktop': patch
---

Show every keystroke of a long Entry at once, and every toggle in the state it was saved in.

Writing in a long Entry is as quick as writing in a short one. A page like a site's home page, with hundreds of fields across its sections, used to lag behind every key: each keystroke redrew the whole Entry, so a letter took about a tenth of a second to appear in the Title and in a section's field alike. Now only the field being typed in is redrawn, and the rest of the screen when something on it changes. What is missing still follows the keystroke that changes it: the mark on the field, the line under Save that names the language and how many Values it misses, and the marks on the language switch above the fields.

A toggle now opens in the state it was saved in. Opening an Entry from the list of Entries drew a toggle off however it was stored, and said so to a screen reader too: an Entry with "Show featured blog article" on read as off. Only the stored state was still right, so the site showed one thing and elek.io Desktop another. Clicking such a toggle saved nothing either, because the state it switched to was the one already stored, so it took a second click, which then stored the opposite. One click now turns a toggle to its other state, and Save stores the state the toggle shows, in the language on screen. The switches of a Collection's settings open as saved as well, so a toggle field whose Default value is on reads on there.

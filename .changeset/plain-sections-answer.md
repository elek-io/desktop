---
'@elek-io/desktop': minor
---

Ask before a field change deletes what your Entries hold, and fill in the Values it needs right there.

Changing the fields of a Collection or a Component can delete Values your Entries hold, or leave Entries without a Value they now need. elek.io Core refuses such a change rather than carrying it out, and until now the app only said that nothing was saved and listed the Entries it could not reach by their internal ids, with nothing you could do about it but put your changes back.

Saving now opens one dialog that says what the change would do and lets you answer it:

- **Lost when you save** names each Value that would go, by the Entry's own title and the field, with the Value struck through and "Would be lost" read out beside it. Every title is a link to that Entry, so you can look before you decide.
- **Needs a Value** shows the field as editors see it under its new rules, one per Entry that needs one, to fill in without leaving the dialog. A field still without a Value says "Missing, so the changes can't be saved yet", and the button waits for it, as Save does. Where your Project has more than one language, a switch above those fields takes them into another one, because a Value is needed in each.
- **The red button names the loss**, such as "Remove Published on from 3 Entries", and nothing at all is written until you press it. **Cancel changes nothing**, and a change elek.io Core carries out on its own, such as a renamed label or a looser rule, still saves with no dialog in the way. Without a loss, the button is the usual Save.

Opening an Entry from the dialog keeps the settings you had not saved, so you come back to them as you left them and can press Save again. Leaving the page any other way still asks first.

A Component's field change is answered the same way for what it would delete. The Entries whose sections need a Value are listed by their title with a link each, their section and their Collection, and such a Value cannot be filled in yet, in the dialog or in the Entry, so the dialog says so and names what you can do instead: change the field until the sections are allowed as they are, or open an Entry and remove the section.

The dialog shows what elek.io Core's refusal names and sends back what elek.io Core takes, so what you see is what will happen. Of an Entry, only the Value that would be deleted ever leaves the part of the app that reads your files, and nothing else it holds does.

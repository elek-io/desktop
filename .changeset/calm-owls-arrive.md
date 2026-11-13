---
'@elek-io/desktop': patch
---

Open a rich text field as one text box rather than two.

Opening an Entry with a rich text field showed that field twice for a moment: one box above the other, the upper one not yet taking edits. It happened as the field's stored Value arrived, because the editor was built again the moment the form started taking edits, and the box it replaced stayed on the screen until it had finished closing down. A screen reader landing in between found two text boxes with the same name.

The editor is now built once and reads what changes while you work through the field itself, so there is one box from the moment the Entry opens.

---
'@elek-io/desktop': minor
---

Show a select's options as a list, an Asset or an Entry field as what it holds, and a markdown button as pressed while its format is on.

A select field shows its options as radio buttons, so you read them all without opening anything. A field whose Value may stay empty leads the list with None. A list longer than seven options becomes a dropdown with a filter instead, because a list of 86 is not a list to read. What a select saves is unchanged.

An Asset field shows the Asset it holds as a row with its preview, its name, its type and its size, and Replace and Remove beside it. With nothing in it, it says so and offers Choose. An Entry field lists each Entry it holds with its title and its Collection, and Remove, then Choose while it allows another. Until now both showed one button that said "Select Assets" or "Select Entries" and a grid of thumbnails above it, with no way to tell which Asset a field held apart from its picture.

Choose and Replace open a dialog with a filter, which lists the Assets as a grid or the Entries the field allows as rows. Each carries a radio button where the field takes one and a checkbox where it takes several, so you can see what is chosen before you commit to it, and Cancel leaves the field as it was. The line below its title says what the field takes and how many you have chosen, such as "Images only. Up to 2 Assets. 1 chosen.", in words rather than in file types. The field's maximum holds inside the dialog: once you have chosen as many as the field takes, the rest are out until you untick one. The markdown editor's Reference an Asset and Reference an Entry are the same dialogs with one choice.

A field that points at an Asset or an Entry that is no longer there says so in that row, with Remove beside it, instead of reading as if it held nothing. A synchronize can leave such a field behind, when somebody else removed what it points at, and elek.io Core refuses to save it until you take the reference out or point the field at something else. Until now the field looked empty while it still held the reference, and where it takes a single Asset it showed no button at all, so there was no way to save that Entry again.

A markdown toolbar button whose format is on shows as pressed, with a surface and a ring rather than color alone, so you can tell whether the text under the cursor is already bold, italic, code or struck through, and with nothing selected it says what the next thing you type will be. Every toolbar button now works from the keyboard too, where before only the mouse reached them.

A screen reader now hears what an Asset, an Entry or a markdown field needs from the element it lands on. Every Choose, Replace and Remove button says which field it belongs to, such as "Replace Cover" or "Remove Mara Klein from Authors", and the two that fill a required field say that as well. The markdown editor's own text box carries its field's name, that it is required, its description and its error, which it carried nowhere before, so a required markdown field used to be silent about being required and about what it refused.

Nothing about your Projects changes, and nothing needs a migration.

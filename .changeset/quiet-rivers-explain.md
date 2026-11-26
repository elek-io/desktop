---
'@elek-io/desktop': minor
---

Read the History in one column, with the words that changed struck through and underlined where they stand.

The History used to show a change as the whole form twice, side by side: Before on the left and After on the right, each a disabled copy of the editor, with nothing marking what was different between them. Finding what somebody had changed meant reading both forms and comparing them line by line, and at the width two forms share each of them had about 300 px.

It is one column now. The list of changes stands on the left, and the change you chose beside it shows the Entry, the Asset or the Project once, read rather than edited and laid out like its own editor, with what changed marked in place.

- **A changed field says so**, with the bar on its left and "Changed" right after its label, so you see which fields a change touched before you read any of them.
- **Inside the field, the words that went are struck through and the words that came are underlined.** The strike and the underline carry it, so nothing is told by a color alone.
- **A Value that is not text is marked whole**: a toggle, a date or a choice shows the old Value struck through beside the new one underlined. A field that points at Assets or Entries shows the rows its own editor shows, each with its preview or its Collection's icon, so a change there says which file or which Entry took the other's place.
- **A change opens on the language it happened in** and says how many Values changed there, such as "1 Value changed in German". The switch above the fields takes it into another language, and Open Entry opens the Entry in the language you were reading.
- **An Entry somebody added shows without marks**, because everything in it is new, and one somebody deleted shows the state it was last in.
- **The head of a change names what changed** and says below it what it is, who changed it, how long ago that was, and whether it is synced, in place of the "update entry" it used to read. The breadcrumb above it names it too.

The list beside it is the ruled rows every other list of the app has.

- **Each change is listed once**, saying who made it, what they did, the Entry or the Collection it was about, and when. A change that deleted something names it too, as it was last called. The one you have open is marked.
- **With a Git repository the rows are grouped into Not synced and Synced**, a hollow marker for a change that has not reached the repository yet and a filled one for a change that has. Not synced holds as many changes as the Project card beside it counts as not synced.
- **Without a Git repository, and while the app cannot reach one**, the changes are listed without the groups. They are on this computer either way, so the History never stops showing them because a repository stopped answering.
- **A Release is marked in the brand color**, the only color the list uses, and its marker arrives the way the period of the elek.io mark does, unless you asked your system for less motion. Opening it shows its version, its bump and what it published, the way the Releases screen shows a Release.

A changed Collection and a changed Component still show as the two states side by side.

Nothing about your Projects changes, and nothing needs a migration.

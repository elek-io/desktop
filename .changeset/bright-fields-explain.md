---
'@elek-io/desktop': minor
---

Say what every field needs before you save, and explain a refused Value below the field it belongs to.

Each field now states its rules at the top right of its label, such as "Required, up to 200 characters", "Required, unique" or "Required, images only". They move below the label when they do not fit beside it, and a screen reader reads them out with the field. A toggle and a slider show none, since they always hold a Value, and so does a switch a field type leaves you no choice about, such as the Unique switch of a slug. Until now the app marked what is optional instead, with a " - optional" suffix, so a field you had to fill was one you could only tell by the absence of that suffix, and no hand-written form said anything at all. Create Project, a Project's settings, Version control, a Collection's and a Component's settings, the Asset form, the Profile, the markdown editor's link dialog and each field's own settings all say it now, and every rule comes from elek.io Core, so what a field shows is what Core will accept.

Three refusals that used to interrupt you now stand below the field they are about, in the section and the language they happened in:

- A Value another Entry of the Collection already holds, where a unique field asks for one of its own. It used to open a dialog that did not say which field it meant.
- A reference to an Asset or an Entry that is no longer there, which someone else may have removed while you were writing. It used to replace the screen with the error screen.
- An Asset of a type the field does not take, which happens when the field was narrowed after the Entry was written.

A number field keeps its decimals. A price of 19.99 used to be saved as 19, without a word about it.

No input shows placeholder text any more, since it makes an empty field look filled and rarely says anything the label does not. A filter is the one exception and keeps its name inside itself, above a list and inside a picker's popup, because no label stands above it.

Two fields side by side now stack when the area they sit in is too narrow for them, each measured against that area rather than against the window.

Nothing about your Projects changes, and nothing needs a migration.

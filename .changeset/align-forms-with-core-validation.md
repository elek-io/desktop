---
'@elek-io/desktop': patch
---

Make Core the single validator for every form, and fix the mismatches found by cross-checking each form against Core's field definitions.

Entry reference fields could not be saved at all: the stored reference was missing the `collectionId` Core requires, and a cast hid it from the type checker. References now carry the collection of the selected Entry, and an end-to-end test drives the picker so the write path stays covered.

Field-definition authoring now matches what Core accepts. Types whose required or unique flag is fixed (a range is always required, a number, reference, markdown or slug field can never be unique) lock those switches instead of offering a choice that Core would reject, and a unique field can no longer be given a default value. Deleting a field also clears it from any slug field that used it as a source. Asset reference fields and markdown asset references can now be restricted to file types, and the picker only offers allowed types. Markdown heading depths are limited to the configured set while typing, not only in the toolbar.

A Field's description is optional, as Core defines it, so a Field can be added without one. An empty description is stored as no description rather than an empty string Core rejects, and a description filled in one language must be filled in all, matching Core's rule.

Read-only fields are now fully read-only. A disabled date, datetime or slug field can no longer be changed through its calendar or regenerate button, and a slug is not rewritten when its source fields change.

Collections validate every project language on the field itself, so a Collection written before a language was added surfaces the missing translation in place rather than failing on save. A collection slug already used by another Collection is shown in a dialog instead of taking over the screen. Removing a project language now warns first, since Core applies the change without checking for content that still uses it.

Updates `@elek-io/core` to 0.22.0, which moves the unique-and-default rule onto each field schema, reports language errors on the correct nested field, and requires a project's default language to be one of its supported languages. With Core enforcing these, the renderer's own compensating refinements and pre-seeding are removed, so the app no longer validates anything Core does not.

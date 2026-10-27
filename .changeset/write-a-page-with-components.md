---
'@elek-io/desktop': minor
---

Write a page's sections with Components, and open an Entry that holds them.

A Project now has Components, reached from its sidebar. A Component is a group of fields an Entry can hold more than once, in any order, which is what the sections of a page are. You create one, give it a name and a slug, add its fields, and change or delete it later. A Project with none says so and offers to create the first.

A Collection's field can then allow Components. The Add Field picker offers the dynamic type, where you choose which Components may be added as a section and how few or how many sections an Entry has to hold. Choosing none allows every Component of the Project.

In an Entry, such a field is the list of that page's sections. Add section offers each Component the field allows, by name. A section holds that Component's own fields, and it can be moved up, moved down or removed. An Entry with no section yet says so.

Opening an Entry of a Collection that already held such a field used to fail with an error screen, however the field got there. It opens now.

What a Component change reaches is said before you save it: which Collections use it and how many of their Entries hold a section built from it. elek.io Core carries the change into every Entry that holds the Component and saves the lot as one change, so nothing is left half done.

When a change cannot be carried out, nothing is saved and the Component is exactly as it was:

- Taking out a field that Entries have written in would delete what they hold, so the save is refused and each Entry that would lose something is named. Accepting such a loss is not possible in elek.io Desktop yet, so put the field back for now.
- Adding a required field with no default value needs an answer for every Entry that already exists, which is not possible yet either. Give the field a default value, or leave it optional.
- A slug another Component already uses is said below the Slug field.
- A Component cannot use itself, directly or through another Component, and the screen says so rather than failing.
- A Component a Collection or another Component still uses cannot be deleted. Take it out of the fields that allow it first.

A field still cannot be changed after it was added, to a Collection or to a Component, and both screens now say so where you add one, so you can check its label and slug first. A Component holds no slug field, and none of its fields can be unique, so neither is offered. Fields are reordered by dragging or with the Move up and Move down buttons, so a reorder no longer needs a mouse.

Every change to a Component shows in the Project's History, laid out like its own screen, read-only.

---
'@elek-io/desktop': minor
---

Reach every part of a Project from one sidebar, with how many things each part holds.

The Project's sidebar now lists every screen of the Project and every Collection in one place: the Dashboard, Assets and Components, then your Collections by their own plural names, then the History, Releases and Settings. A rule ends the Collections, so the three below them do not read as one. Until now the Collections had a second sidebar of their own, 296 px wide, which only appeared once you were already inside Collections and left the Entries of a Collection with the rest of the window.

Assets, Components, every Collection and Releases say how many things they hold, counted by elek.io Core. A number follows what you do straight away: add an Entry and its Collection counts it, delete an Asset and Assets counts one fewer, without reopening the Project. A long Collection name is cut rather than pushing its number out of the row, and a screen reader reads a Collection's number as "3 Entries" rather than as a bare number.

Create Collection is a button on the Collections label, so the first Collection of a Project is one click away from wherever you are.

A search field stands below the Project, disabled, because elek.io Core cannot search across a Project yet. It says "Search comes later" rather than only looking unavailable, shows no shortcut it does not have, and a screen reader reaches it and hears that it is disabled. Every filter inside a screen, such as Filter Blog posts, works as before.

The navigation keeps every row at its full height at the smallest window elek.io Desktop supports and scrolls instead of squeezing them, and a hairline at its top or bottom edge says that the list continues past it. The screen you are on is marked by the surface it takes, and a screen reader says it is the current page. The rows stand 2 px apart, so the screen you are on and the row under the pointer never read as one.

Nothing about your Projects changes, and nothing needs a migration.

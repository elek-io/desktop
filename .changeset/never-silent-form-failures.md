---
'@elek-io/desktop': patch
---

Make a blocked save say why instead of doing nothing.

A validation error that landed on a Collection's Fields rather than on one of the form's own inputs had nowhere to appear, so pressing Save simply did nothing. The Fields area now reports such an error, and any form whose save is blocked by a problem no field shows says so on the form itself rather than leaving the button looking broken. A failure raised after a save was already under way now reaches the error screen instead of being dropped.

Markdown fields are now read-only where the rest of the form is. In the history and diff views the editor could still be typed into and did not look disabled, because turning a form read-only only reaches ordinary inputs and the markdown editor is not one.

An unexpected failure on a page that handles some errors in place is logged and reported again. Silencing was applied to the whole page rather than to the specific errors it handles, so anything unforeseen lost its log entry and its notification on the way to the error screen.

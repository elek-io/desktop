---
'@elek-io/desktop': patch
---

Add an end-to-end Playwright test suite and the fixes it surfaced.

Errors from Core now carry their type across IPC, so the renderer handles the ones it can act on in place and lets the rest reach the root error boundary. Force-deleting a project with local changes and resolving a sync conflict now show a specific message per reason, and the Core origin stack survives the trip across IPC. The error boundary shows the decoded stack instead of the raw sentinel.

Accessibility: buttons default to type "button" so they no longer submit their form by accident, forms carry explicit ids so a submit button placed outside the form still targets it, and native validation is replaced by zod through react-hook-form. Single-language translatable fields regained their id, aria-describedby and aria-invalid, and back and forward navigation got proper labels.

Hardening: the custom file protocol rejects path traversal and symlink escapes, long paths no longer overflow the Windows 260 character limit, and IPC handlers are registered before the renderer loads so early calls cannot race.

Fixes: the entry table pagination total is correct and no longer strands an empty last page, the dialog footer stays visible while a long body scrolls, and deleting a collection warns before it cascades to its entries or explains why a delete is blocked.

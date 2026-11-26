---
'@elek-io/desktop': minor
---

Take every color, corner, shadow and type role from elek.io's brand package, and show the app in Geist.

The app now draws itself from `@elek-io/branding`, the package elek.io publishes its design from, instead of from a copy of those values it kept. Text is set in Geist and code in Geist Mono, where it used to be Montserrat and Roboto, and every interface icon is a Lucide icon. A Git host's logo stays its own brand's. The installers carry elek.io's app icon, which they did not before, and so does the window the app opens.

Three things are now visible that were not:

- A label on a button reaches 4.5:1 against its fill in light and in dark mode, which WCAG 2.2 AA asks for. So do red text and the text you type in a field. The fill of a primary button goes from cyan-600 to cyan-700 for it, and red text that was the color of a red button is now its own, darker red.
- Focus is a 2 px ring at full opacity, 2 px outside whatever you are on. The ring before was 50% opaque and reached 1.86:1 on white.
- A chosen segment of a segmented control, such as Report a bug next to Share feedback, carries a ring as well as a surface, so the choice does not rest on color alone.

Every interface component was rebuilt from the current shadcn/ui on Base UI, which adds radio buttons, checkboxes, toggles and a spinner for the screens that come next. Every window, dialog, form and list behaves the way it did.

Nothing about your Projects changes, and nothing needs a migration.

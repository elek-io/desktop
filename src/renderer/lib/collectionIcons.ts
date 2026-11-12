// The icons a Collection can be given.
//
// Core takes any icon name Lucide ships and holds no list of them, so which
// names a Collection is offered is the app's own answer. These two are what
// Core used to allow and what every stored Collection carries, see
// contributing/not-yet-implemented.md.

/* eslint-disable lingui/no-unlocalized-strings -- Lucide's own icon names,
   which Core stores as they are written and nobody reads as words. */

/** Every icon name a Collection is offered, in the order they are offered. */
export const COLLECTION_ICON_NAMES = ['home', 'plus'] as const;

/** The icon a Collection starts with, which is the first one offered. */
export const DEFAULT_COLLECTION_ICON: string = 'home';

/* eslint-enable lingui/no-unlocalized-strings */

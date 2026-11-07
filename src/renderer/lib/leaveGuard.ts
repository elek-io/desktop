/** Where a navigation starts or ends, of which the guard reads one thing. */
interface GuardedLocation {
  pathname: string;
}

/**
 * Whether a navigation leaves the page a form is on, which is what the guard
 * asks about.
 *
 * The route is compared and not the whole address. Every push and replace runs
 * the router's blockers, a change of nothing but the search params included,
 * and a form keeps the language it edits there, so comparing the address would
 * ask to discard changes for switching a language on the same page. Opening
 * another Entry is a different route, so it is still asked about.
 *
 * See contributing/renderer/forms.md.
 */
export function isLeavingThePage({
  current,
  next,
}: {
  current: GuardedLocation;
  next: GuardedLocation;
}): boolean {
  return current.pathname !== next.pathname;
}

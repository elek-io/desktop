import { expect, test } from '@playwright/test';

import { isLeavingThePage } from '../../src/renderer/lib/leaveGuard.js';

/**
 * Which navigations count as leaving the page a form is on, which needs no
 * window.
 *
 * The router runs its blockers on every push and replace, a change of nothing
 * but the search params included, and a form keeps the language it edits
 * there. No route of the app takes a search param yet, so the cases are driven
 * here rather than through a screen. That a real navigation ends in the
 * question is what the unsaved changes spec drives, in the app.
 */
test.describe('The leave guard', () => {
  test('counts a change of the route and nothing else', () => {
    const entry = '/projects/1/collections/2/3/update';

    // Another route, which is what takes the form off screen.
    expect(
      isLeavingThePage({
        current: { pathname: entry },
        next: { pathname: '/projects/1/collections/2' },
      })
    ).toBe(true);
    // Another Entry, which is the same route with other parameters and still a
    // different page.
    expect(
      isLeavingThePage({
        current: { pathname: entry },
        next: { pathname: '/projects/1/collections/2/4/update' },
      })
    ).toBe(true);

    // The same page. A language the form edits lives in the search params, so a
    // navigation that changes nothing else leaves the page open, which the
    // router reports as the same pathname.
    expect(
      isLeavingThePage({
        current: { pathname: entry },
        next: { pathname: entry },
      })
    ).toBe(false);
  });
});

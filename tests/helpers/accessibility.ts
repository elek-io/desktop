import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Assert the current page has no axe accessibility violations.
 *
 * The opt-in per-route counterpart to the fixture-wide scan, which runs on every
 * passing test but does not assert yet (see testing.md). A route is added here
 * once it is clean, chipping away at the deferred fixture-wide assertion.
 *
 * Legacy mode is required, since otherwise axe opens a blank aggregation page via
 * `context.newPage()`, which Electron does not support. On failure the rule ids
 * are surfaced through the assertion, so a violation is debuggable at a glance.
 *
 * Pass `disableRules` to scope out a rule a route does not pass yet, so it can
 * still enforce every other rule ahead of the full assertion. Omit it to assert
 * against every rule, which every route here does.
 */
export async function expectNoAxeViolations(
  page: Page,
  options: { disableRules?: string[] } = {}
): Promise<void> {
  let builder = new AxeBuilder({ page }).setLegacyMode();
  if (options.disableRules !== undefined) {
    builder = builder.disableRules(options.disableRules);
  }
  const { violations } = await builder.analyze();
  expect(violations.map((violation) => violation.id)).toStrictEqual([]);
}

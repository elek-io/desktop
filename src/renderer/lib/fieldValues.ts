// How the text somebody types in a control becomes the content a Value holds.
// Core validates tightly, so these contracts are easy to get subtly wrong:
// every nullable Value refuses an empty string, and a numeric control answers
// with a number rather than its digits.
//
// See contributing/renderer/forms.md.

/**
 * An empty input as the `null` Core's nullable schemas expect, rather than an
 * empty string, which they refuse.
 */
export function textFromInput(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/**
 * The typed text as it is.
 *
 * For the handful of keys Core declares as a plain, non-nullable string, such
 * as a field definition's slug or a select option's value, where an empty input
 * is an empty string rather than `null`.
 */
export function rawTextFromInput(value: string): string {
  return value;
}

/**
 * A numeric input's text as the number it holds, or `null` when it is empty.
 *
 * Whole numbers only today, which is what Core's number fields are written
 * with, see contributing/not-yet-implemented.md.
 */
export function numberFromInput(value: string): number | null {
  return value.trim() === '' ? null : parseInt(value);
}

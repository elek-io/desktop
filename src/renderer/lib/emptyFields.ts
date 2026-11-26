import { plural, t } from '@lingui/core/macro';

// What keeps a form of hand-written fields from saving: how many of them are
// still empty, and the one line that says so under Save.
//
// A form whose fields are generated from field definitions says which language
// is missing a Value instead, see components/fields/missing-values.ts. Both
// run without a validator, so either is cheap enough to answer on every
// change.
//
// See contributing/renderer/forms.md#saves-block.

/** Whether a Value a form holds is empty, which is what Core refuses. */
function holdsNothing(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return Array.isArray(value) && value.length === 0;
}

/** How many of the Values a form has to hold are still empty. */
export function countEmptyFields(values: unknown[]): number {
  return values.filter((value) => holdsNothing(value)).length;
}

/**
 * Why the form cannot be saved yet, or `undefined` while it can be.
 *
 * One sentence for every hand-written form, because the answer is the same
 * wherever such a form stands and ci's line under Save has one shape. Which
 * fields a form counts is the form's own, see `countEmptyFields`.
 *
 * Call it during a render, so the words come out of the catalog in use.
 */
export function emptyFieldsReason(missing: number): string | undefined {
  if (missing === 0) {
    return undefined;
  }

  return t`${plural(missing, {
    one: '# field is still empty',
    other: '# fields are still empty',
  })}`;
}

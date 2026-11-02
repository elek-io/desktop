import { plural, t } from '@lingui/core/macro';

import { constraintsAt } from '@renderer/lib/schemaConstraints';

// A field's rules in the words its label shows, such as "Required, up to 200
// characters". ci puts them at the top right of the label, before anybody
// presses Save.
//
// A field type's folder builds its own, from the field definition. A
// hand-written field reads them off the Core schema its form checks against,
// so a limit Core sets is never written out a second time here.
//
// See contributing/renderer/forms.md#the-field-shell.

/** What a field says about itself above its control. */
export interface FieldRules {
  /**
   * Whether the field has to be filled. It leads the words below and reaches
   * assistive tech as `aria-required`, on every control whose role takes it.
   */
  required: boolean;
  /** The rules as the label shows them, the required one first. */
  words: string[];
}

/**
 * The rules of a field, with Required leading them where it holds.
 *
 * Call it during a render: each word is read from the catalog as it is built,
 * so it follows the language in use.
 */
export function fieldRules(parts: {
  required: boolean;
  notes?: string[];
}): FieldRules {
  const notes = parts.notes ?? [];

  return {
    required: parts.required,
    words: parts.required ? [t`Required`, ...notes] : notes,
  };
}

/**
 * A field that always holds a Value, such as a toggle or a slider.
 *
 * Core marks it required, since it can never be empty, so saying so would
 * state a rule nobody can break. Its control carries `aria-required` where its
 * role takes one, as every required field does.
 */
export function alwaysFilledFieldRules(): FieldRules {
  return { required: true, words: [] };
}

/** The one line a field's label shows, or `null` where it has no rules. */
export function fieldRulesLine(rules: FieldRules): string | null {
  const [first, ...rest] = rules.words;

  if (first === undefined) {
    return null;
  }

  // Sentence case, as ci writes every line. The leading word is capitalized
  // wherever it comes from, so a field whose only rule is a limit reads "Up to
  // 2" rather than "up to 2", in any language.
  const led = first.charAt(0).toLocaleUpperCase() + first.slice(1);

  return [led, ...rest].join(', ');
}

/** That a Value may be held by one Entry of the Collection only. */
export function uniqueNote(): string {
  return t`unique`;
}

/** How long a text Value may be, in the words the label shows. */
export function characterNotes(bounds: {
  min: number | null;
  max: number | null;
}): string[] {
  const { min, max } = bounds;

  if (min !== null && max !== null) {
    return [t`${min} to ${max} characters`];
  }
  if (max !== null) {
    return [
      plural(max, { one: 'up to # character', other: 'up to # characters' }),
    ];
  }
  if (min !== null) {
    return [
      plural(min, {
        one: 'at least # character',
        other: 'at least # characters',
      }),
    ];
  }
  return [];
}

/**
 * How many things a Value may hold, such as the Assets a field points at or
 * the sections of a dynamic field.
 *
 * A bound of one is left unsaid: a field that takes one thing shows one row,
 * and Required already says it needs that one. Only a field that takes several
 * has a number worth reading, which is what ci's "Up to 2, from Team" is.
 */
export function countNotes(bounds: {
  min: number | null;
  max: number | null;
}): string[] {
  const { min, max } = bounds;
  // One at least is what Required says, so only more than one is a rule of its
  // own.
  const lowest = min === null || min <= 1 ? null : min;

  if (max === 1) {
    return [];
  }
  return amountNotes({ min: lowest, max });
}

/**
 * What a number Value, or how many of something, may be.
 *
 * One pair of words for both, because a bound on a number and a bound on a
 * count read the same beside a label: the field says what is counted.
 */
export function amountNotes(bounds: {
  min: number | null;
  max: number | null;
}): string[] {
  const { min, max } = bounds;

  if (min !== null && max !== null) {
    return [t`${min} to ${max}`];
  }
  if (max !== null) {
    return [t`up to ${max}`];
  }
  if (min !== null) {
    return [t`at least ${min}`];
  }
  return [];
}

/**
 * The rules the Core schema a form checks against sets for one of its fields,
 * or `null` where that schema cannot say.
 *
 * Read through zod's own API rather than written out here, so a limit Core
 * changes reaches the label without a change in Desktop.
 */
export function fieldRulesFromSchema(
  schema: unknown,
  path: string
): FieldRules | null {
  const constraints = constraintsAt(schema, path);

  if (constraints === null) {
    return null;
  }

  const notes = [
    // A required string carries `min(1)` in Core's schemas, which Required
    // already says, so only a real lower bound is worth a word of its own.
    ...characterNotes({
      min:
        constraints.minLength === undefined || constraints.minLength <= 1
          ? null
          : constraints.minLength,
      max: constraints.maxLength ?? null,
    }),
    ...amountNotes({
      min: constraints.minValue ?? null,
      max: constraints.maxValue ?? null,
    }),
  ];

  return fieldRules({ required: constraints.required, notes });
}

import { plural, t } from '@lingui/core/macro';
import { z } from 'zod';

// The words a refused Value is explained in, one sentence per zod issue code,
// read from the message catalog at the moment the issue is raised.
//
// Every schema in the app is Core's, and Core stays the only judge of what is
// valid. What this file changes is the sentence, never the verdict: zod's own
// English ("Too small: expected string to have >=3 characters") names a type, a
// comparison and an internal measure, none of which an editor asked about.
//
// `setRefusedValueWords` installs it as zod's global `customError`, which every
// schema the renderer parses with reads, Core's generated ones included,
// because the renderer loads one copy of zod.
//
// One refusal it cannot reach: an issue Core raised with a message of its own.
// zod lets a message that arrives with the issue outrank every error map, so
// the field type such a refusal lands on words it instead, see
// `FieldTypeModule.coreRefusalText`.
//
// See contributing/renderer/internationalization.md and
// contributing/renderer/dynamic-form-field-generation.md.

/**
 * Nothing where the field has to hold something.
 *
 * The map is global, so this sentence also stands under a field of Create
 * Project, of a Project's settings and of Add Asset, none of which holds a
 * Value. So it names neither a Value nor what the field holds, and says what
 * to do instead.
 */
function nothingThereText(): string {
  return t`Fill in this field.`;
}

/**
 * A Value whose shape is not one the field can hold at all.
 *
 * Nothing an editor can type reaches this: every control writes the shape its
 * field type stores. So it says to report it, as the form's own backstop does.
 */
function wrongShapeText(): string {
  return t`This field can't hold what's in it. Please report it, so we can fix it.`;
}

/**
 * The one sentence for a refusal nothing here has words for.
 *
 * It stands for an issue code whose measure is new, and for a refusal Core
 * wrote its own English for that the field type it lands on does not know. So
 * neither zod's nor Core's English ever reaches a field, and a message either
 * of them rewords degrades to this rather than leaking.
 */
export function unknownRefusalText(): string {
  return t`This field can't take that. Change it to save.`;
}

/** The words for a string that is not in the format its field type asks for. */
function formatText(format: string): string {
  switch (format) {
    case 'email':
      return t`Enter an email address, such as name@example.com.`;
    case 'url':
      return t`Enter a web address, such as https://elek.io.`;
    case 'ipv4':
      return t`Enter an IPv4 address, such as 192.168.0.1.`;
    case 'date':
      return t`Choose a date.`;
    case 'time':
      return t`Choose a time.`;
    case 'datetime':
      return t`Choose a date and a time.`;
    case 'e164':
      return t`Enter a phone number with its country code, such as +4930123456.`;
    default:
      return unknownRefusalText();
  }
}

/**
 * One sentence per zod issue code, each taking the issue narrowed to its own
 * code so no entry reads the code again.
 *
 * Exported so the type test can name it rather than writing the mapped type
 * out a second time. Being a mapped type over zod's own union of codes, a code
 * zod adds fails to compile here until it has words, rather than falling
 * through to zod's English.
 */
export type RefusalWords = {
  [C in z.core.$ZodIssueCode]: (
    issue: Extract<z.core.$ZodRawIssue, { code: C }>
  ) => string;
};

const REFUSAL_WORDS: RefusalWords = {
  // What the field holds is not of the type it stores. A Value that is not
  // there is the one shape an editor causes, since Core marks a required
  // field's Value non-nullable rather than counting it as empty, and a control
  // that is left empty answers with `null`.
  invalid_type: (issue) =>
    issue.input === null || issue.input === undefined
      ? nothingThereText()
      : wrongShapeText(),

  // What a Value may be at least, which is a length for text, a count for a
  // list and the number itself for a number. zod leaves the set of measures
  // open, so one Core's schemas never ask for, such as a file's size, falls to
  // the sentence for a refusal nothing has words for.
  too_small: (issue) => {
    const smallest = Number(issue.minimum);

    if (issue.origin === 'string') {
      // Core puts `min(1)` on every required string, so a smallest length of
      // one is how it says the field has to hold something, not a length worth
      // reading out.
      return smallest <= 1
        ? nothingThereText()
        : plural(smallest, {
            one: 'Use at least # character.',
            other: 'Use at least # characters.',
          });
    }
    if (issue.origin === 'array') {
      // The same for a list: Core asks for one item where the field is
      // required, and for more where the field's own minimum says so.
      return smallest <= 1
        ? nothingThereText()
        : t`This field needs at least ${smallest}.`;
    }
    if (issue.origin === 'number' || issue.origin === 'int') {
      return issue.inclusive === false
        ? t`Use more than ${smallest}.`
        : t`Use ${smallest} or more.`;
    }
    return unknownRefusalText();
  },

  /** What a Value may be at most, measured as `too_small` measures it. */
  too_big: (issue) => {
    const largest = Number(issue.maximum);

    if (issue.origin === 'string') {
      return plural(largest, {
        one: 'Use up to # character.',
        other: 'Use up to # characters.',
      });
    }
    if (issue.origin === 'array') {
      return t`This field takes up to ${largest}.`;
    }
    if (issue.origin === 'number' || issue.origin === 'int') {
      return issue.inclusive === false
        ? t`Use less than ${largest}.`
        : t`Use ${largest} or less.`;
    }
    return unknownRefusalText();
  },

  // The format a field type asks of its text, such as an email address. zod
  // leaves the set of formats open, so one it has no words for falls to the
  // sentence above rather than to zod's.
  invalid_format: (issue) => formatText(issue.format),

  not_multiple_of: (issue) => {
    const divisor = issue.divisor;

    return t`Use a multiple of ${divisor}.`;
  },

  // A literal the Value has to carry, such as which Component a section is
  // built from, a key no field declares and a language the Project does not
  // support. None of them is a shape a control writes.
  invalid_value: wrongShapeText,
  unrecognized_keys: wrongShapeText,
  invalid_key: wrongShapeText,
  invalid_element: wrongShapeText,

  // Part of the Value is none of the shapes the field accepts, which a
  // markdown tree holding a block its field does not allow comes out as. The
  // resolver prefers the message of the shortest branch wherever a union
  // carries branches, each of which is worded above, so this stands for one
  // that carries none.
  invalid_union: () =>
    t`This field can't take part of what's in it. Change it to save.`,

  // A rule a schema added itself. Core's own carry their English with them and
  // never reach this, see the note at the top of this file.
  custom: unknownRefusalText,
};

/**
 * The sentence for a code the map above has no entry for.
 *
 * Its parameter is `never`, so a code zod adds is a type error at the call
 * site as well as at the map, and a build that still runs says the sentence
 * for a refusal nothing has words for rather than zod's English.
 */
function unwordedCodeText(_code: never): string {
  return unknownRefusalText();
}

/**
 * The sentence one refused Value is explained in.
 *
 * Dispatch only: every word sits in `REFUSAL_WORDS`, and the switch is what
 * hands each code's entry its own narrowed issue without a cast.
 */
export function refusedValueText(issue: z.core.$ZodRawIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return REFUSAL_WORDS.invalid_type(issue);
    case 'too_small':
      return REFUSAL_WORDS.too_small(issue);
    case 'too_big':
      return REFUSAL_WORDS.too_big(issue);
    case 'invalid_format':
      return REFUSAL_WORDS.invalid_format(issue);
    case 'not_multiple_of':
      return REFUSAL_WORDS.not_multiple_of(issue);
    case 'invalid_value':
      return REFUSAL_WORDS.invalid_value(issue);
    case 'unrecognized_keys':
      return REFUSAL_WORDS.unrecognized_keys(issue);
    case 'invalid_key':
      return REFUSAL_WORDS.invalid_key(issue);
    case 'invalid_element':
      return REFUSAL_WORDS.invalid_element(issue);
    case 'invalid_union':
      return REFUSAL_WORDS.invalid_union(issue);
    case 'custom':
      return REFUSAL_WORDS.custom(issue);
    default:
      return unwordedCodeText(issue);
  }
}

/**
 * Installs the words above as zod's global error map, once, when the renderer
 * starts.
 *
 * `customError` is read when an issue is raised rather than when a schema is
 * built, so every sentence comes out of the catalog that is active at that
 * moment and a change of language reaches the next refusal.
 */
export function setRefusedValueWords(): void {
  z.config({ customError: refusedValueText });
}

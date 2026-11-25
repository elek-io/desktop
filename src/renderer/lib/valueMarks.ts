import { diffWords } from 'diff';

// What changed inside one Value, as the History marks it: removed words struck
// through and added words underlined. The words come from jsdiff, and what a
// Value reads as comes from its field type's `renderValue`.
//
// See contributing/renderer/forms.md#a-value-that-is-read-rather-than-edited.

/** One run of a Value's text, and what happened to it. */
export interface ValueMark {
  text: string;
  /** `null` for a run that stands in both readings of the Value. */
  mark: 'removed' | 'added' | null;
}

/**
 * How long a word diff may run before the Value is marked whole instead.
 *
 * A word diff costs O(n*d) in the number of words and the distance between the
 * two readings, so a long markdown Value that was rewritten can be expensive.
 * jsdiff gives up at this point and answers nothing, which `valueMarks` reads
 * as "mark it whole", so the renderer is never held up by one field.
 */
const WORD_DIFF_TIMEOUT = 250;

/**
 * The old Value struck through and the new one underlined, with nothing in
 * between.
 *
 * It is what a Value that is not text reads as, such as an Asset, a toggle, a
 * date or a choice, where there are no words to compare. A reading that holds
 * nothing is left out, so a Value that was empty before shows the new one
 * alone.
 */
function wholeValueMarks(before: string, after: string): ValueMark[] {
  return [
    ...(before === '' ? [] : [{ text: before, mark: 'removed' as const }]),
    ...(after === '' ? [] : [{ text: after, mark: 'added' as const }]),
  ];
}

/**
 * What changed between two readings of one Value.
 *
 * `readsAsWords` is the field type's own answer, from its folder: a Value made
 * of words is compared word by word, and one that is not is shown as the old
 * Value beside the new one. Both readings come from that type's `renderValue`,
 * so no caller knows how any type reads its Value.
 *
 * Call it during a render. It returns the runs in the order they are read.
 */
export function valueMarks({
  before,
  after,
  readsAsWords,
}: {
  /** What the Value read as before the change, empty where it held nothing. */
  before: string;
  /** What it reads as after it, empty where it holds nothing. */
  after: string;
  readsAsWords: boolean;
}): ValueMark[] {
  if (readsAsWords === false) {
    return wholeValueMarks(before, after);
  }

  const words = diffWords(before, after, { timeout: WORD_DIFF_TIMEOUT });

  if (words === undefined) {
    return wholeValueMarks(before, after);
  }

  return words.map((run) => ({
    text: run.value,
    mark: run.added
      ? ('added' as const)
      : run.removed
        ? ('removed' as const)
        : null,
  }));
}

import { expect, test } from '@playwright/test';

import {
  holdsSameContent,
  valueMarks,
} from '../../src/renderer/lib/valueMarks.js';

/**
 * What the History marks inside one Value, checked without a window.
 *
 * The marks are built from two readings of the same Value and from whether its
 * field type reads as words, neither of which needs the app, so the shapes they
 * meet are driven here. That the readings come from each type's own
 * `renderValue` and reach the screen is what the History spec drives, in the
 * app.
 */

test.describe('What changed inside a Value', () => {
  test('marks a Value of words word by word', () => {
    expect(
      valueMarks({
        before: 'Open until 6 pm on weekdays.',
        after: 'Open until 7 pm on weekdays and until 4 pm on Saturdays.',
        readsAsWords: true,
      })
    ).toEqual([
      { text: 'Open until ', mark: null },
      { text: '6', mark: 'removed' },
      { text: '7', mark: 'added' },
      { text: ' pm on weekdays ', mark: null },
      { text: 'and until 4 pm on Saturdays', mark: 'added' },
      { text: '.', mark: null },
    ]);
  });

  test('marks a Value that is not words whole, old before new', () => {
    // A toggle, a date, a choice or a reference reads as one Value rather than
    // as words, so there is nothing inside it to compare.
    expect(
      valueMarks({ before: 'Off', after: 'On', readsAsWords: false })
    ).toEqual([
      { text: 'Off', mark: 'removed' },
      { text: 'On', mark: 'added' },
    ]);
  });

  test('leaves out a reading that holds nothing', () => {
    // A Value that was empty shows the new reading alone, and one that was
    // emptied the old reading alone, so nothing is struck or underlined that
    // was never there.
    expect(
      valueMarks({ before: '', after: '3 Assets', readsAsWords: false })
    ).toEqual([{ text: '3 Assets', mark: 'added' }]);
    expect(
      valueMarks({ before: '3 Assets', after: '', readsAsWords: false })
    ).toEqual([{ text: '3 Assets', mark: 'removed' }]);
  });

  test('marks a Value whole where the word diff gives up', () => {
    // A markdown Value of a few thousand words, rewritten rather than edited,
    // is what the time the word diff is given exists for: jsdiff answers
    // nothing at all, and the whole old reading then stands struck through
    // beside the whole new one, as a Value that is no words does. Nothing of
    // the two readings is shared, so the diff cannot finish on any machine.
    const rewritten = (seed: string): string =>
      Array.from(
        { length: 4000 },
        (_word, index) => `${seed}${(index * 7919) % 997}`
      ).join(' ');
    const before = rewritten('alpha');
    const after = rewritten('beta');

    expect(valueMarks({ before, after, readsAsWords: true })).toEqual([
      { text: before, mark: 'removed' },
      { text: after, mark: 'added' },
    ]);
  });

  test('marks nothing where both readings are the same', () => {
    expect(
      valueMarks({
        before: 'Spring opening hours',
        after: 'Spring opening hours',
        readsAsWords: true,
      })
    ).toEqual([{ text: 'Spring opening hours', mark: null }]);
  });

  test('tells two states of a Value apart by their content, not their reading', () => {
    // What decides whether a field is marked: a reference Value that points
    // somewhere else reads the same either way, and it still changed.
    expect(
      holdsSameContent(
        { en: [{ id: 'one', objectType: 'asset' }] },
        { en: [{ id: 'two', objectType: 'asset' }] }
      )
    ).toBe(false);
    expect(
      holdsSameContent(
        { en: [{ id: 'one', objectType: 'asset' }] },
        { en: [{ id: 'one', objectType: 'asset' }] }
      )
    ).toBe(true);

    // A Value nested as deep as a markdown tree is compared all the way down,
    // and a Value that was never there is not the same as an empty one.
    expect(
      holdsSameContent(
        { en: { type: 'root', children: [{ type: 'text', value: 'a' }] } },
        { en: { type: 'root', children: [{ type: 'text', value: 'b' }] } }
      )
    ).toBe(false);
    expect(holdsSameContent(undefined, '')).toBe(false);
    expect(holdsSameContent(null, null)).toBe(true);
  });
});

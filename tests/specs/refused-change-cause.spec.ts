import { expect, test } from '@playwright/test';

import {
  parseIpcError,
  serializeCoreError,
} from '../../src/shared/ipcError.js';

/**
 * What of a refused field definition change crosses the IPC boundary, checked
 * without the app.
 *
 * The dialog that answers such a refusal shows the Value the change would
 * delete, so that Value crosses with the ids that say where it sits. Nothing
 * else an Entry holds does, and there is no screen a test could read that on:
 * what is under test is the boundary itself, the one place that decides it.
 * The dialog is driven in `collections.spec.ts` and `components.spec.ts`.
 *
 * The issues are written out as Core raises them, with the keys Core's
 * `docs/schema-changes.md` names, rather than taken from a Core call, since
 * what is asserted is which of them survive the crossing.
 */

/** The Values of the whole Entry, which Core attaches to every issue. */
const transformedValues = {
  title: { objectType: 'value', valueType: 'string', content: { en: 'Home' } },
};

/** One Value a removed field would take with it. */
const lostValue = {
  objectType: 'value',
  valueType: 'string',
  content: { en: 'What ships today' },
};

/** The cause of one refusal, as Core attaches it to its `Conflict`. */
function refusalOf(issues: unknown[]): Error {
  return new Error(
    serializeCoreError('Conflict', 'The update was refused', undefined, issues)
  );
}

test.describe('What a refused field definition change forwards', () => {
  test('forwards the Value it would delete, and where it sits', () => {
    const { cause } = parseIpcError(
      refusalOf([
        {
          entryId: 'entry-1',
          collectionId: 'collection-1',
          fieldDefinitionId: 'field-1',
          fieldSlug: 'subtitle',
          componentItemId: 'item-1',
          issue: 'content_loss',
          reason: 'collections_narrowed',
          currentValue: lostValue,
          itemCount: 2,
          language: 'en',
          transformedValues,
        },
      ])
    );

    // Everything the dialog draws a row from, and the Value it strikes
    // through, which only Core knows for a narrowed field.
    expect(cause).toEqual([
      {
        entryId: 'entry-1',
        collectionId: 'collection-1',
        fieldDefinitionId: 'field-1',
        fieldSlug: 'subtitle',
        componentItemId: 'item-1',
        issue: 'content_loss',
        reason: 'collections_narrowed',
        currentValue: lostValue,
        itemCount: 2,
        language: 'en',
      },
    ]);
  });

  test('forwards nothing else of an Entry', () => {
    const { cause } = parseIpcError(
      refusalOf([
        {
          entryId: 'entry-1',
          collectionId: 'collection-1',
          fieldDefinitionId: 'field-1',
          fieldSlug: 'subtitle',
          issue: 'content_loss',
          reason: 'field_removed',
          currentValue: lostValue,
          transformedValues,
        },
        {
          entryId: 'entry-2',
          collectionId: 'collection-1',
          fieldDefinitionId: 'field-2',
          fieldSlug: 'author',
          issue: 'missing_required',
          // The Value that cannot follow the change, which is answered with a
          // new one rather than shown.
          currentValue: lostValue,
          transformedValues,
        },
        {
          entryId: 'entry-3',
          collectionId: 'collection-1',
          fieldDefinitionId: 'field-3',
          fieldSlug: 'slug',
          issue: 'unique_collision',
          // The colliding text and the Entry that keeps it, which nothing
          // reads either.
          value: 'home',
          conflictingEntryId: 'entry-9',
          language: 'en',
          transformedValues,
        },
      ])
    );

    // The Value a loss would delete is the one Value of an Entry that crosses.
    expect(cause).toEqual([
      {
        entryId: 'entry-1',
        collectionId: 'collection-1',
        fieldDefinitionId: 'field-1',
        fieldSlug: 'subtitle',
        issue: 'content_loss',
        reason: 'field_removed',
        currentValue: lostValue,
      },
      {
        entryId: 'entry-2',
        collectionId: 'collection-1',
        fieldDefinitionId: 'field-2',
        fieldSlug: 'author',
        issue: 'missing_required',
      },
      {
        entryId: 'entry-3',
        collectionId: 'collection-1',
        fieldDefinitionId: 'field-3',
        fieldSlug: 'slug',
        issue: 'unique_collision',
      },
    ]);
    // Said again on the whole message, so a key renamed in Core cannot let the
    // content of every affected Entry through unnoticed.
    expect(JSON.stringify(cause)).not.toContain('Home');
    expect(JSON.stringify(cause)).not.toContain('transformedValues');
  });
});

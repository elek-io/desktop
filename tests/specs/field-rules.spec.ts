import { expect, test } from '@playwright/test';
import { z } from 'zod';

import {
  entryReferenceIssuesOf,
  entryValuePath,
  uniqueValueConflictsOf,
} from '../../src/renderer/lib/entryRefusals.js';
import { constraintsAt } from '../../src/renderer/lib/schemaConstraints.js';

/**
 * What a form reads off a schema, and where a refusal belongs, neither of which
 * needs a window.
 *
 * Both are read in a render of every field, and both answer `null` for
 * something they cannot place, so the shapes they meet are driven here rather
 * than through a screen. That a real Core schema reaches the label is what the
 * forms spec drives, in the app.
 */

test.describe('What a schema says about a field', () => {
  test('reads a bound and a required field through every wrapper', () => {
    const schema = z.object({
      name: z.string().trim().min(1).max(256),
      note: z.string().max(40).nullable(),
      maybe: z.string().optional(),
      amount: z.number().min(1).max(9),
      // A translatable Value, which Core keys by language, and one the object
      // may leave out altogether.
      label: z.record(z.enum(['en', 'de']), z.string().trim().min(1)),
      description: z
        .record(z.enum(['en', 'de']), z.string().trim().min(1))
        .nullable(),
      // What a form holds is a schema's input, and a bound on the other side
      // of a pipe still holds what somebody types.
      message: z.string().pipe(z.string().max(5000)),
      tags: z.array(z.string()).min(1),
      isOn: z.boolean(),
      section: z.object({ headline: z.string().min(2) }),
    });

    expect(constraintsAt(schema, 'name')).toEqual({
      required: true,
      minLength: 1,
      maxLength: 256,
    });
    // A Value that may be null is not required, whatever the string inside it
    // asks for.
    expect(constraintsAt(schema, 'note')).toEqual({
      required: false,
      maxLength: 40,
    });
    expect(constraintsAt(schema, 'maybe')).toEqual({ required: false });
    expect(constraintsAt(schema, 'amount')).toEqual({
      required: true,
      minValue: 1,
      maxValue: 9,
    });
    expect(constraintsAt(schema, 'label.en')).toEqual({
      required: true,
      minLength: 1,
    });
    // The language slot of a record the object may leave out is not required
    // either, which is what a field definition's description is.
    expect(constraintsAt(schema, 'description.de')).toEqual({
      required: false,
      minLength: 1,
    });
    expect(constraintsAt(schema, 'message')).toEqual({
      required: true,
      maxLength: 5000,
    });
    // A list and a boolean say nothing about being required: Core asks for the
    // key either way, and neither can be left empty by the person in front of
    // it.
    expect(constraintsAt(schema, 'tags')).toEqual({ required: false });
    expect(constraintsAt(schema, 'isOn')).toEqual({ required: false });
    expect(constraintsAt(schema, 'section.headline')).toEqual({
      required: true,
      minLength: 2,
    });
  });

  test('says nothing rather than guessing, for a path it cannot follow', () => {
    const schema = z.object({ name: z.string().min(1) });

    expect(constraintsAt(schema, 'nothing')).toBeNull();
    expect(constraintsAt(schema, 'name.deeper')).toBeNull();
    expect(constraintsAt(undefined, 'name')).toBeNull();
  });

  test('takes what every kind of an object agrees on, and no more', () => {
    // Core writes a few objects as a union of their kinds, a User as a local
    // and a Cloud one.
    const kinds = z.union([
      z.object({
        kind: z.literal('local'),
        name: z.string().max(256),
        account: z.string().nullable(),
      }),
      z.object({
        kind: z.literal('cloud'),
        name: z.string().max(256),
        account: z.string(),
      }),
    ]);

    expect(constraintsAt(kinds, 'name')).toEqual({
      required: true,
      maxLength: 256,
    });
    // One kind demands it and the other does not, so the field says nothing.
    expect(constraintsAt(kinds, 'account')).toEqual({ required: false });
  });
});

test.describe("Where a refusal of an Entry's save belongs", () => {
  const values = {
    values: {
      title: { valueType: 'string', content: { en: 'Spring opening hours' } },
      sections: {
        valueType: 'component',
        content: [
          { id: 'section-one', componentId: 'hero', values: {} },
          {
            id: 'section-two',
            componentId: 'hero',
            values: {
              headline: { valueType: 'string', content: { en: 'Service' } },
            },
          },
        ],
      },
    },
  };

  test("names the field, its section and its language, by the section's id", () => {
    expect(entryValuePath({ fieldSlug: 'title', language: 'en' }, values)).toBe(
      'values.title.content.en'
    );
    // The second section, named by its id rather than by its place, since a
    // section can be moved between the save and the answer.
    expect(
      entryValuePath(
        {
          fieldSlug: 'headline',
          language: 'en',
          componentPath: [{ fieldSlug: 'sections', itemId: 'section-two' }],
        },
        values
      )
    ).toBe('values.sections.content.1.values.headline.content.en');
  });

  test('answers nothing for a place this form does not hold', () => {
    // A field the Collection no longer has.
    expect(
      entryValuePath({ fieldSlug: 'teaser', language: 'en' }, values)
    ).toBeNull();
    // A section somebody removed while the save was in flight.
    expect(
      entryValuePath(
        {
          fieldSlug: 'headline',
          language: 'en',
          componentPath: [{ fieldSlug: 'sections', itemId: 'section-gone' }],
        },
        values
      )
    ).toBeNull();
    // A hop through a field that holds no sections at all.
    expect(
      entryValuePath(
        {
          fieldSlug: 'headline',
          language: 'en',
          componentPath: [{ fieldSlug: 'title', itemId: 'section-one' }],
        },
        values
      )
    ).toBeNull();
    expect(
      entryValuePath({ fieldSlug: 'title', language: 'en' }, {})
    ).toBeNull();
  });
});

test.describe('The details Core attaches to a refused save', () => {
  test('reads the Values another Entry already holds, and nothing else', () => {
    expect(
      uniqueValueConflictsOf([
        {
          collectionId: 'a-collection',
          fieldDefinitionId: 'a-definition',
          fieldSlug: 'slug',
          language: 'en',
          value: 'spring-opening-hours',
          conflictingEntryId: 'another-entry',
        },
      ])
    ).toEqual([{ fieldSlug: 'slug', language: 'en' }]);
    // Every other Conflict, such as the one a Component's slug raises, carries
    // no such list, which is what tells the two apart.
    expect(uniqueValueConflictsOf(undefined)).toEqual([]);
    expect(uniqueValueConflictsOf([])).toEqual([]);
    expect(uniqueValueConflictsOf([{ fieldSlug: 'slug' }])).toEqual([]);
    expect(uniqueValueConflictsOf({ issues: [] })).toEqual([]);
  });

  test('reads a reference Core refused, with where and what it is', () => {
    expect(
      entryReferenceIssuesOf({
        issues: [
          {
            kind: 'reference_not_found',
            refKind: 'asset',
            refId: 'an-asset',
            collectionId: null,
            fieldSlug: 'cover',
            language: 'en',
            treePath: [],
            index: 0,
            componentPath: [],
          },
        ],
      })
    ).toEqual([
      {
        kind: 'reference_not_found',
        refKind: 'asset',
        fieldSlug: 'cover',
        language: 'en',
        componentPath: [],
      },
    ]);
    // An Asset of a type the field does not take carries no refKind, since
    // only an Asset has one.
    expect(
      entryReferenceIssuesOf({
        issues: [
          {
            kind: 'asset_mime_mismatch',
            assetId: 'an-asset',
            expectedMimeTypes: ['image/png'],
            actualMimeType: 'image/jpeg',
            fieldSlug: 'cover',
            language: 'en',
            treePath: [],
            index: 0,
            componentPath: [
              {
                fieldSlug: 'sections',
                itemId: 'section-two',
                componentId: 'hero',
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        kind: 'asset_mime_mismatch',
        fieldSlug: 'cover',
        language: 'en',
        componentPath: [{ fieldSlug: 'sections', itemId: 'section-two' }],
      },
    ]);
    expect(entryReferenceIssuesOf(undefined)).toEqual([]);
    expect(entryReferenceIssuesOf({ issues: [] })).toEqual([]);
    expect(entryReferenceIssuesOf([{ kind: 'reference_not_found' }])).toEqual(
      []
    );
  });
});

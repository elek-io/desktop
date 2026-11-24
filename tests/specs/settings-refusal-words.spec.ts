import { expect, test } from '@playwright/test';
import type { z } from 'zod';

import {
  createCollectionSchema,
  createComponentSchema,
  markdownFieldDefinitionSchema,
  numberFieldDefinitionSchema,
  slugFieldDefinitionSchema,
  stringSelectFieldDefinitionSchema,
  textFieldDefinitionSchema,
  uuid,
  type CreateCollectionProps,
  type CreateComponentProps,
  type FieldDefinition,
} from '@elek-io/core';

import { settingsRefusals } from '../../src/renderer/lib/settingsRefusals.js';
import {
  markdownFieldDefinition,
  numberFieldDefinition,
  selectFieldDefinition,
  slugFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';

/**
 * What the words for a refused setting answer for, checked without the app.
 *
 * `lib/settingsRefusals.ts` matches a refusal Core wrote its own English for by
 * the opening of its message, and anything it does not match falls to the one
 * sentence for a refusal nothing knows, which says nothing about what to
 * change. So every opening has to be text the installed Core really writes.
 * This triggers each of them against Core's own schemas, so a Core release that
 * rewords one fails here, where the words are still right, rather than on a
 * field where the sentence would go vague.
 *
 * It is the settings counterpart of `refusal-words.spec.ts`, which holds the
 * same line for the refusals an Entry's Values run into. What a field shows is
 * driven in `collections.spec.ts` and `components.spec.ts`.
 */

const A_COLLECTION = '16fd2706-8baf-433b-82eb-8c7fada847da';

/** A Collection as its create form hands it over, around these definitions. */
function collection(
  fieldDefinitions: FieldDefinition[]
): CreateCollectionProps {
  return {
    projectId: A_COLLECTION,
    icon: 'home',
    name: { singular: { en: 'Article' }, plural: { en: 'Articles' } },
    description: { en: 'The articles of this blog' },
    slug: { singular: 'article', plural: 'articles' },
    fieldDefinitions,
  };
}

/** A Component as its create form hands it over, around these definitions. */
function component(fieldDefinitions: FieldDefinition[]): CreateComponentProps {
  return {
    projectId: A_COLLECTION,
    name: { en: 'Teaser' },
    description: null,
    slug: 'teaser',
    fieldDefinitions,
  };
}

/**
 * Every message a refusal comes out with, the branches of a union included.
 *
 * A union's branches are walked because a field definition is one: Core reports
 * the branch of the type it is, and a refusal of a Collection's whole array
 * arrives below it.
 */
function messagesOf(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) =>
    issue.code === 'invalid_union'
      ? [issue.message, ...issue.errors.flatMap((branch) => messagesOf(branch))]
      : [issue.message]
  );
}

/** What refusing this input against this Core schema says. */
function refusals(schema: z.ZodType, input: unknown): string[] {
  const refused = schema.safeParse(input);

  expect(refused.success, 'Core took what should have been refused').toBe(
    false
  );
  return messagesOf(refused.error?.issues ?? []);
}

/**
 * One refusal per opening the table matches by, with the settings that run
 * into it.
 *
 * A slug field is always unique, so the two refusals a Component answers both
 * arrive for one of them, which is why each case asks for its own opening
 * rather than for the whole list of messages.
 */
const driven: {
  key: keyof typeof settingsRefusals;
  refused: () => string[];
}[] = [
  {
    key: 'reservedSlug',
    refused: () =>
      refusals(
        textFieldDefinitionSchema,
        textFieldDefinition({ slug: 'settings' })
      ),
  },
  {
    key: 'takenFieldSlug',
    refused: () =>
      refusals(
        createCollectionSchema,
        collection([
          textFieldDefinition({ slug: 'title' }),
          textFieldDefinition({ slug: 'title' }),
        ])
      ),
  },
  {
    key: 'minAboveMax',
    refused: () =>
      refusals(
        textFieldDefinitionSchema,
        textFieldDefinition({ min: 10, max: 5 })
      ),
  },
  {
    key: 'defaultNotAnOption',
    refused: () =>
      refusals(
        stringSelectFieldDefinitionSchema,
        selectFieldDefinition({ defaultValue: 'nothing offers this' })
      ),
  },
  {
    key: 'defaultLengthOutOfRange',
    refused: () =>
      refusals(
        textFieldDefinitionSchema,
        textFieldDefinition({ min: 2, max: 5, defaultValue: 'Far too long' })
      ),
  },
  {
    key: 'defaultOutOfRange',
    refused: () =>
      refusals(
        numberFieldDefinitionSchema,
        numberFieldDefinition({ min: 2, max: 5, defaultValue: 99 })
      ),
  },
  {
    key: 'uniqueWithDefault',
    refused: () =>
      refusals(
        textFieldDefinitionSchema,
        textFieldDefinition({ isUnique: true, defaultValue: 'Untitled' })
      ),
  },
  {
    key: 'badSeparator',
    refused: () =>
      refusals(
        slugFieldDefinitionSchema,
        slugFieldDefinition({
          separator: '+',
        })
      ),
  },
  {
    key: 'taskListsWithoutLists',
    refused: () =>
      refusals(
        markdownFieldDefinitionSchema,
        markdownFieldDefinition({
          features: {
            ...markdownFieldDefinition().features,
            lists: false,
            taskListItems: true,
          },
        })
      ),
  },
  {
    key: 'slugFromItself',
    refused: () => {
      const itself = slugFieldDefinition({ slug: 'handle' });
      return refusals(
        createCollectionSchema,
        collection([
          textFieldDefinition(),
          { ...itself, ofFieldDefinitions: [itself.id] },
        ])
      );
    },
  },
  {
    key: 'duplicateSlugSource',
    refused: () => {
      const source = textFieldDefinition();
      return refusals(
        createCollectionSchema,
        collection([
          source,
          slugFieldDefinition({ ofFieldDefinitions: [source.id, source.id] }),
        ])
      );
    },
  },
  {
    key: 'goneSlugSource',
    refused: () =>
      refusals(
        createCollectionSchema,
        collection([
          textFieldDefinition(),
          slugFieldDefinition({ ofFieldDefinitions: [uuid()] }),
        ])
      ),
  },
  {
    key: 'unusableSlugSource',
    refused: () => {
      // A number holds no text, so no slug can be written from it.
      const source = numberFieldDefinition({ slug: 'rating' });
      return refusals(
        createCollectionSchema,
        collection([
          source,
          slugFieldDefinition({ ofFieldDefinitions: [source.id] }),
        ])
      );
    },
  },
  {
    key: 'slugInComponent',
    refused: () =>
      refusals(createComponentSchema, component([slugFieldDefinition()])),
  },
  {
    key: 'uniqueInComponent',
    refused: () =>
      refusals(
        createComponentSchema,
        component([textFieldDefinition({ isUnique: true })])
      ),
  },
  {
    key: 'markdownDefault',
    refused: () =>
      refusals(
        markdownFieldDefinitionSchema,
        markdownFieldDefinition({
          // A code block, which this field's own features do not allow.
          defaultValue: {
            type: 'root',
            children: [
              { type: 'code', lang: null, meta: null, value: 'const a = 1;' },
            ],
          },
        })
      ),
  },
];

test.describe('The words for a refused setting', () => {
  test('every refusal Core words itself is matched by its opening', () => {
    for (const { key, refused } of driven) {
      const opening = settingsRefusals[key];

      expect(
        refused().filter((message) => message.startsWith(opening)),
        `${key} matches nothing Core writes, so its words fall to the one sentence for a refusal nothing knows`
      ).not.toEqual([]);
    }
  });

  test('every opening the settings match by is driven above', () => {
    // So an opening added to the table without a refusal behind it fails here
    // rather than passing as watched.
    expect(driven.map(({ key }) => key).sort()).toEqual(
      Object.keys(settingsRefusals).sort()
    );
  });
});

import { expect, test } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  getValueSchemaFromFieldDefinition,
  type FieldDefinition,
  type MdAstRoot,
  type ProjectLanguages,
} from '@elek-io/core';

import { coreRefusals } from '../../src/renderer/components/fields/core-refusals.js';
import { typeCheck } from '../helpers/checks.js';
import {
  assetFieldDefinition,
  dynamicFieldDefinition,
  emailFieldDefinition,
  ipv4FieldDefinition,
  markdownFieldDefinition,
  numberFieldDefinition,
  referenceFieldDefinition,
  slugFieldDefinition,
  telephoneFieldDefinition,
  textFieldDefinition,
  toggleFieldDefinition,
  urlFieldDefinition,
} from '../helpers/collection.js';

/**
 * What the words for a refused Value answer for, checked without the app.
 *
 * Three things need no window. Which refusals an Entry's fields can produce,
 * and whether each one reaches the renderer's error map or arrives carrying
 * English Core wrote itself, which is what decides where its words come from.
 * That an issue code without words fails the type check. And that no sentence
 * an editor is shown repeats a word of zod's or Core's.
 *
 * The map itself cannot be imported here, because its sentences come from
 * Lingui's macros and those only exist once a build has compiled them. So the
 * map stands in as a marker, and the sentences are read from the catalog the
 * code is extracted into. What a field shows is driven in `entries.spec.ts`.
 */

const root = path.resolve(import.meta.dirname, '../..');
const catalogPath = path.join(root, 'src/locales/en.po');

/** The files that hold the words of a refused Value. */
const wordingSources = [
  'src/renderer/lib/refusedValueText.ts',
  'src/renderer/components/fields/slug/index.tsx',
  'src/renderer/components/fields/entry/index.tsx',
  'src/renderer/components/fields/markdown/index.tsx',
];

/**
 * Stands in for the error map `setRefusedValueWords` installs, so a message
 * that comes back unmarked is one zod let outrank every map, which is exactly
 * the refusal a field type has to word itself.
 */
const MAPPED = 'mapped by Desktop';

const languages: ProjectLanguages = ['en', 'de'];
const A_COLLECTION = '16fd2706-8baf-433b-82eb-8c7fada847da';
const ANOTHER_COLLECTION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const anAssetReference = { objectType: 'asset', id: ANOTHER_COLLECTION };
const anEntryReference = {
  objectType: 'entry',
  id: ANOTHER_COLLECTION,
  collectionId: A_COLLECTION,
};

/** A Value as a form holds it, which is what its schema is handed. */
function value(fieldDefinition: FieldDefinition, content: unknown): unknown {
  return {
    id: '2f1a3d4e-5b6c-4d7e-8f90-a1b2c3d4e5f6',
    objectType: 'value',
    valueType: fieldDefinition.valueType,
    fieldDefinitionId: fieldDefinition.id,
    content,
  };
}

/** One markdown tree holding `blocks` paragraphs. */
function paragraphs(blocks: number): MdAstRoot {
  return {
    type: 'root',
    children: Array.from({ length: blocks }, (_unused, index) => ({
      type: 'paragraph',
      children: [{ type: 'text', value: `Block ${index}` }],
    })),
  };
}

/** One markdown tree nested `levels` deep, which Core's depth guard answers. */
function nested(levels: number): MdAstRoot {
  let deepest: MdAstRoot['children'][number] = {
    type: 'paragraph',
    children: [{ type: 'text', value: 'Deep' }],
  };
  for (let level = 0; level < levels; level += 1) {
    deepest = { type: 'blockquote', children: [deepest] };
  }
  return { type: 'root', children: [deepest] };
}

/**
 * Every message a refusal comes out with, the branches of a union included.
 *
 * A union's branches are walked because the resolver does the same: it reports
 * the first message of the shortest branch, so a branch zod worded in its own
 * English would reach the field.
 */
function messagesOf(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) =>
    issue.code === 'invalid_union'
      ? [issue.message, ...issue.errors.flatMap((branch) => messagesOf(branch))]
      : [issue.message]
  );
}

/** What refusing `content` against its own field definition says. */
function refusals(
  fieldDefinition: FieldDefinition,
  content: unknown
): string[] {
  const schema = getValueSchemaFromFieldDefinition(
    fieldDefinition,
    languages,
    // A Component with no fields of its own, which every item of a dynamic
    // field below is. Core asks for a resolver before it looks at one.
    () => []
  );
  const refused = schema.safeParse(value(fieldDefinition, content));

  expect(refused.success).toBe(false);
  return messagesOf(refused.error?.issues ?? []);
}

/** The messages Core wrote itself, which no error map reaches. */
function coreWrote(messages: string[]): string[] {
  return messages.filter((message) => message !== MAPPED);
}

/** Every sentence the catalog holds for one of the files above. */
async function wordedSentences(): Promise<string[]> {
  const catalog = await readFile(catalogPath, 'utf8');

  return catalog
    .split('\n\n')
    .filter((entry) =>
      wordingSources.some((source) =>
        entry.includes(`#: ${source.replaceAll('/', path.sep)}`)
      )
    )
    .flatMap((entry) => entry.match(/^msgid "((?:[^"\\]|\\.)*)"/m) ?? [])
    .filter((_match, index) => index % 2 === 1);
}

test.describe('The words for a refused Value', () => {
  test.beforeAll(() => {
    z.config({ customError: () => MAPPED });
  });

  test('every refusal zod raises itself goes through the map', () => {
    const text = textFieldDefinition({ min: 3, max: 10 });
    const number = numberFieldDefinition({ min: 2, max: 8 });
    const assets = assetFieldDefinition({ min: 2, max: 3 });
    const entries = referenceFieldDefinition({ min: null, max: 2 });
    const markdown = markdownFieldDefinition({
      isRequired: true,
      min: 2,
      max: 3,
    });
    const sections = dynamicFieldDefinition({ isRequired: true, max: 1 });
    const anItem = {
      id: '9a7b1f3c-2d4e-4f50-9a1b-2c3d4e5f6071',
      componentId: A_COLLECTION,
      values: {},
    };

    // One row per measure a refusal carries, and one per format a field type
    // asks of its text. Every message has to be the map's, because each of
    // these is one zod would otherwise word in its own English, naming a type,
    // a comparison sign or an internal measure.
    const everyRefusal = [
      // A Value that is not there, of each shape an Entry stores.
      ...refusals(text, { en: null, de: 'Four' }),
      ...refusals(number, { en: null, de: 4 }),
      ...refusals(toggleFieldDefinition(), { en: null, de: true }),
      ...refusals(markdown, { en: null, de: paragraphs(2) }),
      ...refusals(assets, { en: [], de: [anAssetReference, anAssetReference] }),
      // A length, a count and a number, from both ends.
      ...refusals(text, { en: 'Ab', de: 'Four' }),
      ...refusals(text, { en: 'Far too long for one field', de: 'Four' }),
      ...refusals(number, { en: 1, de: 4 }),
      ...refusals(number, { en: 99, de: 4 }),
      ...refusals(assets, {
        en: [anAssetReference],
        de: [anAssetReference, anAssetReference],
      }),
      ...refusals(entries, {
        en: [anEntryReference, anEntryReference, anEntryReference],
        de: [],
      }),
      ...refusals(markdown, { en: paragraphs(1), de: paragraphs(2) }),
      ...refusals(markdown, { en: paragraphs(4), de: paragraphs(2) }),
      ...refusals(sections, []),
      ...refusals(sections, [anItem, { ...anItem, id: A_COLLECTION }]),
      // A format, one per field type that asks for one.
      ...refusals(emailFieldDefinition(), { en: 'nobody', de: 'a@elek.io' }),
      ...refusals(urlFieldDefinition(), {
        en: 'nowhere',
        de: 'https://elek.io',
      }),
      ...refusals(ipv4FieldDefinition(), {
        en: 'nowhere',
        de: '192.168.0.1',
      }),
      ...refusals(telephoneFieldDefinition(), {
        en: 'nobody',
        de: '+4930123456',
      }),
      // A block a markdown field does not allow, which is none of the shapes
      // its tree takes.
      ...refusals(markdown, {
        en: {
          type: 'root',
          children: [
            { type: 'code', lang: null, meta: null, value: 'const a = 1;' },
            ...paragraphs(2).children,
          ],
        },
        de: paragraphs(2),
      }),
    ];

    expect([...new Set(everyRefusal)]).toEqual([MAPPED]);
  });

  test('every refusal Core words itself is matched by its field type', () => {
    const slug = slugFieldDefinition();
    const entries = referenceFieldDefinition({
      ofCollections: [A_COLLECTION],
    });
    const markdown = markdownFieldDefinition({
      ofCollections: [A_COLLECTION],
      features: {
        ...markdownFieldDefinition().features,
        entryReferences: true,
      },
    });
    const fromElsewhere = {
      ...anEntryReference,
      collectionId: ANOTHER_COLLECTION,
    };

    // Each of these is English Core wrote into the refusal itself, which no
    // error map reaches, and each starts with what the field type it lands on
    // matches it by. A Core release that rewords one fails here, where the
    // words are still right, rather than on a field where it would show.
    expect(coreWrote(refusals(slug, { en: '???', de: 'fine' }))).toEqual([
      expect.stringContaining(coreRefusals.unusableSlug),
    ]);
    expect(coreWrote(refusals(slug, { en: 'Not A Slug', de: 'fine' }))).toEqual(
      [expect.stringContaining(coreRefusals.nonCanonicalSlug)]
    );
    expect(
      coreWrote(refusals(entries, { en: [fromElsewhere], de: [] }))
    ).toEqual([expect.stringContaining(coreRefusals.foreignCollection)]);
    expect(
      coreWrote(
        refusals(markdown, { en: { type: 'root', children: [] }, de: null })
      )
    ).toEqual([expect.stringContaining(coreRefusals.emptyMarkdown)]);
    expect(
      coreWrote(
        refusals(markdown, {
          en: { type: 'root', children: [{ type: 'paragraph', children: [] }] },
          de: null,
        })
      )
    ).toEqual([expect.stringContaining(coreRefusals.emptyMarkdown)]);
    expect(
      coreWrote(refusals(markdown, { en: nested(110), de: null }))
    ).toEqual([expect.stringContaining(coreRefusals.deepMarkdown)]);
    expect(
      coreWrote(
        refusals(markdown, {
          en: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'entryReference',
                    collectionId: ANOTHER_COLLECTION,
                    entryId: A_COLLECTION,
                    children: [{ type: 'text', value: 'There' }],
                  },
                ],
              },
            ],
          },
          de: null,
        })
      )
    ).toEqual([expect.stringContaining(coreRefusals.foreignCollection)]);
  });

  test('an issue code without words fails the type check', async () => {
    // The map as it would read with one code's words missing. Written to disk
    // rather than checked from a string, because what is under test is the
    // project's own type check.
    const probe = path.join(root, 'src/renderer/lib/refusalProbe.ts');
    await writeFile(
      probe,
      [
        "import type { RefusalWords } from '@renderer/lib/refusedValueText';",
        '',
        "// One of zod's issue codes, which is what the map would hold if a code",
        '// zod added had no words yet. Annotated with the map`s own exported',
        '// type, so loosening that type is what this goes green on rather than',
        '// what TypeScript does with any mapped type.',
        'export const unworded: RefusalWords = {',
        "  invalid_type: () => '',",
        '};',
        '',
      ].join('\n')
    );

    try {
      const failed = await typeCheck();
      expect(failed.code).not.toBe(0);
      // Nothing but the probe is asserted on, because `pnpm check` is what
      // proves the project itself is green and a spec running beside this one
      // writes probes of its own into the same project.
      expect(failed.output).toContain('refusalProbe.ts');
      // Named, so what refuses the incomplete map is the map's own exported
      // type rather than a mapped type written out again here.
      expect(failed.output).toContain(
        "is missing the following properties from type 'RefusalWords'"
      );
      expect(failed.output).toContain('too_small');
    } finally {
      await rm(probe);
    }
  });

  test('no sentence repeats a word of zod or of Core', async () => {
    const sentences = await wordedSentences();

    // Enough of them that a catalog read wrongly could not pass as a pass.
    expect(sentences.length).toBeGreaterThanOrEqual(20);

    // What zod and Core write and an editor never asked about: the word they
    // lead with, the type they name, the sign they compare with and the path
    // they happened at. "number" is not among the types, because it is also
    // the English word a phone number and a multiple are named by.
    const theirs = [
      'expected',
      'too small',
      'too big',
      'invalid',
      '>=',
      '<=',
      'string',
      'array',
      'object',
      'boolean',
      'mdast',
      'content.',
      'values.',
      ...Object.values(coreRefusals),
    ];

    for (const sentence of sentences) {
      for (const word of theirs) {
        expect(sentence.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });
});

import { expect, test } from '@playwright/test';

import {
  fieldTypeSchema,
  getValueSchemaFromFieldDefinition,
  type FieldDefinition,
  type FieldType,
  type MdAstRoot,
  type ProjectLanguages,
} from '@elek-io/core';

import {
  holdsNoMarkdown,
  holdsNothing,
} from '../../src/renderer/components/fields/empty-values.js';
import {
  assetFieldDefinition,
  dateFieldDefinition,
  datetimeFieldDefinition,
  dynamicFieldDefinition,
  emailFieldDefinition,
  ipv4FieldDefinition,
  markdownFieldDefinition,
  numberFieldDefinition,
  rangeFieldDefinition,
  referenceFieldDefinition,
  selectFieldDefinition,
  slugFieldDefinition,
  telephoneFieldDefinition,
  textFieldDefinition,
  textareaFieldDefinition,
  timeFieldDefinition,
  toggleFieldDefinition,
  urlFieldDefinition,
} from '../helpers/collection.js';

/**
 * Whether a Value holds nothing, checked against Core without the app.
 *
 * Which required Values an Entry is missing decides whether Save is blocked,
 * what the switch above the fields marks and which row of the list of Entries
 * carries the Missing badge, so it has to agree with what Core refuses an Entry
 * for. The answer comes from the field type's own `isEmpty`, which every type's
 * folder takes from `empty-values.ts`, so that is what is read here beside
 * Core's own schema.
 *
 * Both directions are checked, for every field type:
 *
 * - **Sound**: a Value the contract calls empty is one Core refuses, so Save is
 *   never blocked for a Value Core would have taken.
 * - **Complete**: a Value the contract calls filled is one Core takes, so Save
 *   is never offered for an Entry Core would refuse for a Value that is not
 *   there.
 *
 * A Value that is there and wrong, such as a text that is too short or an
 * address that is no address, is refused by Core and is no missing Value. That
 * is the submit's to answer at the field, which `entries.spec.ts` drives in the
 * app.
 */

const languages: ProjectLanguages = ['en'];
const A_COLLECTION = '16fd2706-8baf-433b-82eb-8c7fada847da';
const A_COMPONENT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const AN_ITEM = '9a7b1f3c-2d4e-4f50-9a1b-2c3d4e5f6071';

/** One paragraph of markdown, which is the smallest tree Core takes. */
const aParagraph: MdAstRoot = {
  type: 'root',
  children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Hi' }] }],
};

/** The editor opened and nothing typed, which Core refuses as a Value. */
const anEmptyEditor = {
  type: 'root',
  children: [{ type: 'paragraph', children: [] }],
};

/** A Value as a form holds it, which is what its schema is handed. */
function value(fieldDefinition: FieldDefinition, content: unknown): unknown {
  return {
    id: '2f1a3d4e-5b6c-4d7e-8f90-a1b2c3d4e5f6',
    objectType: 'value',
    valueType: fieldDefinition.valueType,
    fieldDefinitionId: fieldDefinition.id,
    content: { en: content },
  };
}

/** Whether Core takes this content for this field definition. */
function coreTakes(
  fieldDefinition: FieldDefinition,
  content: unknown
): boolean {
  const schema = getValueSchemaFromFieldDefinition(
    fieldDefinition,
    languages,
    // A Component with one required field of its own, so a section counts as
    // a section rather than as nothing.
    () => [textFieldDefinition({ slug: 'headline' })]
  );
  const asStored =
    fieldDefinition.valueType === 'component'
      ? {
          id: '2f1a3d4e-5b6c-4d7e-8f90-a1b2c3d4e5f6',
          objectType: 'value',
          valueType: 'component',
          fieldDefinitionId: fieldDefinition.id,
          content,
        }
      : value(fieldDefinition, content);

  return schema.safeParse(asStored).success;
}

/**
 * Every field type with the contract its folder takes, the shapes a form can
 * hold that are nothing, and one Value Core takes.
 *
 * The contract is named per type here, so a type wired to the wrong one is
 * caught by the count under Save in the app rather than silently: that count
 * is one per type, see `entries.spec.ts`.
 */
const types: {
  fieldType: FieldType;
  definition: FieldDefinition;
  isEmpty: (content: unknown) => boolean;
  nothing: unknown[];
  something: unknown;
}[] = [
  {
    fieldType: fieldTypeSchema.enum.text,
    definition: textFieldDefinition({ isRequired: true, min: null, max: null }),
    isEmpty: holdsNothing,
    nothing: [null, '', '   '],
    something: 'Spring',
  },
  {
    fieldType: fieldTypeSchema.enum.textarea,
    definition: textareaFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, '', '  '],
    something: 'Spring',
  },
  {
    fieldType: fieldTypeSchema.enum.email,
    definition: emailFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: 'mara@example.com',
  },
  {
    fieldType: fieldTypeSchema.enum.url,
    definition: urlFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: 'https://elek.io',
  },
  {
    fieldType: fieldTypeSchema.enum.telephone,
    definition: telephoneFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: '+4930123456',
  },
  {
    fieldType: fieldTypeSchema.enum.ipv4,
    definition: ipv4FieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: '192.168.0.1',
  },
  {
    fieldType: fieldTypeSchema.enum.slug,
    definition: slugFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, '', '   '],
    something: 'spring-opening-hours',
  },
  {
    fieldType: fieldTypeSchema.enum.select,
    definition: selectFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: 'draft',
  },
  {
    fieldType: fieldTypeSchema.enum.date,
    definition: dateFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: '2026-03-01',
  },
  {
    fieldType: fieldTypeSchema.enum.datetime,
    definition: datetimeFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: '2026-03-01T09:30:00.000Z',
  },
  {
    fieldType: fieldTypeSchema.enum.time,
    definition: timeFieldDefinition({ isRequired: true }),
    isEmpty: holdsNothing,
    nothing: [null, ''],
    something: '09:30:00',
  },
  {
    fieldType: fieldTypeSchema.enum.number,
    definition: numberFieldDefinition({
      isRequired: true,
      min: null,
      max: null,
    }),
    isEmpty: holdsNothing,
    // A number always holds something once it is there, and `0` is no
    // exception, which is why it stands under what Core takes below.
    nothing: [null],
    something: 0,
  },
  {
    fieldType: fieldTypeSchema.enum.range,
    definition: rangeFieldDefinition({ min: 0, max: 10 }),
    isEmpty: holdsNothing,
    nothing: [null],
    something: 0,
  },
  {
    fieldType: fieldTypeSchema.enum.toggle,
    definition: toggleFieldDefinition(),
    isEmpty: holdsNothing,
    nothing: [null],
    something: false,
  },
  {
    fieldType: fieldTypeSchema.enum.asset,
    definition: assetFieldDefinition({ isRequired: true, min: null, max: 1 }),
    isEmpty: holdsNothing,
    nothing: [[]],
    something: [{ objectType: 'asset', id: A_COMPONENT }],
  },
  {
    fieldType: fieldTypeSchema.enum.entry,
    definition: referenceFieldDefinition({
      isRequired: true,
      ofCollections: [A_COLLECTION],
      min: null,
      max: 1,
    }),
    isEmpty: holdsNothing,
    nothing: [[]],
    something: [
      { objectType: 'entry', id: A_COMPONENT, collectionId: A_COLLECTION },
    ],
  },
  {
    fieldType: fieldTypeSchema.enum.markdown,
    definition: markdownFieldDefinition({
      isRequired: true,
      min: null,
      max: null,
    }),
    isEmpty: holdsNoMarkdown,
    // Nothing at all, the editor opened and nothing typed, and a tree with no
    // block in it, which are the three shapes an empty editor leaves behind.
    nothing: [null, anEmptyEditor, { type: 'root', children: [] }],
    something: aParagraph,
  },
];

/**
 * A dynamic field, whose Value is one flat list rather than content per
 * language, so it is checked on its own below.
 */
const sections = {
  definition: dynamicFieldDefinition({
    isRequired: true,
    ofComponents: [A_COMPONENT],
    max: null,
  }),
  nothing: [[]],
  something: [
    {
      id: AN_ITEM,
      componentId: A_COMPONENT,
      values: {
        headline: {
          id: AN_ITEM,
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Book online' },
        },
      },
    },
  ],
};

test.describe('A Value that holds nothing', () => {
  test('agrees with Core for every field type, both ways', () => {
    // Every type Core defines is in the table, so a type Core adds is noticed
    // here rather than being left unchecked.
    expect(
      [...types.map((type) => type.fieldType), fieldTypeSchema.enum.dynamic]
        .slice()
        .sort()
    ).toEqual(Object.values(fieldTypeSchema.enum).slice().sort());

    for (const type of types) {
      for (const content of type.nothing) {
        // Sound: what the contract calls empty is what Core refuses.
        expect(
          type.isEmpty(content),
          `${type.fieldType} reads ${JSON.stringify(content)} as empty`
        ).toBe(true);
        expect(
          coreTakes(type.definition, content),
          `Core refuses ${JSON.stringify(content)} for ${type.fieldType}`
        ).toBe(false);
      }

      // Complete: what the contract calls filled is what Core takes.
      expect(
        type.isEmpty(type.something),
        `${type.fieldType} reads ${JSON.stringify(type.something)} as filled`
      ).toBe(false);
      expect(
        coreTakes(type.definition, type.something),
        `Core takes ${JSON.stringify(type.something)} for ${type.fieldType}`
      ).toBe(true);
    }
  });

  test('agrees with Core for a dynamic field, whose Value is one list', () => {
    for (const content of sections.nothing) {
      expect(holdsNothing(content)).toBe(true);
      expect(coreTakes(sections.definition, content)).toBe(false);
    }

    expect(holdsNothing(sections.something)).toBe(false);
    expect(coreTakes(sections.definition, sections.something)).toBe(true);
  });

  test('agrees with Core about a toggle in a language a Project gained', () => {
    // A toggle is on or off, so nothing in its place only happens where the
    // Project gained a language after the Entry was written. The contract
    // reads that language as empty, and Core refuses the Entry for it, which
    // is why a toggle is marked and counted there like any other field.
    const toggle = toggleFieldDefinition();
    const grown: ProjectLanguages = ['en', 'de'];
    const schema = getValueSchemaFromFieldDefinition(toggle, grown, () => []);
    const asStored = (content: unknown): unknown => ({
      id: '2f1a3d4e-5b6c-4d7e-8f90-a1b2c3d4e5f6',
      objectType: 'value',
      valueType: toggle.valueType,
      fieldDefinitionId: toggle.id,
      content,
    });

    expect(holdsNothing(undefined)).toBe(true);
    expect(schema.safeParse(asStored({ en: false })).success).toBe(false);
    expect(schema.safeParse(asStored({ en: false, de: null })).success).toBe(
      false
    );

    // And a toggle both languages hold is one Core takes.
    expect(holdsNothing(false)).toBe(false);
    expect(schema.safeParse(asStored({ en: false, de: true })).success).toBe(
      true
    );
  });

  test('reads an optional Value Core takes as empty all the same', () => {
    // An optional field is nullable in Core, so nothing is fine there. The
    // contract still calls it empty, and the one function over the field
    // definitions is what leaves an optional field out of the count.
    const optional = textFieldDefinition({ isRequired: false });

    expect(holdsNothing(null)).toBe(true);
    expect(coreTakes(optional, null)).toBe(true);
  });
});

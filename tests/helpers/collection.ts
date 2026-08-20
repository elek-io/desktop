import { expect, type Page } from '@playwright/test';

import {
  uuid,
  type AssetFieldDefinition,
  type Collection,
  type CreateCollectionProps,
  type DateFieldDefinition,
  type DatetimeFieldDefinition,
  type EmailFieldDefinition,
  type NumberFieldDefinition,
  type RangeFieldDefinition,
  type ReferenceFieldDefinition,
  type TextFieldDefinition,
  type TimeFieldDefinition,
  type UpdateCollectionProps,
} from '@elek-io/core';

import { navigate } from './navigation.js';

/**
 * Build a required single-line text FieldDefinition with a caller-supplied id.
 * A Collection needs at least one field, and Core matches definitions by id, so
 * each call gets a fresh UUID unless one is passed in the overrides.
 */
export function textFieldDefinition(
  overrides: Partial<TextFieldDefinition> = {}
): TextFieldDefinition {
  return {
    id: uuid(),
    slug: 'title',
    label: { en: 'Title' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'text',
    defaultValue: null,
    min: null,
    max: null,
    ...overrides,
  };
}

/**
 * Build a required email FieldDefinition with a caller-supplied id. Mirrors
 * `textFieldDefinition` but with `fieldType` "email", so a Collection can drive
 * both the required and format validation paths. Email definitions carry no
 * min/max, so those keys are absent here.
 */
export function emailFieldDefinition(
  overrides: Partial<EmailFieldDefinition> = {}
): EmailFieldDefinition {
  return {
    id: uuid(),
    slug: 'email',
    label: { en: 'Email' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'email',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required number FieldDefinition with a caller-supplied id. Defaults to
 * `min` 1 and `max` 9 so a test can assert the rendered number input carries no
 * native `min` / `max` constraint attribute (zod owns validation). The slug is
 * `rating` because `count` is a reserved slug in Core. Number definitions cannot
 * be unique, so `isUnique` is the literal `false`.
 */
export function numberFieldDefinition(
  overrides: Partial<NumberFieldDefinition> = {}
): NumberFieldDefinition {
  return {
    id: uuid(),
    slug: 'rating',
    label: { en: 'Rating' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'number',
    fieldType: 'number',
    defaultValue: null,
    min: 1,
    max: 9,
    ...overrides,
  };
}

/**
 * Build a range FieldDefinition with a caller-supplied id. A range definition is
 * always required and never unique (Core pins both), carries a numeric
 * `defaultValue`, and its `min` / `max` are the Slider's functional value domain
 * (Radix exposes them as `aria-valuemin` / `aria-valuemax`), not HTML constraint
 * attributes, so a test can assert they survive on the rendered slider.
 */
export function rangeFieldDefinition(
  overrides: Partial<RangeFieldDefinition> = {}
): RangeFieldDefinition {
  return {
    id: uuid(),
    slug: 'level',
    label: { en: 'Level' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'number',
    fieldType: 'range',
    defaultValue: 5,
    min: 0,
    max: 10,
    ...overrides,
  };
}

/**
 * Build a required date FieldDefinition with a caller-supplied id. Mirrors
 * `emailFieldDefinition` (no min/max) but with `fieldType` "date". Core stores a
 * date Value as a `YYYY-MM-DD` ISO string, formatted per the User's language in
 * the UI, so this drives the temporal-formatting specs.
 */
export function dateFieldDefinition(
  overrides: Partial<DateFieldDefinition> = {}
): DateFieldDefinition {
  return {
    id: uuid(),
    slug: 'published',
    label: { en: 'Published' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'date',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required datetime FieldDefinition with a caller-supplied id. Mirrors
 * `dateFieldDefinition` but with `fieldType` "datetime", storing a full ISO
 * datetime string.
 */
export function datetimeFieldDefinition(
  overrides: Partial<DatetimeFieldDefinition> = {}
): DatetimeFieldDefinition {
  return {
    id: uuid(),
    slug: 'event-at',
    label: { en: 'Event at' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'datetime',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required time FieldDefinition with a caller-supplied id. Mirrors
 * `dateFieldDefinition` but with `fieldType` "time", storing an ISO time string.
 */
export function timeFieldDefinition(
  overrides: Partial<TimeFieldDefinition> = {}
): TimeFieldDefinition {
  return {
    id: uuid(),
    slug: 'opens-at',
    label: { en: 'Opens at' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'time',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * The entry arm of the `ReferenceFieldDefinition` union (an `entry` reference,
 * as opposed to an `asset` one). Extracted so the builder's overrides are typed
 * against the concrete member rather than the whole union.
 */
type EntryReferenceFieldDefinition = Extract<
  ReferenceFieldDefinition,
  { fieldType: 'entry' }
>;

/**
 * Build an optional single-entry reference FieldDefinition with a caller-supplied
 * id. Mirrors `textFieldDefinition` but points at another Entry: `fieldType`
 * "entry", `ofCollections` empty (any Collection), `max` 1 (a single reference).
 * Used to arrange a Collection whose Entries can point at one another, so a sync
 * rebase can orphan a reference target.
 */
export function referenceFieldDefinition(
  overrides: Partial<EntryReferenceFieldDefinition> = {}
): ReferenceFieldDefinition {
  return {
    id: uuid(),
    slug: 'related',
    label: { en: 'Related' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'reference',
    fieldType: 'entry',
    ofCollections: [],
    min: null,
    max: 1,
    ...overrides,
  };
}

/**
 * Build a required single-asset reference FieldDefinition with a caller-supplied
 * id. Mirrors `referenceFieldDefinition` but points at an Asset: `fieldType`
 * "asset", `ofAssetMimeTypes` empty (any type), `min`/`max` 1 (a single required
 * reference). Used to arrange a Collection whose Entries reference an Asset, so a
 * delete of that Asset is blocked while the reference stands.
 */
export function assetFieldDefinition(
  overrides: Partial<AssetFieldDefinition> = {}
): AssetFieldDefinition {
  return {
    id: uuid(),
    slug: 'logo',
    label: { en: 'Logo' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'reference',
    fieldType: 'asset',
    min: 1,
    max: 1,
    ofAssetMimeTypes: [],
    ...overrides,
  };
}

/**
 * Create a Collection directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify. `projectId` is required, everything else defaults to a valid
 * single-language Collection with one required text field ("title"). To
 * exercise the create flow through the form, use `createCollection`.
 */
export async function createCollectionViaIpc(
  page: Page,
  overrides: Partial<CreateCollectionProps> & { projectId: string }
): Promise<Collection> {
  const props: CreateCollectionProps = {
    icon: 'home',
    name: {
      singular: { en: 'Article' },
      plural: { en: 'Articles' },
    },
    description: { en: 'Articles created by the E2E tests' },
    slug: {
      singular: 'article',
      plural: 'articles',
    },
    fieldDefinitions: [textFieldDefinition()],
    ...overrides,
  };

  return page.evaluate(
    async (p) => window.ipc.core.collections.create(p),
    props
  );
}

/**
 * Update a Collection directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify, for example adding a field definition to an existing Collection so a
 * later Entry-update back-fill can be observed. `props` is the full
 * `UpdateCollectionProps`, so pass a spread of the Collection plus `projectId`
 * (as the update form does) with the fields adjusted. Returns the updated
 * Collection.
 */
export async function updateCollectionViaIpc(
  page: Page,
  props: UpdateCollectionProps
): Promise<Collection> {
  return page.evaluate(
    async (p) => window.ipc.core.collections.update(p),
    props
  );
}

/** Route to a Collection's Entry list and confirm the app rendered there. */
export async function navigateToCollection(
  page: Page,
  ids: { projectId: string; collectionId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/collections/${ids.collectionId}`
  );
}

/** Route to the Collection create form and confirm the app rendered there. */
export async function navigateToCollectionCreate(
  page: Page,
  projectId: string
): Promise<void> {
  await navigate(page, `#/projects/${projectId}/collections/create`);
}

/** Route to a Collection's configure (update) page and confirm it rendered. */
export async function navigateToCollectionSettings(
  page: Page,
  ids: { projectId: string; collectionId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/collections/${ids.collectionId}/update`
  );
}

/** Fill the visible base fields of the Collection form (single language). */
export async function fillCollectionForm(
  page: Page,
  props: {
    namePlural: string;
    nameSingular: string;
    description: string;
    slugPlural: string;
    slugSingular: string;
  }
): Promise<void> {
  await page
    .getByLabel('Collection name (Plural)', { exact: true })
    .fill(props.namePlural);
  await page
    .getByLabel('Entry name (Singular)', { exact: true })
    .fill(props.nameSingular);
  await page.getByLabel('Description', { exact: true }).fill(props.description);
  await page
    .getByLabel('Collection-Slug', { exact: true })
    .fill(props.slugPlural);
  await page.getByLabel('Entry-Slug', { exact: true }).fill(props.slugSingular);
}

export interface AddFieldDefinitionOptions {
  label: string;
  description: string;
  /** Fills the text field's "Minimum" control. */
  min?: number;
  /** Fills the text field's "Maximum" control. */
  max?: number;
  /**
   * Assert the add is REJECTED rather than accepted. `submitDefinition` only
   * closes the sheet after it appends the definition, so a still-open sheet
   * proves the definition was not appended (a failed per-type schema, or a
   * duplicate slug). When omitted, assert the happy path: the sheet closes
   * because the definition was appended.
   */
  expectRejected?: boolean;
}

/**
 * Drive the "Add Field" sheet to add one text field definition. Opens the
 * sheet, fills the translatable label and description (the slug auto-derives
 * from the label) plus any per-type bounds, then confirms with "Add definition".
 *
 * For a valid, unique definition the sheet closes (asserted). Pass
 * `expectRejected` to instead assert the sheet stays open, which the negative
 * validation specs (duplicate slug, min>max) use to prove the definition was
 * not appended. Add other input types (a `fieldType` Select drive) when a spec
 * needs them.
 */
export async function addFieldDefinition(
  page: Page,
  options: AddFieldDefinitionOptions
): Promise<void> {
  await page.getByRole('button', { name: 'Add Field' }).click();
  const sheet = page.getByRole('dialog', {
    name: 'Add a Field to this Collection',
  });
  await expect(sheet).toBeVisible();

  // The "Input type" Select defaults to "text", so no change is needed here.
  await sheet.getByLabel('Label', { exact: true }).fill(options.label);
  // A Field's Description is optional, so its label carries an "- optional"
  // suffix. Match by prefix. Filling an optional Field is still valid.
  await sheet.getByLabel('Description').fill(options.description);

  // The text field's bounds labels carry an "- optional" suffix (they are not
  // required), so match by prefix rather than exactly.
  if (options.min !== undefined) {
    await sheet.getByLabel('Minimum').fill(String(options.min));
  }
  if (options.max !== undefined) {
    await sheet.getByLabel('Maximum').fill(String(options.max));
  }

  await page.getByRole('button', { name: 'Add definition' }).click();
  if (options.expectRejected === true) {
    await expect(sheet).toBeVisible();
  } else {
    await expect(sheet).toBeHidden();
  }
}

/**
 * Create a Collection through the form and wait for the redirect to its detail
 * page. Starts on the Collection create route, returns the new Collection's id
 * parsed from the resulting route.
 */
export async function createCollection(
  page: Page,
  props: {
    namePlural: string;
    nameSingular: string;
    description: string;
    slugPlural: string;
    slugSingular: string;
    field: { label: string; description: string };
  }
): Promise<string> {
  await fillCollectionForm(page, props);
  await addFieldDefinition(page, props.field);

  await page.getByRole('button', { name: 'Create Collection' }).click();
  // Match the new Collection's detail route by its uuid segment, never the
  // 'create' segment. A plain `[^/]+` also matches `/collections/create`, so a
  // form that never submits would still satisfy this and hide the failure a
  // caller depends on. See collections.spec.ts for the same uuid pattern.
  await expect(page).toHaveURL(
    /#\/projects\/[^/]+\/collections\/[0-9a-f-]{36}$/
  );

  const hash = new URL(page.url()).hash;
  const collectionId = hash.split('/')[4];
  if (collectionId === undefined) {
    throw new Error(`Expected a collection id in the route, got "${hash}"`);
  }
  return collectionId;
}

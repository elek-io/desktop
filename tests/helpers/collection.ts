import { expect, type Locator, type Page } from '@playwright/test';

import {
  uuid,
  type AssetFieldDefinition,
  type Collection,
  type CreateCollectionProps,
  type DateFieldDefinition,
  type DatetimeFieldDefinition,
  type DynamicFieldDefinition,
  type EmailFieldDefinition,
  type FieldType,
  type Ipv4FieldDefinition,
  type MarkdownFieldDefinition,
  type NumberFieldDefinition,
  type RangeFieldDefinition,
  type SlugFieldDefinition,
  type StringSelectFieldDefinition,
  type ReferenceFieldDefinition,
  type SupportedLanguage,
  type TelephoneFieldDefinition,
  type TextareaFieldDefinition,
  type TextFieldDefinition,
  type TimeFieldDefinition,
  type ToggleFieldDefinition,
  type UpdateCollectionProps,
  type UrlFieldDefinition,
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
 * Build a required multi-line text FieldDefinition with a caller-supplied id.
 * Mirrors `textFieldDefinition` but with `fieldType` "textarea", which Core
 * stores as the same value type with the same bounds.
 */
export function textareaFieldDefinition(
  overrides: Partial<TextareaFieldDefinition> = {}
): TextareaFieldDefinition {
  return {
    id: uuid(),
    slug: 'teaser',
    label: { en: 'Teaser' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'textarea',
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
 * Build a toggle FieldDefinition with a caller-supplied id. Core pins a toggle
 * to required and gives it a boolean default, because it always holds a Value,
 * which is why it shows no rule beside its label.
 */
export function toggleFieldDefinition(
  overrides: Partial<ToggleFieldDefinition> = {}
): ToggleFieldDefinition {
  return {
    id: uuid(),
    slug: 'featured',
    label: { en: 'Featured' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'boolean',
    fieldType: 'toggle',
    defaultValue: false,
    ...overrides,
  };
}

/**
 * Build a required url FieldDefinition with a caller-supplied id. Mirrors
 * `emailFieldDefinition`, with `fieldType` "url", so a spec can drive the
 * refusal of text that is not a web address.
 */
export function urlFieldDefinition(
  overrides: Partial<UrlFieldDefinition> = {}
): UrlFieldDefinition {
  return {
    id: uuid(),
    slug: 'homepage',
    label: { en: 'Homepage' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'url',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required ipv4 FieldDefinition with a caller-supplied id. Mirrors
 * `urlFieldDefinition` with `fieldType` "ipv4".
 */
export function ipv4FieldDefinition(
  overrides: Partial<Ipv4FieldDefinition> = {}
): Ipv4FieldDefinition {
  return {
    id: uuid(),
    slug: 'server',
    label: { en: 'Server' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'ipv4',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required telephone FieldDefinition with a caller-supplied id. Mirrors
 * `urlFieldDefinition` with `fieldType` "telephone". Core checks it against
 * E.164, which takes a leading plus, a country code and no spaces.
 */
export function telephoneFieldDefinition(
  overrides: Partial<TelephoneFieldDefinition> = {}
): TelephoneFieldDefinition {
  return {
    id: uuid(),
    slug: 'hotline',
    label: { en: 'Hotline' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'telephone',
    defaultValue: null,
    ...overrides,
  };
}

/**
 * Build a required slug FieldDefinition with a caller-supplied id.
 *
 * Core pins a slug to unique and to no default Value, and takes the form it
 * has to be in from `separator`, `lowercase` and `decamelize`. With no
 * `ofFieldDefinitions` it stands on its own rather than following other fields.
 */
export function slugFieldDefinition(
  overrides: Partial<SlugFieldDefinition> = {}
): SlugFieldDefinition {
  return {
    id: uuid(),
    slug: 'handle',
    label: { en: 'Handle' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: true,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'slug',
    defaultValue: null,
    separator: '-',
    lowercase: true,
    decamelize: true,
    ofFieldDefinitions: [],
    ...overrides,
  };
}

/**
 * Build an optional string select FieldDefinition with a caller-supplied id.
 *
 * A select's options are what the control draws: up to seven of them as a list
 * of radio buttons, and more as a dropdown with a filter. An optional one may
 * stay empty, so None leads its list. Pass `options` to drive either shape.
 */
export function selectFieldDefinition(
  overrides: Partial<StringSelectFieldDefinition> = {}
): StringSelectFieldDefinition {
  return {
    id: uuid(),
    slug: 'style',
    label: { en: 'Style' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'string',
    fieldType: 'select',
    defaultValue: null,
    options: [
      { value: 'primary', label: { en: 'Primary' } },
      { value: 'outline', label: { en: 'Outline' } },
    ],
    ...overrides,
  };
}

/**
 * Build a range FieldDefinition with a caller-supplied id. A range definition is
 * always required and never unique (Core pins both), carries a numeric
 * `defaultValue`, and its `min` / `max` are the Slider's functional value domain,
 * carried by the range input that owns the slider role, so a test can assert
 * they survive on the rendered slider.
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
 * Build an optional markdown FieldDefinition with a caller-supplied id. Markdown
 * is the one field type whose input is not a native form control but a Milkdown
 * `contenteditable`, so it is what a view-only form has to disable explicitly.
 * Every feature defaults off, matching the authoring form's own defaults (Core
 * expects features to be opted into).
 */
export function markdownFieldDefinition(
  overrides: Partial<MarkdownFieldDefinition> = {}
): MarkdownFieldDefinition {
  return {
    id: uuid(),
    slug: 'body',
    label: { en: 'Body' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'mdast',
    fieldType: 'markdown',
    defaultValue: null,
    min: null,
    max: null,
    features: {
      headings: [],
      blockquotes: false,
      lists: false,
      taskListItems: false,
      codeBlocks: false,
      thematicBreak: false,
      tables: false,
      footnotes: false,
      rawHtml: false,
      emphasis: false,
      strong: false,
      inlineCode: false,
      strikethrough: false,
      hardLineBreaks: false,
      externalLinks: false,
      externalImages: false,
      entryReferences: false,
      assetReferences: false,
    },
    ofCollections: [],
    ofAssetMimeTypes: [],
    ...overrides,
  };
}

/**
 * Build an optional dynamic FieldDefinition with a caller-supplied id. A dynamic
 * field holds the sections of a page: an ordered list of Component items, which
 * is the one Value shape that is a flat array rather than content per language.
 * `ofComponents` empty means every Component of the Project is allowed, and Core
 * pins `isUnique` to false. Pass `ofComponents` to restrict it to the
 * Components a test arranged.
 */
export function dynamicFieldDefinition(
  overrides: Partial<DynamicFieldDefinition> = {}
): DynamicFieldDefinition {
  return {
    id: uuid(),
    slug: 'sections',
    label: { en: 'Sections' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    valueType: 'component',
    fieldType: 'dynamic',
    ofComponents: [],
    min: null,
    max: null,
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

/**
 * Delete a Collection directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify, for example a `draft` whose added and removed Collection nets to no
 * change at all, which is what Core calls a patch Release.
 */
export async function deleteCollectionViaIpc(
  page: Page,
  props: { projectId: string; id: string }
): Promise<void> {
  await page.evaluate(
    async (p) => window.ipc.core.collections.delete(p),
    props
  );
}

/** Read a Collection directly over IPC, to assert what was written. */
export async function readCollectionViaIpc(
  page: Page,
  props: { projectId: string; id: string }
): Promise<Collection> {
  return page.evaluate(async (p) => window.ipc.core.collections.read(p), props);
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

/**
 * Fill the visible base fields of the Collection form, in the language the
 * switch above the page shows.
 *
 * Scoped to the main area, so the pane of the chosen field, whose Label, Slug
 * and Description carry names of their own, cannot make a locator ambiguous.
 */
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
  const settings = page.getByRole('main');

  await settings
    .getByLabel('Collection name', { exact: true })
    .fill(props.namePlural);
  await settings
    .getByLabel('Entry name', { exact: true })
    .fill(props.nameSingular);
  await settings
    .getByLabel('Description', { exact: true })
    .fill(props.description);
  await settings
    .getByLabel('Collection slug', { exact: true })
    .fill(props.slugPlural);
  await settings
    .getByLabel('Entry slug', { exact: true })
    .fill(props.slugSingular);
}

/**
 * Switch the whole settings page to another language, which is what the names,
 * the labels and the descriptions are then edited in.
 */
export async function switchSettingsLanguage(
  page: Page,
  language: SupportedLanguage
): Promise<void> {
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: new RegExp(`^${language.toUpperCase()}`) })
    .click();
}

/**
 * Open the pane of field types, which is what Add field does, and return it so
 * a caller can scope its locators to it.
 */
export async function openFieldTypes(page: Page): Promise<Locator> {
  // The page's own Add field, which the settings of a chosen field never
  // carry: a list inside them says what it adds.
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Add field', exact: true })
    .click();
  const pane = page.getByRole('complementary', { name: 'Add field' });
  await expect(pane).toBeVisible();

  return pane;
}

/**
 * Open the settings of the field with this label, and return the pane so a
 * caller can scope its locators to it.
 *
 * The whole row of a field is the control that opens it, named after what it
 * opens, since the field below it is a preview rather than something to fill
 * in there.
 */
export async function chooseFieldDefinition(
  page: Page,
  label: string
): Promise<Locator> {
  await page
    .getByRole('button', { name: `Settings of the ${label} field` })
    .click();
  const pane = page.getByRole('complementary', {
    name: `Settings of the ${label} field`,
  });
  await expect(pane).toBeVisible();

  return pane;
}

export interface AddFieldDefinitionOptions {
  label: string;
  description?: string;
  /** The type to choose in the pane. Defaults to `text`. */
  fieldType?: FieldType;
  /** Fills the field's "Minimum" control. */
  min?: number;
  /** Fills the field's "Maximum" control. */
  max?: number;
  /** Fills the "Default Value" control. */
  defaultValue?: string;
  /** Ticks the "Unique" checkbox. Only the string types allow it. */
  isUnique?: boolean;
  /** Unticks the "Required" checkbox, which a new field starts with ticked. */
  isRequired?: boolean;
}

/**
 * Add one field through the pane of field types and fill in its settings.
 *
 * Choosing a type adds the field and opens its settings, so the pane that
 * comes back is the field's own, and the field is already part of what the
 * page saves.
 */
export async function addFieldDefinition(
  page: Page,
  options: AddFieldDefinitionOptions
): Promise<Locator> {
  const types = await openFieldTypes(page);
  await types
    .getByRole('button', { name: options.fieldType ?? 'text', exact: true })
    .click();

  // The new field has no label yet, so its pane is the one named after a field
  // with none.
  const pane = page.getByRole('complementary', {
    name: /^Settings of the/,
  });
  await expect(pane).toBeVisible();

  await pane.getByLabel('Label', { exact: true }).fill(options.label);
  if (options.description !== undefined) {
    await pane
      .getByLabel('Description', { exact: true })
      .fill(options.description);
  }
  if (options.min !== undefined) {
    await pane.getByLabel('Minimum', { exact: true }).fill(String(options.min));
  }
  if (options.max !== undefined) {
    await pane.getByLabel('Maximum', { exact: true }).fill(String(options.max));
  }
  if (options.defaultValue !== undefined) {
    await pane
      .getByLabel('Default Value', { exact: true })
      .fill(options.defaultValue);
  }
  if (options.isUnique === true) {
    await pane.getByRole('checkbox', { name: 'Unique' }).click();
  }
  if (options.isRequired === false) {
    await pane.getByRole('checkbox', { name: 'Required' }).click();
  }

  return pane;
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

  await page
    .getByRole('main')
    .getByRole('button', { name: 'Create Collection' })
    .click();
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

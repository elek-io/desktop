import { expect, type Locator, type Page } from '@playwright/test';

import {
  uuid,
  type ComponentItem,
  type ComponentValue,
  type CreateEntryProps,
  type Entry,
  type MdAstRoot,
  type ReferencedValue,
  type SupportedLanguage,
  type UpdateEntryProps,
} from '@elek-io/core';

import { navigate } from './navigation.js';

/**
 * Build a translatable string Entry Value in the shape Core expects, keyed by
 * language. Entry Values are keyed by their field's slug, so pass the result
 * under that slug in `createEntryViaIpc`'s `values`.
 */
export function stringValue(
  content: Partial<Record<SupportedLanguage, string | null>>
): CreateEntryProps['values'][string] {
  return { objectType: 'value', valueType: 'string', content };
}

/**
 * Build a translatable temporal Entry Value (date, datetime or time). Core
 * stores all three as an ISO string in a translatable string Value (see Core's
 * fields docs), so the shape matches `stringValue`. Named for temporal fields to
 * keep the temporal specs self-documenting. Pass valid ISO content, e.g.
 * `{ en: '2026-01-15' }` for a date field.
 */
export function temporalValue(
  content: Partial<Record<SupportedLanguage, string | null>>
): CreateEntryProps['values'][string] {
  return stringValue(content);
}

/**
 * Build an mdast tree holding a single paragraph. A paragraph and its text need
 * no markdown feature enabled, so this is valid content for a field definition
 * with every feature off.
 */
export function mdAstParagraph(text: string): MdAstRoot {
  return {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: text }] },
    ],
  };
}

/**
 * Build a translatable markdown Entry Value. Core stores an mdast tree per
 * language, not a markdown string (see Core's fields docs), so pass a tree from
 * `mdAstParagraph` or `null` for an empty field.
 */
export function markdownValue(
  content: Partial<Record<SupportedLanguage, MdAstRoot | null>>
): CreateEntryProps['values'][string] {
  return { objectType: 'value', valueType: 'mdast', content };
}

/**
 * The markdown field's editable surface, the ProseMirror document the Milkdown
 * editor renders inside the wrapper `MarkdownEditor` draws.
 *
 * Located by ProseMirror's own class rather than by role and name, so a spec
 * reaches the document itself, and every markdown field a form draws, rather
 * than one field by what it is called. `[contenteditable]` would match every
 * atom node inside the document too, such as a reference chip, which draws
 * itself as `contenteditable="false"`.
 */
export function markdownEditorSurface(page: Page): Locator {
  return page.locator('.markdown-editor .ProseMirror');
}

/**
 * Build a single-entry reference Value pointing at one target Entry. An Entry
 * reference carries both the target's `id` and its `collectionId`, since Core's
 * storage layout needs both to find the file. Pass the result under the
 * reference field's slug in `createEntryViaIpc`'s `values`.
 *
 * Called with no arguments it builds an empty reference (no target). Core still
 * requires the value wrapper for an optional reference field, with `content.en`
 * present as an array, so an Entry that holds no reference passes `referenceValue()`.
 */
export function referenceValue(
  entryId?: string,
  collectionId?: string
): ReferencedValue {
  const content =
    entryId !== undefined && collectionId !== undefined
      ? [{ id: entryId, objectType: 'entry' as const, collectionId }]
      : [];
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: content },
  };
}

/**
 * Build a single-asset reference Value pointing at one target Asset. Unlike an
 * entry reference, an asset reference carries only the target's `id` (no
 * `collectionId`, since Assets live at the Project root, not inside a
 * Collection). Pass the result under the asset field's slug in
 * `createEntryViaIpc`'s `values`.
 */
export function assetReferenceValue(assetId: string): ReferencedValue {
  return {
    objectType: 'value',
    valueType: 'reference',
    content: { en: [{ id: assetId, objectType: 'asset' as const }] },
  };
}

/**
 * Build a dynamic field's Value: the ordered sections of a page. Unlike every
 * other Value its content is one flat array rather than a record per language,
 * and each item names the Component it is built from plus that Component's own
 * Values, keyed by field slug. An item id is generated unless one is passed, so
 * a test that asserts on a specific section can name it.
 */
export function componentValue(
  items: Array<{
    id?: string;
    componentId: string;
    values: ComponentItem['values'];
  }>
): ComponentValue {
  return {
    objectType: 'value',
    valueType: 'component',
    content: items.map((item) => ({
      id: item.id ?? uuid(),
      componentId: item.componentId,
      values: item.values,
    })),
  };
}

/**
 * Create an Entry directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify. `values` is keyed by field slug (see `stringValue`). To exercise the
 * create flow through the form, use the Entry create route with `fillEntryForm`.
 */
export async function createEntryViaIpc(
  page: Page,
  props: {
    projectId: string;
    collectionId: string;
    values: CreateEntryProps['values'];
  }
): Promise<Entry> {
  return page.evaluate(async (p) => window.ipc.core.entries.create(p), props);
}

/**
 * Update an Entry directly over IPC, bypassing the UI.
 *
 * Use this to arrange a precondition a test depends on but does not itself
 * verify, such as a Project holding a changed Entry for a Release's diff. To
 * exercise the update flow through the form, use the Entry update route.
 */
export async function updateEntryViaIpc(
  page: Page,
  props: {
    projectId: string;
    collectionId: string;
    id: string;
    values: UpdateEntryProps['values'];
  }
): Promise<Entry> {
  return page.evaluate(async (p) => window.ipc.core.entries.update(p), props);
}

/**
 * Delete an Entry directly over IPC, bypassing the UI.
 *
 * There is no UI control to delete an Entry (the `EntryTable` actions column is
 * commented out), so this is the only way to reach `entries.delete`. Used to
 * observe the delete guard as a bare throw / no-throw: a delete rejects while
 * another Entry references the target and resolves once the referrer is gone.
 */
export async function deleteEntryViaIpc(
  page: Page,
  props: { projectId: string; collectionId: string; id: string }
): Promise<void> {
  await page.evaluate(async (p) => window.ipc.core.entries.delete(p), props);
}

/**
 * List a Collection's Entries directly over IPC, bypassing the UI.
 *
 * Used to find an Entry a test created through the form, since the Entry table's
 * value columns render nothing yet (see not-yet-implemented.md) and the create
 * route redirects to the Collection rather than to the new Entry.
 */
export async function listEntriesViaIpc(
  page: Page,
  props: { projectId: string; collectionId: string }
): Promise<Entry[]> {
  const list = await page.evaluate(
    async (p) => window.ipc.core.entries.list({ ...p, limit: 0 }),
    props
  );
  return list.list;
}

/**
 * One row of the list of Entries beside the editor, by the title it shows.
 *
 * A row's accessible name runs its title, when it last changed and whatever
 * badge it carries, so the row is found by the title element inside it rather
 * than by that whole name.
 */
export function entryRow(page: Page, title: string): Locator {
  return page
    .locator('[data-slot="entry-row"]')
    .filter({ has: page.getByText(title, { exact: true }) });
}

/**
 * The switch above an Entry's fields, which sets the language of the whole
 * Entry. It is a row of segments while they fit and one dropdown otherwise.
 */
export function languageSwitch(page: Page): Locator {
  return page.locator('[data-slot="language-switch"]');
}

/**
 * Take the whole Entry into another language, through the switch above its
 * fields.
 *
 * It presses the segment while the languages stand side by side, and picks
 * from the dropdown the switch becomes when they do not fit.
 */
export async function chooseLanguage(
  page: Page,
  language: SupportedLanguage
): Promise<void> {
  const switcher = languageSwitch(page);
  // A segment shows the language's code and says its word for a screen
  // reader, so it is found by the code its name opens with.
  const segment = switcher.getByRole('button', {
    name: new RegExp(`^${language.toUpperCase()}\\b`),
  });
  const picker = switcher.getByRole('combobox');
  // Which of the two the switch is depends on how many languages the Project
  // holds, so the wait is on whichever one it drew. Without it a form that is
  // still reading reads as neither.
  await expect(segment.or(picker)).toBeVisible();

  if ((await segment.count()) > 0) {
    await segment.click();
    await expect(segment).toHaveAttribute('aria-pressed', 'true');
    return;
  }

  await picker.click();
  await page.getByRole('option', { name: languageName(language) }).click();
}

/** A language by its word in English, which is what the switch says it is. */
function languageName(language: SupportedLanguage): string {
  return (
    new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language
  );
}

/** Route to a Collection's Entry create form and confirm the app rendered. */
export async function navigateToEntryCreate(
  page: Page,
  ids: { projectId: string; collectionId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/collections/${ids.collectionId}/create`
  );
}

/** Route to an Entry's update form and confirm the app rendered there. */
export async function navigateToEntryUpdate(
  page: Page,
  ids: { projectId: string; collectionId: string; entryId: string }
): Promise<void> {
  await navigate(
    page,
    `#/projects/${ids.projectId}/collections/${ids.collectionId}/${ids.entryId}/update`
  );
}

/**
 * Fill the dynamically generated Entry form. Fields are keyed by their label
 * (as shown above each input).
 *
 * A field value is either:
 * - a string, which fills the field in the language the form is showing, or
 * - a per-language record like `{ en: 'Hello', de: 'Hallo' }`, which takes the
 *   whole Entry into each of those languages through the switch above its
 *   fields and fills the field there.
 *
 * A per-language record leaves the form in the last language it filled, and
 * the language it started in is restored at the end, so a spec that fills one
 * field per language and then reads the form finds it as it left it.
 */
export async function fillEntryForm(
  page: Page,
  fields: Record<string, string | Partial<Record<SupportedLanguage, string>>>
): Promise<void> {
  for (const [label, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      await page.getByLabel(label, { exact: true }).fill(value);
      continue;
    }

    for (const [language, text] of Object.entries(value)) {
      await chooseLanguage(page, language as SupportedLanguage);
      await page.getByLabel(label, { exact: true }).fill(text);
    }
  }
}

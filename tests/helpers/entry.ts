import { expect, type Locator, type Page } from '@playwright/test';

import type {
  CreateEntryProps,
  Entry,
  MdAstRoot,
  ReferencedValue,
  SupportedLanguage,
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
 * The markdown field's editable surface, the ProseMirror `contenteditable` the
 * Milkdown editor renders inside the wrapper `MarkdownEditor` draws.
 *
 * Located by class rather than by role on purpose: what a spec asserts here is
 * whether it is editable at all, and a disabled editor deliberately stops
 * exposing the textbox role, so a role locator could not find it to check.
 */
export function markdownEditorSurface(page: Page): Locator {
  return page.locator('.markdown-editor [contenteditable]');
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
 * - a string, which fills the default-language input directly (single-language
 *   projects, or the visible input of a translatable field), or
 * - a per-language record like `{ en: 'Hello', de: 'Hallo' }`, which opens that
 *   field's translations dialog (via its accessible name "Edit translations for
 *   <label>", from form.tsx's translatable trigger), fills each language input
 *   (labelled by its language code, scoped to the dialog), then clicks "Done".
 *
 * The string path stays backward compatible, so existing specs are unaffected.
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

    // Per-language: open the field's translations dialog. Its accessible name
    // comes from the Phase 0 sr-only label on the LanguagesIcon trigger, and the
    // dialog's own name is the field's title (both the field's label).
    await page
      .getByRole('button', { name: `Edit translations for ${label}` })
      .click();
    const dialog = page.getByRole('dialog', { name: label });
    await expect(dialog).toBeVisible();

    for (const [language, text] of Object.entries(value)) {
      await dialog.getByLabel(language, { exact: true }).fill(text);
    }

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  }
}

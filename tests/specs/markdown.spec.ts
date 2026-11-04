import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MarkdownFieldDefinition, MdAstRoot } from '@elek-io/core';

import { closeApp, test, testDataDirs } from '../fixtures/electronApp.js';
import { relaunchApp } from '../helpers/app.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  markdownFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  createEntryViaIpc,
  fillEntryForm,
  listEntriesViaIpc,
  markdownEditorSurface,
  markdownValue,
  navigateToEntryCreate,
  navigateToEntryUpdate,
  stringValue,
} from '../helpers/entry.js';
import { recordedLogs, recordLogsViaIpc } from '../helpers/log.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

/**
 * The parts one control names in `aria-describedby`, by slot and by text.
 *
 * Read off the element itself rather than off the field's label, because what
 * the markdown field has to prove is that the element taking focus is the one
 * carrying them.
 */
async function describedPartsOf(
  page: Page,
  locator: Locator
): Promise<{ slot: string | null; text: string }[]> {
  const ids = (await locator.getAttribute('aria-describedby')) ?? '';
  return page.evaluate(
    (list) =>
      list
        .split(' ')
        .filter((id) => id !== '')
        .map((id) => {
          const node = document.getElementById(id);
          if (node === null) {
            throw new Error(`The editor is described by the missing id ${id}`);
          }
          return {
            slot: node.getAttribute('data-slot'),
            text: (node.textContent ?? '').trim(),
          };
        }),
    ids
  );
}

/**
 * The editable surface, once the editor has settled on one.
 *
 * Milkdown rebuilds the editor when the form stops being disabled, and the
 * element it replaces stays in the document for a moment, so a spec waits for
 * the one that is left rather than reading whichever comes first.
 */
async function settledEditor(page: Page): Promise<Locator> {
  const editor = markdownEditorSurface(page);
  await expect(editor).toHaveCount(1);
  return editor;
}

/**
 * What a toolbar button looks like beyond its color: its ring.
 *
 * Polled, because the ring is transitioned in and out, so a read right after a
 * press would catch it part of the way.
 */
function expectRingOf(
  locator: Locator
): ReturnType<typeof expect.poll<string>> {
  return expect.poll(async () =>
    locator.evaluate((node) => getComputedStyle(node).boxShadow)
  );
}

/** Every markdown feature the toolbar draws a button for in these specs. */
const features: MarkdownFieldDefinition['features'] = {
  ...markdownFieldDefinition().features,
  headings: [2],
  strong: true,
  emphasis: true,
  assetReferences: true,
};

/** Every feature at once, so the toolbar offers each format it can write. */
const everyFeature: MarkdownFieldDefinition['features'] = {
  headings: [2],
  blockquotes: true,
  lists: true,
  taskListItems: false,
  codeBlocks: true,
  thematicBreak: true,
  tables: true,
  footnotes: false,
  rawHtml: false,
  emphasis: true,
  strong: true,
  inlineCode: true,
  strikethrough: true,
  hardLineBreaks: false,
  externalLinks: true,
  externalImages: false,
  entryReferences: true,
  assetReferences: true,
};

/** The message the editor draws when content cannot cross the bridge. */
function bridgeMessage(page: Page): Locator {
  return page.locator('[data-slot="markdown-message"]');
}

/**
 * A tree holding every format the toolbar writes, as the editor itself writes
 * it.
 *
 * Each node is shaped the way the spec above saw the editor store it, down to
 * the empty `code.lang` a code block with no language carries, so a save that
 * changes nothing can be compared against this tree node for node.
 */
function everyFormatTree(ids: {
  assetId: string;
  assetName: string;
  collectionId: string;
  entryId: string;
  entryLabel: string;
}): MdAstRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'plain ' },
          { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
          { type: 'text', value: ' ' },
          { type: 'emphasis', children: [{ type: 'text', value: 'italic' }] },
          { type: 'text', value: ' ' },
          { type: 'inlineCode', value: 'code' },
          { type: 'text', value: ' ' },
          { type: 'delete', children: [{ type: 'text', value: 'gone' }] },
          { type: 'text', value: ' ' },
          {
            type: 'link',
            url: 'https://elek.io',
            title: null,
            children: [{ type: 'text', value: 'link' }],
          },
        ],
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'assetReference',
            assetId: ids.assetId,
            alt: ids.assetName,
            title: null,
          },
          {
            type: 'entryReference',
            collectionId: ids.collectionId,
            entryId: ids.entryId,
            children: [{ type: 'text', value: ids.entryLabel }],
          },
        ],
      },
      {
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'Heading' }],
      },
      {
        type: 'blockquote',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'Quoted' }] },
        ],
      },
      {
        type: 'list',
        ordered: false,
        start: null,
        spread: false,
        children: [
          {
            type: 'listItem',
            spread: true,
            checked: null,
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Bullet' }],
              },
            ],
          },
        ],
      },
      {
        type: 'list',
        ordered: true,
        start: 1,
        spread: false,
        children: [
          {
            type: 'listItem',
            spread: true,
            checked: null,
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'Numbered' }],
              },
            ],
          },
        ],
      },
      { type: 'code', lang: '', meta: null, value: 'const a = 1;' },
      {
        type: 'table',
        align: ['left', 'left'],
        children: [
          {
            type: 'tableRow',
            children: [
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Head A' }],
              },
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Head B' }],
              },
            ],
          },
          {
            type: 'tableRow',
            children: [
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Cell A' }],
              },
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Cell B' }],
              },
            ],
          },
        ],
      },
      { type: 'thematicBreak' },
    ],
  };
}

/**
 * Each format in the editor's document, by what it renders as.
 *
 * One entry per format the toolbar writes, so a format that comes back empty
 * or as something else fails here rather than in a tree comparison, which
 * would say only that two long trees differ.
 */
async function expectEveryFormat(
  page: Page,
  names: { asset: string; entry: string }
): Promise<void> {
  // Every markdown field of the form at once, since a typed Entry spreads the
  // formats over two of them and a seeded one holds them in one.
  const editor = markdownEditorSurface(page);
  await expect(editor.locator('p > strong')).toHaveText('bold');
  await expect(editor.locator('p > em')).toHaveText('italic');
  await expect(editor.locator('p > code')).toHaveText('code');
  await expect(editor.locator('p > del')).toHaveText('gone');
  await expect(editor.locator('a[href="https://elek.io"]')).toHaveText('link');
  await expect(editor.locator('[data-type="asset-reference"]')).toContainText(
    names.asset
  );
  await expect(editor.locator('[data-type="entry-reference"]')).toContainText(
    names.entry
  );
  await expect(editor.locator('h2')).toHaveText('Heading');
  await expect(editor.locator('blockquote')).toContainText('Quoted');
  await expect(editor.locator('ul li')).toContainText('Bullet');
  await expect(editor.locator('ol li')).toContainText('Numbered');
  await expect(editor.locator('pre code')).toHaveText('const a = 1;');
  await expect(editor.locator('table th').first()).toContainText('Head');
  await expect(editor.locator('table td').first()).toContainText('Cell');
  await expect(editor.locator('hr')).toHaveCount(1);
}

test.describe('The markdown field', () => {
  test('shows a format that is on as pressed, by more than its color', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({ features }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const editor = await settledEditor(mainWindow);
    await expect(editor).toBeVisible();

    const bold = mainWindow.getByRole('button', { name: 'Bold' });
    const italic = mainWindow.getByRole('button', { name: 'Italic' });
    // Nothing is bold at an empty cursor, so neither button is pressed and
    // neither draws a ring.
    // shadcn's toggle on Base UI, not a button with a state of our own.
    await expect(bold).toHaveAttribute('data-slot', 'toggle');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expect(italic).toHaveAttribute('aria-pressed', 'false');
    const unpressedRing = await bold.evaluate(
      (node) => getComputedStyle(node).boxShadow
    );

    // ci gives every button of the bar one size, so a toggle, a button that
    // inserts something and the one that opens a menu all measure the same
    // square.
    const boxOf = async (name: string): Promise<string> => {
      const box = await mainWindow.getByRole('button', { name }).boundingBox();
      return `${String(box?.width)} by ${String(box?.height)}`;
    };
    const toggleSize = await boxOf('Bold');
    expect(await boxOf('Reference an Asset')).toBe(toggleSize);
    expect(await boxOf('Heading')).toBe(toggleSize);

    // Bold from the keyboard with nothing selected, which turns the format on
    // for whatever is typed next. Neither the text nor the selection changes
    // there, so this is the state a toolbar watching those two misses.
    await editor.click();
    await bold.focus();
    await mainWindow.keyboard.press('Enter');

    // The format is on, so the button says so, and it is not color alone: ci
    // gives a pressed button a ring in the input color.
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(italic).toHaveAttribute('aria-pressed', 'false');
    await expectRingOf(bold).not.toBe(unpressedRing);
    await expectRingOf(bold).not.toBe('none');

    // What the cursor carried is what the text comes out as, and the button
    // stays pressed inside it.
    await expect(editor).toBeFocused();
    await mainWindow.keyboard.type('Longer evenings');
    await expect(editor.locator('strong')).toHaveText('Longer evenings');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    // Pressing it again at the cursor behind the text turns the format off for
    // what comes next, and the button with it, while the text keeps its own.
    await bold.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expectRingOf(bold).toBe(unpressedRing);
    await expect(editor.locator('strong')).toHaveText('Longer evenings');

    // Over a selection the button says what that text is, and pressing it
    // takes the format off the text itself.
    await editor.click();
    await mainWindow.keyboard.press('ControlOrMeta+a');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await bold.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expectRingOf(bold).toBe(unpressedRing);
    await expect(editor.locator('strong')).toHaveCount(0);
    await expect(editor).toHaveText('Longer evenings');
  });

  test('says what it needs on the element that takes focus', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition({ slug: 'note', label: { en: 'Note' } }),
        markdownFieldDefinition({
          isRequired: true,
          description: { en: 'The article itself' },
          features,
        }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const editor = await settledEditor(mainWindow);
    await expect(editor).toBeVisible();

    // The editable element is what takes focus, so it is what carries the
    // field's name, that it has to be filled, and the parts below it.
    await expect(editor).toHaveRole('textbox');
    await expect(editor).toHaveAttribute('aria-label', 'Body');
    await expect(editor).toHaveAttribute('aria-required', 'true');
    await expect(editor).toHaveAttribute('aria-invalid', 'false');
    expect(await describedPartsOf(mainWindow, editor)).toEqual([
      { slot: 'field-rules', text: 'Required' },
      { slot: 'field-description', text: 'The article itself' },
    ]);
    // The field's label points at it rather than at a wrapper nothing focuses.
    await expect(mainWindow.getByLabel('Body', { exact: true })).toHaveRole(
      'textbox'
    );

    // A refused submit, which is the only way an error is on screen. The
    // editor is left empty while another field dirties the form past the gate.
    await fillEntryForm(mainWindow, { Note: 'Just a note' });
    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    const refused = await describedPartsOf(mainWindow, editor);
    expect(refused.map((part) => part.slot)).toEqual([
      'field-rules',
      'field-description',
      'field-error',
    ]);
    expect(refused[2]?.text).not.toBe('');
  });

  test('lists the Assets it references the way the Asset field does', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const showroom = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({ features }),
      ],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const editor = await settledEditor(mainWindow);
    await expect(editor).toBeVisible();

    await mainWindow
      .getByRole('button', { name: 'Reference an Asset' })
      .click();
    const picker = mainWindow.getByRole('dialog', {
      name: 'Reference an Asset',
    });
    // One Asset goes into the text, so the picker lists them with a radio
    // button each, as the Asset field's own picker does, with the same filter.
    await expect(
      picker.getByRole('textbox', { name: 'Filter Assets' })
    ).toBeVisible();
    const radio = picker.getByRole('radio', {
      name: `${showroom.name} PNG, 70 Bytes`,
      exact: true,
    });
    await radio.focus();
    await mainWindow.keyboard.press('Space');
    await picker.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(picker).toBeHidden();

    // The reference is in the text, which is what the chip the editor draws
    // for it says.
    await expect(editor.getByText(showroom.name)).toBeVisible();
  });

  test('opens with every format that was typed into it', async ({
    mainWindow,
  }, testInfo) => {
    // Slow on purpose: every format the toolbar writes goes in through the
    // toolbar, and the editor reads the saved tree back on the second route.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const showroom = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    // Two markdown fields, because the inline formats are applied over a
    // selection and the blocks are typed line by line. In one field the two
    // would meet: a dialog hands focus back on its own schedule and
    // ProseMirror then writes its own selection into the document again, so a
    // key pressed after the link dialog can land on the text the link was
    // applied over and delete it. Each field holds the group that belongs
    // together, and the link is the last thing typed anywhere.
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({ features: everyFeature }),
        markdownFieldDefinition({
          slug: 'notes',
          label: { en: 'Notes' },
          features: everyFeature,
        }),
      ],
    });
    const referenced = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Opening hours' }),
        body: markdownValue({ en: null }),
        notes: markdownValue({ en: null }),
      },
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await expect(markdownEditorSurface(mainWindow)).toHaveCount(2);
    await fillEntryForm(mainWindow, { Title: 'Typed' });

    // Each field by its own label, since the editable element carries it and
    // every field draws a toolbar of its own.
    const field = (label: string): Locator =>
      mainWindow.locator('.markdown-editor').filter({
        has: mainWindow.getByRole('textbox', { name: label, exact: true }),
      });
    const surface = (label: string): Locator =>
      field(label).locator('.ProseMirror');
    // Clicked rather than pressed from the keyboard, because the toolbar
    // prevents the default of the mouse press, which is what keeps the
    // editor's selection for a format that needs one. The keyboard reach of
    // the same buttons is what the first spec above drives.
    const bar = (label: string, name: string): Locator =>
      field(label).getByRole('button', { name, exact: true });
    const atEnd = async (label: string): Promise<void> => {
      await surface(label).focus();
      await expect(surface(label)).toBeFocused();
      await mainWindow.keyboard.press('ControlOrMeta+End');
    };
    const select = async (characters: number): Promise<void> => {
      for (let step = 0; step < characters; step += 1) {
        await mainWindow.keyboard.press('Shift+ArrowLeft');
      }
    };

    // Every block format in Notes, each on a line of its own at the end, then
    // both references in a paragraph of their own, then the table last, whose
    // cells are the only place a block format takes typed text afterwards.
    await atEnd('Notes');
    await mainWindow.keyboard.type('Heading');
    await bar('Notes', 'Heading').click();
    await mainWindow.getByRole('menuitem', { name: 'Heading 2' }).click();
    await atEnd('Notes');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.type('Quoted');
    await bar('Notes', 'Blockquote').click();
    await atEnd('Notes');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.type('Bullet');
    await bar('Notes', 'Bullet list').click();
    await atEnd('Notes');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.type('Numbered');
    await bar('Notes', 'Ordered list').click();
    await atEnd('Notes');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.press('Enter');
    await mainWindow.keyboard.type('const a = 1;');
    await bar('Notes', 'Code block').click();

    await atEnd('Notes');
    await mainWindow.keyboard.press('Enter');
    await bar('Notes', 'Reference an Asset').click();
    const assetPicker = mainWindow.getByRole('dialog', {
      name: 'Reference an Asset',
    });
    await assetPicker
      .getByRole('radio', { name: new RegExp(showroom.name) })
      .focus();
    await mainWindow.keyboard.press('Space');
    await assetPicker
      .getByRole('button', { name: 'Choose', exact: true })
      .click();
    await expect(assetPicker).toBeHidden();
    await atEnd('Notes');
    await bar('Notes', 'Reference an Entry').click();
    const entryPicker = mainWindow.getByRole('dialog', {
      name: 'Reference an Entry',
    });
    await entryPicker.getByRole('radio', { name: /Opening hours/ }).focus();
    await mainWindow.keyboard.press('Space');
    await entryPicker
      .getByRole('button', { name: 'Choose', exact: true })
      .click();
    await expect(entryPicker).toBeHidden();

    await atEnd('Notes');
    await bar('Notes', 'Thematic break').click();
    await atEnd('Notes');
    await bar('Notes', 'Table').click();
    // The caret lands in the first cell, and Tab walks the row, so three
    // presses reach the first cell of the body in a table of three columns.
    await mainWindow.keyboard.type('Head A');
    await mainWindow.keyboard.press('Tab');
    await mainWindow.keyboard.press('Tab');
    await mainWindow.keyboard.press('Tab');
    await mainWindow.keyboard.type('Cell A');

    // One paragraph in Body holding every inline format, which is the field
    // that combines several of them. Inline code, strike-through and the link
    // each need something selected, so each word is typed with a space behind
    // it and then selected back. The space also keeps the next word out of the
    // mark just applied, and the link comes last, since its dialog is what
    // takes the focus away.
    await atEnd('Body');
    await mainWindow.keyboard.type('plain ');
    await bar('Body', 'Bold').click();
    await mainWindow.keyboard.type('bold');
    await bar('Body', 'Bold').click();
    await mainWindow.keyboard.type(' ');
    await bar('Body', 'Italic').click();
    await mainWindow.keyboard.type('italic');
    await bar('Body', 'Italic').click();
    await mainWindow.keyboard.type(' code ');
    await mainWindow.keyboard.press('ArrowLeft');
    await select(4);
    await bar('Body', 'Inline code').click();
    await atEnd('Body');
    await mainWindow.keyboard.type('gone ');
    await mainWindow.keyboard.press('ArrowLeft');
    await select(4);
    await bar('Body', 'Strikethrough').click();
    await atEnd('Body');
    await mainWindow.keyboard.type('link ');
    await mainWindow.keyboard.press('ArrowLeft');
    await select(4);
    await bar('Body', 'Link').click();
    const linkDialog = mainWindow.getByRole('dialog', {
      name: 'Link the selected text',
    });
    await linkDialog.getByLabel('URL', { exact: true }).fill('https://elek.io');
    await linkDialog.getByRole('button', { name: 'Apply link' }).click();
    await expect(linkDialog).toBeHidden();

    // Everything is in the two editors before it is saved, so what the second
    // route shows is about reading it back rather than about the typing.
    await expectEveryFormat(mainWindow, {
      asset: showroom.name,
      entry: 'Opening hours',
    });
    await expect(bridgeMessage(mainWindow)).toHaveCount(0);

    await mainWindow.getByRole('button', { name: 'Create Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const stored = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const typed = stored.find((entry) => entry.id !== referenced.id);
    expect(typed).toBeDefined();

    // Reopened, each format is back as it was saved, with nothing to say
    // about the content.
    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: typed?.id ?? '',
    });
    await expect(markdownEditorSurface(mainWindow)).toHaveCount(2);
    await expectEveryFormat(mainWindow, {
      asset: showroom.name,
      entry: 'Opening hours',
    });
    await expect(bridgeMessage(mainWindow)).toHaveCount(0);
  });

  test("opens with every format already in the Project's files, and saves it unchanged", async ({
    mainWindow,
  }, testInfo) => {
    // Slow on purpose: the editor reads a tree of every format, and the save
    // below goes through Core.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const showroom = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'Showroom',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        markdownFieldDefinition({ features: everyFeature }),
      ],
    });
    const referenced = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Opening hours' }),
        body: markdownValue({ en: null }),
      },
    });
    const tree = everyFormatTree({
      assetId: showroom.id,
      assetName: showroom.name,
      collectionId: collection.id,
      entryId: referenced.id,
      entryLabel: 'Opening hours',
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Seeded' }),
        body: markdownValue({ en: tree }),
      },
    });

    await navigateToEntryUpdate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      entryId: entry.id,
    });
    const editor = await settledEditor(mainWindow);
    await expectEveryFormat(mainWindow, {
      asset: showroom.name,
      entry: 'Opening hours',
    });
    await expect(bridgeMessage(mainWindow)).toHaveCount(0);

    // Saved without touching the text, which stores the tree it opened with.
    // Save takes nothing while the form is clean, so the Title carries the
    // change and the text has to come back as it went in.
    await editor.click();
    await fillEntryForm(mainWindow, { Title: 'Seeded, renamed' });
    await mainWindow.getByRole('button', { name: 'Update Article' }).click();
    await expect(mainWindow).toHaveURL(
      new RegExp(`#/projects/[^/]+/collections/${collection.id}$`)
    );
    const stored = await listEntriesViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    const saved = stored.find((candidate) => candidate.id === entry.id);
    expect(saved?.values['body']?.content).toEqual({ en: tree });
  });

  test('keeps a Value it cannot read, and says so in words of its own', async ({
    electronApp,
    mainWindow,
  }, testInfo) => {
    // A tree holding a block the field does not allow. Core refuses to write
    // one, so it is put into the Project's file and the app restarted, which
    // is how a Project a pull or another client changed arrives. The restart
    // is also what clears Core's file cache, which a write from outside
    // cannot.
    test.slow();
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        // Code blocks are off, so the editor registers no node for one and
        // cannot turn the stored tree into a document at all.
        markdownFieldDefinition({ features }),
      ],
    });
    const entry = await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Imported' }),
        body: markdownValue({ en: null }),
      },
    });
    const unreadable: MdAstRoot = {
      type: 'root',
      children: [
        { type: 'code', lang: null, meta: null, value: 'const a = 1;' },
      ],
    };
    const file = join(
      testDataDirs(testInfo).dataDir,
      'projects',
      project.id,
      'collections',
      collection.id,
      `${entry.id}.json`
    );
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as {
      values: Record<string, Record<string, unknown>>;
    };
    onDisk.values['body'] = {
      ...onDisk.values['body'],
      content: { en: unreadable },
    };
    writeFileSync(file, JSON.stringify(onDisk, null, 2));

    const { app, window } = await relaunchApp(testInfo, electronApp);
    try {
      await recordLogsViaIpc(app);
      await navigateToEntryUpdate(window, {
        projectId: project.id,
        collectionId: collection.id,
        entryId: entry.id,
      });
      const editor = await settledEditor(window);

      // The field says what it means for the text, in its own words, and the
      // element that takes focus is described by that sentence.
      await expect(bridgeMessage(window)).toHaveText(
        "Desktop can't show this text. It stays saved as it is."
      );
      expect(await describedPartsOf(window, editor)).toEqual([
        {
          slot: 'markdown-message',
          text: "Desktop can't show this text. It stays saved as it is.",
        },
      ]);
      // Nothing of what was thrown is on the screen, and that includes the
      // stored text itself, which the thrown message carries.
      const shown = await window.locator('body').innerText();
      expect(shown).not.toContain('Cannot match');
      expect(shown).not.toContain('const a = 1;');

      // The box takes no edit, and keeps its place in the tab order so the
      // sentence can still be reached and heard.
      await expect(editor).toHaveAttribute('contenteditable', 'false');
      await expect(editor).toHaveAttribute('aria-readonly', 'true');
      await expect(editor).toHaveAttribute('tabindex', '0');
      await editor.focus();
      await expect(editor).toBeFocused();

      // Clicking in, typing and leaving the field change nothing.
      await editor.click();
      await window.keyboard.type('overwritten');
      await window.getByLabel('Title', { exact: true }).click();
      await expect(editor).toHaveText('');

      // And saving stores no empty or partial Value in its place: the form
      // still holds the tree it opened with, which this field cannot take, so
      // the save is refused in the field's own words and the file keeps what
      // it had. The refusal is what says the submit was taken at all, and the
      // route is only read once it is on screen, since a save that went
      // through leaves this route.
      await fillEntryForm(window, { Title: 'Imported, renamed' });
      await window.getByRole('button', { name: 'Update Article' }).click();
      await expect(
        window.getByText(
          "This field can't hold what's in it. Please report it, so we can fix it."
        )
      ).toBeVisible();
      await expect(editor).toHaveAttribute('aria-invalid', 'true');
      await expect(window).toHaveURL(
        new RegExp(`/collections/${collection.id}/${entry.id}/update$`)
      );
      const stored = await listEntriesViaIpc(window, {
        projectId: project.id,
        collectionId: collection.id,
      });
      expect(
        stored.find((candidate) => candidate.id === entry.id)?.values['body']
          ?.content
      ).toEqual({
        en: unreadable,
      });

      // What the editor could not read reached the log file, with the type,
      // the message and the stack a pane's boundary writes.
      const logs = await recordedLogs(app);
      const record = logs.find((entry) =>
        entry.message.startsWith('Markdown editor could not read')
      );
      expect(record?.level).toBe('error');
      expect(record?.source).toBe('desktop');
      expect(record?.meta['exception.type']).toBe('MilkdownError');
      expect(record?.meta['exception.stacktrace']).toBeDefined();
    } finally {
      // The relaunched app is not covered by the fixture teardown, so close it.
      await closeApp(app);
    }
  });
});

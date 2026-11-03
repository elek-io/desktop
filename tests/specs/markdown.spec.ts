import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { createAssetViaIpc, makeTempFile, pngBytes } from '../helpers/asset.js';
import {
  createCollectionViaIpc,
  markdownFieldDefinition,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  fillEntryForm,
  markdownEditorSurface,
  navigateToEntryCreate,
} from '../helpers/entry.js';
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
const features = {
  ...markdownFieldDefinition().features,
  strong: true,
  emphasis: true,
  assetReferences: true,
};

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

    // Typed text, selected, then Bold from the keyboard, which is the whole
    // point of a button that acts like a toggle.
    await editor.click();
    await mainWindow.keyboard.type('Longer evenings');
    await mainWindow.keyboard.press('ControlOrMeta+a');
    await bold.focus();
    await mainWindow.keyboard.press('Enter');

    // The format is on, so the button says so, and it is not color alone: ci
    // gives a pressed button a ring in the input color.
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(italic).toHaveAttribute('aria-pressed', 'false');
    await expectRingOf(bold).not.toBe(unpressedRing);
    await expectRingOf(bold).not.toBe('none');
    await expect(editor.locator('strong')).toHaveText('Longer evenings');

    // Pressing it again turns the format off, and the button with it.
    await bold.focus();
    await mainWindow.keyboard.press('Enter');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expectRingOf(bold).toBe(unpressedRing);
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
});

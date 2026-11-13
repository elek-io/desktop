import { expect } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

import { test } from '../fixtures/electronApp.js';
import {
  assetCard,
  assetGrid,
  assetGridOrder,
  assetPane,
  createAssetViaIpc,
  deleteOpenAsset,
  jpegBytes,
  makeTempFile,
  openAsset,
  pngBytes,
  readAssetViaIpc,
} from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  dismissDialog,
  lastSaveDialogOptions,
  stubFileDialog,
} from '../helpers/dialog.js';
import {
  assetReferenceValue,
  createEntryViaIpc,
  navigateToEntryCreate,
  stringValue,
} from '../helpers/entry.js';
import {
  recordCoreCallProps,
  recordedCoreCallProps,
  recordedCoreCalls,
  stubCoreHang,
  stubCoreRecord,
  stubCoreReject,
} from '../helpers/ipc.js';
import { createProjectViaIpc, navigateToAssets } from '../helpers/project.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import { MINIMUM_WINDOW_SIZE, resizeWindow } from '../helpers/window.js';

test.describe('Assets', () => {
  test('shows each Asset as a card of ci’s grid, and the filter narrows it', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'price-list.jpg', jpegBytes),
      name: 'price-list',
    });

    await navigateToAssets(mainWindow, project.id);

    // The page head says how many there are, and holds the filter and the one
    // primary button, as ci draws it.
    await expect(
      mainWindow.getByRole('heading', { name: 'Assets 2' })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Filter Assets')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Add Asset' })
    ).toBeVisible();

    // A card per Asset, each with the file name it is stored under and what
    // kind of file it is.
    await expect(assetGrid(mainWindow)).toHaveCount(2);
    await expect(
      assetCard(mainWindow, 'showroom.png PNG, 70 Bytes')
    ).toBeVisible();
    await expect(assetCard(mainWindow, 'price-list.jpg JPG, ')).toBeVisible();

    // The filter narrows the grid by what the cards show, as it is typed.
    await mainWindow.getByLabel('Filter Assets').fill('showroom');
    await expect(assetGrid(mainWindow)).toHaveCount(1);
    await expect(assetCard(mainWindow, 'showroom.png')).toBeVisible();

    // The extension is part of that name, so a type narrows the grid too.
    await mainWindow.getByLabel('Filter Assets').fill('.jpg');
    await expect(assetGrid(mainWindow)).toHaveCount(1);
    await expect(assetCard(mainWindow, 'price-list.jpg')).toBeVisible();

    // And nothing matching says so rather than showing an empty grid.
    await mainWindow.getByLabel('Filter Assets').fill('nothing of the sort');
    await expect(assetGrid(mainWindow)).toHaveCount(0);
    await expect(
      mainWindow.getByText('No Asset matches the filter.')
    ).toBeVisible();
  });

  test('opens an Asset’s pane from its card, which marks the card as the current one', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
      description: 'The showroom from the street',
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    // The open Asset is in the address, which is what lets the question before
    // losing changes catch a click on the next card.
    await expect(mainWindow).toHaveURL(
      (url) => url.hash === `#/projects/${project.id}/assets/${asset.id}`
    );

    // The pane shows what the Asset is and what a person may change about it.
    const pane = assetPane(mainWindow);
    await expect(pane.getByText('showroom.png', { exact: true })).toBeVisible();
    await expect(pane.getByText('PNG, 70 Bytes')).toBeVisible();
    await expect(pane.getByLabel('Name', { exact: true })).toHaveValue(
      'showroom'
    );
    await expect(pane.getByText('.png', { exact: true })).toBeVisible();
    await expect(pane.getByLabel('Description', { exact: true })).toHaveValue(
      'The showroom from the street'
    );
    await expect(
      pane.getByRole('button', { name: 'Replace file of showroom.png' })
    ).toBeVisible();
    await expect(
      pane.getByRole('button', { name: 'Save a copy of showroom.png' })
    ).toBeVisible();

    // The chosen card is marked as the one the pane is about, by its surface
    // and the bar, and says so to a screen reader.
    const card = assetCard(mainWindow, 'showroom.png');
    await expect(card).toHaveAttribute('aria-current', 'page');
    await expect(card).toHaveAttribute('data-active', 'true');

    // Closing the pane leaves the grid with no card marked.
    await pane.getByRole('link', { name: 'Close showroom.png' }).click();
    await expect(assetPane(mainWindow)).toBeHidden();
    await expect(card).not.toHaveAttribute('aria-current', 'page');
  });

  test('saves a new name and description without replacing the file', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    // What the save carries is what says it left the file alone, so the
    // channel in front of Core is watched while it answers as usual.
    await recordCoreCallProps(electronApp, 'core:assets:update');

    const pane = assetPane(mainWindow);
    // A name as somebody types it, with a capital and a space in it, which
    // Core slugifies on the way in, so what the screen shows afterwards is
    // what an editor really gets.
    await pane.getByLabel('Name', { exact: true }).fill('Showroom Evening');
    await pane
      .getByLabel('Description', { exact: true })
      .fill('The showroom in the evening');
    await pane.getByRole('button', { name: 'Save showroom.png' }).click();

    // The grid shows the new name at once, the pane's head is about the same
    // Asset under it, and the Name field holds what Core stored rather than
    // what was typed.
    await expect(assetCard(mainWindow, 'showroom-evening.png')).toBeVisible();
    await expect(
      assetPane(mainWindow).getByText('showroom-evening.png', { exact: true })
    ).toBeVisible();
    await expect(
      assetPane(mainWindow).getByRole('button', {
        name: 'More for showroom-evening.png',
      })
    ).toBeVisible();
    await expect(
      assetPane(mainWindow).getByLabel('Name', { exact: true })
    ).toHaveValue('showroom-evening');

    // The save asked Core to change the two fields and nothing else: no file
    // went with it, which is what keeps the stored one.
    expect(await recordedCoreCallProps(electronApp)).toEqual([
      {
        id: asset.id,
        projectId: project.id,
        name: 'Showroom Evening',
        description: 'The showroom in the evening',
        newFilePath: undefined,
      },
    ]);

    // And what Core derives from a file is what it was, so the Asset is still
    // the one that was opened.
    const saved = await readAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
    });
    expect(saved.name).toBe('showroom-evening');
    expect(saved.description).toBe('The showroom in the evening');
    expect(saved.extension).toBe(asset.extension);
    expect(saved.mimeType).toBe(asset.mimeType);
    expect(saved.size).toBe(asset.size);
    expect(saved.absolutePath).toBe(asset.absolutePath);
  });

  test('replaces the file only once the pane is saved', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });
    // The replacement is a JPEG, a different type than the seed, so what Core
    // derives from the file says whether it went through.
    await stubFileDialog(electronApp, {
      open: [makeTempFile(testInfo, 'showroom.jpg', jpegBytes)],
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    const pane = assetPane(mainWindow);
    await pane
      .getByRole('button', { name: 'Replace file of showroom.png' })
      .click();
    await expect(pane.getByText('New file: showroom.jpg')).toBeVisible();

    // Nothing reached Core yet: the pending file waits for Save.
    const pending = await readAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
    });
    expect(pending.mimeType).toBe('image/png');

    await pane.getByRole('button', { name: 'Save showroom.png' }).click();
    await expect(assetCard(mainWindow, 'showroom.jpg')).toBeVisible();

    const replaced = await readAssetViaIpc(mainWindow, {
      projectId: project.id,
      id: asset.id,
    });
    expect(replaced.mimeType).toBe('image/jpeg');
    // And the pending file is gone with the save, so the pane does not offer
    // to replace it twice.
    await expect(
      assetPane(mainWindow).getByText('New file: showroom.jpg')
    ).toBeHidden();
  });

  test('adds an Asset from a file through the pane for it', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await stubFileDialog(electronApp, {
      open: [makeTempFile(testInfo, 'company-logo.png', pngBytes)],
    });

    await navigateToAssets(mainWindow, project.id);
    await expect(mainWindow.getByText('No Assets yet')).toBeVisible();

    // Add Asset opens the system's file dialog, and then the pane for the
    // picked file, with its name filled in.
    await mainWindow.getByRole('button', { name: 'Add Asset' }).click();
    const pane = assetPane(mainWindow);
    await expect(pane.getByText('Add Asset', { exact: true })).toBeVisible();
    await expect(pane.getByLabel('Name', { exact: true })).toHaveValue(
      'company-logo'
    );
    await expect(
      pane.getByText(
        'The file company-logo.png is added once it has a name and a description.'
      )
    ).toBeVisible();

    // Core requires a description, so Save says why it cannot save yet.
    const save = pane.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(pane.getByText('1 field is still empty')).toBeVisible();

    // Another file picked while this pane is open is what it is about from
    // then on, and the name follows that file rather than the first one.
    await stubFileDialog(electronApp, {
      open: [makeTempFile(testInfo, 'price-list.png', pngBytes)],
    });
    await mainWindow.getByRole('button', { name: 'Add Asset' }).click();
    await expect(pane.getByLabel('Name', { exact: true })).toHaveValue(
      'price-list'
    );

    await pane
      .getByLabel('Description', { exact: true })
      .fill('The price list');
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await save.click();

    // The Asset is in the grid, and its own pane took the place of the one
    // that added it.
    await expect(assetCard(mainWindow, 'price-list.png')).toBeVisible();
    await expect(
      assetPane(mainWindow).getByRole('button', {
        name: 'More for price-list.png',
      })
    ).toBeVisible();
  });

  test('adds an Asset inside the Asset picker, where it can be chosen', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [
        textFieldDefinition(),
        assetFieldDefinition({ slug: 'cover', label: { en: 'Cover' }, max: 1 }),
      ],
    });
    await stubFileDialog(electronApp, {
      open: [makeTempFile(testInfo, 'company-logo.png', pngBytes)],
    });

    await navigateToEntryCreate(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
    });
    await mainWindow.getByRole('button', { name: /^Choose Cover/ }).click();
    const picker = mainWindow.getByRole('dialog', { name: 'Choose Cover' });
    await expect(picker).toBeVisible();
    await expect(
      picker.getByText('No Assets yet. Add one on the Assets screen first.')
    ).toBeVisible();

    // The picker has no pane of its own, so Add Asset asks for the name and
    // the description in a dialog instead.
    await picker.getByRole('button', { name: 'Add Asset' }).click();
    const addDialog = mainWindow.getByRole('dialog', { name: 'Add Asset' });
    await expect(addDialog).toBeVisible();
    await expect(addDialog.getByLabel('Name', { exact: true })).toHaveValue(
      'company-logo'
    );
    await addDialog
      .getByLabel('Description', { exact: true })
      .fill('The company logo');
    await addDialog.getByRole('button', { name: 'Add Asset' }).click();
    await expect(addDialog).toBeHidden();

    // It stands in the picker's grid, drawn as the same card the Assets screen
    // draws, and is chosen from there.
    await expect(assetGrid(mainWindow)).toHaveCount(1);
    await expect(
      picker.getByRole('radio', { name: /^company-logo\.png PNG, / })
    ).toBeVisible();
    await picker.getByRole('radio', { name: /^company-logo\.png/ }).check();
    await picker.getByRole('button', { name: 'Choose' }).click();
    await expect(picker).toBeHidden();
    await expect(
      mainWindow.getByText('company-logo', { exact: true })
    ).toBeVisible();
  });

  test('blocks Save with its reason, and asks before a change is lost', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'price-list.png', pngBytes),
      name: 'price-list',
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    const pane = assetPane(mainWindow);
    const save = pane.getByRole('button', { name: 'Save showroom.png' });
    const name = pane.getByLabel('Name', { exact: true });
    const description = pane.getByLabel('Description', { exact: true });

    // Nothing may reach Core, however the submit is raised. The channel in
    // front of it is the seam this records.
    await stubCoreRecord(electronApp, 'core:assets:update');

    // Core requires both, so either one empty is a reason, and each of them
    // blocks Save the same way. One step per field, so a half that stops
    // blocking says which one it was.
    for (const [label, field] of [
      ['Description', description],
      ['Name', name],
    ] as const) {
      await test.step(`an empty ${label} blocks Save`, async () => {
        const filled = await field.inputValue();
        await field.fill('');
        await expect(save).toHaveAttribute('aria-disabled', 'true');
        await expect(pane.getByText('1 field is still empty')).toBeVisible();

        // A click, which the control still takes, since it is not
        // `disabled`, and Enter in a field, which raises a submit of the form
        // itself.
        await save.click({ force: true });
        await field.press('Enter');
        expect(await recordedCoreCalls(electronApp)).toEqual([]);

        // Put back for the next one, so exactly one field is empty each time.
        await field.fill(filled);
        await expect(pane.getByText('1 field is still empty')).toBeHidden();
      });
    }

    // The question before changes are lost is about what is still typed, so
    // the Description is left empty for it.
    await description.fill('');
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Choosing another card with the change still unsaved asks first, and Keep
    // editing leaves the pane as it was.
    await assetCard(mainWindow, 'price-list.png').click();
    await expect(
      mainWindow.getByText('Discard your changes to showroom.png?')
    ).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Keep editing' }).click();
    await expect(description).toHaveValue('');

    // Closing the pane asks the same question, and Discard lets it go.
    await pane.getByRole('link', { name: 'Close showroom.png' }).click();
    await expect(
      mainWindow.getByText('Discard your changes to showroom.png?')
    ).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Discard' }).click();
    await expect(assetPane(mainWindow)).toBeHidden();

    // And so does leaving the page altogether.
    await openAsset(mainWindow, 'showroom.png');
    await assetPane(mainWindow)
      .getByLabel('Name', { exact: true })
      .fill('showroom-evening');
    await mainWindow
      .locator('[data-slot="sidebar"]')
      .getByRole('link', { name: /^Dashboard/ })
      .click();
    await expect(
      mainWindow.getByText('Discard your changes to showroom.png?')
    ).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Discard' }).click();
    await expect(mainWindow).toHaveURL(
      (url) => url.hash === `#/projects/${project.id}/dashboard`
    );
  });

  test('deletes an Asset from its More menu and leaves the focus in the grid', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    for (const name of ['a-first', 'b-second', 'c-third']) {
      await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath: makeTempFile(testInfo, `${name}.png`, pngBytes),
        name: name,
      });
    }

    await navigateToAssets(mainWindow, project.id);
    // Core answers the Assets in no particular order, so where a card stands
    // is read rather than assumed.
    const [, middle = '', after = ''] = await assetGridOrder(mainWindow);
    await openAsset(mainWindow, middle);
    await deleteOpenAsset(mainWindow, middle);

    // The Asset is gone with its pane, and the grid keeps the focus: the card
    // that took the deleted one's place has it. Asserted on that card rather
    // than on whatever has the focus, since the document body answers for a
    // focus that landed nowhere and carries every card's name.
    await expect(assetCard(mainWindow, middle)).toBeHidden();
    await expect(assetPane(mainWindow)).toBeHidden();
    await expect(assetGrid(mainWindow)).toHaveCount(2);
    await expect(assetCard(mainWindow, after)).toBeFocused();

    // Deleting the last one leaves no grid, so Add Asset takes the focus.
    for (const fileName of await assetGridOrder(mainWindow)) {
      await openAsset(mainWindow, fileName);
      await deleteOpenAsset(mainWindow, fileName);
    }
    await expect(mainWindow.getByText('No Assets yet')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Add Asset' })
    ).toBeFocused();
  });

  test('keeps an Asset an Entry still uses, and says why it cannot go', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Core blocks the delete with a Conflict listing the referring Entry.
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), assetFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Uses the showroom' }),
        logo: assetReferenceValue(asset.id),
      },
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');
    await deleteOpenAsset(mainWindow, 'showroom.png');

    // The refusal is answered in place, in the dialog that takes the confirm's
    // place rather than on the error screen.
    await expect(
      mainWindow.getByText('Could not delete this Asset')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('used by one or more Entries')
    ).toBeVisible();
    await dismissDialog(mainWindow);

    // Nothing was deleted, so the Asset and its pane are still there.
    await expect(assetCard(mainWindow, 'showroom.png')).toBeVisible();
    await expect(
      assetPane(mainWindow).getByRole('button', {
        name: 'More for showroom.png',
      })
    ).toBeVisible();
  });

  test('routes an unexpected delete failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    // The delete handles only a referenced-Asset Conflict in place, so every
    // other failure must reach the root error boundary. Guards the
    // throwOnError predicate against a regression to a blanket
    // throwOnError: false.
    await stubCoreReject(electronApp, 'core:assets:delete');
    await deleteOpenAsset(mainWindow, 'showroom.png');

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Could not delete this Asset')
    ).toBeHidden();
  });

  test('offers the Asset’s own name and type to the save dialog, and writes the copy', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });
    const target = testInfo.outputPath('a-copy.png');
    await stubFileDialog(electronApp, { save: target });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');
    await assetPane(mainWindow)
      .getByRole('button', { name: 'Save a copy of showroom.png' })
      .click();

    // The file went to the path the person picked, through Core's own save.
    await expect
      .poll(() => (existsSync(target) ? statSync(target).size : 0))
      .toBeGreaterThan(0);

    // No test can drive a native panel, so what the app asked it for is what
    // is asserted here. The panel itself is the hand check in
    // contributing/testing.md.
    const options = await lastSaveDialogOptions(electronApp);
    expect(options).not.toBeNull();
    expect(options?.title).toBe('Save a copy of showroom.png');
    expect(options?.buttonLabel).toBe('Save a copy');
    // The name whole and once, so no platform offers `showroom` or
    // `showroom.png.png`.
    expect(options?.defaultPath).toBe('showroom.png');
    // One filter, on the Asset's own type, which keeps a PNG from being saved
    // as something else and leaves macOS without its format chooser.
    expect(options?.filters).toEqual([
      { name: 'PNG file', extensions: ['png'] },
    ]);
    // None of Electron's properties touches the name field, so the dialog sets
    // none.
    expect(options?.properties).toBeUndefined();
  });

  test('holds the pane while its own save runs', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });

    await navigateToAssets(mainWindow, project.id);
    await openAsset(mainWindow, 'showroom.png');

    const pane = assetPane(mainWindow);
    await pane
      .getByLabel('Description', { exact: true })
      .fill('An edited description');
    const save = pane.getByRole('button', { name: 'Save showroom.png' });
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');

    // Make the save never resolve, so what the pane does while it runs is
    // stable to assert.
    await stubCoreHang(electronApp, 'core:assets:update');
    await save.click();

    // Save says it is busy, and the fields take no edit that the state the
    // save brings back would drop.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(
      pane.getByLabel('Description', { exact: true })
    ).toHaveAttribute('readonly', '');
  });

  test('renders an Asset’s preview over the custom file protocol', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'showroom.png', pngBytes),
      name: 'showroom',
    });

    await navigateToAssets(mainWindow, project.id);

    // The card's preview actually loaded its bytes over the
    // elek-io-local-file:// protocol under the packaged CSP: a failed
    // protocol or CSP load leaves naturalWidth at 0.
    const cardPreview = mainWindow.locator('[data-slot="asset-card"] img');
    await expect
      .poll(async () => cardPreview.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);

    // And so does the bigger one the pane draws.
    await openAsset(mainWindow, 'showroom.png');
    const panePreview = assetPane(mainWindow).locator('img');
    await expect
      .poll(async () => panePreview.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('fits the smallest window the app supports, with a pane open', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    for (const name of ['a-first', 'b-second', 'c-third', 'd-fourth']) {
      await createAssetViaIpc(mainWindow, {
        projectId: project.id,
        filePath: makeTempFile(testInfo, `${name}.png`, pngBytes),
        name: name,
      });
    }
    // The longest name ci measured this screen with, which is the one that has
    // to be cut rather than widen a column.
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: makeTempFile(testInfo, 'test-drive-weekend.png', pngBytes),
      name: 'test-drive-weekend-at-the-showroom',
    });

    await navigateToAssets(mainWindow, project.id);
    await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);
    await openAsset(mainWindow, 'test-drive-weekend-at-the-showroom.png');

    for (const theme of ['light', 'dark'] as const) {
      // Setting the theme reloads the renderer, so the screen is waited for
      // again before anything on it is measured.
      await setTheme(mainWindow, theme);
      await expect(assetPane(mainWindow)).toBeVisible();
      await expect(assetGrid(mainWindow).first()).toBeVisible();

      // The pane is taller than the window at this height, so its body
      // scrolls, which is how ci keeps a pane's contents reachable. Save is
      // scrolled to rather than expected on screen, and what is asserted is
      // that it stands inside the pane once it is.
      const save = assetPane(mainWindow).locator('[type="submit"]');
      await save.scrollIntoViewIfNeeded();

      const measured = await mainWindow.evaluate(() => {
        const panel = document.querySelector('[data-slot="panel"]');
        const pane = document.querySelector('[data-slot="asset-pane"]');
        const cards = Array.from(
          document.querySelectorAll('[data-slot="asset-card"]')
        );
        const names = cards.map((card) => card.querySelector('.truncate'));
        const save = document.querySelector(
          '[data-slot="asset-pane"] [type="submit"]'
        );
        const paneBody = document.querySelector(
          '[data-slot="asset-pane"] [data-slot="scroll-area-viewport"]'
        );
        if (panel === null || pane === null || save === null) {
          throw new Error('The screen draws no panel, pane or Save');
        }

        const longest =
          names.find(
            (name) => name !== null && name.scrollWidth > name.clientWidth
          ) ?? null;

        return {
          panel: panel.getBoundingClientRect(),
          pane: pane.getBoundingClientRect(),
          paneScrolls:
            paneBody !== null && paneBody.scrollHeight > paneBody.clientHeight,
          columns: cards
            .slice(0, 4)
            .map((card) => Math.round(card.getBoundingClientRect().width)),
          save: save.getBoundingClientRect(),
          cutName:
            longest === null
              ? null
              : getComputedStyle(longest).getPropertyValue('text-overflow'),
        };
      });

      // The pane keeps ci's 296 px and the grid takes what is left, so neither
      // runs past the panel.
      expect(Math.round(measured.pane.width)).toBe(296);
      expect(Math.round(measured.pane.right)).toBeLessThanOrEqual(
        Math.round(measured.panel.right)
      );
      expect(new Set(measured.columns).size).toBe(1);

      // Save stands inside the pane rather than past one of its edges.
      expect(Math.round(measured.save.right)).toBeLessThanOrEqual(
        Math.round(measured.pane.right)
      );
      expect(Math.round(measured.save.left)).toBeGreaterThanOrEqual(
        Math.round(measured.pane.left)
      );
      expect(Math.round(measured.save.bottom)).toBeLessThanOrEqual(
        Math.round(measured.pane.bottom)
      );
      expect(Math.round(measured.save.top)).toBeGreaterThanOrEqual(
        Math.round(measured.pane.top)
      );

      // A name too long for its column is cut with an ellipsis rather than
      // widening the card.
      expect(measured.cutName).toBe('ellipsis');

      // And the pane's own body is what scrolls, rather than the pane growing
      // past the panel.
      expect(measured.paneScrolls).toBe(true);
    }
  });
});

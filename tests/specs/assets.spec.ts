import { expect } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

import { test } from '../fixtures/electronApp.js';
import {
  createAssetViaIpc,
  jpegBytes,
  makeTempFile,
  pngBytes,
} from '../helpers/asset.js';
import {
  assetFieldDefinition,
  createCollectionViaIpc,
  textFieldDefinition,
} from '../helpers/collection.js';
import {
  confirmDialog,
  dismissDialog,
  stubFileDialog,
} from '../helpers/dialog.js';
import {
  assetReferenceValue,
  createEntryViaIpc,
  stringValue,
} from '../helpers/entry.js';
import { stubCoreReject } from '../helpers/ipc.js';
import { createProjectViaIpc, navigateToAssets } from '../helpers/project.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Assets', () => {
  test('creates an asset through the form and shows its teaser', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // The Add Asset flow opens a native file picker first, so stub it to return
    // our temp PNG before driving the UI.
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await stubFileDialog(electronApp, { open: [filePath] });

    await navigateToAssets(mainWindow, project.id);
    await expect(mainWindow.getByText('No Assets yet')).toBeVisible();

    // The header "Add Asset" runs the (stubbed) picker, then opens the Add Asset
    // dialog. The name is not derived from the picked file, so fill it and the
    // description, then submit inside the dialog (the header trigger shares the
    // "Add Asset" label, so scope to the dialog).
    await mainWindow.getByRole('button', { name: 'Add Asset' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Asset name', { exact: true }).fill('Company logo');
    await dialog
      .getByLabel('Asset description', { exact: true })
      .fill('The company logo');
    await dialog.getByRole('button', { name: 'Add Asset' }).click();

    // The create reached Core without throwing: the dialog closes, the empty
    // state is gone and the new teaser renders with its (un-slugified)
    // description and its controls.
    await expect(dialog).toBeHidden();
    await expect(mainWindow.getByText('No Assets yet')).toBeHidden();
    await expect(mainWindow.getByText('The company logo')).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'View' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Delete' })
    ).toBeVisible();
  });

  test('deletes an unreferenced asset and returns to the empty state', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, { projectId: project.id, filePath });

    await navigateToAssets(mainWindow, project.id);
    await expect(
      mainWindow.getByText('An Asset created by the E2E tests')
    ).toBeVisible();

    // The teaser Delete opens the confirm alertdialog (role="alertdialog").
    await mainWindow.getByRole('button', { name: 'Delete' }).click();
    await expect(
      mainWindow.getByText('You are about to delete this Asset')
    ).toBeVisible();
    await confirmDialog(mainWindow, 'Delete');

    // The delete reached Core: the teaser is gone and the empty state returns.
    await expect(mainWindow.getByText('No Assets yet')).toBeVisible();
    await expect(
      mainWindow.getByText('An Asset created by the E2E tests')
    ).toBeHidden();
  });

  test('replaces an asset binary through the update flow', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const pngPath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: pngPath,
    });

    await navigateToAssets(mainWindow, project.id);

    // The replacement picker returns a JPEG, a different extension than the seed.
    const jpgPath = makeTempFile(testInfo, 'logo.jpg', jpegBytes);
    await stubFileDialog(electronApp, { open: [jpgPath] });

    // Open the update dialog from the teaser.
    await mainWindow.getByRole('button', { name: 'Update' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Nothing changed yet, so the Update submit is gated.
    await expect(dialog.getByRole('button', { name: 'Update' })).toBeDisabled();

    // Replacing the file picks logo.jpg (stubbed), shows the hint and dirties
    // the form, which enables Update.
    await dialog.getByRole('button', { name: 'Replace file' }).click();
    await expect(dialog.getByText('New file: logo.jpg')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Update' })).toBeEnabled();

    // Submitting drives Core's replace without throwing: the dialog closes and
    // the teaser is still present. The binary swap and metadata re-derivation
    // are Core's own tests, not asserted here.
    await dialog.getByRole('button', { name: 'Update' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      mainWindow.getByRole('button', { name: 'Update' })
    ).toBeVisible();
  });

  test('exports the asset to the chosen path on save-as', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const pngPath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath: pngPath,
    });

    await navigateToAssets(mainWindow, project.id);

    // The save dialog resolves to a path under the test output.
    const target = testInfo.outputPath('exported.png');
    await stubFileDialog(electronApp, { save: target });

    await mainWindow.getByRole('button', { name: 'Save as' }).click();

    // The desktop drove the export to the user-chosen path. Observing the target
    // file on the runner is the flow's result; byte correctness is Core's test.
    await expect
      .poll(() => (existsSync(target) ? statSync(target).size : 0))
      .toBeGreaterThan(0);
  });

  test('gates the asset create on description and the update on a dirty change', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    const pngPath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await stubFileDialog(electronApp, { open: [pngPath] });
    await navigateToAssets(mainWindow, project.id);

    // Open the Add Asset dialog and give the Asset a name, so only the missing
    // description gates the submit. The description starts empty and unflagged.
    await mainWindow.getByRole('button', { name: 'Add Asset' }).click();
    const createDialog = mainWindow.getByRole('dialog');
    await expect(createDialog).toBeVisible();
    await createDialog
      .getByLabel('Asset name', { exact: true })
      .fill('Company logo');
    await expect(
      createDialog.getByLabel('Asset description', { exact: true })
    ).toHaveAttribute('aria-invalid', 'false');

    // Submitting with the description empty flags it invalid and creates nothing:
    // the dialog stays open and the empty state is untouched behind it.
    await createDialog.getByRole('button', { name: 'Add Asset' }).click();
    await expect(
      createDialog.getByLabel('Asset description', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(createDialog).toBeVisible();

    // Filling the description lets the submit through: the dialog closes and a
    // teaser renders.
    await createDialog
      .getByLabel('Asset description', { exact: true })
      .fill('The company logo');
    await createDialog.getByRole('button', { name: 'Add Asset' }).click();
    await expect(createDialog).toBeHidden();
    await expect(mainWindow.getByText('No Assets yet')).toBeHidden();
    await expect(
      mainWindow.getByRole('button', { name: 'Update' })
    ).toBeVisible();

    // Update dirty-gate: open the update dialog on the now-existing asset.
    await mainWindow.getByRole('button', { name: 'Update' }).click();
    const updateDialog = mainWindow.getByRole('dialog');
    await expect(updateDialog).toBeVisible();

    // Nothing changed on open, so Update is gated.
    await expect(
      updateDialog.getByRole('button', { name: 'Update' })
    ).toBeDisabled();

    // Editing the description dirties the form, so Update enables.
    await updateDialog
      .getByLabel('Asset description', { exact: true })
      .fill('An edited description');
    await expect(
      updateDialog.getByRole('button', { name: 'Update' })
    ).toBeEnabled();
  });

  test('disables the asset update submit while the mutation is in flight', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    // The Update submit gates on the form submitting (RHF isSubmitting, which
    // spans the awaited mutateAsync). Hang the update handler so the in-flight
    // window is observable rather than racing a fast resolve.
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, { projectId: project.id, filePath });

    await navigateToAssets(mainWindow, project.id);

    // Open the update dialog and dirty the form, so Update leaves the dirty gate
    // and is enabled before the submit.
    await mainWindow.getByRole('button', { name: 'Update' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel('Asset description', { exact: true })
      .fill('An edited description');
    const updateButton = dialog.getByRole('button', { name: 'Update' });
    await expect(updateButton).toBeEnabled();

    // Make the update never resolve, so the form stays submitting after the click
    // and the in-flight disabled state is stable to assert.
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('core:assets:update');
      ipcMain.handle('core:assets:update', async () => {
        await new Promise(() => {});
      });
    });

    // Submitting keeps the form in flight, so the button disables and does not
    // re-enable while the mutation is pending.
    await updateButton.click();
    await expect(updateButton).toBeDisabled();
  });

  test('surfaces a blocked delete in place when the asset is referenced', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);

    // Seed an Asset plus a Collection whose Entry references it, so Core blocks
    // the delete with a Conflict listing the referring Entry.
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    const asset = await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath,
    });
    const collection = await createCollectionViaIpc(mainWindow, {
      projectId: project.id,
      fieldDefinitions: [textFieldDefinition(), assetFieldDefinition()],
    });
    await createEntryViaIpc(mainWindow, {
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: stringValue({ en: 'Uses the logo' }),
        logo: assetReferenceValue(asset.id),
      },
    });

    await navigateToAssets(mainWindow, project.id);
    await expect(
      mainWindow.getByText('An Asset created by the E2E tests')
    ).toBeVisible();

    // The teaser Delete opens the confirm alertdialog, then confirming it fires
    // the guarded delete.
    await mainWindow.getByRole('button', { name: 'Delete' }).click();
    await expect(
      mainWindow.getByText('You are about to delete this Asset')
    ).toBeVisible();
    await confirmDialog(mainWindow, 'Delete');

    // The Conflict is surfaced in place through the in-use dialog rather than the
    // root error boundary. The fixture's console check backs this up: an error
    // reaching the boundary would log and fail the run.
    await expect(
      mainWindow.getByText('Could not delete this Asset')
    ).toBeVisible();
    await expect(
      mainWindow.getByText('used by one or more Entries')
    ).toBeVisible();
    await dismissDialog(mainWindow);

    // The Asset was not deleted: its teaser is still present and the empty state
    // has not returned.
    await expect(
      mainWindow.getByText('An Asset created by the E2E tests')
    ).toBeVisible();
    await expect(mainWindow.getByText('No Assets yet')).toBeHidden();
  });

  test('renders the asset preview over the custom file protocol', async ({
    mainWindow,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    // A slug-safe name so the preview dialog title is predictable (Core
    // slugifies the name on write).
    await createAssetViaIpc(mainWindow, {
      projectId: project.id,
      filePath,
      name: 'logo',
    });

    await navigateToAssets(mainWindow, project.id);

    // Open the teaser's preview dialog, whose title is the Asset's name.
    await mainWindow.getByRole('button', { name: 'View' }).click();
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'logo' })).toBeVisible();

    // The preview <img> actually loaded its bytes over the elek-io-local-file://
    // protocol under the packaged CSP: a failed protocol/CSP load leaves
    // naturalWidth at 0. Scope to the open dialog so this is the preview, not the
    // teaser thumbnail behind it.
    const previewImage = dialog.getByRole('img');
    await expect
      .poll(async () => previewImage.evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('routes an unexpected delete failure to the root error boundary', async ({
    mainWindow,
    electronApp,
  }, testInfo) => {
    await setUserViaIpc(mainWindow);
    const project = await createProjectViaIpc(mainWindow);
    const filePath = makeTempFile(testInfo, 'logo.png', pngBytes);
    await createAssetViaIpc(mainWindow, { projectId: project.id, filePath });

    await navigateToAssets(mainWindow, project.id);
    await expect(
      mainWindow.getByText('An Asset created by the E2E tests')
    ).toBeVisible();

    // Make the delete reject with a non-guard error. The delete handles only a
    // referenced-Asset Conflict in place (the in-use dialog), so every other
    // failure must reach the root error boundary. Guards the throwOnError
    // predicate against a regression to a blanket throwOnError: false (see the
    // projects delete spec for the full rationale).
    await stubCoreReject(electronApp, 'core:assets:delete');

    // The teaser Delete opens the confirm alertdialog, then confirming fires the
    // guarded delete.
    await mainWindow.getByRole('button', { name: 'Delete' }).click();
    await confirmDialog(mainWindow, 'Delete');

    // The failure propagates: the root error boundary replaces the view and the
    // in-use dialog never opens.
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
    await expect(
      mainWindow.getByText('Could not delete this Asset')
    ).toBeHidden();
  });
});

import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { dismissDialog } from '../helpers/dialog.js';
import { navigate } from '../helpers/navigation.js';
import {
  openReportDialogFromHeader,
  switchReportMode,
} from '../helpers/report.js';
import { setUserViaIpc, waitForUserLoaded } from '../helpers/user.js';

/**
 * These cover opening, switching, validating, sending and dismissing the report
 * dialog.
 *
 * A send really does go through `core.cloud.reports.create`. What it cannot
 * reach is elek.io Cloud: the fixture points `ELEK_IO_CLOUD_URL` at a closed
 * loopback port, so every send fails as `PreconditionFailed`, which is both the
 * one failure the dialog is built to survive and a guarantee that no test sends
 * a report anywhere. Cloud's own `POST /management/v1/reports` does not exist
 * yet, so there is no success path to assert against.
 *
 * @todo Once Cloud accepts a report, add: a successful send closes the dialog
 * and toasts, and a failure that is not `PreconditionFailed` reaches the root
 * error boundary.
 */
test.describe('Reporting a bug or feedback', () => {
  test('the report dialog opens from the header on any route', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);

    // Opens on the bug form, since that is what the alpha needs most.
    await expect(
      dialog.getByRole('heading', { name: 'Report a bug' })
    ).toBeVisible();

    // The GitHub fallback is offered but is not the primary path.
    await expect(
      dialog.getByRole('button', { name: 'Open an issue on GitHub' })
    ).toBeVisible();

    await dismissDialog(mainWindow);
  });

  test('the report dialog is reachable before a User exists', async ({
    mainWindow,
  }) => {
    // No setUserViaIpc on purpose. The button sits outside user-header's
    // `user === null` check because a broken first run is the thing most worth
    // reporting, and every other spec here seeds a User, so without this one a
    // refactor that moved the button inside that branch would pass CI.
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);
    await expect(
      dialog.getByRole('heading', { name: 'Report a bug' })
    ).toBeVisible();

    // Core takes a whole User or null and nothing in between, so with no User
    // the contact is empty rather than absent. Both halves stay fillable, which
    // is what keeps a first run reportable and answerable.
    await expect(dialog.getByLabel('Name - optional')).toHaveValue('');
    await expect(dialog.getByLabel('Email - optional')).toHaveValue('');

    await dismissDialog(mainWindow);
  });

  test('the contact block is prefilled from the local User', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);

    const dialog = await openReportDialogFromHeader(mainWindow);

    // Core does not read the User for us, so what the dialog shows is exactly
    // what gets sent. Both stay editable, so somebody can be answered at an
    // address their commits are not signed with.
    await expect(dialog.getByLabel('Name - optional')).toHaveValue('Test User');
    await expect(dialog.getByLabel('Email - optional')).toHaveValue(
      'test@elek.io'
    );

    await dismissDialog(mainWindow);
  });

  test('reopening returns to the mode the caller asked for', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);
    await switchReportMode(dialog, 'Share feedback');
    await dismissDialog(mainWindow);

    // Radix never fires onOpenChange for an open driven by the `open` prop, so
    // the reset runs from an effect instead. Without it this reopens on the
    // feedback form.
    const reopened = await openReportDialogFromHeader(mainWindow);
    await expect(
      reopened.getByRole('heading', { name: 'Report a bug' })
    ).toBeVisible();

    await dismissDialog(mainWindow);
  });

  test('switching between the bug and feedback forms swaps the fields', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);

    // Each form asks its one question its own way, and the log switch belongs
    // to the bug form alone.
    await expect(dialog.getByLabel('What went wrong?')).toBeVisible();
    await expect(dialog.getByLabel('Also send my logs')).toBeVisible();

    await switchReportMode(dialog, 'Share feedback');

    // Feedback never carries logs, in Core as well as here, so there is nothing
    // to consent to.
    await expect(dialog.getByLabel('What went wrong?')).toBeHidden();
    await expect(dialog.getByLabel('Also send my logs')).toBeHidden();
    await expect(
      dialog.getByLabel('What would you like to tell us?')
    ).toBeVisible();

    await dismissDialog(mainWindow);
  });

  test('the log switch is off by default when reporting from the header', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);

    // Nothing the user did not type is attached unless they say so. The error
    // boundary is the one place this defaults the other way, which
    // error-boundary.spec.ts covers.
    await expect(dialog.getByLabel('Also send my logs')).not.toBeChecked();

    await dismissDialog(mainWindow);
  });

  test('an empty report reports what is missing instead of doing nothing', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);

    // Nothing is disabled to express "invalid", so Send is available on an
    // untouched form and validation runs on the click. See
    // contributing/renderer/forms.md.
    const send = dialog.getByRole('button', { name: 'Send report' });
    await expect(send).toBeEnabled();
    await send.click();

    // The one required field reports on itself, and the dialog stays open.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('What went wrong?')).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    await dismissDialog(mainWindow);
  });

  test('half a contact is reported rather than silently dropped', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);

    const dialog = await openReportDialogFromHeader(mainWindow);
    await dialog
      .getByLabel('What went wrong?')
      .fill('Creating a Collection leaves the list empty until I reload.');
    await dialog.getByLabel('Email - optional').fill('');
    await dialog.getByRole('button', { name: 'Send report' }).click();

    // Core takes a whole User or null, so clearing one half would otherwise
    // send the report with no way back at all. Both empty is fine and means
    // anonymous, one empty is a mistake worth naming.
    await expect(dialog.getByLabel('Email - optional')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await expect(dialog).toBeVisible();

    await dismissDialog(mainWindow);
  });

  test('a send that cannot reach Cloud keeps the dialog and the text', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);

    const dialog = await openReportDialogFromHeader(mainWindow);

    const message = 'Deleting a Collection spins forever after I confirm.';
    await dialog.getByLabel('What went wrong?').fill(message);
    await dialog.getByRole('button', { name: 'Send report' }).click();

    // The fixture points Core at a closed port, so the send fails as
    // PreconditionFailed. That is handled in place rather than at the root
    // error boundary, precisely so what somebody wrote survives the failure.
    await expect(dialog.getByText('Could not send this report')).toBeVisible();
    await expect(dialog.getByLabel('What went wrong?')).toHaveValue(message);

    await dismissDialog(mainWindow);
  });

  test('the report form emits no native constraint attributes', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);

    // zod through react-hook-form is the sole validator and the form is
    // noValidate, so the browser must have nothing to reject before
    // handleSubmit runs. A native constraint here would block submit silently.
    const message = dialog.getByLabel('What went wrong?');
    await expect(message).toBeVisible();
    for (const attribute of ['required', 'minlength', 'maxlength']) {
      await expect(message).not.toHaveAttribute(attribute);
    }

    // Required-ness is conveyed by the label instead: FormLabel appends
    // " - optional" to everything that is not required, so the contact block is
    // marked and the message is the unmarked default.
    await expect(dialog.getByLabel('Email - optional')).toBeVisible();

    await dismissDialog(mainWindow);
  });
});

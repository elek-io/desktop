import { expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

import { test } from '../fixtures/cloudStub.js';
import { navigate } from '../helpers/navigation.js';
import {
  closeReportDialog,
  openReportDialogFromHeader,
  switchReportMode,
} from '../helpers/report.js';
import { setUserViaIpc, waitForUserLoaded } from '../helpers/user.js';

/**
 * These cover what happens once elek.io Cloud answers a send. The fixture
 * launches the app against a local stub that validates each report against
 * Core's own request schema and answers like Cloud, since no test may send to
 * a real Cloud. A send that cannot reach Cloud at all is in reports.spec.ts.
 */
test.describe('Delivering a report to Cloud', () => {
  test('an accepted bug report closes the dialog and arrives as written', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);

    const dialog = await openReportDialogFromHeader(mainWindow);
    const message = 'Deleting a Collection spins forever after I confirm.';
    await dialog.getByLabel('What went wrong?').fill(message);
    await dialog.getByRole('button', { name: 'Send report' }).click();

    // The dialog closes and the toast is the only evidence it worked, so a
    // missing one would make the user send it again.
    await expect(dialog).toBeHidden();
    await expect(mainWindow.getByText('create report')).toBeVisible();

    expect(cloudStub.reports).toHaveLength(1);
    const [report] = cloudStub.reports;
    expect(report).toMatchObject({
      type: 'bug',
      message,
      user: { name: 'Test User', email: 'test@elek.io' },
      core: { platform: process.platform },
      // Off by default from the header, so nothing was attached
      logs: null,
    });
  });

  test('a bug report with consent carries this machine’s log tail', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);
    await dialog
      .getByLabel('What went wrong?')
      .fill('The sidebar stays collapsed after a restart.');
    await dialog.getByLabel('Also send my logs').click();
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog).toBeHidden();

    expect(cloudStub.reports).toHaveLength(1);
    const logs = cloudStub.reports[0]?.logs;
    expect(logs?.encoding).toBe('gzip+base64');

    // The tail is this app's own log, which every start opens with the runtime
    // it is running on.
    const tail = gunzipSync(Buffer.from(logs?.data ?? '', 'base64')).toString(
      'utf8'
    );
    expect(tail).toContain('starting (electron');
  });

  test('feedback arrives without logs', async ({ mainWindow, cloudStub }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');

    const dialog = await openReportDialogFromHeader(mainWindow);
    await switchReportMode(dialog, 'Share feedback');
    const message = 'A dark mode for the markdown editor would be lovely.';
    await dialog.getByLabel('What would you like to tell us?').fill(message);
    await dialog.getByRole('button', { name: 'Send feedback' }).click();
    await expect(dialog).toBeHidden();

    expect(cloudStub.reports).toHaveLength(1);
    expect(cloudStub.reports[0]).toMatchObject({
      type: 'feedback',
      message,
      logs: null,
    });
  });

  test('a report with both contact fields cleared is sent anonymously', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await waitForUserLoaded(mainWindow);

    const dialog = await openReportDialogFromHeader(mainWindow);
    await dialog
      .getByLabel('What went wrong?')
      .fill('Renaming a Project does not update the breadcrumb.');
    await dialog.getByLabel('Name - optional').fill('');
    await dialog.getByLabel('Email - optional').fill('');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog).toBeHidden();

    // Core takes a whole User or null, so an emptied contact folds to null
    // rather than sending the rest of the local User along.
    expect(cloudStub.reports).toHaveLength(1);
    expect(cloudStub.reports[0]?.user).toBeNull();
  });

  for (const { status, type, copy } of [
    {
      status: 400,
      type: 'BadRequest',
      copy: 'Shortening it, or sending it without the logs, usually helps.',
    },
    {
      status: 429,
      type: 'RateLimited',
      copy: 'Too many reports were sent from here recently.',
    },
  ]) {
    test(`a refused send (${type}) keeps the dialog and the text`, async ({
      mainWindow,
      cloudStub,
    }) => {
      cloudStub.refuseWith(status);
      await setUserViaIpc(mainWindow);
      await navigate(mainWindow, '#/projects');

      const dialog = await openReportDialogFromHeader(mainWindow);
      const message = 'Pressing Save twice creates two Entries.';
      await dialog.getByLabel('What went wrong?').fill(message);
      await dialog.getByRole('button', { name: 'Send report' }).click();

      // Every type is handled in place with its own copy, never at the root
      // error boundary, so what the user wrote survives the refusal.
      await expect(
        dialog.getByText('Could not send this report')
      ).toBeVisible();
      await expect(dialog.getByText(copy)).toBeVisible();
      await expect(dialog.getByLabel('What went wrong?')).toHaveValue(message);
      expect(cloudStub.reports).toHaveLength(0);

      await closeReportDialog(mainWindow);
    });
  }
});

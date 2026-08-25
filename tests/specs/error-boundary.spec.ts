import { expect } from '@playwright/test';

import { IPC_CORE_ERROR_SENTINEL } from '../../src/shared/ipcError.js';
import { test } from '../fixtures/electronApp.js';
import { dismissDialog } from '../helpers/dialog.js';
import { navigate, verifyCurrentRouteHash } from '../helpers/navigation.js';
import { setUserViaIpc } from '../helpers/user.js';

test.describe('Not found', () => {
  test('an unknown route renders the not-found screen', async ({
    mainWindow,
  }) => {
    // An unmatched hash is a normal router state (no thrown error), so this
    // stays console-clean and must NOT opt into the console allow-list, which
    // would mask a real regression.
    const unknownHash = '#/definitely-not-a-route';
    await navigate(mainWindow, unknownHash);

    // The NotFoundComponent renders: its title, the attempted href (from
    // `location.href`, which carries the hash), and the two recovery controls.
    await expect(
      mainWindow.getByRole('heading', { name: 'Not Found' })
    ).toBeVisible();
    await expect(mainWindow.getByText(unknownHash)).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Back to Projects' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Reload' })
    ).toBeVisible();
  });
});

test.describe('Root error boundary', () => {
  test('a failed route read renders the error boundary and recovers', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    // A project route with a non-existent id: the `projects.read` query
    // (throwOnError: true) fails and `useQueryNoError` re-throws it in render,
    // so the root ErrorComponent replaces the whole view. React Query retries
    // the read a few times first (~8s), so the boundary needs a longer wait.
    await navigate(
      mainWindow,
      '#/projects/00000000-0000-0000-0000-000000000000/dashboard'
    );
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible({ timeout: 20000 });

    // The desktop app shows a decoded message (via parseIpcError) and, in the
    // technical detail block, the decoded Core origin stack. Neither carries the
    // raw IPC sentinel JSON, so the whole error view is free of it. The message
    // is a plain `<p>` with no ARIA role, so key its visibility off the Page's
    // card body, which holds it and not the Page header's description. Scoping
    // structurally rather than filtering the description out by text keeps this
    // from breaking every time the boundary's copy is reworded. Then assert the
    // sentinel is absent from the entire main region (the `<pre>` included,
    // which before the fix still leaked the encoded form).
    const errorMessage = mainWindow
      .getByRole('main')
      .locator('[data-slot="card-content"] p');
    await expect(errorMessage).toBeVisible();
    await expect(mainWindow.getByRole('main')).not.toContainText(
      IPC_CORE_ERROR_SENTINEL
    );

    // Recovery: Back to Projects returns to the Projects list and the app is
    // usable again (the empty state renders, since no Project was created).
    await mainWindow.getByRole('button', { name: 'Back to Projects' }).click();
    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expect(mainWindow.getByText('No Projects yet')).toBeVisible();
  });

  test('the boundary offers to report the problem, prefilled', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);

    await navigate(
      mainWindow,
      '#/projects/00000000-0000-0000-0000-000000000000/dashboard'
    );
    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible({ timeout: 20000 });

    // Nothing is reported automatically any more, so the boundary has to ask.
    // It is the primary action, since the crash is the moment the report is
    // worth most and the user will not go hunting for the header button.
    const report = mainWindow.getByRole('button', {
      name: 'Report this problem',
    });
    await expect(report).toBeVisible();
    await report.click();

    // It opens the bug form, not the feedback one: the user is not here to
    // share an opinion.
    const dialog = mainWindow.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Report a bug' })
    ).toBeVisible();

    // A report is one message, so the boundary hands over the decoded error and
    // the stack inside it. The user does not have to retype what the screen
    // already shows, and none of it leaks the raw sentinel.
    const message = dialog.getByLabel('What went wrong?');
    await expect(message).not.toHaveValue('');
    await expect(message).not.toHaveValue(new RegExp(IPC_CORE_ERROR_SENTINEL));

    // Logs default ON here and only here: they are the point of a crash report,
    // and the user is looking at the failure while deciding.
    await expect(dialog.getByLabel('Also send my logs')).toBeChecked();

    // Dismissing the dialog leaves the boundary's own recovery working.
    await dismissDialog(mainWindow);
    await mainWindow.getByRole('button', { name: 'Back to Projects' }).click();
    await verifyCurrentRouteHash(mainWindow, '#/projects');
  });
});

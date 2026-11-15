import {
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { homedir } from 'node:os';

import { IPC_CORE_ERROR_SENTINEL } from '../../src/shared/ipcError.js';
import { test } from '../fixtures/electronApp.js';
import { expectNoAxeViolations } from '../helpers/accessibility.js';
import { clearClipboard, clipboardText } from '../helpers/clipboard.js';
import { errorScreenTitle } from '../helpers/error.js';
import { stubCoreReject, stubCoreRejectWithType } from '../helpers/ipc.js';
import { recordLogsViaIpc, recordedLogs } from '../helpers/log.js';
import { navigate, verifyCurrentRouteHash } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import { closeReportDialog, reportDialog } from '../helpers/report.js';
import { setTheme } from '../helpers/theme.js';
import { setUserViaIpc } from '../helpers/user.js';
import { MINIMUM_WINDOW_SIZE, resizeWindow } from '../helpers/window.js';

/**
 * A token nothing else on this machine carries, so finding it anywhere a
 * person reads or pastes can only come from this error.
 *
 * Core masks the user and the password of an address, not a token standing on
 * its own, so it rides in the address of a Git repository, which is where one
 * reaches Desktop from (see Core's usage docs).
 */
const SENTINEL_TOKEN = 'ghp_sentinel00000000000000000000000000';

/** An email address, which Core masks as `[email]` wherever it stands. */
const SENTINEL_EMAIL = 'mara.klein@autohaus-ebersfelde.de';

/**
 * A `CoreError` carrying all three shapes at once: a credential in an address,
 * an email address and the home folder of this computer.
 *
 * Shaped like Core's message for a git command that failed, with git's own
 * output after it and the home folder in a stack frame, which is what a stack
 * of a renderer loaded from a file looks like. No repository a spec can arrange
 * raises all three in one error, so it is injected.
 */
const errorWithSecrets = {
  message: `Git command "git clone --branch draft https://mara-klein:${SENTINEL_TOKEN}@example.invalid/website.git ${homedir()}/elek.io/tmp/website" failed with exit code "128": ${SENTINEL_EMAIL}: Permission denied`,
  // Long enough to scroll past the 200 px the block keeps, which is what the
  // copy button in its corner and the keyboard inside it are for.
  stack: [
    'CoreError: Git command failed',
    ...Array.from(
      { length: 8 },
      (_frame, index) =>
        `    at GitService.git (file://${homedir()}/elek.io/app/core.mjs:${2290 + index}:24)`
    ),
  ].join('\n'),
};

/**
 * Drive the app onto the root error boundary with one error of our own,
 * through the Project a route reads above every pane.
 *
 * A Project of its own rather than an address that holds none: a Project that
 * is not there fails more than one read, and which of them reaches the
 * boundary first is a race. With the Project there, the one read that fails is
 * the one this replaces.
 */
async function openErrorBoundaryWith(
  electronApp: ElectronApplication,
  mainWindow: Page,
  text: { message: string; stack: string }
): Promise<void> {
  const project = await createProjectViaIpc(mainWindow);
  await stubCoreRejectWithType(electronApp, 'core:projects:read', 'Internal', {
    text,
  });
  await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
  await expect(errorScreenTitle(mainWindow)).toBeVisible({ timeout: 20000 });
}

/**
 * Drive the app onto the root error boundary through a project route with a
 * non-existent id. The `projects.read` query (throwOnError: true) fails and
 * `useQueryNoError` re-throws it in render, so the root ErrorComponent replaces
 * the whole view. React Query retries the read a few times first (~8s), so the
 * boundary needs a longer wait.
 */
async function openErrorBoundary(mainWindow: Page): Promise<void> {
  await navigate(
    mainWindow,
    '#/projects/00000000-0000-0000-0000-000000000000/dashboard'
  );
  await expect(errorScreenTitle(mainWindow)).toBeVisible({ timeout: 20000 });
}

/** The Details disclosure, its button and the text it opens. */
function details(page: Page): {
  disclosure: Locator;
  button: Locator;
  text: Locator;
} {
  return {
    disclosure: page.locator('[data-slot="error-details"]'),
    button: page.locator('[data-slot="error-details-summary"]'),
    text: page.locator('[data-slot="error-details-text"]'),
  };
}

test.describe('Not found', () => {
  test('an unknown route renders the not-found screen', async ({
    mainWindow,
  }) => {
    // A User, since without one the gate on the root route settles every
    // address on the first start and no other screen is reached.
    await setUserViaIpc(mainWindow);

    // An unmatched hash is a normal router state (no thrown error), so this
    // stays console-clean and must NOT opt into the console allow-list, which
    // would mask a real regression.
    const unknownHash = '#/definitely-not-a-route';
    await navigate(mainWindow, unknownHash);

    // The NotFoundComponent renders: its title, the attempted href (from
    // `location.href`, which carries the hash), and the two recovery controls.
    await expect(
      mainWindow.getByRole('heading', { name: 'This screen does not exist' })
    ).toBeVisible();
    await expect(mainWindow.getByText(unknownHash)).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Back to Projects' })
    ).toBeVisible();
    await expect(
      mainWindow.getByRole('button', { name: 'Reload' })
    ).toBeVisible();

    // It takes the error screen's layout and nothing of its Details: there is
    // no error here to show the cause of.
    await expect(details(mainWindow).disclosure).toHaveCount(0);
  });
});

test.describe('Root error boundary', () => {
  test('a failed route read renders the error boundary, logs it and recovers', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await recordLogsViaIpc(electronApp);
    await openErrorBoundary(mainWindow);

    // What the screen shows of the error is behind Details, and neither it nor
    // anything else on screen carries the raw IPC sentinel JSON. Opened first,
    // so the assertion reads the text itself rather than a block nobody has
    // opened yet (the `<pre>` before the fix still leaked the encoded form).
    await details(mainWindow).button.click();
    await expect(details(mainWindow).text).toBeVisible();
    await expect(mainWindow.getByRole('main')).not.toContainText(
      IPC_CORE_ERROR_SENTINEL
    );

    // It logs what it caught, the way a pane's boundary logs what it catches,
    // so the error that took the whole view is in the log file with its type,
    // message and stack.
    const records = await recordedLogs(electronApp);
    const logged = records.filter(
      (record) =>
        record.level === 'error' &&
        record.message.startsWith('Uncaught route error')
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]?.source).toBe('desktop');
    expect(Object.keys(logged[0]?.meta ?? {})).toContain(
      'exception.stacktrace'
    );

    // Recovery: Back to Projects returns to the Projects list and the app is
    // usable again (the empty state renders, since no Project was created).
    await mainWindow.getByRole('button', { name: 'Back to Projects' }).click();
    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expect(
      mainWindow.getByText('Create your first Project')
    ).toBeVisible();
  });

  test('Details stays closed until it is opened, and then says what Core raised', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    // The message and the stack are Core's own, so they are driven rather than
    // arranged: what the block has to show is the type, the message and the
    // frames, whatever the failure was.
    await openErrorBoundaryWith(electronApp, mainWindow, {
      message: 'Git command failed with exit code "128"',
      stack:
        'CoreError: Git command failed with exit code "128"\n    at GitService.git (file:///app/core.mjs:2290:24)',
    });

    // Closed until somebody asks for it: the technical cause is not what an
    // editor is here for, see ci's docs/desktop.md.
    const { disclosure, button, text } = details(mainWindow);
    await expect(button).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(text).toBeHidden();

    await button.click();
    await expect(text).toBeVisible();

    // Core's type in brackets, then its message, then the frames of its stack.
    const shown = (await text.textContent()) ?? '';
    expect(shown).toContain('CoreError [Internal]');
    expect(shown).toContain('Git command failed with exit code "128"');
    expect(shown).toContain('at GitService.git');

    // The message stands once rather than twice, since a stack opens with the
    // message it was thrown with and the line above already carries it.
    expect(shown.split('Git command failed')).toHaveLength(2);
  });

  test('an error that carries no type opens Details with its own message', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    // A plain `Error` rather than a `CoreError`, which is what an ordinary bug
    // in our own IPC plumbing arrives as: no type, and the frameless error
    // Electron reconstructs on this side.
    const project = await createProjectViaIpc(mainWindow);
    await stubCoreReject(electronApp, 'core:projects:read');
    await navigate(mainWindow, `#/projects/${project.id}/dashboard`);
    await expect(errorScreenTitle(mainWindow)).toBeVisible({ timeout: 20000 });

    const { button, text } = details(mainWindow);
    await button.click();
    const shown = (await text.textContent()) ?? '';

    // Its own message, with no type in brackets in front of it and no sentinel
    // of the encoding either.
    expect(shown).toContain('E2E injected failure');
    expect(shown).not.toContain('CoreError [');
    expect(shown).not.toContain(IPC_CORE_ERROR_SENTINEL);
  });

  test('Copy details copies exactly what Details shows and says it copied', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await clearClipboard(electronApp);
    await openErrorBoundary(mainWindow);

    const { button, text } = details(mainWindow);
    await button.click();
    const shown = await text.textContent();
    await mainWindow.getByRole('button', { name: 'Copy details' }).click();

    // The toast is the only evidence the clipboard took it, since nothing else
    // on screen changes, see ci's messages table.
    await expect(mainWindow.getByText('Details copied')).toBeVisible();
    expect(await clipboardText(electronApp)).toBe(shown);
  });

  test('neither Details nor the clipboard holds a token, an email address or the home folder', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await clearClipboard(electronApp);
    await openErrorBoundaryWith(electronApp, mainWindow, errorWithSecrets);

    const { button, text } = details(mainWindow);
    await button.click();
    await expect(text).toBeVisible();
    await mainWindow.getByRole('button', { name: 'Copy details' }).click();
    await expect(mainWindow.getByText('Details copied')).toBeVisible();

    const shown = (await text.textContent()) ?? '';
    const copied = await clipboardText(electronApp);

    for (const read of [shown, copied]) {
      expect(read).not.toContain(SENTINEL_TOKEN);
      expect(read).not.toContain(SENTINEL_EMAIL);
      expect(read).not.toContain(homedir());
      // Masked rather than dropped, so the line still says what it was about:
      // the address keeps its host, and the home folder becomes `~`.
      expect(read).toContain('[redacted]@example.invalid/website.git');
      expect(read).toContain('[email]');
      expect(read).toContain('~/elek.io/tmp/website');
    }
  });

  test('a masking that cannot answer shows and copies nothing of the error', async ({
    electronApp,
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await clearClipboard(electronApp);
    // Nothing unmasked may stand in for the masked text, so the screen says it
    // has no details rather than showing Core's own.
    await stubCoreReject(electronApp, 'core:logger:mask');
    await openErrorBoundaryWith(electronApp, mainWindow, errorWithSecrets);

    const { button, text } = details(mainWindow);
    await button.click();
    await expect(
      mainWindow.getByText(
        'elek.io Desktop could not prepare the details of this error'
      )
    ).toBeVisible();
    await expect(text).toHaveCount(0);
    await expect(
      mainWindow.getByRole('button', { name: 'Copy details' })
    ).toHaveCount(0);

    expect(await mainWindow.getByRole('main').textContent()).not.toContain(
      SENTINEL_TOKEN
    );
    expect(await clipboardText(electronApp)).toBe('');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the screen and its Details fit the smallest window in ${theme} mode`, async ({
      electronApp,
      mainWindow,
    }) => {
      await setUserViaIpc(mainWindow);
      await openErrorBoundaryWith(electronApp, mainWindow, errorWithSecrets);
      await setTheme(mainWindow, theme);
      await resizeWindow(electronApp, mainWindow, MINIMUM_WINDOW_SIZE);

      const { button, text } = details(mainWindow);
      const closed = await button.boundingBox();
      await button.click();
      await expect(text).toBeVisible();
      const open = await button.boundingBox();

      // The text opens below Details out of the flow, so the button somebody
      // just pressed stays where it was rather than moving out from under the
      // pointer.
      expect(open).toEqual(closed);

      // The block takes the keyboard, so the arrow keys scroll it and what it
      // holds is not out of reach for anybody who uses no pointer. The focus
      // ring is the one every control takes, 2 px in the ring color.
      await button.press('Tab');
      await expect(text).toBeFocused();
      const outline = await text.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline).toEqual({ width: '2px', style: 'solid' });

      // Nothing of the screen is cut off: the pane scrolls as far as the open
      // block reaches, and the whole of it is inside the pane once it has.
      const fits = await text.evaluate((element) => {
        const pane = element.closest('[data-slot="error-screen"]');

        if (pane === null) {
          throw new Error('The error screen is not on the page');
        }

        pane.scrollTop = pane.scrollHeight;
        const block = element.getBoundingClientRect();
        const box = pane.getBoundingClientRect();

        return {
          within: block.top >= box.top - 1 && block.bottom <= box.bottom + 1,
          clipped: element.scrollWidth > element.clientWidth,
        };
      });
      expect(fits).toEqual({ within: true, clipped: false });

      // Every text and control of the open screen passes every axe rule,
      // `color-contrast` included, in this mode at this size.
      await expectNoAxeViolations(mainWindow);
    });
  }

  test('the boundary offers to report the problem, with logs on', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await openErrorBoundary(mainWindow);

    // Nothing is reported automatically any more, so the boundary has to ask.
    // It is the one primary button, since a report is how the error reaches us
    // at all and the user will not go hunting for the header button.
    const report = mainWindow.getByRole('button', { name: 'Report an issue' });
    await expect(report).toBeVisible();
    await report.click();

    // It opens the bug form, not the feedback one: the user is not here to
    // share an opinion.
    const dialog = reportDialog(mainWindow);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Report a bug' })
    ).toBeVisible();

    // The message is the user's own account of what they did. The error and
    // its stack are already in the logs, and copying them in here would send
    // them even with the logs switched off.
    await expect(dialog.getByLabel('What went wrong?')).toHaveValue('');

    // The contact is filled in from the User, and stays theirs to change.
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
      'Test User'
    );
    await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(
      'test@elek.io'
    );

    // Logs default ON here and only here: they carry the error, and the user is
    // looking at the failure while deciding.
    await expect(
      dialog.getByRole('switch', { name: 'Also send my logs' })
    ).toBeChecked();

    // Dismissing the dialog leaves the boundary's own recovery working.
    await closeReportDialog(mainWindow);
    await mainWindow.getByRole('button', { name: 'Back to Projects' }).click();
    await verifyCurrentRouteHash(mainWindow, '#/projects');
  });

  test('a send from the boundary that cannot reach Cloud keeps the screen and the text', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow);
    await openErrorBoundary(mainWindow);

    await mainWindow.getByRole('button', { name: 'Report an issue' }).click();
    const dialog = reportDialog(mainWindow);

    const message = 'I opened a Project from the list and got this screen.';
    await dialog.getByLabel('What went wrong?').fill(message);
    await dialog.getByRole('button', { name: 'Send report' }).click();

    // The fixture points Core at a closed port, so the send fails as
    // PreconditionFailed. The dialog renders inside the boundary's own
    // fallback, which cannot catch what it renders, so a failure let through
    // here would replace this screen and take the report with it. That is why
    // the dialog handles every error type in place.
    await expect(dialog.getByText('Could not send this report')).toBeVisible();
    await expect(dialog.getByLabel('What went wrong?')).toHaveValue(message);

    await closeReportDialog(mainWindow);
    await expect(errorScreenTitle(mainWindow)).toBeVisible();
  });
});

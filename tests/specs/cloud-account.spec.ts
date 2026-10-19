import { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '../fixtures/cloudStub.js';
import {
  test as testWithoutCloud,
  testDataDirs,
} from '../fixtures/electronApp.js';
import {
  chooseFromUserMenu,
  createAccount,
  expectAccountLine,
  filesContaining,
  signIn,
} from '../helpers/account.js';
import { relaunchApp } from '../helpers/app.js';
import { navigate, verifyCurrentRouteHash } from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import {
  closeReportDialog,
  openReportDialogFromHeader,
  switchReportMode,
} from '../helpers/report.js';
import { setUserViaIpc } from '../helpers/user.js';

const password = 'correct horse battery staple';
const mara = { name: 'Mara Klein', email: 'mara@example.com', password };

/** Where Desktop keeps the encrypted token, see contributing/cloud-account.md */
const tokenFileName = 'cloud-session';

test.describe('Signing in to elek.io Cloud', () => {
  test('the first start works on this computer without an account', async ({
    mainWindow,
  }) => {
    await verifyCurrentRouteHash(mainWindow, '#/welcome');
    await mainWindow.getByLabel('Name', { exact: true }).fill(mara.name);
    await mainWindow
      .getByLabel('Email address', { exact: true })
      .fill(mara.email);
    await mainWindow.getByRole('button', { name: 'Continue' }).click();

    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expectAccountLine(mainWindow, mara.name, 'On this computer');
    // Signed out, the empty Projects page points to elek.io Cloud
    await expect(
      mainWindow.getByText('Sign in to open your Projects on elek.io Cloud.')
    ).toBeVisible();
  });

  test('creates an account from the first start and is signed in', async ({
    mainWindow,
    cloudStub,
  }) => {
    await verifyCurrentRouteHash(mainWindow, '#/welcome');
    await mainWindow.getByRole('button', { name: 'Create account' }).click();
    await verifyCurrentRouteHash(mainWindow, '#/welcome/create-account');
    await expect(
      mainWindow.getByRole('navigation', { name: 'breadcrumb' })
    ).toContainText('WelcomeCreate account');

    await createAccount(mainWindow, mara);

    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expect(
      mainWindow.getByText('Signed in to elek.io Cloud')
    ).toBeVisible();
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');
    expect(cloudStub.accounts.list().map(({ email }) => email)).toEqual([
      mara.email,
    ]);
  });

  test('signs in from the user menu, and the User follows the account', async ({
    mainWindow,
    cloudStub,
  }) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects');
    await expectAccountLine(mainWindow, 'Test User', 'On this computer');

    await chooseFromUserMenu(
      mainWindow,
      'Test User',
      'Sign in to elek.io Cloud'
    );
    await verifyCurrentRouteHash(mainWindow, '#/projects/sign-in');
    // Filled from the User on this computer
    await expect(
      mainWindow.getByLabel('Email address', { exact: true })
    ).toHaveValue('test@elek.io');

    await signIn(mainWindow, mara);

    await verifyCurrentRouteHash(mainWindow, '#/projects');
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');

    // A cloud User's name and address come from the account
    await navigate(mainWindow, '#/user/profile');
    await expect(mainWindow.getByLabel('Full name')).toHaveValue(mara.name);
    await expect(mainWindow.getByLabel('Full name')).toHaveAttribute(
      'readonly',
      ''
    );
    await expect(
      mainWindow.getByText(
        'Your name and email address come from your elek.io Cloud account.'
      )
    ).toBeVisible();
  });

  test('a wrong password says so under the field and changes nothing', async ({
    mainWindow,
    cloudStub,
  }) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');

    await signIn(mainWindow, {
      email: mara.email,
      password: 'not the password',
    });

    await expect(
      mainWindow.getByText('The email address or the password is wrong.')
    ).toBeVisible();
    await expect(
      mainWindow.getByLabel('Password', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await verifyCurrentRouteHash(mainWindow, '#/projects/sign-in');
    await expectAccountLine(mainWindow, 'Test User', 'On this computer');
  });

  test('too many attempts make the button wait', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    cloudStub.accounts.refuseWith({ status: 429 });

    await signIn(mainWindow, mara);

    await expect(
      mainWindow.getByRole('button', { name: /^Try again in \d+ seconds?$/ })
    ).toBeDisabled();
    // The wait ends by itself
    await expect(
      mainWindow.getByRole('button', { name: 'Sign in', exact: true })
    ).toBeEnabled({ timeout: 15000 });
  });

  test('input elek.io Cloud refuses says so above the button', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    cloudStub.accounts.refuseWith({ status: 400 });

    await signIn(mainWindow, mara);

    await expect(
      mainWindow.getByText(
        "elek.io Cloud didn't accept this. Check each field and try again."
      )
    ).toBeVisible();
  });

  test('an address not confirmed yet says Desktop cannot confirm it', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    cloudStub.accounts.refuseWith({ status: 403, code: 'EMAIL_NOT_VERIFIED' });

    await signIn(mainWindow, mara);

    await expect(
      mainWindow.getByText(
        "This account isn't confirmed yet, and this version of Desktop can't confirm it."
      )
    ).toBeVisible();
  });

  test('an unexpected answer reaches the root error boundary', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    // A 500 is Internal, which no account form handles in place
    cloudStub.accounts.refuseWith({ status: 500 });

    await signIn(mainWindow, mara);

    await expect(
      mainWindow.getByRole('heading', { name: 'Error' })
    ).toBeVisible();
  });

  test('an address with an account already offers to sign in instead', async ({
    mainWindow,
    cloudStub,
  }) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/create-account');

    await createAccount(mainWindow, mara);

    await expect(
      mainWindow.getByText('An account uses this email address already.')
    ).toBeVisible();
    await mainWindow.getByRole('link', { name: 'Sign in' }).first().click();
    await verifyCurrentRouteHash(mainWindow, '#/projects/sign-in');
  });

  test('a sign up that needs a confirmed address says so', async ({
    mainWindow,
    cloudStub,
  }) => {
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/create-account');
    cloudStub.accounts.requireVerification(true);

    await createAccount(mainWindow, mara);

    await expect(
      mainWindow.getByText(
        "Your account needs a confirmed email address, and this version of Desktop can't confirm one yet. Sign in once an update can."
      )
    ).toBeVisible();
    await expectAccountLine(mainWindow, 'Test User', 'On this computer');
  });

  test('signing out keeps every local Project and the name and address', async ({
    mainWindow,
    cloudStub,
  }, testInfo) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await createProjectViaIpc(mainWindow, { name: 'Kept Project' });
    await navigate(mainWindow, '#/projects/sign-in');
    await signIn(mainWindow, mara);
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');
    expect(
      existsSync(join(testDataDirs(testInfo).userDataDir, tokenFileName))
    ).toBe(true);

    await chooseFromUserMenu(mainWindow, mara.name, 'Sign out');

    await expect(
      mainWindow.getByText('Signed out of elek.io Cloud')
    ).toBeVisible();
    await expectAccountLine(mainWindow, mara.name, 'On this computer');
    await expect(mainWindow.getByText('Kept Project')).toBeVisible();
    // The local User keeps the account's name and address
    const user = await mainWindow.evaluate(async () =>
      window.ipc.core.user.get()
    );
    expect(user).toMatchObject({
      userType: 'local',
      name: mara.name,
      email: mara.email,
    });
    expect(
      existsSync(join(testDataDirs(testInfo).userDataDir, tokenFileName))
    ).toBe(false);
  });

  test('a session that ends while Desktop runs pauses sync', async ({
    mainWindow,
    cloudStub,
  }) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    await signIn(mainWindow, mara);
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');

    // A report carries the session, and Cloud answers 401 for one that ended.
    // Core drops the token, and the main process tells the renderer.
    cloudStub.accounts.endSessions();
    const dialog = await openReportDialogFromHeader(mainWindow);
    await switchReportMode(dialog, 'Share feedback');
    await dialog
      .getByLabel('What would you like to tell us?')
      .fill('Sent after the session ended');
    await dialog.getByRole('button', { name: 'Send feedback' }).click();
    // The dialog keeps the text and says it could not be sent
    await expect(dialog.getByRole('alert')).toBeVisible();
    await closeReportDialog(mainWindow);

    await expectAccountLine(mainWindow, mara.name, 'Sync paused');
  });

  test('a session that ended by the next start shows Sync paused and Sign in again', async ({
    mainWindow,
    electronApp,
    cloudStub,
  }, testInfo) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    await signIn(mainWindow, mara);
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');
    const [token] = cloudStub.accounts.issuedTokens;

    cloudStub.accounts.endSessions();
    const { app, window } = await relaunchApp(testInfo, electronApp, {
      cloudUrl: cloudStub.url,
    });
    try {
      // The stored token was handed back and checked, and Cloud found no
      // session for it
      await expectAccountLine(window, mara.name, 'Sync paused');
      expect(cloudStub.accounts.bearerTokens).toContain(token);

      await chooseFromUserMenu(window, mara.name, 'Sign in again');
      await verifyCurrentRouteHash(window, '#/projects/sign-in-again');
      // The account is shown, not asked for
      await expect(
        window.getByRole('main').getByText(mara.email)
      ).toBeVisible();
      await expect(window.getByLabel('Email address')).toHaveCount(0);

      await window
        .getByLabel('Password', { exact: true })
        .fill('not the password');
      await window
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await expect(window.getByText('The password is wrong.')).toBeVisible();

      await window.getByLabel('Password', { exact: true }).fill(password);
      await window
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await verifyCurrentRouteHash(window, '#/projects');
      await expectAccountLine(window, mara.name, 'elek.io Cloud');
    } finally {
      await app.close();
    }
  });

  test('the token survives a restart and never reaches the renderer', async ({
    mainWindow,
    electronApp,
    cloudStub,
  }, testInfo) => {
    cloudStub.accounts.add(mara);
    await setUserViaIpc(mainWindow);
    await navigate(mainWindow, '#/projects/sign-in');
    await signIn(mainWindow, mara);
    await expectAccountLine(mainWindow, mara.name, 'elek.io Cloud');

    // What the account calls answer the renderer holds no token
    const answer = await mainWindow.evaluate(
      async (credentials) => window.ipc.core.cloud.account.signIn(credentials),
      { email: mara.email, password }
    );
    expect(Object.keys(answer)).toEqual(['account']);
    const token = cloudStub.accounts.issuedTokens.at(-1);
    if (token === undefined) {
      throw new Error('The stub issued no token');
    }
    expect(JSON.stringify(answer)).not.toContain(token);

    // Nor does the page or its storage
    // The specs type-check without the DOM lib, so the storage is read
    // through a string expression
    expect(await mainWindow.content()).not.toContain(token);
    const storage = await mainWindow.evaluate<string>(
      'JSON.stringify({ ...localStorage, ...sessionStorage })'
    );
    expect(storage).not.toContain(token);

    // It is stored encrypted under Electron's userData, and nowhere in plain
    // text, Core's data directory included
    const { dataDir, userDataDir } = testDataDirs(testInfo);
    expect(existsSync(join(userDataDir, tokenFileName))).toBe(true);
    expect(await filesContaining(dataDir, token)).toEqual([]);
    expect(await filesContaining(userDataDir, token)).toEqual([]);

    const relaunched = await relaunchApp(testInfo, electronApp, {
      cloudUrl: cloudStub.url,
    });
    try {
      // Handed back to Core, checked with Cloud, and still signed in
      await expectAccountLine(relaunched.window, mara.name, 'elek.io Cloud');
      expect(cloudStub.accounts.bearerTokens).toContain(token);
    } finally {
      await relaunched.app.close();
    }
  });

  test('without a keyring the session lasts until Desktop quits', async ({
    electronApp,
    mainWindow,
    cloudStub,
  }, testInfo) => {
    test.skip(
      process.platform !== 'linux',
      'Only Linux runs without a keyring, through a D-Bus that leads nowhere'
    );
    cloudStub.accounts.add(mara);
    // libsecret reaches the keyring over D-Bus, so without one Desktop finds
    // no way to encrypt and keeps the token in memory only
    const withoutKeyring = {
      cloudUrl: cloudStub.url,
      env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent' },
    };
    // Let the first launch finish loading before it is closed
    await expect(mainWindow.locator('#app')).toBeVisible();
    const first = await relaunchApp(testInfo, electronApp, withoutKeyring);
    let second: Awaited<ReturnType<typeof relaunchApp>> | null = null;
    try {
      await setUserViaIpc(first.window);
      await navigate(first.window, '#/projects/sign-in');
      await signIn(first.window, mara);
      await expectAccountLine(first.window, mara.name, 'elek.io Cloud');
      expect(
        existsSync(join(testDataDirs(testInfo).userDataDir, tokenFileName))
      ).toBe(false);

      second = await relaunchApp(testInfo, first.app, withoutKeyring);
      await expectAccountLine(second.window, mara.name, 'Sync paused');
    } finally {
      await (second ?? first).app.close();
    }
  });
});

testWithoutCloud.describe('Signing in without elek.io Cloud', () => {
  testWithoutCloud(
    'an unreachable elek.io Cloud says so above the button',
    async ({ mainWindow }) => {
      // The fixture's Cloud is a closed port, which Core answers with
      // PreconditionFailed
      await setUserViaIpc(mainWindow);
      await navigate(mainWindow, '#/projects/sign-in');

      await signIn(mainWindow, mara);

      await expect(
        mainWindow.getByText(
          "Can't reach elek.io Cloud. Check your internet connection and try again."
        )
      ).toBeVisible();
      await expectAccountLine(mainWindow, 'Test User', 'On this computer');
    }
  );
});

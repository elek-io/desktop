import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';
import { navigateToUserProfile, setUserViaIpc } from '../helpers/user.js';

test.describe('User profile', () => {
  test('the first start sets and persists the local User', async ({
    mainWindow,
  }) => {
    // A fresh app has no User, so it opens on the First start
    await verifyCurrentRouteHash(mainWindow, '#/welcome');
    await expect(
      mainWindow.getByRole('heading', { name: 'Welcome to elek.io Desktop' })
    ).toBeVisible();

    // Continue validates on click: an empty form says what is missing
    await mainWindow.getByRole('button', { name: 'Continue' }).click();
    await expect(mainWindow.getByText('Enter your name.')).toBeVisible();
    await expect(
      mainWindow.getByText('Enter your email address.')
    ).toBeVisible();

    const name = 'Ada Lovelace';
    await mainWindow.getByLabel('Name', { exact: true }).fill(name);
    await mainWindow
      .getByLabel('Email address', { exact: true })
      .fill('ada@elek.io');
    await mainWindow.getByRole('button', { name: 'Continue' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects$/);

    // Persistence: the profile reads the saved User back
    await navigateToUserProfile(mainWindow);
    await expect(
      mainWindow.getByRole('heading', { name: 'User profile' })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Full name')).toHaveValue(name);
  });

  test('edits an existing User and persists the change', async ({
    mainWindow,
  }) => {
    await setUserViaIpc(mainWindow, {
      name: 'Test User',
      email: 'test@elek.io',
    });
    await navigateToUserProfile(mainWindow);

    // With a User already set, the form reset from it (no Welcome title), shows
    // the existing name, and Save is gated until an edit dirties the form.
    await expect(
      mainWindow.getByRole('heading', { name: 'User profile' })
    ).toBeVisible();
    await expect(mainWindow.getByLabel('Full name')).toHaveValue('Test User');
    await expect(
      mainWindow.getByRole('button', { name: 'Save local User' })
    ).toBeDisabled();

    // Editing the name dirties the form, so Save enables. Saving navigates to
    // the Projects list. Whether the new identity reaches the git author is
    // Core's own test, so it is not asserted here.
    await mainWindow.getByLabel('Full name').fill('Renamed User');
    await expect(
      mainWindow.getByRole('button', { name: 'Save local User' })
    ).toBeEnabled();
    await mainWindow.getByRole('button', { name: 'Save local User' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects$/);

    // Persistence: reopening the profile shows the renamed value.
    await navigateToUserProfile(mainWindow);
    await expect(mainWindow.getByLabel('Full name')).toHaveValue(
      'Renamed User'
    );
  });
});

import { expect } from '@playwright/test';

import { test } from '../fixtures/electronApp.js';
import { verifyCurrentRouteHash } from '../helpers/navigation.js';

test.describe('App Initialization', () => {
  test('should be able to launch the app successfully', async ({
    mainWindow,
  }) => {
    // Verify the renderer loaded and its mount point is visible
    await expect(mainWindow.locator('#app')).toBeVisible();

    // Verify the title set by the root route
    await expect(mainWindow).toHaveTitle('elek.io Desktop');

    // "/" leads to "/projects", and without a User yet on to the First start
    await verifyCurrentRouteHash(mainWindow, '#/welcome');
  });
});

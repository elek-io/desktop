import { expect } from '@playwright/test';
import { createServer, type Server } from 'node:net';

import { test } from '../fixtures/electronApp.js';
import { navigate } from '../helpers/navigation.js';
import {
  apiIsRunningViaIpc,
  navigateToUserProfile,
  setUserViaIpc,
} from '../helpers/user.js';

/**
 * Hold a port on the address Core's local API binds to, so starting the API
 * there fails with a `Conflict`. Release it with `releasePort`.
 */
async function holdPort(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function releasePort(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test.describe('Local API lifecycle', () => {
  test('the profile Enabled toggle starts and stops the local API', async ({
    mainWindow,
    request,
  }) => {
    // A test-specific port keeps this spec independent of whatever the default
    // 31310 might be doing elsewhere.
    const port = 31310;
    const url = `http://localhost:${port}/content/v1/projects`;

    // Probe the API from the Node runner. Node requests carry no browser Origin,
    // so the API's localhost-only CORS does not block them (a renderer `fetch`
    // would be blocked). A closed port rejects the request, which we map to
    // 'refused'.
    const probe = async (): Promise<'serving' | 'refused'> => {
      try {
        const response = await request.get(url);
        return response.ok() ? 'serving' : 'refused';
      } catch {
        return 'refused';
      }
    };

    // Arrange: a User whose local-API preference is off, so nothing starts the
    // API (Core only records the flag, the desktop app acts on it).
    await setUserViaIpc(mainWindow, { localApi: { port, isEnabled: false } });
    expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);

    // Act: toggle Enabled ON and save. `onSetUser` starts the API, then
    // navigates to the Projects list. The profile page has a single Switch.
    await navigateToUserProfile(mainWindow);
    const enabledToggle = mainWindow.getByRole('switch');
    await enabledToggle.click();
    await expect(enabledToggle).toBeChecked();
    await mainWindow.getByRole('button', { name: 'Save local User' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects$/);

    // Assert: the desktop app drove the API lifecycle. It is running...
    expect(await apiIsRunningViaIpc(mainWindow)).toBe(true);
    // ...and actually serving content over HTTP.
    await expect.poll(probe).toBe('serving');

    // Act: toggle Enabled OFF and save. `onSetUser` stops the running API.
    await navigateToUserProfile(mainWindow);
    await expect(enabledToggle).toBeChecked();
    await enabledToggle.click();
    await expect(enabledToggle).not.toBeChecked();
    await mainWindow.getByRole('button', { name: 'Save local User' }).click();
    await expect(mainWindow).toHaveURL(/#\/projects$/);

    // Assert: it is stopped and the port refuses connections. Poll the port,
    // since the OS may lag releasing it after the server closes.
    expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);
    await expect.poll(probe).toBe('refused');
  });

  test('the profile marks a port in use on the Port field and saves nothing', async ({
    mainWindow,
  }) => {
    // Not the port above, so this never waits on the OS releasing that one.
    const port = 31311;

    // Arrange: a User with the API off, and something else holding the port.
    await setUserViaIpc(mainWindow, { localApi: { port, isEnabled: false } });
    const blocker = await holdPort(port);

    try {
      // Act: toggle Enabled ON and save.
      await navigateToUserProfile(mainWindow);
      await mainWindow.getByRole('switch').click();
      await mainWindow.getByRole('button', { name: 'Save local User' }).click();

      // Assert: the Port field says why, and the page stays to correct it.
      await expect(
        mainWindow.getByText(
          'This port is already in use by another application. Choose a different one.'
        )
      ).toBeVisible();
      await expect(mainWindow).toHaveURL(/#\/user\/profile$/);
      expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);

      // The API is started before the User is saved, so nothing was saved.
      const user = await mainWindow.evaluate(async () =>
        window.ipc.core.user.get()
      );
      expect(user?.localApi.isEnabled).toBe(false);
    } finally {
      await releasePort(blocker);
    }
  });

  test('the user menu Local API switch reports a port in use', async ({
    mainWindow,
  }) => {
    const port = 31311;

    // Arrange: a User with the API off, and something else holding the port.
    await setUserViaIpc(mainWindow, { localApi: { port, isEnabled: false } });
    await navigate(mainWindow, '#/projects');
    const blocker = await holdPort(port);

    try {
      // Act: switch the local API on from the user menu in the header.
      await mainWindow.getByRole('button', { name: /Test User/ }).click();
      await mainWindow.getByRole('menu').getByRole('switch').click();

      // Assert: a toast says why, and the API stays off.
      await expect(
        mainWindow.getByText(`Port ${port} is already in use`)
      ).toBeVisible();
      expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);
    } finally {
      await releasePort(blocker);
    }
  });
});

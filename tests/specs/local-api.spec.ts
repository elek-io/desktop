import { expect, type Locator, type Page } from '@playwright/test';
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

/**
 * The Local API switch in the header's user menu, which ci makes the one place
 * the API is turned on and off.
 *
 * It opens the menu where it is not already open, so a flip that closed it is
 * followed by another without the trigger being pressed twice.
 */
async function localApiSwitch(page: Page): Promise<Locator> {
  const menu = page.getByRole('menu').first();

  if ((await menu.isVisible()) === false) {
    await page.getByRole('button', { name: /Test User/ }).click();
    await expect(menu).toBeVisible();
  }

  return menu.getByRole('switch');
}

/** Whether the User Core stored says the local API comes back with the app. */
async function rememberedViaIpc(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    async () => (await window.ipc.core.user.get())?.localApi.isEnabled
  );
}

test.describe('Local API lifecycle', () => {
  test("the user menu's switch starts and stops the local API, and is remembered", async ({
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
    await navigate(mainWindow, '#/projects');

    // Act: switch the Local API on in the user menu, which ci's rule makes the
    // one place it is turned on and off.
    await (await localApiSwitch(mainWindow)).click();

    // Assert: the desktop app drove the API lifecycle. It is running...
    await expect.poll(async () => apiIsRunningViaIpc(mainWindow)).toBe(true);
    // ...and actually serving content over HTTP.
    await expect.poll(probe).toBe('serving');
    // ...and the preference the main process reads at launch was written, so
    // the API comes back with the app.
    await expect.poll(async () => rememberedViaIpc(mainWindow)).toBe(true);

    // Act: switch it off again. The switch shows the state it is in, so this
    // waits for it to say the API is running before flipping it back.
    const onAgain = await localApiSwitch(mainWindow);
    await expect(onAgain).toBeChecked();
    await onAgain.click();

    // Assert: it is stopped, the port refuses connections, and the preference
    // followed. Polled, since the OS may lag releasing the port.
    await expect.poll(async () => apiIsRunningViaIpc(mainWindow)).toBe(false);
    await expect.poll(probe).toBe('refused');
    await expect.poll(async () => rememberedViaIpc(mainWindow)).toBe(false);
  });

  test('the profile marks a port in use on the Port field and saves nothing', async ({
    mainWindow,
  }) => {
    // Not the port above, so this never waits on the OS releasing that one.
    const port = 31311;

    // Arrange: a User whose switch is on while the API is not running, which
    // is the state a port held at launch leaves behind, and something holding
    // the port the Profile is about to be given.
    await setUserViaIpc(mainWindow, {
      localApi: { port: 31312, isEnabled: true },
    });
    expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);
    const blocker = await holdPort(port);

    try {
      // Act: give it the held port and save.
      await navigateToUserProfile(mainWindow);
      await mainWindow.getByLabel('Port', { exact: true }).fill(String(port));
      await mainWindow.getByRole('button', { name: 'Save' }).click();

      // Assert: the Port field says why, and the page stays to correct it.
      await expect(
        mainWindow.getByText(
          'This port is already in use. Choose a different one.'
        )
      ).toBeVisible();
      await expect(mainWindow).toHaveURL(/#\/user\/profile$/);
      expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);

      // The API is started before the User is saved, so nothing was saved.
      const user = await mainWindow.evaluate(async () =>
        window.ipc.core.user.get()
      );
      expect(user?.localApi.port).toBe(31312);
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
      await (await localApiSwitch(mainWindow)).click();

      // Assert: a toast says why, the API stays off, and nothing was
      // remembered, so the next launch does not try the held port either.
      await expect(
        mainWindow.getByText(`Port ${port} is already in use`)
      ).toBeVisible();
      expect(await apiIsRunningViaIpc(mainWindow)).toBe(false);
      expect(await rememberedViaIpc(mainWindow)).toBe(false);
    } finally {
      await releasePort(blocker);
    }
  });
});

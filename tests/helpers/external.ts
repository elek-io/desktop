import { type ElectronApplication } from '@playwright/test';

/**
 * Record what the app asks the system to open, instead of opening it.
 *
 * A link that leaves the app goes through the main process's window open
 * handler, which denies a hostname outside the allow list and only reaches
 * `shell.openExternal` for one inside it. So an address that arrives here is an
 * address the app is allowed to open, which is what a spec about an outward
 * link asserts. Nothing opens a browser while this is in place.
 *
 * Scoped to the current test's app instance, like the other main-process stubs.
 */
export async function recordExternalOpensViaIpc(
  electronApp: ElectronApplication
): Promise<void> {
  await electronApp.evaluate(({ shell }) => {
    globalThis.openedExternally = [];
    // The real one is async, so the replacement has to be too, and it has
    // nothing to await.
    shell.openExternal = async (url: string): Promise<void> => {
      await Promise.resolve(globalThis.openedExternally?.push(url));
    };
  });
}

/** Every address the app asked the system to open, in order. */
export async function externalOpens(
  electronApp: ElectronApplication
): Promise<string[]> {
  return electronApp.evaluate(() => globalThis.openedExternally ?? []);
}

import { expect, type ElectronApplication } from '@playwright/test';

import { type CoreErrorType } from '@elek-io/core';

import { serializeCoreError } from '../../src/shared/ipcError.js';

/**
 * Assert that an IPC call rejects.
 *
 * Playwright's `expect` has no `.rejects` matcher (that is Jest), so await the
 * promise inside a try/catch and assert it threw. The `ViaIpc` helpers run their
 * `window.ipc` call inside `page.evaluate`, so a rejected IPC call rejects the
 * helper's promise, which this observes. Awaiting the rejection here (rather than
 * letting it surface through a UI mutation) keeps it off the renderer console, so
 * the fixture's console assertion is not tripped.
 *
 * This deliberately asserts only that the call threw, not the error's code, cause
 * or message. Core owns and tests its error contract; the desktop suite observes
 * only throw / no-throw for a guard with no UI path (see testing.md).
 */
export async function expectRejects(promise: Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await promise;
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

/**
 * Replace a Core IPC handler so its next call rejects, to drive an unexpected
 * failure the app has no in-place handling for. Used to prove such a failure
 * reaches the root error boundary rather than an in-place dialog, which guards
 * the mutation's `throwOnError` predicate against a regression back to a blanket
 * `throwOnError: false` (see error-handling.md).
 *
 * Mirrors `stubFileDialog`: the app captures each handler by reference at
 * registration, so this removes the real one and registers a throwing
 * replacement in the main process. The thrown error is a plain `Error` and so
 * carries no `CoreError` type, which is exactly what the predicate treats as
 * unexpected and lets propagate. Scoped to the current test's app instance, so
 * it does not leak. Electron logs a handler throw to the main process console,
 * not the renderer, so the fixture's renderer console check is not tripped.
 */
export async function stubCoreReject(
  electronApp: ElectronApplication,
  channel: string
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    ipcMain.removeHandler(ch);
    ipcMain.handle(ch, () => {
      throw new Error('E2E injected failure');
    });
  }, channel);
}

/**
 * Replace a Core IPC handler so its next call rejects with a `CoreError` of
 * `type`, to drive a failure the app routes by type without arranging the
 * conditions Core raises it for. Used for a type no local git repository can
 * produce, such as a remote that refuses the credentials (`Unauthorized`), and
 * for a type the app deliberately does not handle, which has to reach the root
 * error boundary even though it carries a type.
 *
 * Mirrors `stubCoreReject`, including why it has to run in the main process.
 * The one difference is the message: the main process encodes a `CoreError`'s
 * type into the message with a sentinel, which the renderer decodes back out
 * (see `shared/ipcError.ts`), so the replacement throws the same encoded shape
 * the real handler would. The message is written here rather than in the main
 * process, because `electronApp.evaluate` can only take plain data.
 */
export async function stubCoreRejectWithType(
  electronApp: ElectronApplication,
  channel: string,
  type: CoreErrorType
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, stub) => {
      ipcMain.removeHandler(stub.channel);
      ipcMain.handle(stub.channel, () => {
        throw new Error(stub.message);
      });
    },
    {
      channel,
      message: serializeCoreError(type, `E2E injected ${type} failure`),
    }
  );
}

/**
 * Replace a Core IPC handler so its next call never settles, to make the
 * in-flight window of a mutation stable to assert instead of racing a fast
 * resolve. A control that waits while its call is in flight is observed this
 * way: the button's waiting state cannot be caught otherwise.
 *
 * Mirrors `stubCoreReject`, including why it has to run in the main process.
 * The call never settles, so the test ends with it pending, which is fine since
 * the app is closed in teardown.
 */
export async function stubCoreHang(
  electronApp: ElectronApplication,
  channel: string
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    ipcMain.removeHandler(ch);
    ipcMain.handle(ch, async () => {
      await new Promise(() => {});
    });
  }, channel);
}

/**
 * Replace a Core IPC handler so its next call answers with a canned value, to
 * drive a shape of Core's answer the UI has to render but the app cannot
 * produce itself yet.
 *
 * The one use today is a diff carrying a Component change: a Release renders
 * every change Core reports, while Components have no UI, no IPC surface and so
 * no way to be renamed from the app (see not-yet-implemented.md). Rendering
 * Core's answer is the desktop app's own responsibility, which is what this
 * asserts, and the diff's contents stay Core's to compute and test.
 *
 * Mirrors `stubCoreReject`: the app captures each handler by reference at
 * registration, so this removes the real one and registers a replacement in the
 * main process. Scoped to the current test's app instance, so it does not leak.
 * The value crosses the process boundary through Electron's structured clone,
 * so it has to be plain data.
 */
export async function stubCoreResolve(
  electronApp: ElectronApplication,
  channel: string,
  value: unknown
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, canned) => {
      ipcMain.removeHandler(canned.channel);
      ipcMain.handle(canned.channel, () => canned.value);
    },
    { channel, value }
  );
}

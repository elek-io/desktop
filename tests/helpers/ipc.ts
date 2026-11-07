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
 * The message a `CoreError` of `type` arrives in, as the main process encodes
 * one.
 *
 * The main process encodes a `CoreError`'s type into the message with a
 * sentinel, which the renderer decodes back out (see `shared/ipcError.ts`), so
 * an injected failure throws the same encoded shape the real handler would. It
 * is written here rather than in the main process, because
 * `electronApp.evaluate` can only take plain data.
 *
 * The stack is a stand-in for Core's own origin stack, because Core raises
 * every `CoreError` with one and the renderer logs whatever arrives. Without it
 * a spec that reads the log record could not tell a stack the app dropped from
 * one that was never sent.
 */
function injectedCoreErrorMessage(
  type: CoreErrorType,
  cause?: unknown
): string {
  return serializeCoreError(
    type,
    `E2E injected ${type} failure`,
    `CoreError: E2E injected ${type} failure\n    at injectedCoreErrorMessage (tests/helpers/ipc.ts)`,
    cause
  );
}

/**
 * Replace a Core IPC handler so its next call rejects with a `CoreError` of
 * `type`, to drive a failure the app routes by type without arranging the
 * conditions Core raises it for. Used for a type no local git repository can
 * produce, such as a remote that refuses the credentials (`Unauthorized`), and
 * for a type the app deliberately does not handle, which has to reach the root
 * error boundary even though it carries a type.
 *
 * Pass `delayMs` to hold the rejection open for that long, which is what makes
 * a window between pressing a control and its failure arriving long enough to
 * act in. A failure that depends on where focus is when it lands is observed
 * that way: without the delay the rejection races the step that moves focus.
 *
 * Pass `cause` to drive a shape Core attaches to one, which it does for a
 * refused field definition change and for a sync it would integrate dangling
 * references with. It goes through `serializeCoreError`, so it crosses exactly
 * as the real one does, narrowed by the same encoding (see
 * `shared/ipcError.ts`). Used for a set of references no local repository can
 * be arranged into, such as the same field reached through two carriers.
 *
 * Mirrors `stubCoreReject`, including why it has to run in the main process.
 * The one difference is the message, see `injectedCoreErrorMessage`.
 */
export async function stubCoreRejectWithType(
  electronApp: ElectronApplication,
  channel: string,
  type: CoreErrorType,
  options: { delayMs?: number; cause?: unknown } = {}
): Promise<void> {
  const { delayMs = 0, cause } = options;

  await electronApp.evaluate(
    ({ ipcMain }, stub) => {
      ipcMain.removeHandler(stub.channel);
      ipcMain.handle(stub.channel, async () => {
        if (stub.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, stub.delayMs));
        }
        throw new Error(stub.message);
      });
    },
    { channel, delayMs, message: injectedCoreErrorMessage(type, cause) }
  );
}

/**
 * Wrap a Core IPC handler so its next call rejects with a `CoreError` of
 * `type` and every call after it reaches Core as usual.
 *
 * A flow that has to fail and then go through is driven this way, which
 * `stubCoreRejectWithType` cannot do, because it drops the real handler for
 * good. The sync is the case: the card holds a failed sync as a state until a
 * sync succeeds, and the toast's Retry is what starts that second one.
 *
 * It takes the same `delayMs` and `cause` as `stubCoreRejectWithType`, and the
 * same encoded message. Unlike every other stub here it wraps the registered
 * handler rather than replacing it, which needs Electron's own handler map, the
 * way `recordUnsavedChangesClaims` does, see `tests/electron-internals.d.ts`.
 */
export async function stubCoreRejectWithTypeOnce(
  electronApp: ElectronApplication,
  channel: string,
  type: CoreErrorType,
  options: { delayMs?: number; cause?: unknown } = {}
): Promise<void> {
  const { delayMs = 0, cause } = options;

  await electronApp.evaluate(
    ({ ipcMain }, stub) => {
      const handlers = ipcMain._invokeHandlers;
      const handler = handlers?.get(stub.channel);

      // Asked before the app registered the channel, so a stub that cannot
      // wrap says so instead of leaving the call to fail every time.
      if (handlers === undefined || handler === undefined) {
        throw new Error(
          `No handler of "${stub.channel}" to wrap, so nothing would reject`
        );
      }

      let rejected = false;
      handlers.set(stub.channel, async (event, ...args) => {
        if (rejected) {
          return handler(event, ...args);
        }

        rejected = true;

        if (stub.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, stub.delayMs));
        }

        throw new Error(stub.message);
      });
    },
    { channel, delayMs, message: injectedCoreErrorMessage(type, cause) }
  );
}

/**
 * Wrap a Core IPC handler so a call whose props match rejects with a
 * `CoreError` of `type`, and every other call reaches Core as usual.
 *
 * A screen that reads the same channel once per thing it shows is driven this
 * way: one of those reads fails and the rest answer, which is what shows
 * whether a failure stays where it happened. The Projects page is the case,
 * where every card reads the Releases of its own Project.
 *
 * The match is plain data, because `electronApp.evaluate` takes nothing else,
 * and every entry of it has to equal the same key of the call's first argument.
 * It wraps the registered handler rather than replacing it, like
 * `stubCoreRejectWithTypeOnce`, which needs Electron's own handler map, see
 * `tests/electron-internals.d.ts`.
 */
export async function stubCoreRejectWithTypeWhere(
  electronApp: ElectronApplication,
  channel: string,
  type: CoreErrorType,
  match: Record<string, string>
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, stub) => {
      const handlers = ipcMain._invokeHandlers;
      const handler = handlers?.get(stub.channel);

      if (handlers === undefined || handler === undefined) {
        throw new Error(
          `No handler of "${stub.channel}" to wrap, so nothing would reject`
        );
      }

      handlers.set(stub.channel, (event, ...args) => {
        const [props] = args;
        const matches =
          typeof props === 'object' &&
          props !== null &&
          Object.entries(stub.match).every(
            ([key, value]) => (props as Record<string, unknown>)[key] === value
          );

        if (matches === false) {
          return handler(event, ...args);
        }

        throw new Error(stub.message);
      });
    },
    { channel, match, message: injectedCoreErrorMessage(type) }
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
 * Replace a Core IPC handler so it records that it was called instead of
 * reaching Core, to observe that something never got that far.
 *
 * A form that blocks Save is the case: pressing it has to reach neither Core
 * nor the channel in front of it, and the channel is the seam a desktop test
 * owns (see testing.md). Mirrors `stubCoreReject`, including why it has to run
 * in the main process. Read what it collected with `recordedCoreCalls`.
 */
export async function stubCoreRecord(
  electronApp: ElectronApplication,
  channel: string
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    globalThis.recordedCoreCalls = [];
    ipcMain.removeHandler(ch);
    ipcMain.handle(ch, () => {
      globalThis.recordedCoreCalls?.push(ch);
    });
  }, channel);
}

/** Every call a `stubCoreRecord` channel took since it was put in place. */
export async function recordedCoreCalls(
  electronApp: ElectronApplication
): Promise<string[]> {
  return electronApp.evaluate(() => globalThis.recordedCoreCalls ?? []);
}

/**
 * Replace a Core IPC handler so its next call answers with a canned value, to
 * drive a shape of Core's answer the UI has to render without arranging what
 * Core computes it from.
 *
 * The one use today is a Release diff carrying a Component change. A Release
 * renders every change Core reports, and what Core reports for one is Core's to
 * compute and test, so the answer is stubbed rather than arranged. Rendering it
 * is the desktop app's own responsibility, which is what this asserts.
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

/**
 * Record what the app hands a Core channel, while Core keeps answering it.
 *
 * Wrapped rather than replaced, because what the call does is part of what a
 * spec asserts: a save that renames an Asset has to reach Core, and what says
 * it left the file alone is that the call carried no new file. The handler the
 * app registered is taken from Electron's own map, since no public API hands
 * one back and `removeHandler` drops it for good, see
 * tests/electron-internals.d.ts.
 */
export async function recordCoreCallProps(
  electronApp: ElectronApplication,
  channel: string
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    const handlers = ipcMain._invokeHandlers;
    const handler = handlers?.get(ch);

    // Asked before anything is set up, so a helper that cannot watch leaves no
    // record of its own behind to read as an empty one.
    if (handlers === undefined || handler === undefined) {
      throw new Error(
        `No handler of "${ch}" to watch, so nothing would be recorded`
      );
    }

    globalThis.recordedCoreCallProps = [];
    handlers.set(ch, async (event, ...args) => {
      globalThis.recordedCoreCallProps?.push(args[0]);
      return await Promise.resolve(handler(event, ...args));
    });
  }, channel);
}

/** What every call of a `recordCoreCallProps` channel was handed, in order. */
export async function recordedCoreCallProps(
  electronApp: ElectronApplication
): Promise<unknown[]> {
  return electronApp.evaluate(() => globalThis.recordedCoreCallProps ?? []);
}

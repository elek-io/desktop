// One Electron internal, declared so a spec can watch an IPC channel the app
// owns without a cast. It is test-only and is not used anywhere in `src`.
export {};

declare global {
  namespace Electron {
    interface IpcMain {
      /**
       * Electron's own map from channel name to the handler `handle`
       * registered for it.
       *
       * There is no public way to read a registered handler back, and
       * `removeHandler` drops it for good, so a spec that has to watch a
       * channel while the app keeps answering it reaches for this. Declared
       * optional on purpose: an Electron that renames it then fails the check
       * in the helper that uses it rather than silently watching nothing, see
       * tests/helpers/window.ts.
       */
      _invokeHandlers?: Map<
        string,
        (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
      >;
    }
  }
}

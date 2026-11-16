import { type ElectronApplication } from '@playwright/test';

/**
 * Record what the app logs, instead of letting it reach Core's log files.
 *
 * Core's logger is the app's one sink and everything goes to it over the
 * `core:logger:*` channels, so replacing those handlers in the main process
 * records every record the renderer writes, through the app's own code path and
 * the real IPC hop. It is the only way to observe logging from a spec, since a
 * log file is Core's and a desktop test does not read Core's output.
 *
 * Scoped to the current test's app instance, like the other main-process stubs.
 * Core writes nothing while it is in place, which is what makes the records
 * readable, so a spec that needs the real logger does not call this.
 */
export async function recordLogsViaIpc(
  electronApp: ElectronApplication
): Promise<void> {
  await electronApp.evaluate(({ ipcMain }) => {
    globalThis.recordedLogs = [];

    for (const level of ['debug', 'info', 'warn', 'error']) {
      const channel = `core:logger:${level}`;
      ipcMain.removeHandler(channel);
      // What the app sends over these channels, which is Core's own
      // `LogProps`. Annotated rather than narrowed, since Electron types a
      // handler's arguments as `any`.
      ipcMain.handle(
        channel,
        (
          _event,
          record: {
            source?: string;
            message?: string;
            meta?: Record<string, unknown>;
          }
        ) => {
          globalThis.recordedLogs?.push({
            level,
            source: record.source ?? '',
            message: record.message ?? '',
            meta: record.meta ?? {},
          });
        }
      );
    }
  });
}

/** Every record written since `recordLogsViaIpc`, newest last. */
export async function recordedLogs(
  electronApp: ElectronApplication
): Promise<RecordedLog[]> {
  return electronApp.evaluate(() => globalThis.recordedLogs ?? []);
}

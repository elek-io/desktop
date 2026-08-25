import { parseIpcError } from '@root/src/shared/ipcError';
import { createHashHistory, createRouter } from '@tanstack/react-router';

import { errorLogAttributes } from '@renderer/lib/logError';
import { routeTree } from '@renderer/routeTree.gen';

/**
 * Last-resort sink for the renderer.
 *
 * React's root callbacks in `app.tsx` only see errors thrown during render.
 * Anything outside that, a rejected floated promise (the app is full of
 * `void window.ipc.core.*` calls) or an error in a plain event handler, reached
 * no sink at all once Sentry's browser SDK was removed, which installed these
 * two listeners itself. They would be missing from the log tail a bug report
 * attaches, which is the one thing meant to replace it.
 *
 * The main process needs no equivalent. Core's logger builds its winston
 * transport with `handleExceptions` and `handleRejections`, so winston installs
 * the matching `process.on` handlers and an uncaught throw there already lands
 * in Core's log files.
 *
 * Installed at module scope so it is in place before the app mounts, and both
 * listeners swallow a failed log rather than floating it, since a rejection
 * raised from inside this handler would come straight back to it.
 */
function reportToCore(message: string, error: unknown): void {
  const { message: decoded } = parseIpcError(error);

  void window.ipc.core.logger
    .error({
      source: 'desktop',
      message: `${message}: ${decoded}`,
      meta: errorLogAttributes(error),
    })
    .catch(() => undefined);
}

window.addEventListener('unhandledrejection', (event) => {
  reportToCore('Unhandled promise rejection', event.reason);
});

window.addEventListener('error', (event) => {
  reportToCore('Uncaught error', event.error ?? event.message);
});

// Create a new router instance
const hashHistory = createHashHistory(); // Use hash based routing since in production electron just loads the index.html via the file protocol
const router = createRouter({
  routeTree,
  history: hashHistory,
  context: {},
});
router.subscribe('onBeforeLoad', (event) => {
  void window.ipc.core.logger.info({
    source: 'desktop',
    message: `Desktop navigating from "${event.fromLocation?.href}" to "${event.toLocation.href}"`,
  });
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };

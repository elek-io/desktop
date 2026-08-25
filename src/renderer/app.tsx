import '@fontsource-variable/montserrat';
import '@fontsource/roboto';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { ThemeProvider } from '@renderer/components/theme-provider';
import { router } from '@renderer/index';
import '@renderer/index.css';
import {
  COMPONENT_STACK_ATTRIBUTE,
  errorLogAttributes,
} from '@renderer/lib/logError';
import { queryClient } from '@renderer/queries';

/**
 * Sends one of React's root error callbacks to Core's logger.
 *
 * Everything is flattened to plain strings on purpose, because this crosses IPC
 * and a structured clone failure would lose the log silently, which is the one
 * thing a last-resort sink must not do. Two values would break it:
 *
 * - `errorInfo` carries `errorBoundary` on the caught-error callback, which is
 *   the boundary's class instance (TanStack Router's `CatchBoundaryImpl`
 *   extends `React.Component`). It holds `updater` and `_reactInternals`, so it
 *   has functions and circular references. Only `componentStack` is forwarded.
 * - `error` is `unknown`, so a thrown non-Error object need not be cloneable.
 *   `errorLogAttributes` reduces any value to strings, and decodes a
 *   `CoreError` that crossed IPC on the way, so the copy matches what the error
 *   boundary shows.
 */
function logReactError(
  level: 'error' | 'warn',
  message: string,
  error: unknown,
  errorInfo: { componentStack?: string | undefined }
): void {
  // Swallow a failed log rather than `void`ing it. This runs on the error path,
  // where an unhandled rejection would be picked up by the global handler in
  // `renderer/index.ts`, which logs the same way and would fail the same way.
  void window.ipc.core.logger[level]({
    source: 'desktop',
    message,
    meta: {
      ...errorLogAttributes(error),
      ...(errorInfo.componentStack === undefined
        ? {}
        : { [COMPONENT_STACK_ATTRIBUTE]: errorInfo.componentStack }),
    },
  }).catch(() => undefined);
}

// Render the app
const rootElement = document.getElementById('app')!;
if (!rootElement.innerHTML) {
  // All three handlers are defined on purpose, even where the body is thin.
  // Defining one replaces React's own default, which writes the error to the
  // renderer console. The E2E fixture asserts a console-clean run, and the app
  // routes its error logging over IPC to Core instead, so leaving one out would
  // hand that surface back to React's console.error.
  // See contributing/testing.md and contributing/error-handling.md.
  const root = ReactDOM.createRoot(rootElement, {
    // Called when an error is thrown and not caught by an ErrorBoundary.
    onUncaughtError: (error, errorInfo) => {
      logReactError('error', 'Uncaught React error', error, errorInfo);
    },
    // Called when React catches an error in an ErrorBoundary. The root
    // ErrorComponent logs the decoded error itself, so this only records that
    // React handed it to a boundary, with the component stack it carries.
    onCaughtError: (error, errorInfo) => {
      logReactError(
        'error',
        'React error caught by a boundary',
        error,
        errorInfo
      );
    },
    // Called when React automatically recovers from an error.
    onRecoverableError: (error, errorInfo) => {
      logReactError('warn', 'React recovered from an error', error, errorInfo);
    },
  });

  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="system">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

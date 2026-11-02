import { Trans } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import {
  CatchBoundary,
  type ErrorComponentProps,
  useRouterState,
} from '@tanstack/react-router';
import { type VariantProps } from 'class-variance-authority';
import { RefreshCw } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '@renderer/components/ui/button';
import { isReadFailure } from '@renderer/lib/readFailure';
import { cn } from '@renderer/lib/utils';
import { paneVariants } from '@renderer/lib/variants';

/**
 * The main panel: one solid surface on the ground, with 12 px corners, 8 px
 * from the window's edges, holding one pane or several.
 *
 * It is lighter than the ground in both themes, which is why it takes `card`
 * rather than `background`, and why a control on it takes the same color. A
 * layout route renders it, so every screen under that layout sits on it while
 * the Project's sidebar stays beside it on the ground.
 */
function Panel({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="panel"
      className={cn(
        'mx-2 mb-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-raised',
        className
      )}
      {...props}
    />
  );
}

/**
 * A row of panes, for a screen that splits the main panel into panes of its
 * own, such as a list beside what it opens.
 */
function Panes({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="panes"
      className={cn('flex min-h-0 min-w-0 flex-1', className)}
      {...props}
    />
  );
}

/**
 * A pane of the main panel: the main area, or a list or pane of 296 px beside
 * it.
 *
 * Every pane carries its own error boundary, so a read it cannot make is
 * answered where the pane sits instead of taking the whole window to the error
 * screen. A failed write and a component that throws while rendering are
 * re-thrown and still reach the root error screen, see
 * contributing/error-handling.md.
 */
function Pane({
  className,
  width,
  name,
  children,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof paneVariants> & {
    /**
     * What this pane holds, in the words the failed-read sentence reads with,
     * such as "the History of this Entry".
     *
     * Required, so a new pane cannot ship saying only that it cannot read what
     * belongs here.
     */
    name: string;
  }): React.JSX.Element {
  return (
    <div
      data-slot="pane"
      className={cn(paneVariants({ width }), className)}
      {...props}
    >
      <PaneBoundary name={name}>{children}</PaneBoundary>
    </div>
  );
}

/**
 * The head of a pane: ci's page head in the main area, and a pane's own head in
 * a list of 296 px.
 *
 * The title starts on the pane's text edge, 20 px down, and anything after it
 * ends on the same edge at the right.
 */
function PaneHead({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="pane-head"
      className={cn(
        'flex flex-none items-center gap-3 px-(--pane-edge) py-5',
        className
      )}
      {...props}
    />
  );
}

/**
 * The boundary each pane puts around what it holds.
 *
 * `QueryErrorResetBoundary` is what makes Try again work: a failed query keeps
 * its error until something resets it, so the button clears the query's error
 * and then the boundary, and the read runs again. The router's location is the
 * boundary's reset key, so a pane that failed is not still failed when the
 * screen is opened again.
 */
function PaneBoundary({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}): ReactElement {
  const location = useRouterState({ select: (state) => state.location.href });

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <PaneContext.Provider value={{ name, resetQueries: reset }}>
          <CatchBoundary
            getResetKey={() => location}
            errorComponent={PaneReadFailed}
          >
            {children}
          </CatchBoundary>
        </PaneContext.Provider>
      )}
    </QueryErrorResetBoundary>
  );
}

/**
 * What the pane's name is and how its queries are reset, for the one component
 * `CatchBoundary` renders, which it only ever hands an error and a reset.
 *
 * The default value is `createContext`'s own requirement and is never read:
 * the only component that reads this context is rendered by the boundary
 * inside the provider, and every pane passes a name.
 */
const PaneContext = createContext<{
  name: string;
  resetQueries: () => void;
}>({ name: 'what belongs here', resetQueries: () => undefined });

/**
 * One sentence in the pane's place, and Try again.
 *
 * It logs what it caught the way the root error screen does, through
 * `errorLogAttributes`, so a read that failed inside a pane reaches the log
 * file with its type, message and stack like any other. From an effect rather
 * than the render body, so a re-render does not write the same record again.
 *
 * Anything that is not a failed read is re-thrown, which carries it to the root
 * error screen: an unexpected failure is fatal to the view and worth reporting,
 * and "cannot be read" would be the wrong thing to say about a save that
 * failed. The re-throw sits below the hooks, so none of them is conditional,
 * and React discards this render instead of committing it.
 */
function PaneReadFailed({ error, reset }: ErrorComponentProps): ReactElement {
  const { name, resetQueries } = useContext(PaneContext);
  const isRead = isReadFailure(error);
  const { message } = parseIpcError(error);

  useEffect(() => {
    if (isRead === false) {
      return;
    }

    void window.ipc.core.logger.error({
      source: 'desktop',
      message: `Uncaught pane error: ${message}`,
      meta: errorLogAttributes(error),
    });
  }, [isRead, message, error]);

  if (isRead === false) {
    throw error;
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 px-(--pane-edge) py-4"
    >
      <p>
        <Trans>Desktop can&apos;t read {name}.</Trans>
      </p>
      <Button
        variant="outline"
        size="sm"
        Icon={RefreshCw}
        onClick={() => {
          resetQueries();
          reset();
        }}
      >
        <Trans>Try again</Trans>
      </Button>
    </div>
  );
}

export { Panel, Panes, Pane, PaneHead };

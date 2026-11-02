import {
  type DragEventHandler,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import { PaneHead } from '@renderer/components/pane';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { cn } from '@renderer/lib/utils';

export interface PageProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: ReactElement;
  actions?: ReactElement;
  children?: ReactNode;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}

/**
 * A screen inside the main panel's pane: one page head, then what the screen
 * shows.
 *
 * The head holds the title on the pane's text edge, 20 px down, and the
 * screen's buttons ending on the same edge at the right. It stays while the
 * body below it scrolls, so a window at the smallest size the app supports
 * never pushes the title or a primary button out of reach.
 *
 * Everything inside starts on the pane's one text edge, `--pane-edge`, which
 * is 24 px in the main area and 16 px in a list of 296 px.
 */
export function Page({
  className,
  title,
  description,
  actions,
  children,
  onDragOver,
  onDragLeave,
  onDragEnter,
  onDrop,
  ...props
}: PageProps): ReactElement {
  return (
    <main
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
      {...props}
    >
      <PaneHead>
        <div className="min-w-0 flex-1">
          <h1 className="text-h3">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-prose text-small text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-none items-center gap-2">{actions}</div>
        ) : null}
      </PaneHead>

      <ScrollArea className="flex-1">
        <div className="px-(--pane-edge) pb-6">{children}</div>
      </ScrollArea>
    </main>
  );
}

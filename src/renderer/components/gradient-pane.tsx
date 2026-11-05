import * as React from 'react';

import { cn } from '@renderer/lib/utils';

/**
 * The one gradient, filling a pane, with what it holds centered on it.
 *
 * Three screens take it and nothing else does: an empty state, the Welcome
 * screen and the first start. A filter without matches says so in its list
 * instead, because the page itself is not empty, see ci's docs/desktop.md.
 *
 * The gradient always carries the dark mode colors, in light mode too, so the
 * surface declares `dark` and the text color with it, and a card placed on it
 * takes the light colors back through `on-plate`, see
 * contributing/renderer/theming-and-styling.md.
 *
 * It is the screen's `main` landmark, the way `Page` is on every other screen,
 * so a screen that stands empty is still one somebody can jump to.
 */
export function GradientPane({
  className,
  children,
  ...props
}: React.ComponentProps<'main'>): React.JSX.Element {
  return (
    <main
      data-slot="gradient-pane"
      className={cn(
        'dark flex min-h-0 flex-1 overflow-y-auto bg-linear-to-br from-gradient-start to-gradient-end to-90% p-6 text-foreground',
        className
      )}
      {...props}
    >
      {/* The pane itself keeps the edge clear, so what stands here is a plain
      content box: a column of 520 px holds ci's own 520 px of content. */}
      <div className="m-auto flex max-w-full flex-col items-center text-center text-balance">
        {children}
      </div>
    </main>
  );
}

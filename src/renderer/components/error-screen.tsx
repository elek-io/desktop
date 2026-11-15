import { type ReactElement, type ReactNode } from 'react';

import { cn } from '@renderer/lib/utils';

/**
 * The screen that stands in for the whole view when there is nothing to show:
 * the error screen and the not-found screen.
 *
 * It is ci's empty state laid out on the panel itself rather than on the
 * gradient, since nothing here is empty, see ci's docs/desktop.md. The column
 * is 640 px instead of an empty state's 520, so an error's title and its
 * sentence sit on two lines rather than four, and what it holds comes from
 * `ui/empty.tsx`, so the icon, the title, the sentence and the buttons keep the
 * same rhythm as every empty state.
 *
 * It is the screen's `main` landmark, like `Page` on every other screen, and it
 * scrolls, so a window lower than what it holds, Details included, can reach
 * all of it. The room for that scrollbar is kept whether or not there is one,
 * so opening Details does not take 15 px off the column and shift the centered
 * screen sideways while somebody is reading it.
 */
export function ErrorScreen({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <main
      data-slot="error-screen"
      className={cn(
        'flex min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto p-6',
        className
      )}
    >
      <div className="m-auto flex w-[640px] max-w-full flex-col items-center text-center text-balance">
        {children}
      </div>
    </main>
  );
}

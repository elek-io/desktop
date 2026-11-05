import { type VariantProps } from 'class-variance-authority';

import { cn } from '@renderer/lib/utils';
import { emptyMediaVariants } from '@renderer/lib/variants';

/**
 * A screen with nothing in it yet: the one gradient filling the pane, and a
 * column of 520 px centered on it.
 *
 * ci's empty state, which every screen's uses: an icon of what is missing, a
 * title, one sentence, and the screen's one primary button. It takes the pane
 * rather than standing under a page head, because no other button may repeat
 * the action the state itself offers, see ci's docs/desktop.md.
 *
 * The gradient always carries the dark mode colors, in light mode too, so the
 * surface declares `dark` and the text color with it, and a card placed on it
 * takes the light colors back through `on-plate`, see
 * contributing/renderer/theming-and-styling.md. Nothing else in the app takes
 * the gradient: a filter with no matches says so in its list, because the page
 * itself is not empty.
 */
function Empty({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty"
      className={cn(
        'dark flex min-h-0 flex-1 overflow-y-auto bg-linear-to-br from-gradient-start to-gradient-end to-90% py-6 text-foreground',
        className
      )}
      {...props}
    >
      <div className="m-auto flex w-[520px] max-w-full flex-col items-center px-6 text-center text-balance">
        {children}
      </div>
    </div>
  );
}

/**
 * The icon of what is missing, framed as ci draws it: 48 px on the pane's own
 * surface with the raised shadow, so it reads as a card on the gradient.
 */
function EmptyMedia({
  className,
  variant = 'icon',
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof emptyMediaVariants>): React.JSX.Element {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

/**
 * What is missing, in ci's h3 role: 28 px below the mark, and 20 px below the
 * framed icon that stands in its place on a screen of a Project.
 */
function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<'h2'>): React.JSX.Element {
  return (
    <h2
      data-slot="empty-title"
      className={cn('mt-7 text-h3 [[data-slot=empty-media]+&]:mt-5', className)}
      {...props}
    />
  );
}

/** The one sentence below the title. */
function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="empty-description"
      className={cn('mt-2.5 text-body text-muted-foreground', className)}
      {...props}
    />
  );
}

/** The screen's one primary button, and nothing that repeats it. */
function EmptyActions({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty-actions"
      className={cn('mt-7 flex items-center gap-2', className)}
      {...props}
    />
  );
}

export { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle };

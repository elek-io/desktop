import { type VariantProps } from 'class-variance-authority';

import { GradientPane } from '@renderer/components/gradient-pane';
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
 * The gradient itself is `GradientPane`, which the first start takes too.
 */
function Empty({
  className,
  ...props
}: React.ComponentProps<'main'>): React.JSX.Element {
  return (
    <GradientPane
      data-slot="empty"
      className={cn('[&>*]:w-[520px]', className)}
      {...props}
    />
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
 *
 * It is the screen's `h1`, because an empty state takes the pane and there is
 * no page head above it to carry one. ci's h3 is its size, not its rank.
 */
function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<'h1'>): React.JSX.Element {
  return (
    <h1
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

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { type VariantProps } from 'class-variance-authority';

import { Separator } from '@renderer/components/ui/separator';
import { cn } from '@renderer/lib/utils';
import { buttonGroupVariants } from '@renderer/lib/variants';

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof buttonGroupVariants>): React.JSX.Element {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  render,
  ...props
}: useRender.ComponentProps<'div'>): React.ReactElement {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(
          "flex items-center gap-2 rounded-md border bg-muted px-2.5 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: 'button-group-text',
    },
  });
}

function ButtonGroupSeparator({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof Separator>): React.JSX.Element {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        'relative self-stretch bg-input data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto',
        className
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };

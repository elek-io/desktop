'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '@renderer/lib/utils';
import { toggleVariants } from '@renderer/lib/variants';

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants>): React.JSX.Element {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle };

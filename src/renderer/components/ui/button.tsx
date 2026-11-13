import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { type VariantProps } from 'class-variance-authority';
import { type LucideProps } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@renderer/components/ui/spinner';
import { cn } from '@renderer/lib/utils';
import { buttonVariants } from '@renderer/lib/variants';

function Button({
  className,
  variant = 'default',
  size = 'default',
  children,
  disabled,
  isLoading = false,
  Icon,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
    // Explicitly undefined, so a wrapper can forward an Icon it may not have
    // got under exactOptionalPropertyTypes.
    Icon?: React.ComponentType<LucideProps> | undefined;
  }): React.JSX.Element {
  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={isLoading === true || disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {isLoading ? (
        // The disabled button already says it is busy, so the spinner stays out
        // of the accessible name a label or a locator reads.
        <Spinner aria-hidden="true" />
      ) : Icon ? (
        <Icon className="size-4" />
      ) : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button };

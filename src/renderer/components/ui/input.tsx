import { Input as InputPrimitive } from '@base-ui/react/input';
import * as React from 'react';

import { cn } from '@renderer/lib/utils';

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Input };

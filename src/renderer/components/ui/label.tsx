import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';

import { cn } from '@renderer/lib/utils';

function Label({
  className,
  children,
  isRequired = false,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  isRequired?: boolean;
}): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      {isRequired === false && (
        // The leading space keeps the composed accessible name readable ("Title -
        // optional", not "Title- optional"). The flex gap collapses it visually.
        <span className="text-sm text-muted-foreground">{' - optional'}</span>
      )}
    </LabelPrimitive.Root>
  );
}

export { Label };

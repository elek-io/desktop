import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@renderer/lib/utils';

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full p-[3px] transition-all after:absolute after:-inset-x-3 after:-inset-y-2 aria-invalid:inset-ring-1 aria-invalid:inset-ring-error data-[size=default]:h-[18px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:bg-foreground data-unchecked:bg-card data-unchecked:inset-ring-1 data-unchecked:inset-ring-input data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full transition-transform group-data-[size=default]/switch:size-3 group-data-[size=sm]/switch:size-2 data-checked:bg-background group-data-[size=default]/switch:data-checked:translate-x-[14px] group-data-[size=sm]/switch:data-checked:translate-x-[10px] data-unchecked:bg-muted-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

import { useLingui } from '@lingui/react/macro';
import { Loader2Icon } from 'lucide-react';

import { cn } from '@renderer/lib/utils';

function Spinner({
  className,
  ...props
}: React.ComponentProps<'svg'>): React.JSX.Element {
  const { t } = useLingui();

  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t`Loading`}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };

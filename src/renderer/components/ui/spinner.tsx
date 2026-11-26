import { useLingui } from '@lingui/react/macro';
import { Loader2Icon } from 'lucide-react';

import { cn } from '@renderer/lib/utils';

/**
 * The one thing in the app that keeps moving, because it says that something
 * is still running.
 *
 * Under `prefers-reduced-motion` it stands still, as ci's motion rules ask:
 * the control around it says what it is doing in words, such as Sync saying
 * "Syncing" while it syncs, so nothing is told by the movement alone.
 */
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
      className={cn(
        'size-4 animate-spin motion-reduce:animate-none',
        className
      )}
      {...props}
    />
  );
}

export { Spinner };

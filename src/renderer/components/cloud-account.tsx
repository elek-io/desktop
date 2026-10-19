import {
  CloudIcon,
  HardDriveIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';

import type { CloudAccountState } from '@renderer/hooks/useCloudAccount';
import { cn } from '@renderer/lib/utils';

const accountLines: Record<
  CloudAccountState,
  { label: string; Icon: LucideIcon; className: string }
> = {
  local: {
    label: 'On this computer',
    Icon: HardDriveIcon,
    className: 'text-muted-foreground',
  },
  cloud: {
    label: 'elek.io Cloud',
    Icon: CloudIcon,
    className: 'text-muted-foreground',
  },
  // Today's theme has no warning token, so amber stands in for it until the
  // redesign brings one
  paused: {
    label: 'Sync paused',
    Icon: TriangleAlertIcon,
    className: 'text-amber-700 dark:text-amber-400',
  },
};

/**
 * Where the person works, shown under their name in the header without
 * opening the menu. See contributing/cloud-account.md.
 */
export function AccountLine({
  state,
  className,
}: {
  state: CloudAccountState;
  className?: string;
}): React.JSX.Element {
  const { label, Icon, className: colorClassName } = accountLines[state];

  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs',
        colorClassName,
        className
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

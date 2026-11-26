import * as React from 'react';

import { type GitHostLogo as Logo } from '@renderer/lib/gitHost';

/**
 * A Git host's logo, drawn from the single path Simple Icons ships for it.
 *
 * A brand logo rather than a UI icon, so it does not come from Lucide, and it
 * is marked `data-brand-logo` so the suite can tell it from the Lucide icons
 * around it. It is hidden from assistive technology, because the host's name
 * stands beside it in words wherever it is drawn.
 */
export function GitHostLogo({
  logo,
  className,
}: {
  logo: Logo;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-brand-logo
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d={logo.path} />
    </svg>
  );
}

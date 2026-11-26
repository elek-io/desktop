import * as React from 'react';

import { cn } from '@renderer/lib/utils';

import markDark from '@elek-io/branding/logo/mark-dark.svg?raw';
import markLight from '@elek-io/branding/logo/mark-light.svg?raw';

/**
 * The elek.io mark, as the first start and the Welcome screen lead with it.
 *
 * The brand package's own file, inlined at build time rather than loaded as an
 * image, because its cyan period arrives on its own when the screen opens and
 * only an inline SVG has a period to move. Nothing of the mark's geometry is
 * written out here, so a mark the brand package changes changes with it. The
 * markup is that file and nothing else, so no input of any kind reaches it.
 *
 * Both files ship, one per mode, and the theme decides which is shown, as the
 * header's lockup does it. A mark on the gradient takes the dark one in both
 * modes, since the gradient always carries the dark colors, which the `dark`
 * class on the surface around it is what settles.
 *
 * The motion itself is one rule in `index.css`, which holds the period still
 * under reduced motion, see contributing/renderer/theming-and-styling.md.
 */
export function BrandMark({
  className,
}: {
  /** The mark's size, which ci sets per screen. */
  className?: string;
}): React.JSX.Element {
  return (
    <>
      <span
        data-slot="brand-mark"
        className={cn('block dark:hidden', className)}
        // The brand package's own SVG, read at build time. See above.
        dangerouslySetInnerHTML={{ __html: markLight }}
      />
      <span
        data-slot="brand-mark"
        className={cn('hidden dark:block', className)}
        dangerouslySetInnerHTML={{ __html: markDark }}
      />
    </>
  );
}

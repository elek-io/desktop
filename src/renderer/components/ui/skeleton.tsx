import { cn } from '@renderer/lib/utils';

/**
 * A still placeholder in the muted surface, for anything that is being read.
 *
 * It does not pulse. Nothing in the app moves while a page loads, so the only
 * thing that says a pane is still reading is the shape of what will be there,
 * see contributing/renderer/loading-and-updating-data.md.
 */
function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="skeleton"
      className={cn('rounded-sm bg-muted', className)}
      {...props}
    />
  );
}

/**
 * The rows a pane shows while it reads a list: a title and a line below it,
 * each a still bar, in the geometry of a real row.
 *
 * One component for every list, so a pane that loads looks the same everywhere
 * and no screen writes its own. `aria-busy` with a label says what is being
 * read, since the rows themselves carry no text.
 */
function SkeletonRows({
  rows = 6,
  label,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  rows?: number;
  label: string;
}): React.JSX.Element {
  // Each row's bars differ in width, so a list of them reads as rows of text
  // rather than as a table. Fixed per position, because a random width would
  // change on every render.
  const widths: readonly (readonly [string, string])[] = [
    ['72%', '44%'],
    ['58%', '40%'],
    ['80%', '36%'],
    ['64%', '48%'],
    ['70%', '40%'],
    ['54%', '44%'],
  ];

  return (
    <div
      data-slot="skeleton-rows"
      aria-busy="true"
      aria-label={label}
      className={cn('border-t', className)}
      {...props}
    >
      {Array.from({ length: rows }, (_row, index) => {
        const [title, sub] = widths[index % widths.length] ?? ['72%', '44%'];

        return (
          <div key={index} className="flex flex-col border-b py-2.5">
            <Skeleton className="my-1 h-3" style={{ width: title }} />
            <Skeleton className="mt-1.5 mb-1 h-2" style={{ width: sub }} />
          </div>
        );
      })}
    </div>
  );
}

export { Skeleton, SkeletonRows };

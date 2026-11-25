import { Trans } from '@lingui/react/macro';
import { PencilIcon } from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';

import { FieldShell } from '@renderer/components/ui/app-form';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { fieldRules } from '@renderer/lib/fieldRules';
import { cn } from '@renderer/lib/utils';
import { type ValueMark } from '@renderer/lib/valueMarks';

// What a change shows of one Value: the field laid out as its editor lays it
// out, read rather than edited, with what changed marked in place. What each
// Value reads as is in `value-reading.ts`.
//
// See contributing/renderer/forms.md#a-value-that-is-read-rather-than-edited.

/** "Changed", right after the label, which is where ci puts it. */
function ChangedTag(): ReactElement {
  return (
    <span
      data-slot="field-changed"
      className="inline-flex items-center gap-1 text-foreground"
    >
      {/* The word says it, so the icon is decoration. */}
      <PencilIcon aria-hidden className="size-3" />
      <Trans>Changed</Trans>
    </span>
  );
}

/** One run of the Value, struck through, underlined or as it stands. */
function Mark({ run }: { run: ValueMark }): ReactElement {
  if (run.mark === 'removed') {
    return (
      <del
        data-slot="value-removed"
        className="rounded-[3px] bg-error-surface px-0.5 text-error line-through"
      >
        {run.text}
      </del>
    );
  }

  if (run.mark === 'added') {
    return (
      <ins
        data-slot="value-added"
        className="rounded-[3px] bg-success-surface px-0.5 text-success underline underline-offset-[3px]"
      >
        {run.text}
      </ins>
    );
  }

  return <>{run.text}</>;
}

export interface ReadValueProps {
  /** The Value's runs, in the order they are read. */
  marks: ValueMark[];
  className?: string;
}

/**
 * The Value itself, in ci's read-only field: the border in the divider color
 * rather than the input color, no control, and the text at full contrast.
 *
 * A Value that holds nothing keeps the height of one, so a field that is empty
 * still reads as a field. The text wraps as it was written, which is what
 * keeps the lines of a markdown Value.
 */
export function ReadValue({ marks, className }: ReadValueProps): ReactElement {
  return (
    <div
      data-slot="read-value"
      className={cn(
        'rounded-md border px-2.5 py-[5px] leading-5 wrap-anywhere whitespace-pre-wrap',
        className
      )}
    >
      {marks.length === 0
        ? // A non-breaking space, so an empty Value keeps the height of one.
          '\u00a0'
        : marks.map((run, index) => (
            // A run's place in the Value is its identity: the whole list is
            // worked out again from the two readings whenever either of them
            // changes, so nothing is ever inserted between two runs, and a run
            // holds no state of its own that reconciling by place could lose.
            // eslint-disable-next-line react/no-array-index-key
            <Mark key={index} run={run} />
          ))}
    </div>
  );
}

export interface ReadFieldProps {
  /** The field's label, as its editor shows it. */
  label: ReactNode;
  /** Whether this change touched the field, which gets the bar and "Changed". */
  isChanged: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * One field of a change: its label, "Changed" right after it where it changed,
 * and the Value below.
 *
 * It draws the one field shell with no control in it, because a Value that is
 * read is text and a `<label>` cannot be for text. The bar stands 12 px to the
 * field's left, in the gap of the editor's grid, which is where ci draws it,
 * and in ink rather than in a status color, since the marks inside the Value
 * carry the colors.
 */
export function ReadField({
  label,
  isChanged,
  className,
  children,
}: ReadFieldProps): ReactElement {
  return (
    <div
      data-slot="read-field"
      data-changed={isChanged}
      className={cn(
        'relative',
        isChanged
          ? 'before:absolute before:inset-y-0 before:-left-3 before:w-0.5 before:rounded-full before:bg-foreground'
          : null,
        className
      )}
    >
      <FieldShell
        label={
          <>
            {label}
            {isChanged ? <ChangedTag /> : null}
          </>
        }
        // A Value that is read shows no rule, since there is nothing to break.
        rules={fieldRules({ required: false })}
        hasControl={false}
      >
        {(): ReactNode => children}
      </FieldShell>
    </div>
  );
}

/**
 * The fields of a change in the grid their editor lays them out in, so a field
 * that takes half the width there takes half of it here.
 *
 * It is a container of its own, which is what lets a field measure itself
 * against the editor rather than against the window, as every form does.
 */
export function ReadFields({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-slot="read-fields"
      className="@container grid grid-cols-12 gap-x-6 gap-y-4 pt-2"
    >
      {children}
    </div>
  );
}

/** The same fields while what the change holds is still being read. */
export function ReadFieldsSkeleton({
  fields = 4,
  label,
}: {
  fields?: number;
  label: string;
}): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="flex flex-col gap-4 pt-2"
    >
      {Array.from({ length: fields }, (_field, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

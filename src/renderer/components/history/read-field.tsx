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

/**
 * One stretch of a change, struck through where it went, underlined where it
 * came, and as it stands where it did neither.
 *
 * Both marks carry a decoration as well as a color, so neither is told by its
 * color alone, which is what ci asks for and what WCAG 1.4.1 holds.
 */
function Marked({
  mark,
  children,
}: {
  mark: ValueMark['mark'];
  children: ReactNode;
}): ReactElement {
  if (mark === 'removed') {
    return (
      <del
        data-slot="value-removed"
        className="rounded-[3px] bg-error-surface px-0.5 text-error line-through"
      >
        {children}
      </del>
    );
  }

  if (mark === 'added') {
    return (
      <ins
        data-slot="value-added"
        className="rounded-[3px] bg-success-surface px-0.5 text-success underline underline-offset-[3px]"
      >
        {children}
      </ins>
    );
  }

  return <>{children}</>;
}

/** One run of the Value, struck through, underlined or as it stands. */
function Mark({ run }: { run: ValueMark }): ReactElement {
  return <Marked mark={run.mark}>{run.text}</Marked>;
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

/**
 * The box ci leads a row with, 64 by 40 px: an Asset's preview, or the icon
 * that stands in where there is none to show.
 */
export function ReadRowLead({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground"
    >
      {children}
    </span>
  );
}

export interface ReadRowProps {
  /** The 64 by 40 px box the row leads with, drawn by `ReadRowLead`. */
  lead: ReactNode;
  /** What it is called, which is where the mark of the row stands. */
  name: ReactNode;
  /** The line below the name, such as "JPG, 412 KB". */
  line?: ReactNode;
  /** Whether the row came with this change, went with it, or stands in both. */
  mark?: ValueMark['mark'];
}

/**
 * One row of a Value that points at something, as ci draws the chosen Asset
 * and Entry: the preview or the icon, what it is called, and one line below.
 *
 * The geometry its own control draws a row in, since a change lays a field out
 * like its editor, without the buttons that control carries, because nothing
 * here is edited. A row that came with the change is underlined and one that
 * went struck through, in the colors the marks inside a text Value carry, so a
 * reference that was replaced says which one went.
 */
export function ReadRow({
  lead,
  name,
  line,
  mark = null,
}: ReadRowProps): ReactElement {
  return (
    <div
      data-slot="read-row"
      className="flex w-full items-center gap-3 rounded-lg border p-2"
    >
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">
          <Marked mark={mark}>{name}</Marked>
        </span>
        {line === undefined ? null : (
          <span className="text-small text-muted-foreground">{line}</span>
        )}
      </span>
    </div>
  );
}

/** The rows of one Value, stacked the way its own control stacks them. */
export function ReadRowList({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <div className="flex flex-col gap-2">{children}</div>;
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

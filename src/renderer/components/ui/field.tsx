import { type VariantProps } from 'class-variance-authority';
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';

import { Label } from '@renderer/components/ui/label';
import { Separator } from '@renderer/components/ui/separator';
import { cn } from '@renderer/lib/utils';
import { fieldVariants } from '@renderer/lib/variants';

function FieldSet({
  className,
  ...props
}: React.ComponentProps<'fieldset'>): React.JSX.Element {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        'flex flex-col gap-6 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & {
  variant?: 'legend' | 'label';
}): React.JSX.Element {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        'mb-3 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base',
        className
      )}
      {...props}
    />
  );
}

function FieldGroup({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
        className
      )}
      {...props}
    />
  );
}

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof fieldVariants>): React.JSX.Element {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="field-content"
      className={cn(
        'group/field-content flex flex-1 flex-col gap-1 leading-snug',
        className
      )}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>): React.JSX.Element {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:outline-2 has-[>[data-slot=field]]:has-[:focus-visible]:outline-offset-2 has-[>[data-slot=field]]:has-[:focus-visible]:outline-ring *:data-[slot=field]:p-3 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
        className
      )}
      {...props}
    />
  );
}

/**
 * The head of a field: its label, with the field's rules at the top right.
 *
 * The rules wrap below the label when they do not fit beside it, which is what
 * ci asks for and what a narrow editor does to a long label.
 */
function FieldHeader({
  className,
  rules,
  rulesId,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  /** The field's rules as one line, or nothing where it has none. */
  rules?: string | undefined;
  /** The id the control names the rules by, so they are read out with it. */
  rulesId?: string | undefined;
}): React.JSX.Element {
  return (
    <div
      data-slot="field-header"
      className={cn('flex flex-wrap justify-between gap-x-2', className)}
      {...props}
    >
      {children}
      {rules === undefined ? null : (
        <span
          data-slot="field-rules"
          id={rulesId}
          className="text-small text-muted-foreground"
        >
          {rules}
        </span>
      )}
    </div>
  );
}

/**
 * Something about the field's Value that keeps nobody from saving, such as a
 * translation it is still missing.
 *
 * It sits between the control and the description, in the warning color with
 * the warning icon, which is where ci draws it. An error is not this: it says
 * what was refused, see `FieldError`.
 */
function FieldWarning({
  className,
  children,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="field-warning"
      className={cn(
        'flex items-center gap-1.5 text-small text-warning',
        className
      )}
      {...props}
    >
      {/* The color alone would carry it, so the icon says it again. */}
      <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />
      {children}
    </p>
  );
}

function FieldTitle({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="field-label"
      className={cn(
        'flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50',
        className
      )}
      {...props}
    />
  );
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5',
        'last:mt-0 nth-last-2:-mt-1',
        '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot="field-separator"
      data-content={Boolean(children)}
      className={cn(
        'relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2',
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children == null ? null : (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
}): React.JSX.Element | null {
  const content = useMemo((): React.ReactNode => {
    if (children != null) {
      return children;
    }

    if (errors === undefined || errors.length === 0) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map((error) =>
          error?.message === undefined ? null : (
            <li key={error.message}>{error.message}</li>
          )
        )}
      </ul>
    );
  }, [children, errors]);

  if (content == null || content === false || content === '') {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('flex gap-1.5 text-sm font-normal text-error', className)}
      {...props}
    >
      {/* ci's Messages table draws the error icon beside the words, so the
      color is not the only thing that says it is one. Nudged down to sit on
      the first line rather than on the box's center, which a message of
      several lines would move. */}
      <CircleAlertIcon aria-hidden className="mt-1 size-3 shrink-0" />
      <div className="flex-1">{content}</div>
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldHeader,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
  FieldWarning,
};

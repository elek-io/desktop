import * as React from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { DatePicker } from '@renderer/components/ui/date-picker';
import {
  TextControl,
  type FieldControlProps,
} from '@renderer/components/ui/field-controls';
import {
  InputGroup,
  InputGroupAddon,
} from '@renderer/components/ui/input-group';
import { cn } from '@renderer/lib/utils';

export interface DateControlProps<
  TFieldValues extends FieldValues,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues>;
  disabled?: boolean;
}

/**
 * A date input beside a picker. The Value is a `YYYY-MM-DD` string, which is
 * what Core stores, not a `Date`.
 */
export function DateControl<TFieldValues extends FieldValues>({
  field,
  className,
  disabled,
  ...controlProps
}: DateControlProps<TFieldValues>): React.ReactElement {
  const dateFromValue = React.useMemo(() => {
    if (typeof field.value === 'string' && field.value !== '') {
      const parsedDate = new Date(field.value);
      return isNaN(parsedDate.getTime()) ? null : parsedDate;
    }
    return null;
  }, [field.value]);

  function dateToString(date: Date | null): string {
    if (date === null) {
      return '';
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  return (
    <InputGroup>
      <TextControl
        field={field}
        data-slot="input-group-control"
        className={cn(
          'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
          className
        )}
        {...controlProps}
        disabled={disabled}
        onChange={(event) => {
          field.onChange(event.target.value || null);
        }}
        type="date"
      />
      <InputGroupAddon align="inline-end">
        <DatePicker
          variant="ghost"
          size="xs"
          disabled={disabled}
          date={dateFromValue}
          setDate={(value) => {
            const newDate =
              typeof value === 'function' ? value(dateFromValue) : value;
            field.onChange(dateToString(newDate));
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  );
}

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

export interface DatetimeControlProps<
  TFieldValues extends FieldValues,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues>;
  disabled?: boolean;
}

/**
 * A datetime input beside a picker. Core stores an ISO datetime with its zone
 * (UTC), while the native `datetime-local` input speaks the user's local time
 * without one, so this converts in both directions.
 */
export function DatetimeControl<TFieldValues extends FieldValues>({
  field,
  className,
  disabled,
  ...controlProps
}: DatetimeControlProps<TFieldValues>): React.ReactElement {
  const dateFromValue = React.useMemo(() => {
    if (typeof field.value === 'string' && field.value !== '') {
      const parsedDate = new Date(field.value);
      return isNaN(parsedDate.getTime()) ? null : parsedDate;
    }
    return null;
  }, [field.value]);

  function dateToLocalInputValue(date: Date | null): string {
    if (date === null) {
      return '';
    }

    const pad = (value: number): string => String(value).padStart(2, '0');
    // The value a `datetime-local` input takes, which is a fixed format.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
        value={dateToLocalInputValue(dateFromValue)}
        onChange={(event) => {
          field.onChange(
            event.target.value === ''
              ? null
              : new Date(event.target.value).toISOString()
          );
        }}
        type="datetime-local"
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
            if (newDate === null) {
              field.onChange(null);
              return;
            }
            // Picking a date keeps the already entered time of day
            const merged = new Date(newDate);
            if (dateFromValue !== null) {
              merged.setHours(
                dateFromValue.getHours(),
                dateFromValue.getMinutes(),
                0,
                0
              );
            }
            field.onChange(merged.toISOString());
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  );
}

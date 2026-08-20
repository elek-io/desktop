'use client';

import { Calendar as CalendarIcon } from 'lucide-react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { Button } from '@renderer/components/ui/button';
import { Calendar } from '@renderer/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@renderer/components/ui/popover';

export function DatePicker({
  date,
  setDate,
  ...props
}: React.ComponentProps<typeof Button> & {
  date: Date | null;
  setDate: Dispatch<SetStateAction<Date | null>>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(date ?? new Date());

  // Keep the visible month in sync when the selected date changes from outside
  // (a form reset or a programmatic set). User month navigation changes `month`
  // directly, not `date`, so it is unaffected.
  useEffect(() => {
    if (date) {
      setMonth(date);
    }
  }, [date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button Icon={CalendarIcon} {...props}>
          <span className="sr-only">Select date</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto overflow-hidden p-0"
        align="end"
        alignOffset={-8}
        sideOffset={10}
      >
        <Calendar
          mode="single"
          selected={date ? date : undefined}
          captionLayout="dropdown"
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => {
            if (!date) {
              setDate(null);
            } else {
              setDate(date);
            }
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

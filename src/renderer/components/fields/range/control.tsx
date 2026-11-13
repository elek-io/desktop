import * as React from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Slider } from '@renderer/components/ui/slider';
import { useProject } from '@renderer/hooks/useProject';

import { type RangeFieldDefinition } from '@elek-io/core';

export interface RangeControlProps<
  TFieldValues extends FieldValues,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues>;
  fieldDefinition: RangeFieldDefinition;
  disabled: boolean;
}

/**
 * A slider bound to one number Value.
 *
 * Its `min` and `max` are the control's own value domain rather than HTML
 * constraint attributes, which is why this is the one control that emits them.
 */
export function RangeControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  ...controlProps
}: RangeControlProps<TFieldValues>): React.ReactElement {
  const { translateContent } = useProject();
  // The `role="slider"` thumb, not the wrapper the control-association `id`
  // lands on, is the focusable widget, so it needs its own accessible name.
  // `htmlFor` cannot name a non-labelable element, so the field label is passed
  // as the thumb's aria-label.
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  return (
    <Slider
      {...controlProps}
      aria-label={label}
      name={field.name}
      ref={field.ref}
      onBlur={field.onBlur}
      disabled={disabled}
      min={fieldDefinition.min}
      max={fieldDefinition.max}
      step={1} // @todo Core needs to support this too
      // The slider is a range control (value is number[]), but a range Value's
      // content is a single number, so wrap it and tolerate a null/empty content.
      value={typeof field.value === 'number' ? [field.value] : []}
      onValueChange={(value) =>
        field.onChange(Array.isArray(value) ? value[0] : value)
      }
    />
  );
}

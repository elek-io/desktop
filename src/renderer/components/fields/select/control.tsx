import { Trans, useLingui } from '@lingui/react/macro';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useProject } from '@renderer/hooks/useProject';

import type {
  NumberSelectFieldDefinition,
  StringSelectFieldDefinition,
} from '@elek-io/core';

export interface FormSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: StringSelectFieldDefinition | NumberSelectFieldDefinition;
  disabled: boolean;
}

/**
 * Renders the options of a select field definition. Items are keyed by their
 * index because a select item cannot hold an empty value, which string options can.
 * Selecting an item stores the option's value, so the Value keeps the correct
 * string or number type. A "None" item clears optional fields.
 *
 * The control-association props land on the SelectTrigger, the real focusable
 * button.
 */
export function SelectControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormSelectFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();
  const { translateContent } = useProject();

  const optionDisplay = (
    option: (typeof fieldDefinition.options)[number]
  ): string => {
    const label = translateContent({
      key: 'fieldDefinition.options.label',
      record: option.label,
    });
    return label !== '' ? label : String(option.value);
  };
  const items = fieldDefinition.options.map((option, index) => ({
    itemValue: String(index),
    display: optionDisplay(option),
  }));

  const selectedIndex =
    field.value === null || field.value === undefined
      ? -1
      : fieldDefinition.options.findIndex(
          (option) => option.value === field.value
        );

  return (
    <Select
      name={field.name}
      disabled={disabled}
      items={{
        none: t`None`,
        ...Object.fromEntries(
          items.map((item) => [item.itemValue, item.display])
        ),
      }}
      value={selectedIndex === -1 ? '' : String(selectedIndex)}
      onValueChange={(selected) =>
        field.onChange(
          selected === null || selected === 'none'
            ? null
            : (fieldDefinition.options[Number(selected)]?.value ?? null)
        )
      }
    >
      <SelectTrigger
        {...controlProps}
        className={className}
        ref={field.ref}
        onBlur={field.onBlur}
      >
        <SelectValue placeholder={t`Select an option`} />
      </SelectTrigger>
      <SelectContent>
        {fieldDefinition.isRequired === false ? (
          <SelectItem value="none">
            <Trans>None</Trans>
          </SelectItem>
        ) : null}
        {items.map((item) => (
          <SelectItem key={item.itemValue} value={item.itemValue}>
            {item.display}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

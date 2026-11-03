import { Trans, useLingui } from '@lingui/react/macro';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { Button } from '@renderer/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@renderer/components/ui/combobox';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Label } from '@renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@renderer/components/ui/radio-group';
import { useProject } from '@renderer/hooks/useProject';
import { cn } from '@renderer/lib/utils';

import type {
  NumberSelectFieldDefinition,
  StringSelectFieldDefinition,
} from '@elek-io/core';

/**
 * How many options still read as a list of radio buttons.
 *
 * ci draws every select as a list of radio buttons and sets no bound for a long
 * one, so Nils decided this one: up to seven options stay a list, and more show
 * as a dropdown with a filter, which is what a list of 86 would need.
 */
const RADIO_LIST_LIMIT = 7;

/**
 * The item value that stands for a Value of none.
 *
 * An item value rather than words: what somebody reads comes from the catalog
 * below.
 */
// eslint-disable-next-line lingui/no-unlocalized-strings
const NONE = 'none';

/** One option as the control offers it, keyed by its place in the list. */
export interface ChoiceOption {
  /** The option's place in the list, which is what the control holds. */
  itemValue: string;
  /** What somebody reads, which is the option's label or its value. */
  display: string;
}

export interface OptionChoiceProps extends FieldControlProps {
  /**
   * The field's label. A list of radio buttons and a combobox are both named by
   * the author rather than by their own text, so each says it.
   */
  label: string;
  options: ChoiceOption[];
  /** The option that is chosen, or `null` for a Value of none. */
  chosen: string | null;
  /**
   * Whether None leads the list. It does wherever the Value can stay empty,
   * such as an optional field or a Default Value.
   */
  withNone: boolean;
  disabled: boolean;
  onChoose: (itemValue: string | null) => void;
  onBlur: () => void;
  controlRef: (instance: unknown) => void;
}

/**
 * The control of a choice between named options: a list of radio buttons, or a
 * dropdown with a filter once the list is longer than it reads as a list.
 *
 * Both are named by the field's label, since neither a radio group nor a
 * combobox takes its name from its own text, and both take `aria-required`,
 * which their roles allow.
 *
 * See contributing/renderer/forms.md#the-shared-controls-and-their-value-contracts.
 */
export function OptionChoice({
  label,
  options,
  chosen,
  withNone,
  disabled,
  onChoose,
  onBlur,
  controlRef,
  className,
  ...controlProps
}: OptionChoiceProps): React.ReactElement {
  const { t } = useLingui();
  const itemId = React.useId();
  const items = withNone
    ? [{ itemValue: NONE, display: t`None` }, ...options]
    : options;

  if (options.length > RADIO_LIST_LIMIT) {
    const chosenItem = items.find(
      (item) => item.itemValue === (chosen ?? NONE)
    );

    return (
      <Combobox<ChoiceOption>
        items={items}
        itemToStringLabel={(item) => item.display}
        value={chosenItem ?? null}
        disabled={disabled}
        onValueChange={(item) =>
          onChoose(
            item === null || item.itemValue === NONE ? null : item.itemValue
          )
        }
      >
        <ComboboxTrigger
          {...controlProps}
          className={className}
          ref={controlRef}
          onBlur={onBlur}
          // A combobox never takes its name from its own text, so it says what
          // it shows.
          aria-label={label}
          render={<Button variant="outline" />}
        >
          {chosenItem === undefined ? <Trans>None</Trans> : chosenItem.display}
        </ComboboxTrigger>
        <ComboboxContent>
          {/* The field inside the popup filters the list, and no label stands
          above it, so it keeps its name inside itself, as every filter does. */}
          <ComboboxInput name={t`Filter options`} showTrigger={false} />
          <ComboboxEmpty>
            <Trans>No option matches the filter.</Trans>
          </ComboboxEmpty>
          <ComboboxList>
            {(item: ChoiceOption) => (
              <ComboboxItem key={item.itemValue} value={item}>
                {item.display}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  return (
    <RadioGroup
      {...controlProps}
      // A radio group takes no name from the radio buttons inside it, so it
      // says the field's label, and its role is one of those that take
      // `aria-required`.
      aria-label={label}
      className={cn('gap-2', className)}
      disabled={disabled}
      value={chosen ?? NONE}
      onValueChange={(itemValue: string) =>
        onChoose(itemValue === NONE ? null : itemValue)
      }
      ref={controlRef}
      onBlur={onBlur}
    >
      {items.map((item) => {
        const id = `${itemId}-${item.itemValue}`;

        return (
          <Label key={item.itemValue} htmlFor={id} className="font-normal">
            <RadioGroupItem id={id} value={item.itemValue} />
            {item.display}
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export interface FormSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: StringSelectFieldDefinition | NumberSelectFieldDefinition;
  /** The field's label, which names the group of radio buttons. */
  label: string;
  disabled: boolean;
}

/**
 * The control of a select field: its options as a list of radio buttons.
 *
 * An option is keyed by its place in the list, because an option's own value
 * can be the empty string, which no item value may be. Choosing one stores the
 * option's own value, so the Value keeps the string or the number Core stored
 * before.
 */
export function SelectControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  label,
  disabled,
  ...controlProps
}: FormSelectFieldProps<TFieldValues>): React.ReactElement {
  const { translateContent } = useProject();

  const optionDisplay = (
    option: (typeof fieldDefinition.options)[number]
  ): string => {
    const optionLabel = translateContent({
      key: 'fieldDefinition.options.label',
      record: option.label,
    });
    return optionLabel !== '' ? optionLabel : String(option.value);
  };
  const options = fieldDefinition.options.map((option, index) => ({
    itemValue: String(index),
    display: optionDisplay(option),
  }));
  const chosenIndex =
    field.value === null || field.value === undefined
      ? -1
      : fieldDefinition.options.findIndex(
          (option) => option.value === field.value
        );

  return (
    <OptionChoice
      {...controlProps}
      label={label}
      options={options}
      chosen={chosenIndex === -1 ? null : String(chosenIndex)}
      // Only a field whose Value may stay empty offers None, so a required one
      // cannot be emptied again once it holds an option.
      withNone={fieldDefinition.isRequired === false}
      disabled={disabled}
      onChoose={(itemValue) =>
        field.onChange(
          itemValue === null
            ? null
            : (fieldDefinition.options[Number(itemValue)]?.value ?? null)
        )
      }
      onBlur={field.onBlur}
      controlRef={field.ref}
    />
  );
}

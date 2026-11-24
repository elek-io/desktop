import { Trans, useLingui } from '@lingui/react/macro';
import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, type ReactElement } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import {
  type DefinitionBinding,
  type DefinitionOf,
} from '@renderer/components/fields/module';
import {
  OptionChoice,
  type ChoiceOption,
} from '@renderer/components/fields/select/control';
import { AppField } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  TextControl,
  type FieldControlProps,
} from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useListFocus } from '@renderer/hooks/useListFocus';
import { rawTextFromInput } from '@renderer/lib/fieldValues';
import { translatableDefault } from '@renderer/lib/utils';

import { slug, type SupportedLanguage } from '@elek-io/core';

// The settings of a select field. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// Core backs the one `select` field type with two schemas, one per option value
// type, so the options are rows of text or rows of numbers and the type of the
// options is a setting of its own.

/** One option of the list, as either of Core's two select schemas holds it. */
type SelectOption = DefinitionOf<'select'>['options'][number];

/** What one option reads as in the Default Value's list. */
function optionDisplay(
  option: SelectOption,
  index: number,
  language: SupportedLanguage,
  fallback: (position: number) => string
): string {
  const label = option.label[language];
  if (label !== undefined && label !== '') {
    return label;
  }
  if (option.value !== '') {
    return String(option.value);
  }
  return fallback(index + 1);
}

/**
 * One option: the words editors read and the value that is stored, with the way
 * to take the option out again.
 *
 * The value follows the label while nobody has written one, which is what makes
 * a list of options something to fill in rather than to think about twice.
 *
 * The row is a group of its own, named by where it stands, and focusable only
 * to be focused: it is where the focus lands once the option above it was
 * removed, see `useListFocus`. Its own Remove cannot take that focus, since
 * the last option left is one Core needs and its Remove is therefore off.
 */
function OptionRow<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  labelName,
  valueName,
  position,
  total,
  derivesValue,
  rowRef,
  onRemove,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  labelName: FieldPath<TFieldValues>;
  valueName: FieldPath<TFieldValues>;
  position: number;
  /** How many options the list holds, which the row's name says too. */
  total: number;
  /** Whether the stored value is text a label can be turned into. */
  derivesValue: boolean;
  rowRef: (element: HTMLElement | null) => void;
  onRemove: (() => void) | undefined;
}): ReactElement {
  const { t } = useLingui();
  const labelText: unknown = form.watch(labelName);
  const derived = slug(typeof labelText === 'string' ? labelText : '');
  // The value a label wrote last, or `null` for an option that came with one
  // of its own, so writing a value by hand stops the deriving for good.
  const valueFromLabel = useRef<string | null>(
    derivesValue && form.getValues(valueName) === '' ? '' : null
  );

  useEffect(() => {
    if (derivesValue && form.getValues(valueName) === valueFromLabel.current) {
      valueFromLabel.current = derived;
      form.setValue(valueName, derived as never, { shouldDirty: true });
    }
  }, [form, valueName, derived, derivesValue]);

  return (
    <div
      className="flex items-start gap-2"
      ref={rowRef}
      role="group"
      aria-label={t`Option ${position} of ${total}`}
      tabIndex={-1}
    >
      <AppField
        form={form}
        name={labelName}
        label={<span className="sr-only">{t`Option ${position} label`}</span>}
        className="flex-1"
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="text" {...controlProps} />
        )}
      </AppField>
      <AppField
        form={form}
        name={valueName}
        label={<span className="sr-only">{t`Option ${position} value`}</span>}
        className="flex-1"
      >
        {({ field, controlProps }) =>
          derivesValue ? (
            // An option's value is a plain string, not a Value that may be
            // empty, so the null-for-empty transform does not apply.
            <TextControl
              field={field}
              type="text"
              transform={rawTextFromInput}
              className="font-mono"
              {...controlProps}
            />
          ) : (
            <TextControl field={field} type="number" {...controlProps} />
          )
        }
      </AppField>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        Icon={XIcon}
        disabled={onRemove === undefined}
        onClick={onRemove}
      >
        <span className="sr-only">{t`Remove option ${position}`}</span>
      </Button>
    </div>
  );
}

/**
 * A Default Value picker keyed by option position, which is what the select
 * field's own control is: a list of radio buttons led by None, since a Default
 * Value may stay empty, and a dropdown with a filter once the list is long.
 *
 * An option's own value can be the empty string, which no item value may be,
 * so the stored value maps to the option's position.
 */
function DefaultOptionChoice({
  label,
  items,
  selectedIndex,
  onSelectIndex,
  controlProps,
  field,
  disabled,
}: {
  label: string;
  items: ChoiceOption[];
  selectedIndex: number;
  onSelectIndex: (index: number | null) => void;
  controlProps: FieldControlProps;
  field: { onBlur: () => void; ref: (instance: unknown) => void };
  disabled: boolean;
}): ReactElement {
  return (
    <OptionChoice
      {...controlProps}
      label={label}
      options={items}
      chosen={selectedIndex === -1 ? null : String(selectedIndex)}
      withNone
      disabled={disabled}
      onChoose={(itemValue) =>
        onSelectIndex(itemValue === null ? null : Number(itemValue))
      }
      onBlur={field.onBlur}
      controlRef={field.ref}
    />
  );
}

/**
 * The settings of a select field: whether its options hold text or numbers,
 * the options themselves as rows with Add and Remove, and which of them a new
 * Entry starts with.
 */
export function SelectDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
  supportedLanguages,
  language,
}: DefinitionBinding<
  'select',
  TFieldValues,
  TTransformedValues
>): ReactElement {
  const { t } = useLingui();
  const focus = useListFocus();
  // Read once, since the field's label and the name of its group of radio
  // buttons are the same words.
  const defaultValueLabel = t`Default Value`;
  // The same for the list of options, whose group says what it holds.
  const optionsLabel = t`Options`;
  const holdsText = fieldDefinition.valueType === 'string';
  const options = fieldDefinition.options;
  const items = options.map((option, index) => ({
    itemValue: String(index),
    display: optionDisplay(
      option,
      index,
      language,
      (position) => t`Option ${position}`
    ),
  }));
  const emptyLabel = (): Record<string, string> =>
    translatableDefault({ supportedLanguages, defaultValue: '' });

  return (
    <>
      <AppField
        form={form}
        name={path('valueType')}
        label={<Trans>Type of options</Trans>}
        description={<Trans>Whether its options hold text or numbers.</Trans>}
      >
        {({ controlProps, disabled }) => (
          <Select
            items={{ string: t`Text`, number: t`Number` }}
            value={fieldDefinition.valueType}
            disabled={disabled}
            onValueChange={(value) => {
              if (value === null || value === fieldDefinition.valueType) {
                return;
              }
              // The options and the Default Value hold the other type from
              // here, so they start over rather than being carried across as
              // values Core would refuse.
              set('valueType', value);
              set('options', [
                value === 'string'
                  ? { value: '', label: emptyLabel() }
                  : { value: 0, label: emptyLabel() },
              ]);
              set('defaultValue', null);
              if (value === 'number') {
                set('min', null);
                set('max', null);
                set('isUnique', false);
              }
            }}
          >
            {/* The trigger is the real focusable control, so the
            control-association props land there rather than on the root. */}
            <SelectTrigger {...controlProps}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">
                <Trans>Text</Trans>
              </SelectItem>
              <SelectItem value="number">
                <Trans>Number</Trans>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </AppField>

      <AppField
        form={form}
        name={path('options')}
        label={optionsLabel}
        description={
          <Trans>
            The label is what editors read, the value is what is stored.
          </Trans>
        }
      >
        {({ controlProps, disabled, readOnly }) => (
          <div
            className="flex flex-col gap-2"
            {...controlProps}
            ref={focus.listRef}
            // The rows and Add option are several controls rather than one, so
            // this is a group named by the field's own label.
            role="group"
            aria-label={optionsLabel}
            tabIndex={-1}
          >
            {options.map((_option, index) => (
              <OptionRow
                // The row stands for the option at this place of the list,
                // which is also what the paths inside it are bound to, so the
                // place is what identifies it.
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                form={form}
                labelName={path(`options.${index}.label.${language}`)}
                valueName={path(`options.${index}.value`)}
                position={index + 1}
                total={options.length}
                derivesValue={holdsText}
                // Each row stands for the place it is at, so the rows that
                // stay after a removal are the same places, one fewer.
                rowRef={focus.rowRef(String(index))}
                onRemove={
                  options.length > 1 && disabled === false && readOnly === false
                    ? () => {
                        set(
                          'options',
                          options.filter((_, candidate) => candidate !== index)
                        );
                        focus.afterRemoval(
                          index,
                          options
                            .map((_option, place) => String(place))
                            .slice(0, -1)
                        );
                      }
                    : undefined
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              Icon={PlusIcon}
              ref={focus.addRef}
              disabled={disabled || readOnly}
              className="w-fit"
              onClick={() =>
                set('options', [
                  ...options,
                  holdsText
                    ? { value: '', label: emptyLabel() }
                    : { value: 0, label: emptyLabel() },
                ])
              }
            >
              <Trans>Add option</Trans>
            </Button>
          </div>
        )}
      </AppField>

      <AppField
        form={form}
        name={path('defaultValue')}
        label={defaultValueLabel}
        description={
          <Trans>Every new Entry starts with it, in every language.</Trans>
        }
      >
        {({ field, controlProps, disabled }) => (
          <DefaultOptionChoice
            label={defaultValueLabel}
            controlProps={controlProps}
            field={field}
            disabled={disabled}
            items={items}
            selectedIndex={
              field.value === null || field.value === undefined
                ? -1
                : options.findIndex((option) => option.value === field.value)
            }
            onSelectIndex={(index) =>
              field.onChange(
                index === null ? null : (options[index]?.value ?? null)
              )
            }
          />
        )}
      </AppField>
    </>
  );
}

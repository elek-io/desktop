import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, TrashIcon } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { Button } from '@renderer/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  TranslatableFormInputField,
} from '@renderer/components/ui/form';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { translatableDefault } from '@renderer/lib/utils';

import {
  numberSelectFieldDefinitionSchema,
  slug,
  stringSelectFieldDefinitionSchema,
  uuid,
  type NumberSelectFieldDefinition,
  type StringSelectFieldDefinition,
  type SupportedLanguage,
} from '@elek-io/core';

// Authoring for the select field type. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// Core backs the one 'select' FieldType with two schemas, so this file holds a
// DefinitionSpec per option value type (string / number) plus the picker that
// mounts the matching one. Its option labels are translatable, which is why it
// reads the language context from DefinitionExtrasProps.

type SelectValueType = 'string' | 'number';

/** The value-type picker. Not part of the form data - it selects which schema
 * and draft are active, so it lives above the form. */
function ValueTypeSelect({
  valueType,
  onValueTypeChange,
}: {
  valueType: SelectValueType;
  onValueTypeChange: (valueType: SelectValueType) => void;
}): ReactElement {
  // Not a form field (it selects which schema is active, above the form), so it
  // uses a plain Label bound to the trigger id rather than FormLabel, whose
  // htmlFor would point at a control that does not exist here.
  const selectId = useId();
  const descriptionId = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={selectId} isRequired>
        Type of options
      </Label>
      <Select
        value={valueType}
        onValueChange={(value: SelectValueType) => onValueTypeChange(value)}
      >
        <SelectTrigger id={selectId} aria-describedby={descriptionId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="string">Text</SelectItem>
          <SelectItem value="number">Number</SelectItem>
        </SelectContent>
      </Select>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        Whether the options of this Field hold text or number values.
      </p>
    </div>
  );
}

/** A "Default value" picker keyed by option index. Radix forbids empty item
 * values, so the stored value maps to the option's position. */
function DefaultOptionSelect({
  items,
  selectedIndex,
  onSelectIndex,
}: {
  items: { itemValue: string; display: string }[];
  selectedIndex: number;
  onSelectIndex: (index: number | null) => void;
}): ReactElement {
  return (
    <FormItem>
      <FormLabel isRequired={false}>Default value</FormLabel>
      <FormControl>
        <Select
          value={selectedIndex === -1 ? 'none' : String(selectedIndex)}
          onValueChange={(selected) =>
            onSelectIndex(selected === 'none' ? null : Number(selected))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.itemValue} value={item.itemValue}>
                {item.display}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormControl>
      <FormDescription>The initial option for the field.</FormDescription>
      <FormMessage />
    </FormItem>
  );
}

function StringSelectOptionRow({
  form,
  index,
  currentLanguage,
  supportedLanguages,
  onRemove,
}: {
  form: UseFormReturn<StringSelectFieldDefinition>;
  index: number;
  currentLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  onRemove: (() => void) | undefined;
}): ReactElement {
  const labelValue = useWatch({
    control: form.control,
    name: `options.${index}.label.${currentLanguage}`,
  });
  // Auto-generate the value from the label until the value is edited manually
  useEffect(() => {
    if (form.getFieldState(`options.${index}.value`).isDirty === false) {
      form.setValue(`options.${index}.value`, slug(labelValue ?? ''));
    }
  }, [form, labelValue, index]);

  return (
    <div className="flex items-start gap-2">
      <FormField
        control={form.control}
        name={`options.${index}.label.${currentLanguage}`}
        render={({ field }) => (
          <FormItem className="flex-1">
            {/* sr-only labels name the option inputs for screen readers and for
            role/label based E2E, which the old option rows lacked. */}
            <FormLabel className="sr-only">{`Option ${index + 1} label`}</FormLabel>
            <TranslatableFormInputField
              title="Label"
              description="The label users see for this option."
              type="text"
              field={field}
              errors={form.formState.errors}
              supportedLanguages={supportedLanguages}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`options.${index}.value`}
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel className="sr-only">{`Option ${index + 1} value`}</FormLabel>
            <FormControl>
              {/* Option values are plain strings, not nullable Values, so the
                  null-for-empty transform of FormInputField does not apply */}
              <Input type="text" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        Icon={TrashIcon}
        disabled={onRemove === undefined}
        onClick={onRemove}
      >
        <span className="sr-only">{`Remove option ${index + 1}`}</span>
      </Button>
    </div>
  );
}

function StringSelectExtras({
  form,
  currentLanguage,
  supportedLanguages,
}: DefinitionExtrasProps<StringSelectFieldDefinition>): ReactElement {
  const options = useFieldArray({ control: form.control, name: 'options' });
  const watchedOptions = useWatch({ control: form.control, name: 'options' });

  const optionDisplay = (
    option: StringSelectFieldDefinition['options'][number],
    index: number
  ): string => {
    const label = option.label[currentLanguage];
    if (label !== undefined && label !== '') {
      return label;
    }
    if (option.value !== '') {
      return option.value;
    }
    return `Option ${String(index + 1)}`;
  };
  const items = watchedOptions.map((option, index) => ({
    itemValue: String(index),
    display: optionDisplay(option, index),
  }));

  return (
    <>
      <FormField
        control={form.control}
        name="options"
        render={() => (
          <FormItem>
            <FormLabel isRequired>Options</FormLabel>
            <div className="space-y-2">
              {options.fields.map((option, index) => (
                <StringSelectOptionRow
                  key={option.id}
                  form={form}
                  index={index}
                  currentLanguage={currentLanguage}
                  supportedLanguages={supportedLanguages}
                  onRemove={
                    options.fields.length > 1
                      ? () => options.remove(index)
                      : undefined
                  }
                />
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              Icon={Plus}
              onClick={() =>
                options.append({
                  value: '',
                  label: translatableDefault({
                    supportedLanguages,
                    defaultValue: '',
                  }),
                })
              }
            >
              Add option
            </Button>
            <FormDescription>
              The options a user can choose between. The label is what users
              see, the value is what gets stored.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="defaultValue"
        render={({ field }) => (
          <DefaultOptionSelect
            items={items}
            selectedIndex={
              field.value === null
                ? -1
                : watchedOptions.findIndex(
                    (option) => option.value === field.value
                  )
            }
            onSelectIndex={(index) =>
              field.onChange(
                index === null ? null : (watchedOptions[index]?.value ?? null)
              )
            }
          />
        )}
      />
    </>
  );
}

function NumberSelectOptionRow({
  form,
  index,
  currentLanguage,
  supportedLanguages,
  onRemove,
}: {
  form: UseFormReturn<NumberSelectFieldDefinition>;
  index: number;
  currentLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  onRemove: (() => void) | undefined;
}): ReactElement {
  return (
    <div className="flex items-start gap-2">
      <FormField
        control={form.control}
        name={`options.${index}.label.${currentLanguage}`}
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel className="sr-only">{`Option ${index + 1} label`}</FormLabel>
            <TranslatableFormInputField
              title="Label"
              description="The label users see for this option."
              type="text"
              field={field}
              errors={form.formState.errors}
              supportedLanguages={supportedLanguages}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`options.${index}.value`}
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel className="sr-only">{`Option ${index + 1} value`}</FormLabel>
            <FormControl>
              <FormInputField type="number" field={field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        Icon={TrashIcon}
        disabled={onRemove === undefined}
        onClick={onRemove}
      >
        <span className="sr-only">{`Remove option ${index + 1}`}</span>
      </Button>
    </div>
  );
}

function NumberSelectExtras({
  form,
  currentLanguage,
  supportedLanguages,
}: DefinitionExtrasProps<NumberSelectFieldDefinition>): ReactElement {
  const options = useFieldArray({ control: form.control, name: 'options' });
  const watchedOptions = useWatch({ control: form.control, name: 'options' });

  const optionDisplay = (
    option: NumberSelectFieldDefinition['options'][number]
  ): string => {
    const label = option.label[currentLanguage];
    if (label !== undefined && label !== '') {
      return label;
    }
    return String(option.value);
  };
  const items = watchedOptions.map((option, index) => ({
    itemValue: String(index),
    display: optionDisplay(option),
  }));

  return (
    <>
      <FormField
        control={form.control}
        name="options"
        render={() => (
          <FormItem>
            <FormLabel isRequired>Options</FormLabel>
            <div className="space-y-2">
              {options.fields.map((option, index) => (
                <NumberSelectOptionRow
                  key={option.id}
                  form={form}
                  index={index}
                  currentLanguage={currentLanguage}
                  supportedLanguages={supportedLanguages}
                  onRemove={
                    options.fields.length > 1
                      ? () => options.remove(index)
                      : undefined
                  }
                />
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              Icon={Plus}
              onClick={() =>
                options.append({
                  value: 0,
                  label: translatableDefault({
                    supportedLanguages,
                    defaultValue: '',
                  }),
                })
              }
            >
              Add option
            </Button>
            <FormDescription>
              The options a user can choose between. The label is what users
              see, the value is what gets stored.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="defaultValue"
        render={({ field }) => (
          <DefaultOptionSelect
            items={items}
            selectedIndex={
              field.value === null
                ? -1
                : watchedOptions.findIndex(
                    (option) => option.value === field.value
                  )
            }
            onSelectIndex={(index) =>
              field.onChange(
                index === null ? null : (watchedOptions[index]?.value ?? null)
              )
            }
          />
        )}
      />
    </>
  );
}

const stringSelectSpec: DefinitionSpec<StringSelectFieldDefinition> = {
  authorableFieldType: 'stringSelect',
  resolver: zodResolver(stringSelectFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'select',
    defaultValue: null,
    options: [
      {
        value: '',
        label: translatableDefault({
          supportedLanguages: langs,
          defaultValue: '',
        }),
      },
    ],
  }),
  Extras: StringSelectExtras,
};

const numberSelectSpec: DefinitionSpec<NumberSelectFieldDefinition> = {
  authorableFieldType: 'numberSelect',
  resolver: zodResolver(numberSelectFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'number',
    fieldType: 'select',
    isUnique: false,
    defaultValue: null,
    min: null,
    max: null,
    options: [
      {
        value: 0,
        label: translatableDefault({
          supportedLanguages: langs,
          defaultValue: '',
        }),
      },
    ],
  }),
  Extras: NumberSelectExtras,
};

/**
 * The select authoring entry. Holds which option value-type is active and mounts
 * the matching draft, keyed so switching gives each variant its own fresh draft.
 * The value-type picker sits above the form; the draft below is a normal
 * DefinitionDraft, so the sheet's detached SubmitButton submits whichever variant
 * is active with no special wiring.
 */
export function SelectDefinitionDraft(
  props: DefinitionDraftProps
): ReactElement {
  const [valueType, setValueType] = useState<SelectValueType>('string');

  return (
    <div className="space-y-6">
      <ValueTypeSelect valueType={valueType} onValueTypeChange={setValueType} />
      {valueType === 'string' ? (
        <DefinitionDraft key="string" {...props} spec={stringSelectSpec} />
      ) : (
        <DefinitionDraft key="number" {...props} spec={numberSelectSpec} />
      )}
    </div>
  );
}

'use client';

import type * as SliderPrimitive from '@radix-ui/react-slider';
import { Slot } from '@radix-ui/react-slot';
import type * as SwitchPrimitive from '@radix-ui/react-switch';
import {
  CheckIcon,
  EditIcon,
  ImagePlusIcon,
  LanguagesIcon,
  ListPlusIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import * as React from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  useWatch,
  type ControllerProps,
  type ControllerRenderProps,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';

import { AssetDisplay } from '@renderer/components/asset-display';
import { DragHandle } from '@renderer/components/drag-and-drop';
import { MarkdownEditor } from '@renderer/components/markdown/markdown-editor';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { Textarea } from '@renderer/components/ui/textarea';
import {
  useAppFormMode,
  useErrorTarget,
} from '@renderer/hooks/useAppFormContext';
import { useFieldDefinitions } from '@renderer/hooks/useFieldDefinitions';
import {
  FormFieldContext,
  FormItemContext,
  useFormField,
} from '@renderer/hooks/useFormField';
import { useProject } from '@renderer/hooks/useProject';
import { useQueriesNoError } from '@renderer/hooks/useQueriesNoError';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import {
  collectFieldErrorMessages,
  isAtOrBelow,
} from '@renderer/lib/formErrors';
import { cn, fieldWidth } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  slug,
  type Asset,
  type AssetFieldDefinition,
  type Collection,
  type Entry,
  type EntryFieldDefinition,
  type FieldDefinition,
  type FieldType,
  type MarkdownFieldDefinition,
  type MdAstRoot,
  type NumberSelectFieldDefinition,
  type RangeFieldDefinition,
  type SlugFieldDefinition,
  type StringSelectFieldDefinition,
  type SupportedLanguage,
  type ValueContentReferenceToAsset,
  type ValueContentReferenceToEntry,
} from '@elek-io/core';

import { DatePicker } from './date-picker';
import { InputGroup, InputGroupAddon } from './input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

const Form = FormProvider;

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  // Defaulted and never read here, only carried so a caller's form (whose schema
  // transforms its input) is assignable without erasing the generic through a
  // cast. See contributing/renderer/forms.md#form-typing.
  TTransformedValues extends FieldValues = TFieldValues,
>({
  ...props
}: ControllerProps<
  TFieldValues,
  TName,
  TTransformedValues
>): React.JSX.Element => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

function FormItem({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn('grid gap-2', className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>): React.JSX.Element {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({
  ...props
}: React.ComponentProps<typeof Slot>): React.JSX.Element {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        error === undefined
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={error !== undefined}
      {...props}
    />
  );
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function FormMessage({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element | null {
  const { error, formMessageId, name } = useFormField();
  // Claims this field's errors, so AppForm knows they have somewhere to render.
  useErrorTarget(name);
  const body =
    error !== undefined ? String(error.message ?? '') : props.children;

  if (body === undefined || body === null || body === '') {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn('text-sm text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
}

export interface FormSubtreeMessageProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  name: FieldPath<TFieldValues>;
  className?: string;
}

/**
 * Renders every validation message at or below `name`. Use it where a value is
 * bound as a single Controller but rendered as something other than a field (the
 * Collection editor's `fieldDefinitions` array), so a refinement landing on the
 * value itself or on a path inside it still has a surface. A `FormMessage` cannot
 * serve here, because it only shows the message sitting at its own exact path.
 *
 * It claims the whole subtree as an error target, which is also what keeps
 * AppForm from reporting the same errors a second time.
 * See contributing/renderer/forms.md.
 */
function FormSubtreeMessage<TFieldValues extends FieldValues>({
  form,
  name,
  className,
}: FormSubtreeMessageProps<TFieldValues>): React.ReactElement | null {
  useErrorTarget(name);
  const { errors } = useFormState({ control: form.control, name });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const messages = collectFieldErrorMessages(errors).filter((error) =>
    isAtOrBelow(error.path, name)
  );
  // A primitive key, so the effect refocuses when the set of messages changes but
  // not on every re-render (the array is rebuilt each time).
  const messageKey = messages.map((error) => error.path).join(',');

  React.useEffect(() => {
    if (messageKey !== '') {
      containerRef.current?.focus();
    }
  }, [messageKey]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="alert"
      data-slot="form-message"
      className={cn('text-sm text-destructive', className)}
    >
      <ul className="list-inside list-disc">
        {messages.map((error) => (
          <li key={error.path}>
            {error.message} ({error.path})
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Control-association props a leaf spreads onto its real input, so the label's
 * `htmlFor`, the description and the error all point at a focusable element.
 * `aria-required` rides along on the same bag, since the registry emits no native
 * `required`. See contributing/renderer/forms.md.
 */
interface FieldControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  className?: string;
}

export interface FormInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<'input'> {
  field: ControllerRenderProps<TFieldValues, TName>;
  type: FieldType;
}

/**
 * Special variant of the Input component
 * that transforms the value the user put in
 * e.g. to a number before handing it back to the form field.
 * It also returns null instead of an empty string
 * if the user did not put in a value.
 */
export function FormInputField<TFieldValues extends FieldValues>({
  field,
  type,
  ...props
}: FormInputFieldProps<TFieldValues>): React.ReactElement {
  function transform(value: string): string | number | null {
    if (value.trim() === '') {
      return null;
    }
    if (type === 'number') {
      return parseInt(value);
    }
    return value;
  }

  // Some field types have no matching HTML input type of the same name
  const htmlInputType =
    type === 'telephone'
      ? 'tel'
      : type === 'ipv4' || type === 'slug'
        ? 'text'
        : type === 'datetime'
          ? 'datetime-local'
          : type;

  return (
    <Input
      type={htmlInputType}
      {...field}
      value={field.value ?? ''} // Content can be null (cleared) or undefined (language absent from the partial record); the input needs a string either way
      onChange={(event) => field.onChange(transform(event.target.value))}
      {...props}
    />
  );
}

/**
 * Reads the surrounding FormItem / FormField control-association ids through
 * useFormField and hands them to a value-typed leaf, so `id` and `aria-*` land on
 * the real input by construction. Use this rather than a `<FormControl>` Slot,
 * which can only reach the leaf's outermost element.
 */
function ControlledLeaf<TFieldValues extends FieldValues>({
  field,
  renderLeaf,
}: {
  field: ControllerRenderProps<TFieldValues>;
  renderLeaf: (
    field: ControllerRenderProps<TFieldValues>,
    controlProps: FieldControlProps
  ) => React.ReactElement;
}): React.ReactElement {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();
  return renderLeaf(field, {
    id: formItemId,
    'aria-describedby':
      error === undefined
        ? formDescriptionId
        : `${formDescriptionId} ${formMessageId}`,
    'aria-invalid': error !== undefined,
  });
}

export interface TranslatableFieldProps<TFieldValues extends FieldValues> {
  field: ControllerRenderProps<TFieldValues>;
  title: string;
  description: string | null;
  supportedLanguages: SupportedLanguage[];
  errors: FieldErrors;
  // The per-language dialog labels use this for their required indicator: string
  // inputs mark every language required, the optional textarea does not.
  dialogItemRequired: boolean;
  // Renders one language's leaf, given its field and the control-association props
  // to place on the real input. Called for the outer field and once per language
  // inside the dialog.
  renderLeaf: (
    field: ControllerRenderProps<TFieldValues>,
    controlProps: FieldControlProps
  ) => React.ReactElement;
}

/**
 * The single per-language field wrapper. With one Project language it renders the
 * leaf directly, with more it adds a dialog that edits every language. It owns the
 * multi-field name convention, where the name's last dot-segment is the current
 * language and the sibling paths derive from it, so the leaf stays value-typed.
 */
function TranslatableField<TFieldValues extends FieldValues>({
  field,
  title,
  description,
  supportedLanguages,
  errors,
  dialogItemRequired,
  renderLeaf,
}: TranslatableFieldProps<TFieldValues>): React.ReactElement {
  const currentLanguage = field.name.split('.').pop() as SupportedLanguage;
  const baseName = field.name.split('.').slice(0, -1).join('.');
  // Claims every language of this field, not just the current one: a hidden
  // translation's error is surfaced by the dialog trigger's invalid state below,
  // so AppForm must not report it as having no message.
  useErrorTarget(baseName);

  /**
   * True when a language other than the current one has an error, so the dialog
   * trigger can flag that a hidden translation is invalid.
   */
  function hasErrorsInTranslations(): boolean {
    // Traverse the errors object to reach the base field's per-language errors
    let fieldErrors: unknown = errors;
    for (const segment of baseName.split('.')) {
      if (
        fieldErrors === null ||
        fieldErrors === undefined ||
        typeof fieldErrors !== 'object'
      ) {
        return false;
      }
      fieldErrors = (fieldErrors as Record<string, unknown>)[segment];
    }
    if (
      fieldErrors === null ||
      fieldErrors === undefined ||
      typeof fieldErrors !== 'object'
    ) {
      return false;
    }
    return supportedLanguages.some(
      (language) =>
        language !== currentLanguage &&
        (fieldErrors as Record<string, unknown>)[language] !== undefined
    );
  }

  if (supportedLanguages.length <= 1) {
    return <ControlledLeaf field={field} renderLeaf={renderLeaf} />;
  }

  return (
    <div className="flex items-center">
      <ControlledLeaf
        field={field}
        renderLeaf={(leafField, controlProps) =>
          renderLeaf(leafField, {
            ...controlProps,
            className: cn('rounded-r-none', controlProps.className),
          })
        }
      />
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            className="h-full rounded-l-none"
            aria-invalid={hasErrorsInTranslations()}
            Icon={LanguagesIcon}
          >
            <span className="sr-only">Edit translations for {title}</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description !== null ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>

          <DialogBody>
            {supportedLanguages.map((language) => (
              <FormField<TFieldValues>
                key={language}
                name={`${baseName}.${language}` as Path<TFieldValues>}
                render={({ field: languageField }) => (
                  <FormItem>
                    <FormLabel isRequired={dialogItemRequired}>
                      {language}
                    </FormLabel>
                    <ControlledLeaf
                      field={languageField}
                      renderLeaf={renderLeaf}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface TranslatableFormInputFieldProps<
  T extends FieldValues,
> extends FormInputFieldProps<T> {
  title: string;
  description: string;
  supportedLanguages: SupportedLanguage[];
  errors: FieldErrors;
}

/**
 * A string FormInputField with a per-language translations dialog. Thin preset
 * over TranslatableField for the common single-line string case.
 */
export function TranslatableFormInputField<T extends FieldValues>({
  title,
  description,
  field,
  supportedLanguages,
  type,
  errors,
}: TranslatableFormInputFieldProps<T>): React.ReactElement {
  return (
    <TranslatableField
      field={field}
      title={title}
      description={description}
      supportedLanguages={supportedLanguages}
      errors={errors}
      dialogItemRequired
      renderLeaf={(leafField, controlProps) => (
        <FormInputField field={leafField} type={type} {...controlProps} />
      )}
    />
  );
}

export interface FormTextareaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<'textarea'> {
  field: ControllerRenderProps<TFieldValues, TName>;
}

/**
 * Special variant of the Textarea component
 * that returns null instead of an empty string
 * if the user did not put in a value and hands
 * it back to the given form field.
 */
export function FormTextareaField<TFieldValues extends FieldValues>({
  field,
  ...props
}: FormTextareaFieldProps<TFieldValues>): React.ReactElement {
  function transform(value: string): string | number | null {
    if (value.trim() === '') {
      return null;
    }
    return value;
  }

  return (
    <Textarea
      {...field}
      value={field.value ?? ''} // Content can be null (cleared) or undefined (language absent from the partial record); the input needs a string either way
      onChange={(event) => field.onChange(transform(event.target.value))}
      {...props}
    />
  );
}

export interface TranslatableFormTextareaFieldProps<
  T extends FieldValues,
> extends FormTextareaFieldProps<T> {
  title: string;
  description: string;
  supportedLanguages: SupportedLanguage[];
  errors: FieldErrors;
}

/**
 * A FormTextareaField with a per-language translations dialog. Thin preset over
 * TranslatableField for the multi-line string case. Unlike the input preset, the
 * dialog's per-language labels are not marked required.
 */
export function TranslatableFormTextareaField<T extends FieldValues>({
  title,
  description,
  field,
  supportedLanguages,
  errors,
}: TranslatableFormTextareaFieldProps<T>): React.ReactElement {
  return (
    <TranslatableField
      field={field}
      title={title}
      description={description}
      supportedLanguages={supportedLanguages}
      errors={errors}
      dialogItemRequired={false}
      renderLeaf={(leafField, controlProps) => (
        <FormTextareaField field={leafField} {...controlProps} />
      )}
    />
  );
}

interface FormDateFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<'input'> {
  field: ControllerRenderProps<TFieldValues, TName>;
}

/**
 * Special variant of the Input component
 * that uses the custom DatePicker component.
 */
function FormDateField<TFieldValues extends FieldValues>({
  field,
  className,
  disabled,
  ...props
}: FormDateFieldProps<TFieldValues>): React.ReactElement {
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
      <FormInputField
        field={field}
        data-slot="input-group-control"
        className={cn(
          'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
          className
        )}
        {...props}
        disabled={disabled}
        value={field.value ?? ''}
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

interface FormDatetimeFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<'input'> {
  field: ControllerRenderProps<TFieldValues, TName>;
}

/**
 * Special variant of the Input component for datetime Values.
 * Core stores an ISO datetime with timezone (UTC), while the native
 * datetime-local input speaks the user's local time without one,
 * so this converts in both directions.
 */
function FormDatetimeField<TFieldValues extends FieldValues>({
  field,
  className,
  disabled,
  ...props
}: FormDatetimeFieldProps<TFieldValues>): React.ReactElement {
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
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  return (
    <InputGroup>
      <FormInputField
        field={field}
        data-slot="input-group-control"
        className={cn(
          'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
          className
        )}
        {...props}
        disabled={disabled}
        value={dateToLocalInputValue(dateFromValue)}
        onChange={(event) => {
          field.onChange(
            event.target.value === ''
              ? null
              : new Date(event.target.value).toISOString()
          );
        }}
        type="datetime"
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

interface FormRangeFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<typeof SliderPrimitive.Root> {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: RangeFieldDefinition;
}

function FormRangeField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  ...props
}: FormRangeFieldProps<TFieldValues>): React.ReactElement {
  const { translateContent } = useProject();
  // The `role="slider"` thumb, not the wrapper the control-association `id` lands
  // on, is the focusable widget, so it needs its own accessible name. `htmlFor`
  // cannot name a non-labelable element, so the field label is passed as the
  // thumb's aria-label.
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  return (
    <Slider
      {...props}
      aria-label={label}
      name={field.name}
      ref={field.ref}
      onBlur={field.onBlur}
      // Radix Slider is a range control (value is number[]), but a range Value's
      // content is a single number, so wrap it and tolerate a null/empty content.
      value={typeof field.value === 'number' ? [field.value] : []}
      onValueChange={(value) => field.onChange(value[0])}
    />
  );
}

interface FormToggleFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  field: ControllerRenderProps<TFieldValues, TName>;
}

function FormToggleField<TFieldValues extends FieldValues>({
  field,
  ...props
}: FormToggleFieldProps<TFieldValues>): React.ReactElement {
  return (
    <Switch
      {...field}
      checked={field.value}
      onCheckedChange={field.onChange}
      {...props}
    />
  );
}

interface FormSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: StringSelectFieldDefinition | NumberSelectFieldDefinition;
  disabled: boolean;
}

/**
 * Renders the options of a select field definition. Items are keyed by their
 * index because Radix forbids empty item values, which string options can hold.
 * Selecting an item stores the option's value, so the Value keeps the correct
 * string or number type. A "None" item clears optional fields.
 *
 * The control-association props land on the SelectTrigger, the real focusable
 * button.
 */
function FormSelectField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormSelectFieldProps<TFieldValues>): React.ReactElement {
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
      value={selectedIndex === -1 ? '' : String(selectedIndex)}
      onValueChange={(selected) =>
        field.onChange(fieldDefinition.options[Number(selected)]?.value ?? null)
      }
    >
      <SelectTrigger
        {...controlProps}
        className={className}
        ref={field.ref}
        onBlur={field.onBlur}
      >
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {fieldDefinition.isRequired === false ? (
          <SelectItem value="none">None</SelectItem>
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

interface FormSlugFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: SlugFieldDefinition;
  disabled: boolean;
}

/**
 * Input for slug Values. While the value is untouched (empty or still equal to
 * the last value derived here), it follows the definition's source fields of
 * the same language live. A stored slug is never rewritten, since keeping
 * permalinks stable is the editor's responsibility. Manual input is made
 * canonical on blur and a button re-derives from the sources on demand.
 */
function FormSlugField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormSlugFieldProps<TFieldValues>): React.ReactElement {
  const fieldDefinitions = useFieldDefinitions();
  const { control } = useFormContext<TFieldValues>();
  const lastDerivedRef = React.useRef<string | null>(null);

  const slugOptions = {
    separator: fieldDefinition.separator,
    lowercase: fieldDefinition.lowercase,
    decamelize: fieldDefinition.decamelize,
  };

  // Entry forms bind Values as values.<slug>.content.<language>
  const language = field.name.split('.').at(-1) ?? '';

  // Resolve the source ids to sibling Value paths of the same language.
  // Outside an Entry form (no context) there is nothing to derive from.
  const sourcePaths = React.useMemo(
    () =>
      fieldDefinitions === null
        ? []
        : (fieldDefinition.ofFieldDefinitions.flatMap((id) => {
            const source = fieldDefinitions.find(
              (definition) => definition.id === id
            );
            return source === undefined
              ? []
              : [`values.${source.slug}.content.${language}`];
          }) as FieldPath<TFieldValues>[]),
    [fieldDefinitions, fieldDefinition.ofFieldDefinitions, language]
  );

  const sourceValues = useWatch({ control, name: sourcePaths });
  const derived = slug(
    sourceValues
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter((value) => value !== '')
      .join(' '),
    slugOptions
  );
  const derivedOrNull = derived === '' ? null : derived;

  React.useEffect(() => {
    // A read-only field must not be rewritten when its sources change either,
    // otherwise isDisabled only locks the input and not the value behind it.
    if (sourcePaths.length === 0 || disabled) {
      return;
    }
    const current: unknown = field.value;
    const isUntouched =
      current === null ||
      current === undefined ||
      current === '' ||
      current === lastDerivedRef.current;
    if (isUntouched && current !== derivedOrNull) {
      lastDerivedRef.current = derivedOrNull;
      field.onChange(derivedOrNull);
    }
  }, [field, derivedOrNull, sourcePaths, disabled]);

  return (
    <InputGroup>
      <FormInputField
        field={field}
        data-slot="input-group-control"
        disabled={disabled}
        className={cn(
          'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
          className
        )}
        {...controlProps}
        onBlur={() => {
          field.onBlur();
          // Core only accepts canonical slugs for this field's configuration
          if (typeof field.value === 'string' && field.value !== '') {
            const canonical = slug(field.value, slugOptions);
            if (canonical !== field.value) {
              field.onChange(canonical === '' ? null : canonical);
            }
          }
        }}
        type="slug"
      />
      {sourcePaths.length > 0 ? (
        <InputGroupAddon align="inline-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            Icon={RefreshCwIcon}
            onClick={() => {
              lastDerivedRef.current = derivedOrNull;
              field.onChange(derivedOrNull);
            }}
          >
            <span className="sr-only">Generate from the source Fields</span>
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

interface FormMarkdownFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: MarkdownFieldDefinition;
  disabled: boolean;
}

function isMdAstRoot(value: unknown): value is MdAstRoot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'root'
  );
}

/**
 * Thin adapter that binds the Milkdown based MarkdownEditor to a form field.
 * The Value is Core's mdast tree or null when empty.
 *
 * The control-association props land on the wrapper, not the editor, which is a
 * Milkdown contenteditable this must not reach into.
 */
function FormMarkdownField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  className,
  ...controlProps
}: FormMarkdownFieldProps<TFieldValues>): React.ReactElement {
  return (
    <div {...controlProps} ref={field.ref} onBlur={field.onBlur}>
      <MarkdownEditor
        value={isMdAstRoot(field.value) ? field.value : null}
        onChange={field.onChange}
        fieldDefinition={fieldDefinition}
        disabled={disabled}
        className={className}
      />
    </div>
  );
}

interface FormAssetFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: AssetFieldDefinition;
  disabled: boolean;
}

/**
 * Form field component for selecting one or multiple existing Assets.
 * Opens a dialog to browse and select assets from the project.
 * The field value is an array of ValueContentReferenceToAsset objects. The
 * control-association props land on the dialog trigger, its focusable control.
 */
function FormAssetField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  ...controlProps
}: FormAssetFieldProps<TFieldValues>): React.ReactElement {
  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  const selectedRefs: ValueContentReferenceToAsset[] = Array.isArray(
    field.value
  )
    ? field.value
    : [];

  const selectedIds = new Set(selectedRefs.map((ref) => ref.id));

  const maxReached =
    fieldDefinition.max !== null && selectedRefs.length >= fieldDefinition.max;

  function toggleAsset(asset: Asset): void {
    if (selectedIds.has(asset.id)) {
      field.onChange(
        selectedRefs.filter((ref) => ref.id !== asset.id) as typeof field.value
      );
    } else if (!maxReached) {
      field.onChange([
        ...selectedRefs,
        { id: asset.id, objectType: 'asset' as const },
      ] as typeof field.value);
    }
  }

  function removeAsset(assetId: string): void {
    field.onChange(
      selectedRefs.filter((ref) => ref.id !== assetId) as typeof field.value
    );
  }

  // Only offer Assets the definition allows. Core enforces ofAssetMimeTypes at
  // write time (EntryService.validateValueReferences reads each Asset's real
  // mimeType), so without this the user picks a disallowed Asset and only finds
  // out when saving fails. Matches the markdown asset-reference picker.
  const selectableAssets: Asset[] = isReadingAssets
    ? []
    : fieldDefinition.ofAssetMimeTypes.length === 0
      ? assetList.list
      : assetList.list.filter((asset) =>
          fieldDefinition.ofAssetMimeTypes.includes(asset.mimeType)
        );

  // Resolve selected refs to full Asset objects for display. Resolved against the
  // full list, not the selectable one, so an Asset that predates a mime-type
  // restriction still renders instead of silently vanishing.
  const selectedAssets: Asset[] = isReadingAssets
    ? []
    : selectedRefs
        .map((ref) => assetList.list.find((a) => a.id === ref.id))
        .filter((a): a is Asset => a !== undefined);

  return (
    <div className="space-y-3">
      {selectedAssets.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {selectedAssets.map((asset) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
            >
              <AssetDisplay {...asset} static className="aspect-4/3" />
              <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                {asset.name}
              </div>
              {disabled !== true && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeAsset(asset.id)}
                  type="button"
                  Icon={XIcon}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button
            {...controlProps}
            ref={field.ref}
            onBlur={field.onBlur}
            variant="secondary"
            type="button"
            disabled={disabled === true || maxReached}
            Icon={ImagePlusIcon}
          >
            Select Assets
            {fieldDefinition.min !== null || fieldDefinition.max !== null ? (
              <span className="ml-1 text-muted-foreground">
                ({selectedRefs.length}
                {fieldDefinition.max !== null
                  ? ` / ${fieldDefinition.max}`
                  : ''}
                )
              </span>
            ) : null}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Select Assets</DialogTitle>
            <DialogDescription>
              {fieldDefinition.max !== null
                ? `Select up to ${fieldDefinition.max} asset${fieldDefinition.max !== 1 ? 's' : ''}.`
                : 'Select one or more assets.'}
              {fieldDefinition.min !== null
                ? ` At least ${fieldDefinition.min} required.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {isReadingAssets ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => {
                  const key = `skeleton-${String(i)}`;
                  return (
                    <div
                      key={key}
                      className="aspect-4/3 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800"
                    />
                  );
                })}
              </div>
            ) : selectableAssets.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {fieldDefinition.ofAssetMimeTypes.length === 0
                  ? 'No assets available. Add assets to the project first.'
                  : `No assets of an allowed type available. This Field accepts ${fieldDefinition.ofAssetMimeTypes.join(', ')}.`}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {selectableAssets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  const isDisabledOption = !isSelected && maxReached;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      disabled={isDisabledOption}
                      onClick={() => toggleAsset(asset)}
                      className={cn(
                        'relative cursor-pointer overflow-hidden rounded-md border-2 transition-all',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500',
                        isDisabledOption && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <AssetDisplay {...asset} static />
                      <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                        {asset.name}
                      </div>
                      {isSelected === true ? (
                        <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <CheckIcon className="h-3 w-3" />
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FormEntryFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: EntryFieldDefinition;
  disabled: boolean;
}

/**
 * Form field component for selecting one or multiple existing Entries.
 * Opens a dialog to browse and select entries from allowed collections.
 * The field value is an array of ValueContentReferenceToEntry objects. The
 * control-association props land on the dialog trigger, its focusable control.
 */
function FormEntryField<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  disabled,
  ...controlProps
}: FormEntryFieldProps<TFieldValues>): React.ReactElement {
  const { projectId, translateContent } = useProject();
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));

  // Filter collections based on ofCollections restriction
  const allowedCollections: Collection[] = isReadingCollections
    ? []
    : fieldDefinition.ofCollections.length > 0
      ? collectionList.list.filter((c) =>
          fieldDefinition.ofCollections.includes(c.id)
        )
      : collectionList.list;

  // Fetch entries for each allowed collection
  const entryQueries = useQueriesNoError(
    allowedCollections.map((c) =>
      queryOptions.entries.list({ projectId, collectionId: c.id, limit: 0 })
    )
  );

  const isReadingEntries = entryQueries.some((q) => q.isPending);

  // Build a flat list of all available entries with their collection context
  const availableEntries: Array<{ entry: Entry; collection: Collection }> = [];
  if (isReadingEntries === false) {
    allowedCollections.forEach((collection, index) => {
      const entryQuery = entryQueries[index];
      if (entryQuery !== undefined && entryQuery.isPending === false) {
        entryQuery.data.list.forEach((entry) => {
          availableEntries.push({ entry, collection });
        });
      }
    });
  }

  const selectedRefs: ValueContentReferenceToEntry[] = Array.isArray(
    field.value
  )
    ? field.value
    : [];

  const selectedIds = new Set(selectedRefs.map((ref) => ref.id));

  const maxReached =
    fieldDefinition.max !== null && selectedRefs.length >= fieldDefinition.max;

  /**
   * Core's `valueContentReferenceToEntrySchema` requires `collectionId`
   * alongside `id` and `objectType`, and refines it against the definition's
   * `ofCollections`. The collection is therefore taken from the selected
   * Entry's own collection, not inferred later.
   */
  function setRefs(refs: ValueContentReferenceToEntry[]): void {
    field.onChange(refs);
  }

  function toggleEntry(entryId: string, collectionId: Collection['id']): void {
    if (selectedIds.has(entryId)) {
      setRefs(selectedRefs.filter((ref) => ref.id !== entryId));
    } else if (maxReached === false) {
      setRefs([
        ...selectedRefs,
        { id: entryId, objectType: 'entry', collectionId },
      ]);
    }
  }

  function removeEntry(entryId: string): void {
    setRefs(selectedRefs.filter((ref) => ref.id !== entryId));
  }

  /**
   * Returns a human-readable label for an entry by extracting the first
   * string value from its content, or falls back to a truncated ID.
   */
  function getEntryLabel(entry: Entry): string {
    for (const value in entry.values) {
      if (entry.values[value]?.valueType === 'string') {
        const content = Object.values(entry.values[value].content).find(
          (v) => typeof v === 'string' && v.length > 0
        );
        if (content !== undefined) {
          return String(content);
        }
      }
    }
    return entry.id.slice(0, 8);
  }

  // Resolve selected refs to entries with collection context for display
  const selectedEntries = selectedRefs
    .map((ref) => {
      const found = availableEntries.find((ae) => ae.entry.id === ref.id);
      return found !== undefined ? found : null;
    })
    .filter(
      (item): item is { entry: Entry; collection: Collection } => item !== null
    );

  // Group available entries by collection for the picker dialog
  const entriesByCollection = allowedCollections.map((collection, index) => ({
    collection,
    entries:
      isReadingEntries === false &&
      entryQueries[index] !== undefined &&
      entryQueries[index].isPending === false
        ? entryQueries[index].data.list
        : [],
  }));

  return (
    <div className="space-y-3">
      {selectedEntries.length > 0 && (
        <div className="space-y-1">
          {selectedEntries.map(({ entry, collection }) => (
            <div
              key={entry.id}
              className="group flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-700"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">
                  {getEntryLabel(entry)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {translateContent({
                    key: 'collection.name.singular',
                    record: collection.name.singular,
                  })}
                </span>
              </div>
              {disabled !== true && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeEntry(entry.id)}
                  type="button"
                  Icon={XIcon}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button
            {...controlProps}
            ref={field.ref}
            onBlur={field.onBlur}
            variant="secondary"
            type="button"
            disabled={disabled === true || maxReached}
            Icon={ListPlusIcon}
          >
            Select Entries
            {fieldDefinition.min !== null || fieldDefinition.max !== null ? (
              <span className="ml-1 text-muted-foreground">
                ({selectedRefs.length}
                {fieldDefinition.max !== null
                  ? ` / ${fieldDefinition.max}`
                  : ''}
                )
              </span>
            ) : null}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Select Entries</DialogTitle>
            <DialogDescription>
              {fieldDefinition.max !== null
                ? `Select up to ${fieldDefinition.max} ${fieldDefinition.max !== 1 ? 'entries' : 'entry'}.`
                : 'Select one or more entries.'}
              {fieldDefinition.min !== null
                ? ` At least ${fieldDefinition.min} required.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {isReadingCollections === true || isReadingEntries === true ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => {
                  const key = `skeleton-${String(i)}`;
                  return (
                    <div
                      key={key}
                      className="h-10 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800"
                    />
                  );
                })}
              </div>
            ) : availableEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No entries available. Create entries in the allowed collections
                first.
              </p>
            ) : (
              <div className="space-y-6">
                {entriesByCollection.map(({ collection, entries }) => {
                  if (entries.length === 0) return null;
                  return (
                    <div key={collection.id}>
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                        {translateContent({
                          key: 'collection.name.plural',
                          record: collection.name.plural,
                        })}
                      </h4>
                      <div className="space-y-1">
                        {entries.map((entry) => {
                          const isSelected = selectedIds.has(entry.id);
                          const isDisabledOption =
                            isSelected === false && maxReached;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              disabled={isDisabledOption}
                              onClick={() =>
                                toggleEntry(entry.id, collection.id)
                              }
                              className={cn(
                                'flex w-full items-center rounded-md border-2 px-3 py-2 text-left transition-all',
                                isSelected === true
                                  ? 'border-primary bg-primary/5'
                                  : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500',
                                isDisabledOption === true &&
                                  'cursor-not-allowed opacity-50'
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {getEntryLabel(entry)}
                              </span>
                              {isSelected === true ? (
                                <div className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <CheckIcon className="h-3 w-3" />
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface FormComponentFromFieldDefinitionProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: FieldDefinition;
}

/**
 * The props a RenderSpec's leaf receives. The leaf is value-typed and owns no form
 * path, only the already-bound `field`. It stays generic over the form value shape
 * so `TFieldValues` chains from the Controller to the leaf with no cast.
 */
export interface FieldInputProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: FieldDefinition;
  disabled: boolean;
  controlProps: FieldControlProps;
}

/**
 * One field type's render contract, the RENDER facet of the field registry (see
 * contributing/renderer/dynamic-form-field-generation.md). It maps a runtime field
 * type to the value-typed leaf input that draws it, sharing the `FieldType` spine
 * with the authoring `DefinitionSpec` registry.
 */
export interface RenderSpec {
  // Generic over the form value shape so the caller's `field` flows through without
  // a cast (RHF's ControllerRenderProps is invariant, so a fixed `FieldValues` here
  // would not accept a concrete caller's field).
  renderInput: <
    TFieldValues extends FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  >(
    props: FieldInputProps<TFieldValues, TName>
  ) => React.ReactNode;
  // Whether the Value is per-language. Core stores every value type except
  // `component` that way (see @elek-io/core docs/fields.md), so every rendered
  // type is translatable today.
  translatable: boolean;
}

/**
 * The RENDER registry: field type to leaf input. Being an exhaustive
 * `Record<FieldType, RenderSpec>`, a new Core field type fails to compile here
 * until it is given an entry.
 */
const RENDER_REGISTRY: Record<FieldType, RenderSpec> = {
  text: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="text"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  telephone: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="telephone"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  email: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="email"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  number: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="number"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  url: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="url"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  ipv4: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="ipv4"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  time: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormInputField
        field={field}
        type="time"
        disabled={disabled}
        {...controlProps}
      />
    ),
  },
  textarea: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormTextareaField field={field} disabled={disabled} {...controlProps} />
    ),
  },
  date: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormDateField field={field} disabled={disabled} {...controlProps} />
    ),
  },
  datetime: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormDatetimeField field={field} disabled={disabled} {...controlProps} />
    ),
  },
  toggle: {
    translatable: true,
    renderInput: ({ field, disabled, controlProps }) => (
      <FormToggleField field={field} disabled={disabled} {...controlProps} />
    ),
  },
  range: {
    translatable: true,
    // The Slider's min / max are its functional value domain, not HTML constraint
    // attributes, so they are the one exception to the no-native-attributes rule.
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'range') {
        return null;
      }
      return (
        <FormRangeField
          field={field}
          fieldDefinition={fieldDefinition}
          min={fieldDefinition.min}
          max={fieldDefinition.max}
          step={1} // @todo Core needs to support this too
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  select: {
    translatable: true,
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'select') {
        return null;
      }
      return (
        <FormSelectField
          field={field}
          fieldDefinition={fieldDefinition}
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  slug: {
    translatable: true,
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'slug') {
        return null;
      }
      return (
        <FormSlugField
          field={field}
          fieldDefinition={fieldDefinition}
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  asset: {
    translatable: true,
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'asset') {
        return null;
      }
      return (
        <FormAssetField
          field={field}
          fieldDefinition={fieldDefinition}
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  entry: {
    translatable: true,
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'entry') {
        return null;
      }
      return (
        <FormEntryField
          field={field}
          fieldDefinition={fieldDefinition}
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  markdown: {
    translatable: true,
    renderInput: ({ field, fieldDefinition, disabled, controlProps }) => {
      if (fieldDefinition.fieldType !== 'markdown') {
        return null;
      }
      return (
        <FormMarkdownField
          field={field}
          fieldDefinition={fieldDefinition}
          disabled={disabled}
          {...controlProps}
        />
      );
    },
  },
  // `dynamic` cannot be rendered yet, since its content is a flat Component array
  // rather than a per-language record. The placeholder keeps a Collection carrying
  // one from crashing. See contributing/not-yet-implemented.md.
  dynamic: {
    translatable: false,
    renderInput: ({ fieldDefinition }) => (
      <div className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        The &quot;{fieldDefinition.fieldType}&quot; field type can&apos;t be
        displayed yet.
      </div>
    ),
  },
};

/**
 * Whether a field's required state should be exposed as `aria-required`, which
 * stands in for the native `required` the registry does not emit. Only the
 * textbox / combobox / spinbutton roles accept it, so slider, switch, reference
 * and markdown fields convey required through their label instead. Returns
 * undefined so spreading the bag leaves the attribute off entirely.
 */
function ariaRequiredFor(fieldDefinition: FieldDefinition): true | undefined {
  const acceptsAriaRequired =
    (fieldDefinition.valueType === 'string' ||
      fieldDefinition.valueType === 'number') &&
    fieldDefinition.fieldType !== 'range';
  return acceptsAriaRequired && fieldDefinition.isRequired ? true : undefined;
}

/**
 * Renders the leaf input for a field definition by looking its field type up in
 * the exhaustive RENDER_REGISTRY. See contributing/renderer/forms.md for why no
 * native constraint attributes are emitted and how `aria-required` replaces them.
 */
function FormComponentFromFieldDefinition<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  ...controlProps
}: FormComponentFromFieldDefinitionProps<TFieldValues>): React.ReactNode {
  // AppForm's view-only fieldset only disables native form controls, so a leaf
  // that is not one (the markdown editor's contenteditable) has to be told. Every
  // leaf takes `disabled`, so the mode is folded in here rather than per type.
  const mode = useAppFormMode();

  return RENDER_REGISTRY[fieldDefinition.fieldType].renderInput({
    field,
    fieldDefinition,
    disabled: fieldDefinition.isDisabled || mode === 'view',
    controlProps: {
      ...controlProps,
      // Omitted (not set to false) when it must not be emitted, so the attribute
      // never lands on a control whose role does not allow it.
      ...(ariaRequiredFor(fieldDefinition) === true
        ? { 'aria-required': true }
        : {}),
    },
  });
}

// TTransformedValues is defaulted and never read: only `control` and
// `formState.errors` are used here, and both are typed by TFieldValues alone.
// Carrying the generic lets a caller pass its form as it is, instead of erasing
// the third generic through a cast. See contributing/renderer/forms.md#form-typing.
interface FormFieldFromDefinitionProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  fieldDefinition: FieldDefinition;
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  supportedLanguages: SupportedLanguage[];
  className?: string;
}

/**
 * Renders a complete, translatable entry field bound to the form at `name`: the
 * label, the value-typed input from the registry, the description and the
 * validation message. For a non-editable definition preview in the collection
 * editor, use FormFieldDefinitionPreview instead.
 */
function FormFieldFromDefinition<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  fieldDefinition,
  supportedLanguages,
  className,
}: FormFieldFromDefinitionProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
  const { translateContent } = useProject();

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            `col-span-12 ${fieldWidth(fieldDefinition.inputWidth)}`,
            className
          )}
        >
          <FormLabel isRequired={fieldDefinition.isRequired}>
            {translateContent({
              key: 'fieldDefinition.label',
              record: fieldDefinition.label,
            })}
          </FormLabel>
          {RENDER_REGISTRY[fieldDefinition.fieldType].translatable ? (
            <TranslatableField
              field={field}
              title={translateContent({
                key: 'fieldDefinition.label',
                record: fieldDefinition.label,
              })}
              description={
                fieldDefinition.description !== null
                  ? translateContent({
                      key: 'fieldDefinition.description',
                      record: fieldDefinition.description,
                    })
                  : null
              }
              supportedLanguages={supportedLanguages}
              errors={form.formState.errors}
              // The entry renderer requires every supported language, so the
              // dialog marks each one required.
              dialogItemRequired
              renderLeaf={(leafField, controlProps) => (
                <FormComponentFromFieldDefinition
                  field={leafField}
                  fieldDefinition={fieldDefinition}
                  {...controlProps}
                />
              )}
            />
          ) : (
            // Non-translatable types (only `dynamic` today) render straight
            // through the registry, which draws the muted placeholder, with no
            // language dialog.
            <FormComponentFromFieldDefinition
              field={field}
              fieldDefinition={fieldDefinition}
            />
          )}
          {fieldDefinition.description !== null ? (
            <FormDescription>
              {translateContent({
                key: 'fieldDefinition.description',
                record: fieldDefinition.description,
              })}
            </FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface FormFieldDefinitionPreviewProps {
  fieldDefinition: FieldDefinition;
  isDraggable?: boolean;
  isEditable?: boolean;
  onDelete?: ((fieldDefinition: FieldDefinition) => void) | undefined;
  className?: string;
}

/**
 * A static, disabled Value for the preview. The preview only shows the shape of an
 * input, so references show an empty selection and every other type shows its
 * default (or nothing for the string and mdast types).
 */
function previewFieldValue(fieldDefinition: FieldDefinition): unknown {
  if (fieldDefinition.valueType === 'reference') {
    return [];
  }
  if (
    fieldDefinition.valueType === 'boolean' ||
    fieldDefinition.valueType === 'number'
  ) {
    return fieldDefinition.defaultValue;
  }
  return null;
}

/**
 * A non-editable preview of a field definition for the collection editor. Unlike
 * FormFieldFromDefinition it is not bound to a form: the example input holds a
 * static value, so there are no phantom form paths and the label still associates
 * with a real (disabled) input.
 */
function FormFieldDefinitionPreview({
  fieldDefinition,
  isDraggable = false,
  isEditable = false,
  onDelete,
  className,
}: FormFieldDefinitionPreviewProps): React.ReactElement {
  const { translateContent } = useProject();
  const id = React.useId();
  const inputId = `${id}-preview-input`;
  const descriptionId = `${id}-preview-description`;
  const description =
    fieldDefinition.description !== null
      ? translateContent({
          key: 'fieldDefinition.description',
          record: fieldDefinition.description,
        })
      : null;
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  const previewField: ControllerRenderProps<FieldValues> = {
    name: `preview-${fieldDefinition.id}`,
    value: previewFieldValue(fieldDefinition),
    onChange: () => {},
    onBlur: () => {},
    ref: () => {},
  };

  return (
    <div
      className={cn(
        `col-span-12 flex items-center gap-2 ${fieldWidth(fieldDefinition.inputWidth)}`,
        className
      )}
    >
      <div className="flex flex-col">
        {isDraggable === true ? (
          <DragHandle
            id={fieldDefinition.id}
            className={cn({
              'rounded-b-none': isEditable === true || onDelete !== undefined,
            })}
          />
        ) : null}
        {isEditable === true ? (
          // Editing a field definition is not implemented yet (deliberate TODO),
          // so this stays disabled and named rather than silently doing nothing.
          <Button
            Icon={EditIcon}
            variant="secondary"
            size="icon"
            disabled
            className={cn({
              'rounded-none': isDraggable === true && onDelete !== undefined,
              'rounded-t-none': isDraggable === true,
              'rounded-b-none': onDelete !== undefined,
            })}
          >
            <span className="sr-only">
              Edit the {label} field (not available yet)
            </span>
          </Button>
        ) : null}
        {onDelete !== undefined ? (
          <Button
            Icon={TrashIcon}
            variant="destructive"
            size="icon"
            onClick={() => onDelete(fieldDefinition)}
            className={cn({
              'rounded-t-none': isDraggable === true || isEditable === true,
            })}
          >
            <span className="sr-only">Remove the {label} field</span>
          </Button>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor={inputId} isRequired={fieldDefinition.isRequired}>
          {label}
        </Label>
        {RENDER_REGISTRY[fieldDefinition.fieldType].renderInput({
          field: previewField,
          fieldDefinition,
          disabled: true,
          controlProps: {
            id: inputId,
            ...(ariaRequiredFor(fieldDefinition) === true
              ? { 'aria-required': true }
              : {}),
            ...(description !== null
              ? { 'aria-describedby': descriptionId }
              : {}),
          },
        })}
        {description !== null ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormSubtreeMessage,
  FormField,
  FormDateField,
  FormDatetimeField,
  FormFieldFromDefinition,
  FormFieldDefinitionPreview,
};

import { Trans } from '@lingui/react/macro';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Controller,
  FormProvider,
  useFormState,
  type ControllerRenderProps,
  type FieldError as RhfFieldError,
  type FieldPath,
  type FieldValues,
  type SubmitErrorHandler,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { Button } from '@renderer/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@renderer/components/ui/field';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import {
  AppFormContext,
  useAppFormId,
  useErrorTarget,
  type AppFormContextValue,
} from '@renderer/hooks/useAppFormContext';
import {
  collectFieldErrorMessages,
  isAtOrBelow,
  type FieldErrorMessage,
} from '@renderer/lib/formErrors';
import { cn } from '@renderer/lib/utils';

// The form layer: the one <form>, the one submit control, the one field shell
// and the hook every form is built with. What Desktop knows about a single
// field type lives in components/fields/ instead.
//
// See contributing/renderer/forms.md.

/**
 * The error a field's message renders: the one at its own path, or the one
 * react-hook-form nested under `root`.
 *
 * `@hookform/resolvers` nests an error reported on an array itself under `root`
 * as soon as any path inside that array is a registered field name, which a
 * dynamic field's sections are the moment one has been mounted. Without this
 * the message on the array (a required field whose last section was just
 * removed, say) would sit at a path nothing reads, so the submit would say
 * nothing at all. A nested error object without a `root` is returned unchanged,
 * so a field holding only errors below it still renders no message of its own.
 */
function messageError(
  error: RhfFieldError | undefined
): RhfFieldError | undefined {
  if (error === undefined || typeof error.message === 'string') {
    return error;
  }
  return error.root ?? error;
}

export interface FieldShellProps {
  label: ReactNode;
  /**
   * Whether the field has to be filled. It only marks the label today, since
   * the label is where every form says so.
   */
  required: boolean;
  description?: ReactNode;
  /** The message of the one error this field shows, if any. */
  error?: string | undefined;
  /** A field whose label, description and control sit side by side. */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  /** Renders the control, given the props that tie it to the parts above. */
  children: (controlProps: FieldControlProps) => ReactNode;
}

/**
 * The one field shell: shadcn's `Field` holding the label, the control, the
 * description and the error, in that order.
 *
 * It mints the ids itself and names only the parts it shows in
 * `aria-describedby`, so a label, a description and an error always point at
 * the real focusable control and never at an element that is not there. It
 * holds no form state, which is what lets the Collection's preview draw a field
 * with the same shell and no form.
 *
 * See contributing/renderer/forms.md.
 */
export function FieldShell({
  label,
  required,
  description,
  error,
  orientation = 'vertical',
  className,
  children,
}: FieldShellProps): ReactNode {
  const id = useId();
  const controlId = `${id}-control`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [
    description === undefined || description === null ? null : descriptionId,
    error === undefined ? null : errorId,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  const control = children({
    id: controlId,
    // Only the parts that are on screen are named, so a label, a description
    // and an error always point at something that exists.
    ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    // Said either way, since a control that was valid and then is not has to
    // change rather than gain the state.
    'aria-invalid': error !== undefined,
  });
  const labelPart = (
    <FieldLabel htmlFor={controlId} isRequired={required}>
      {label}
    </FieldLabel>
  );
  const descriptionPart =
    description === undefined || description === null ? null : (
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
    );
  const errorPart =
    error === undefined ? null : (
      <FieldError id={errorId}>
        {/* The words sit in a paragraph inside the alert, so one message and a
        list of them read the same, and the color a person reads the error in
        is measured on this slot. */}
        <p data-slot="form-message">{error}</p>
      </FieldError>
    );

  // A horizontal field keeps its words together on one side of the control,
  // which is what the switches of the field definition forms are.
  if (orientation === 'horizontal') {
    return (
      <Field orientation="horizontal" className={className}>
        <FieldContent>
          {labelPart}
          {descriptionPart}
          {errorPart}
        </FieldContent>
        {control}
      </Field>
    );
  }

  return (
    <Field className={cn('gap-2', className)}>
      {labelPart}
      {control}
      {descriptionPart}
      {errorPart}
    </Field>
  );
}

export interface AppFieldRenderProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  field: ControllerRenderProps<TFieldValues, TName>;
  /** The id and `aria-*` to place on the real focusable control. */
  controlProps: FieldControlProps;
  /** Whether the whole form or this one field is disabled. */
  disabled: boolean;
}

// TTransformedValues is defaulted and never read here: only `control` is used,
// which is typed by TFieldValues alone. Carrying it lets a caller pass its form
// as it is, instead of erasing the generic through a cast.
// See contributing/renderer/forms.md#form-typing.
export interface AppFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
> extends Omit<FieldShellProps, 'error' | 'children' | 'required'> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  name: TName;
  required?: boolean;
  children: (props: AppFieldRenderProps<TFieldValues, TName>) => ReactNode;
}

/**
 * One field of a form: react-hook-form's `Controller` drawn in the field shell.
 *
 * Nothing else in the app draws a label, a description or an error. `name` is
 * typed against the form that is passed in, so a path that does not exist on it
 * is a compile error at the call site.
 *
 * See contributing/renderer/forms.md.
 */
export function AppField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  required = false,
  children,
  ...shell
}: AppFieldProps<TFieldValues, TName, TTransformedValues>): ReactNode {
  // Claimed whether or not a message is on screen right now, so AppForm's
  // backstop never reports an error this field would show.
  useErrorTarget(name);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = messageError(fieldState.error);

        return (
          <FieldShell
            {...shell}
            required={required}
            {...(error?.message === undefined
              ? {}
              : { error: String(error.message) })}
          >
            {(controlProps): ReactNode =>
              children({
                field,
                controlProps,
                disabled: field.disabled === true,
              })
            }
          </FieldShell>
        );
      }}
    />
  );
}

// The gating a detached SubmitButton reads, since a button outside the form's
// FormProvider subtree cannot read formState from context.
interface FormActionsContextValue {
  formId: string | undefined;
  isDirty: boolean;
  isSubmitting: boolean;
  isDisabled: boolean;
}

const FormActionsContext = createContext<FormActionsContextValue | null>(null);

export interface AppFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  onSubmit: SubmitHandler<TTransformedValues>;
  /**
   * The form's id. A detached submit button (page header, dialog or sheet
   * footer) associates with it via the HTML form attribute. Defaults to a
   * generated id when omitted, which is enough for a form whose submit button is
   * inside its own subtree.
   */
  id?: string | undefined;
  /**
   * 'view' renders the whole form read-only through a disabled fieldset and
   * makes onSubmit a no-op, so the diff and history views reuse the same
   * component without a second read-only code path.
   */
  mode?: 'edit' | 'view';
  className?: string;
  /**
   * Classes for the `<fieldset>` AppForm wraps its children in. Needed because
   * that element sits between the form and its content, so a caller laying the
   * form out (a dialog whose body scrolls while its footer stays put) cannot
   * reach it otherwise and its default sizing breaks the containment. Exposing
   * it keeps that fix here rather than as a workaround at each call site.
   */
  fieldsetClassName?: string;
  children: ReactNode;
}

/**
 * The only place a <form> element is written in the app. It owns noValidate, the
 * handleSubmit wiring, the id a detached SubmitButton associates with, and the
 * view-only mode. See contributing/renderer/forms.md.
 */
export function AppForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  onSubmit,
  id,
  mode = 'edit',
  className,
  fieldsetClassName,
  children,
}: AppFormProps<TFieldValues, TTransformedValues>): ReactNode {
  const generatedId = useId();
  const formId = id ?? generatedId;

  // The paths whose errors something mounted inside this form renders. A ref, not
  // state, because registering must not re-render the form. Counted rather than a
  // Set, since two components legitimately claim the same path (a translatable
  // field's visible message and the same language's message inside its dialog),
  // and closing one must not drop the other's claim.
  const errorTargets = useRef(new Map<string, number>());
  const registerErrorTarget = useCallback((name: string): (() => void) => {
    const targets = errorTargets.current;
    targets.set(name, (targets.get(name) ?? 0) + 1);
    return () => {
      const claims = targets.get(name) ?? 0;
      if (claims > 1) {
        targets.set(name, claims - 1);
      } else {
        targets.delete(name);
      }
    };
  }, []);
  const [unsurfacedErrors, setUnsurfacedErrors] = useState<FieldErrorMessage[]>(
    []
  );
  const unsurfacedRef = useRef<HTMLDivElement>(null);
  const [submitError, setSubmitError] = useState<Error | null>(null);

  useEffect(() => {
    if (unsurfacedErrors.length > 0) {
      unsurfacedRef.current?.focus();
    }
  }, [unsurfacedErrors]);

  const context = useMemo<AppFormContextValue>(
    () => ({ id: formId, mode, registerErrorTarget }),
    [formId, mode, registerErrorTarget]
  );

  // A validation error nothing renders would make the submit a silent no-op, so
  // report it on the form itself and log it, rather than leaving the user with a
  // button that appears to do nothing. See contributing/renderer/forms.md.
  const onInvalid: SubmitErrorHandler<TFieldValues> = (errors) => {
    const unsurfaced = collectFieldErrorMessages(errors).filter((error) =>
      [...errorTargets.current.keys()].every(
        (target) => isAtOrBelow(error.path, target) === false
      )
    );
    setUnsurfacedErrors(unsurfaced);

    if (unsurfaced.length > 0) {
      void window.ipc.core.logger.error({
        source: 'desktop',
        message: 'Form submit blocked by a validation error with no message',
        meta: { formId, errors: unsurfaced },
      });
    }
  };

  const submit = form.handleSubmit(onSubmit, onInvalid);
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    // Load bearing: a Sheet or Dialog is portaled out of an outer form's DOM but
    // React still bubbles the synthetic submit event to its React ancestors, so
    // without this a nested AppForm also submits its parent. handleSubmit already
    // calls preventDefault.
    event.stopPropagation();
    if (mode === 'view') {
      event.preventDefault();
      return;
    }
    setUnsurfacedErrors((previous) => (previous.length === 0 ? previous : []));
    // handleSubmit re-throws whatever onSubmit rejected with, after awaiting it.
    // Nothing is left to catch that by then, so hold it and re-throw it during
    // render, where the root error boundary sees it. A CoreError handled in place
    // never gets here, since that recipe catches inside onSubmit.
    void submit(event).catch((error: unknown) => {
      setSubmitError(error instanceof Error ? error : new Error(String(error)));
    });
  };

  if (submitError !== null) {
    throw submitError;
  }

  return (
    <AppFormContext value={context}>
      <FormProvider {...form}>
        {/* noValidate is deliberately not a prop, so it cannot be forgotten. */}
        <form
          id={formId}
          noValidate
          className={className}
          onSubmit={handleSubmit}
        >
          <fieldset disabled={mode === 'view'} className={fieldsetClassName}>
            {unsurfacedErrors.length > 0 ? (
              <div
                ref={unsurfacedRef}
                tabIndex={-1}
                role="alert"
                className="m-6 rounded-md border border-destructive p-4 text-sm text-error"
              >
                <p className="font-medium">
                  <Trans>
                    This form could not be saved, because of a problem that is
                    not shown on any of its fields:
                  </Trans>
                </p>
                <ul className="mt-2 list-inside list-disc">
                  {unsurfacedErrors.map((error) => (
                    <li key={error.path}>
                      {error.message} ({error.path})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {children}
          </fieldset>
        </form>
      </FormProvider>
    </AppFormContext>
  );
}

// TTransformedValues is defaulted and never read: only `form.control` is used
// here, which is typed by TFieldValues alone. Carrying the generic lets a caller
// pass its form as it is, instead of erasing the third generic through a cast.
// See contributing/renderer/forms.md#form-typing.
export interface FieldSubtreeErrorProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  className?: string;
}

/**
 * Renders every validation message at or below `name`. Use it where a value is
 * bound as a single Controller but rendered as something other than a field (the
 * Collection editor's `fieldDefinitions` array), so a refinement landing on the
 * value itself or on a path inside it still has a surface. An `AppField` cannot
 * serve here, because it only shows the message sitting at its own exact path.
 *
 * It claims the whole subtree as an error target, which is also what keeps
 * AppForm from reporting the same errors a second time.
 * See contributing/renderer/forms.md.
 */
export function FieldSubtreeError<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  className,
}: FieldSubtreeErrorProps<TFieldValues, TTransformedValues>): ReactNode {
  useErrorTarget(name);
  const { errors } = useFormState({ control: form.control, name });
  const containerRef = useRef<HTMLDivElement>(null);
  const messages = collectFieldErrorMessages(errors).filter((error) =>
    isAtOrBelow(error.path, name)
  );
  // A primitive key, so the effect refocuses when the set of messages changes but
  // not on every re-render (the array is rebuilt each time).
  const messageKey = messages.map((error) => error.path).join(',');

  useEffect(() => {
    if (messageKey !== '') {
      containerRef.current?.focus();
    }
  }, [messageKey]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <FieldError ref={containerRef} tabIndex={-1} className={className}>
      <ul className="list-inside list-disc">
        {messages.map((error) => (
          <li key={error.path} data-slot="form-message">
            {error.message} ({error.path})
          </li>
        ))}
      </ul>
    </FieldError>
  );
}

export interface FormActionsProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /**
   * The form's id, shared with the AppForm so a detached SubmitButton inside
   * this area associates with it. Defaults to the enclosing AppForm's id, which
   * is enough when the button sits inside the form's own subtree.
   */
  id?: string | undefined;
  children: ReactNode;
}

/**
 * Wraps the area that holds a form's SubmitButton (a Page header, dialog or
 * sheet footer) and makes the form's reactive gating available to it. It
 * subscribes through `useFormState`, so the enclosed button re-renders when the
 * form dirties or starts submitting.
 */
export function FormActions<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  id,
  children,
}: FormActionsProps<TFieldValues, TTransformedValues>): ReactNode {
  const {
    isDirty,
    isSubmitting,
    disabled: isDisabled,
  } = useFormState({ control: form.control });
  const appFormId = useAppFormId();
  const formId = id ?? appFormId ?? undefined;

  return (
    <FormActionsContext value={{ formId, isDirty, isSubmitting, isDisabled }}>
      {children}
    </FormActionsContext>
  );
}

/**
 * `type` and `render` are omitted, not just defaulted: a SubmitButton that can
 * be talked out of submitting is the bug this component exists to prevent. See
 * contributing/renderer/forms.md.
 */
export interface SubmitButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'type' | 'render'
> {
  /**
   * The id of the form to submit. Needed when the button is rendered outside the
   * form's subtree (the detached header/footer case) and no enclosing
   * FormActions or AppForm supplies it. When omitted, it falls back to the
   * enclosing FormActions' id, then the enclosing AppForm's id.
   */
  form?: string;
  /**
   * Disable the button until the form is dirty. Off by default, so a create form
   * stays enabled on open; update forms opt in to keep their per-form intent.
   * Requires an enclosing FormActions to read the dirty state.
   */
  requireDirty?: boolean;
}

/**
 * The only submit control. It always disables while the form is submitting or
 * still filling from its query, and additionally on a pristine form when
 * `requireDirty` is set. All three read the enclosing FormActions.
 * See contributing/renderer/forms.md.
 */
export function SubmitButton({
  form,
  requireDirty = false,
  disabled,
  isLoading,
  children,
  ...props
}: SubmitButtonProps): ReactNode {
  const actions = useContext(FormActionsContext);
  const appFormId = useAppFormId();
  const formId = form ?? actions?.formId ?? appFormId ?? undefined;

  const isSubmitting = actions?.isSubmitting ?? false;
  const isDirty = actions?.isDirty ?? true;
  // A form still waiting for its data cannot be saved: it would write the
  // defaults over what is stored. Its fields are disabled, so this is the same
  // fact said once more for the control that sits outside them.
  const isDisabled = actions?.isDisabled ?? false;
  const gatedDisabled =
    disabled === true ||
    isSubmitting ||
    isDisabled ||
    (requireDirty && isDirty === false);

  return (
    // The spread comes first on purpose, so the structural props below it cannot
    // be overridden by a caller.
    <Button
      {...props}
      type="submit"
      form={formId}
      disabled={gatedDisabled}
      isLoading={isLoading ?? isSubmitting}
    >
      {children}
    </Button>
  );
}

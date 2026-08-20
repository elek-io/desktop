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
  useFormState,
  type FieldValues,
  type SubmitErrorHandler,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { Button } from '@renderer/components/ui/button';
import { Form } from '@renderer/components/ui/form';
import {
  AppFormContext,
  useAppFormId,
  type AppFormContextValue,
} from '@renderer/hooks/useAppFormContext';
import {
  collectFieldErrorMessages,
  isAtOrBelow,
  type FieldErrorMessage,
} from '@renderer/lib/formErrors';

// The form primitives every form in the app is built from.
// See contributing/renderer/forms.md.

// The gating a detached SubmitButton reads, since a button outside the form's
// FormProvider subtree cannot read formState from context.
interface FormActionsContextValue {
  formId: string | undefined;
  isDirty: boolean;
  isSubmitting: boolean;
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
      <Form {...form}>
        {/* noValidate is deliberately not a prop, so it cannot be forgotten. */}
        <form
          id={formId}
          noValidate
          className={className}
          onSubmit={handleSubmit}
        >
          <fieldset disabled={mode === 'view'}>
            {unsurfacedErrors.length > 0 ? (
              <div
                ref={unsurfacedRef}
                tabIndex={-1}
                role="alert"
                className="m-6 rounded-md border border-destructive p-4 text-sm text-destructive"
              >
                <p className="font-medium">
                  This form could not be saved, because of a problem that is not
                  shown on any of its fields:
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
      </Form>
    </AppFormContext>
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
  const { isDirty, isSubmitting } = useFormState({ control: form.control });
  const appFormId = useAppFormId();
  const formId = id ?? appFormId ?? undefined;

  return (
    <FormActionsContext value={{ formId, isDirty, isSubmitting }}>
      {children}
    </FormActionsContext>
  );
}

/**
 * `type` and `asChild` are omitted, not just defaulted: a SubmitButton that can
 * be talked out of submitting is the bug this component exists to prevent. See
 * contributing/renderer/forms.md.
 */
export interface SubmitButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'type' | 'asChild'
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
 * The only submit control. It always disables while the form is submitting, and
 * additionally on a pristine form when `requireDirty` is set. Both read the
 * enclosing FormActions. See contributing/renderer/forms.md.
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
  const gatedDisabled =
    disabled === true || isSubmitting || (requireDirty && isDirty === false);

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

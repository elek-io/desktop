import { Trans } from '@lingui/react/macro';
import { useBlocker } from '@tanstack/react-router';
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
  FieldHeader,
  FieldLabel,
  FieldWarning,
} from '@renderer/components/ui/field';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { Spinner } from '@renderer/components/ui/spinner';
import {
  AppFormContext,
  useAppFormId,
  useAppFormIsSaving,
  useAppFormSchema,
  useDeeperErrorTarget,
  useErrorTarget,
  type AppFormContextValue,
} from '@renderer/hooks/useAppFormContext';
import {
  useUnsavedChanges,
  useUnsavedChangesClaim,
} from '@renderer/hooks/useUnsavedChanges';
import {
  alsoRequired,
  fieldRules,
  fieldRulesFromSchema,
  fieldRulesLine,
  type FieldRules,
} from '@renderer/lib/fieldRules';
import {
  collectFieldErrorMessages,
  fieldErrorMessage,
  isAtOrBelow,
  type FieldErrorMessage,
} from '@renderer/lib/formErrors';
import { isLeavingThePage } from '@renderer/lib/leaveGuard';
import { cn } from '@renderer/lib/utils';

// The form layer: the one <form>, the one submit control, the one field shell
// and the hook every form is built with. What Desktop knows about a single
// field type lives in components/fields/ instead.
//
// See contributing/renderer/forms.md.

/**
 * The sentence the field shows for the message it renders, if any.
 *
 * Every refusal zod raises arrives already worded, through the error map
 * `lib/refusedValueText.ts` installs. The exception is an issue Core raised
 * with a message of its own, which zod lets outrank every map and which
 * therefore still carries Core's English: it arrives under zod's `custom`
 * code, and the field type it landed on words it through `coreRefusalText`.
 * A message `setError` put here is worded by whoever called it, so only
 * `custom` is handed on.
 */
function fieldErrorText(
  found: FieldErrorMessage | undefined,
  content: unknown,
  coreRefusalText: ((refusal: FieldRefusal) => string) | undefined
): string | undefined {
  if (found === undefined) {
    return undefined;
  }

  if (found.type !== 'custom' || coreRefusalText === undefined) {
    return found.message;
  }
  return coreRefusalText({ message: found.message, content });
}

/** One refusal Core wrote its own English for, as a field type is handed it. */
export interface FieldRefusal {
  /** Core's own English, which is never shown. */
  message: string;
  /**
   * This field's own value, which is what the refusal is about. A refusal of
   * one part of it, such as one reference of a list, carries the whole value
   * here, since that is what the field type can read.
   */
  content: unknown;
}

export interface FieldShellProps {
  label: ReactNode;
  /**
   * What the field says about itself at the top right of its label, such as
   * "Required, up to 200 characters". A field type's folder builds its own and
   * a hand-written field reads them off its Core schema, see
   * `lib/fieldRules.ts`.
   */
  rules: FieldRules;
  description?: ReactNode;
  /**
   * Something about the Value that keeps nobody from saving, such as a
   * translation it is still missing. A field that shows one also takes the
   * warning border and surface on its control.
   */
  warning?: ReactNode;
  /**
   * The same Value in another language, to translate from, which stands below
   * the warning in the muted small role as ci draws it.
   */
  translateFrom?: ReactNode;
  /** The message of the one error this field shows, if any. */
  error?: string | undefined;
  /** A field whose label, description and control sit side by side. */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  /** Renders the control, given the props that tie it to the parts above. */
  children: (controlProps: FieldControlProps) => ReactNode;
}

/**
 * The one field shell: shadcn's `Field` holding the label with the field's
 * rules, the control, the warning, the description and the error, in that
 * order, which is the order ci draws a field in.
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
  rules,
  description,
  warning,
  translateFrom,
  error,
  orientation = 'vertical',
  className,
  children,
}: FieldShellProps): ReactNode {
  const id = useId();
  const controlId = `${id}-control`;
  const rulesId = `${id}-rules`;
  const warningId = `${id}-warning`;
  const translateFromId = `${id}-translate-from`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const rulesLine = fieldRulesLine(rules);
  const warningPart =
    warning === undefined || warning === null ? null : (
      <FieldWarning id={warningId}>{warning}</FieldWarning>
    );
  const translateFromPart =
    translateFrom === undefined || translateFrom === null ? null : (
      <p
        data-slot="field-translate-from"
        id={translateFromId}
        className="text-small text-muted-foreground"
      >
        {translateFrom}
      </p>
    );
  // In the order they stand on screen, so what a screen reader reads after the
  // control follows what somebody sees around it.
  const describedBy = [
    rulesLine === null ? null : rulesId,
    warningPart === null ? null : warningId,
    translateFromPart === null ? null : translateFromId,
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
    // Offered to every control. One whose role does not take it drops it
    // again, which is what a field type's `acceptsAriaRequired` answers.
    ...(rules.required ? { 'aria-required': true } : {}),
    // A warned field takes the warning border and surface, which is what ci
    // draws on the input of a Value a language is still missing. The warning
    // line below it says the same in words, so the color is never alone.
    ...(warningPart === null
      ? {}
      : { className: 'border-warning-border bg-warning-surface' }),
  });
  const headerPart = (
    <FieldHeader {...(rulesLine === null ? {} : { rules: rulesLine, rulesId })}>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
    </FieldHeader>
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
          {headerPart}
          {warningPart}
          {translateFromPart}
          {descriptionPart}
          {errorPart}
        </FieldContent>
        {control}
      </Field>
    );
  }

  return (
    <Field className={cn('gap-1.5', className)}>
      {headerPart}
      {control}
      {warningPart}
      {translateFromPart}
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
  /**
   * Whether the form's own save is running, which `controlProps` already
   * carries as `readOnly` for the control. A field drawn as several controls
   * reads it to leave out the ones that would change its Value, since only an
   * input can be read-only on its own. See
   * contributing/renderer/forms.md#a-form-is-read-only-while-it-saves.
   */
  readOnly: boolean;
}

// TTransformedValues is defaulted and never read here: only `control` is used,
// which is typed by TFieldValues alone. Carrying it lets a caller pass its form
// as it is, instead of erasing the generic through a cast.
// See contributing/renderer/forms.md#form-typing.
export interface AppFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues extends FieldValues = TFieldValues,
> extends Omit<FieldShellProps, 'error' | 'children' | 'rules'> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  name: TName;
  /**
   * The field's rules, where its field definition says them. A generated field
   * passes its type's, see `FieldFromDefinition`.
   */
  rules?: FieldRules;
  /**
   * Whether the field has to be filled, for a field no field definition and no
   * Core schema can answer for. It carries no default, so a field says nothing
   * about itself rather than claiming it is optional.
   *
   * It only ever adds Required to what the schema says, never takes it away: a
   * list is the case it exists for, where Core refuses an empty one and zod's
   * public API carries no minimum to read it off.
   */
  required?: boolean;
  /**
   * This field type's words for a refusal Core wrote its own English for, see
   * `FieldFromDefinition`. A hand-written field passes none, and then the
   * message stands as it arrived.
   */
  coreRefusalText?: (refusal: FieldRefusal) => string;
  children: (props: AppFieldRenderProps<TFieldValues, TName>) => ReactNode;
}

/**
 * One field of a form: react-hook-form's `Controller` drawn in the field shell.
 *
 * Nothing else in the app draws a label, a rule, a warning or an error. `name`
 * is typed against the form that is passed in, so a path that does not exist on
 * it is a compile error at the call site.
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
  rules,
  required,
  coreRefusalText,
  children,
  ...shell
}: AppFieldProps<TFieldValues, TName, TTransformedValues>): ReactNode {
  // Claimed whether or not a message is on screen right now, so AppForm's
  // backstop never reports an error this field would show.
  useErrorTarget(name);
  // Whether this form's own save is running, which holds the field read-only
  // until it is through, see forms.md#a-form-is-read-only-while-it-saves.
  const isSaving = useAppFormIsSaving();
  // What this field leaves to the fields inside it, so a field holding sections
  // says nothing for a refusal one of those sections shows.
  const hasDeeperErrorTarget = useDeeperErrorTarget();
  // The Core schema this form checks against, so a hand-written field never
  // repeats a limit Core sets. A field definition's own rules win over it,
  // because the schema a generated field is checked by is built from that
  // definition in the first place.
  const schema = useAppFormSchema();
  // What the schema says, which is nothing at all for a path it cannot follow,
  // and then the caller's own answer on top of it where it passed one. A list
  // is why the two are composed rather than ordered: its bounds come off the
  // schema while Required cannot, see `alsoRequired`.
  const fromSchema =
    fieldRulesFromSchema(schema, name) ?? fieldRules({ required: false });
  const shownRules =
    rules ?? (required === true ? alsoRequired(fromSchema) : fromSchema);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldErrorText(
          fieldErrorMessage(fieldState.error, name, (path) =>
            hasDeeperErrorTarget(path, name)
          ),
          field.value,
          coreRefusalText
        );

        return (
          <FieldShell
            {...shell}
            rules={shownRules}
            {...(error === undefined ? {} : { error })}
          >
            {(controlProps): ReactNode =>
              children({
                field,
                controlProps: isSaving
                  ? { ...controlProps, readOnly: true }
                  : controlProps,
                disabled: field.disabled === true,
                readOnly: isSaving,
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
  /** Why the form cannot be saved yet, or `undefined` while it can be. */
  blockedBy: string | undefined;
  /** The id of the line that says it, which Save points at. */
  blockedById: string | undefined;
}

const FormActionsContext = createContext<FormActionsContextValue | null>(null);

export interface AppFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  onSubmit: SubmitHandler<TTransformedValues>;
  /**
   * The Core schema this form checks against, the same one its resolver was
   * built from. Every field inside reads its own rules off it, so a limit Core
   * sets is never written out again in a form. A form whose fields are
   * generated from field definitions passes none, since each of those fields
   * takes its rules from its definition.
   */
  schema?: unknown;
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
  /**
   * Why this form cannot be saved yet, such as a required Value a language is
   * still missing. While it is set, the submit is ignored, so Enter in a field
   * saves nothing either and nothing reaches Core.
   *
   * The same reason goes to the `FormActions` that holds this form's Save,
   * which is what puts it on screen below the button. Both are given it,
   * because the button sits outside the form's own subtree, see
   * [Save's block](../../../../contributing/renderer/forms.md#saves-block).
   */
  blockedBy?: string | undefined;
  /**
   * The page's own title, which turns the leave guard on and names it in the
   * question: "Discard your changes to <title>?". A form that passes none asks
   * nothing, which every form but a page form does.
   */
  unsavedChangesTitle?: string | undefined;
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
 * handleSubmit wiring, the id a detached SubmitButton associates with, the
 * view-only mode, a blocked submit and the guard that asks before unsaved
 * changes are lost. See contributing/renderer/forms.md.
 */
export function AppForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  onSubmit,
  schema,
  id,
  mode = 'edit',
  blockedBy,
  unsavedChangesTitle,
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
  // Which of the paths above is between a field and one of its own messages. A
  // target at `name` itself is not one, since a translatable field and the same
  // language inside its dialog claim one path and both show its message.
  const hasDeeperErrorTarget = useCallback(
    (path: string, name: string): boolean =>
      [...errorTargets.current.keys()].some(
        (target) =>
          target !== name &&
          isAtOrBelow(target, name) &&
          isAtOrBelow(path, target)
      ),
    []
  );
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

  // Whether this form holds something nobody saved. A form fills from its query
  // through `values`, which does not dirty it, so this is what somebody typed,
  // see loading-and-updating-data.md.
  const { isDirty } = useFormState({ control: form.control });
  // Whether the submit that is running right now is this form's own. A ref
  // rather than `formState.isSubmitting`, because the navigation a submit ends
  // in happens inside the awaited handler, before React has rendered the new
  // state, and the guard below is read at that moment.
  const isSubmittingRef = useRef(false);
  // Whether this form's own save is running, which holds every field it draws
  // read-only. The form's own state rather than `formState.isSubmitting`,
  // because the `reset()` a submit handler calls at its end clears that one,
  // and the form is filled from what the save brought back after it. See
  // contributing/renderer/forms.md#a-form-is-read-only-while-it-saves.
  const [isSaving, setIsSaving] = useState(false);
  const guardId = useId();
  const unsavedChanges = useUnsavedChanges();
  const isGuarded = unsavedChangesTitle !== undefined && mode === 'edit';

  // What the question before the window closes is about, which only the one
  // place that asks can know, since this form is not the only one on screen.
  useUnsavedChangesClaim(
    guardId,
    isGuarded ? unsavedChangesTitle : undefined,
    isDirty
  );

  // Leaving the page this form is on. The route is compared rather than the
  // whole address, because every push and replace runs the router's blockers,
  // a change of nothing but the search params included, and the language a form
  // edits lives there. `enableBeforeUnload` stays off: closing the window is
  // held in the main process instead, which is the only process that can tell
  // the renderer about it, see src/main/index.ts.
  const leaveGuard = useBlocker({
    disabled: isGuarded === false || isDirty === false,
    enableBeforeUnload: false,
    withResolver: true,
    shouldBlockFn: (navigation) =>
      isLeavingThePage(navigation) && isSubmittingRef.current === false,
  });

  useEffect(() => {
    if (
      leaveGuard.status !== 'blocked' ||
      unsavedChanges === null ||
      unsavedChangesTitle === undefined
    ) {
      return;
    }
    const { proceed, reset } = leaveGuard;
    unsavedChanges.ask({
      title: unsavedChangesTitle,
      onKeepEditing: reset,
      onDiscard: proceed,
    });
  }, [leaveGuard, unsavedChanges, unsavedChangesTitle]);

  const context = useMemo<AppFormContextValue>(
    // The schema is rebuilt each render where it is built from the Project's
    // languages, so this memo only holds while that form is not rendering
    // anyway.
    () => ({
      id: formId,
      mode,
      isSaving,
      schema,
      registerErrorTarget,
      hasDeeperErrorTarget,
    }),
    [formId, mode, isSaving, schema, registerErrorTarget, hasDeeperErrorTarget]
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
    // A blocked form saves nothing, however the submit was raised. Save is
    // `aria-disabled` rather than disabled, so it stays in the tab order and
    // takes a click, and Enter in a field raises a submit of its own, so the
    // one place both arrive is here. See contributing/renderer/forms.md.
    if (mode === 'view' || blockedBy !== undefined) {
      event.preventDefault();
      return;
    }
    setUnsurfacedErrors((previous) => (previous.length === 0 ? previous : []));
    // The navigation this submit may end in is the form's own, so the leave
    // guard lets it through. Set before the submit rather than read off
    // `formState`, which React has not rendered yet by then.
    isSubmittingRef.current = true;
    // The fields are read-only from here until the submit has settled.
    setIsSaving(true);
    // handleSubmit re-throws whatever onSubmit rejected with, after awaiting it.
    // Nothing is left to catch that by then, so hold it and re-throw it during
    // render, where the root error boundary sees it. A CoreError handled in place
    // never gets here, since that recipe catches inside onSubmit.
    void submit(event)
      .catch((error: unknown) => {
        setSubmitError(
          error instanceof Error ? error : new Error(String(error))
        );
      })
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSaving(false);
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
              // One sentence, and nothing of the path it happened at: an
              // internal path says nothing to the person reading it, and the
              // log is where it is of use. See
              // contributing/renderer/forms.md#when-an-error-has-no-field-to-land-on.
              <div
                ref={unsurfacedRef}
                tabIndex={-1}
                role="alert"
                className="m-6 rounded-md border border-destructive p-4 text-sm text-error"
              >
                <Trans>
                  This form can&apos;t be saved, and none of its fields says
                  why. Please report it, so we can fix it.
                </Trans>
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
 * serve here, because that value is drawn as previews rather than as one field,
 * so there is no field shell to hold a message, and a refinement on the array
 * reports several at once while a field shows one.
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
      {/* The message only. The path it sits at is internal, so it belongs in
      the log rather than on screen. */}
      <ul className="list-inside list-disc">
        {messages.map((error) => (
          <li key={error.path} data-slot="form-message">
            {error.message}
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
  /**
   * Why the form cannot be saved yet, in the words the person reads, such as
   * "de is missing 1 Value". It stands below Save on a row of its own, and Save
   * points at it.
   *
   * The same reason goes to the `AppForm`, which is what makes the submit a
   * no-op. Both are given it, because this area sits outside the form's own
   * subtree, see [Save's block](../../../../contributing/renderer/forms.md#saves-block).
   */
  blockedBy?: string | undefined;
  children: ReactNode;
}

/**
 * Wraps the area that holds a form's SubmitButton (a Page header, dialog or
 * sheet footer) and makes the form's reactive gating available to it. It
 * subscribes through `useFormState`, so the enclosed button re-renders when the
 * form dirties or starts submitting.
 *
 * Where the form is blocked it also draws the reason below the button, which is
 * where ci puts what keeps a form from saving.
 */
export function FormActions<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  id,
  blockedBy,
  children,
}: FormActionsProps<TFieldValues, TTransformedValues>): ReactNode {
  const {
    isDirty,
    isSubmitting,
    disabled: isDisabled,
  } = useFormState({ control: form.control });
  const appFormId = useAppFormId();
  const formId = id ?? appFormId ?? undefined;
  const generatedId = useId();
  const blockedById = blockedBy === undefined ? undefined : generatedId;

  return (
    <FormActionsContext
      value={{
        formId,
        isDirty,
        isSubmitting,
        isDisabled,
        blockedBy,
        blockedById,
      }}
    >
      {/* Only a blocked form gains an element of its own, so the row of
      buttons every other form renders here is laid out exactly as before. */}
      {blockedBy === undefined ? (
        children
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          {children}
          <FieldWarning id={blockedById} data-slot="form-blocked-reason">
            {blockedBy}
          </FieldWarning>
        </div>
      )}
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
 * The only submit control. It blocks while the form is submitting, while it is
 * still filling from its query, while the form gave a reason it cannot be
 * saved, and on a pristine form when `requireDirty` is set. All four read the
 * enclosing FormActions.
 *
 * Blocked means `aria-disabled`, not `disabled`: the control keeps its place in
 * the tab order, so it can be reached and read out with the reason it points
 * at, which is what ci draws. The click it then still takes is stopped here,
 * and `AppForm` ignores a blocked submit however else it arrives.
 * See contributing/renderer/forms.md.
 */
export function SubmitButton({
  form,
  requireDirty = false,
  disabled,
  isLoading,
  Icon,
  onClick,
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
  const isBusy = isLoading ?? isSubmitting;
  const isBlocked =
    disabled === true ||
    isBusy ||
    isDisabled ||
    actions?.blockedBy !== undefined ||
    (requireDirty && isDirty === false);

  return (
    // The spread comes first on purpose, so the structural props below it cannot
    // be overridden by a caller.
    <Button
      {...props}
      type="submit"
      form={formId}
      {...(isBlocked ? { 'aria-disabled': true } : {})}
      {...(actions?.blockedById === undefined
        ? {}
        : { 'aria-describedby': actions.blockedById })}
      onClick={(event) => {
        if (isBlocked) {
          // Stops the submit a click on a submit button would raise, without
          // taking the control out of the tab order the way `disabled` would.
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      // The spinner is rendered here rather than through `Button`'s own
      // `isLoading`, which sets the native `disabled` this control must not
      // carry. It is what `Button` draws for a waiting button, hidden from the
      // accessible name the same way.
      {...(isBusy || Icon === undefined ? {} : { Icon })}
    >
      {isBusy ? <Spinner aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}

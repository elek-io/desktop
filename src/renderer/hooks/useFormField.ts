import React from 'react';
import {
  useFormContext,
  useFormState,
  type FieldError,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

export type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

export const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

export type FormItemContextValue = {
  id: string;
};

export const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

/**
 * The error a field's message should render: the one at its own path, or the one
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
function messageError(error: FieldError | undefined): FieldError | undefined {
  if (error === undefined || typeof error.message === 'string') {
    return error;
  }
  return error.root ?? error;
}

export const useFormField = (): {
  invalid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  isValidating: boolean;
  error?: FieldError;
  id: string;
  name: string;
  formItemId: string;
  formDescriptionId: string;
  formMessageId: string;
} => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;
  const error = messageError(fieldState.error);

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
    // Conditional, so an absent error leaves the key off entirely rather than
    // present and undefined, which the declared optional property forbids.
    ...(error === undefined ? {} : { error }),
  };
};

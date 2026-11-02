import { Trans } from '@lingui/react/macro';
import { LanguagesIcon } from 'lucide-react';
import * as React from 'react';
import {
  type ControllerRenderProps,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';

import { AppField } from '@renderer/components/ui/app-form';
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
import {
  TextControl,
  TextareaControl,
  type FieldControlProps,
} from '@renderer/components/ui/field-controls';
import { useErrorTarget } from '@renderer/hooks/useAppFormContext';
import { cn } from '@renderer/lib/utils';

import { type SupportedLanguage } from '@elek-io/core';

// The per-language dialog a translatable field opens today. One switch above a
// whole Entry replaces it, see the redesign of the Entry.
//
// See contributing/renderer/dynamic-form-field-generation.md.

export interface TranslatableFieldProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  field: ControllerRenderProps<TFieldValues>;
  controlProps: FieldControlProps;
  title: string;
  description: string | null;
  supportedLanguages: SupportedLanguage[];
  errors: FieldErrors;
  // The per-language dialog labels use this for their required indicator: string
  // inputs mark every language required, the optional textarea does not.
  dialogItemRequired: boolean;
  // Renders one language's control, given its field and the control-association
  // props to place on the real input. Called for the outer field and once per
  // language inside the dialog.
  renderControl: (
    field: ControllerRenderProps<TFieldValues>,
    controlProps: FieldControlProps
  ) => React.ReactElement;
}

/**
 * The single per-language field wrapper. With one Project language it renders the
 * control directly, with more it adds a dialog that edits every language. It owns
 * the multi-field name convention, where the name's last dot-segment is the
 * current language and the sibling paths derive from it, so the control stays
 * value-typed.
 */
export function TranslatableField<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  field,
  controlProps,
  title,
  description,
  supportedLanguages,
  errors,
  dialogItemRequired,
  renderControl,
}: TranslatableFieldProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
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
    return renderControl(field, controlProps);
  }

  return (
    <div className="flex items-center">
      {renderControl(field, {
        ...controlProps,
        className: cn('rounded-r-none', controlProps.className),
      })}
      <Dialog>
        <DialogTrigger
          render={
            <Button
              variant="secondary"
              className="h-full rounded-l-none"
              aria-invalid={hasErrorsInTranslations()}
              Icon={LanguagesIcon}
            />
          }
        >
          <span className="sr-only">
            <Trans>Edit translations for {title}</Trans>
          </span>
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
              <AppField
                key={language}
                form={form}
                name={`${baseName}.${language}` as Path<TFieldValues>}
                label={language}
                required={dialogItemRequired}
              >
                {({ field: languageField, controlProps: languageProps }) =>
                  renderControl(languageField, languageProps)
                }
              </AppField>
            ))}
          </DialogBody>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              <Trans>Done</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface TranslatableFormInputFieldProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> extends Omit<
  TranslatableFieldProps<TFieldValues, TTransformedValues>,
  'renderControl' | 'dialogItemRequired' | 'description'
> {
  description: string;
  type: React.ComponentProps<'input'>['type'];
}

/**
 * A text control with a per-language translations dialog. Thin preset over
 * TranslatableField for the common single-line string case.
 */
export function TranslatableFormInputField<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  type,
  ...props
}: TranslatableFormInputFieldProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
  return (
    <TranslatableField
      {...props}
      dialogItemRequired
      renderControl={(languageField, languageProps) => (
        <TextControl field={languageField} type={type} {...languageProps} />
      )}
    />
  );
}

export interface TranslatableFormTextareaFieldProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> extends Omit<
  TranslatableFieldProps<TFieldValues, TTransformedValues>,
  'renderControl' | 'dialogItemRequired' | 'description'
> {
  description: string;
}

/**
 * A multi-line text control with a per-language translations dialog. Unlike the
 * input preset, the dialog's per-language labels are not marked required.
 */
export function TranslatableFormTextareaField<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  ...props
}: TranslatableFormTextareaFieldProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
  return (
    <TranslatableField
      {...props}
      dialogItemRequired={false}
      renderControl={(languageField, languageProps) => (
        <TextareaControl field={languageField} {...languageProps} />
      )}
    />
  );
}

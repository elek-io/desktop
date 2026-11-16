import { Trans } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { AppField, AppForm } from '@renderer/components/ui/app-form';
import {
  TextControl,
  TextareaControl,
} from '@renderer/components/ui/field-controls';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from '@renderer/components/ui/input-group';
import { cn } from '@renderer/lib/utils';

interface AssetFormProps<TFieldValues extends FieldValues> {
  assetForm: UseFormReturn<TFieldValues>;
  onFormSubmit: SubmitHandler<TFieldValues>;
  /** The Core schema the caller's form checks against, which its fields read their rules off. */
  schema: unknown;
  /** The path holding the Asset's name on the form that is passed in. */
  nameField: NoInfer<FieldPath<TFieldValues>>;
  /** The path holding the Asset's description on the form that is passed in. */
  descriptionField: NoInfer<FieldPath<TFieldValues>>;
  /**
   * The extension Core stored for this Asset's file, which stands muted at the
   * end of the name field, as ci draws it. An Asset that does not exist yet
   * has none, since Core derives it from the file on the create.
   */
  extension?: string;
  /**
   * Why the form cannot be saved yet, which blocks the submit however it
   * arrives. The caller passes the same reason to the `FormActions` that holds
   * its Save, see contributing/renderer/forms.md#saves-block.
   */
  blockedBy?: string | undefined;
  /**
   * The title the question before leaving names, where this form stands on a
   * page or a pane of its own rather than in a dialog.
   */
  unsavedChangesTitle?: string | undefined;
  /** Classes for the column the fields stand in, which carries their spacing. */
  className?: string;
  /** What stands below the fields, inside the form, such as its Save. */
  children?: ReactNode;
  /**
   * Associates the form with a submit button rendered outside it (in the
   * dialog's `DialogFooter`). The footer button carries `type="submit"` and the
   * same `form={id}`, so it submits this form natively from outside its subtree.
   */
  id?: string;
}

/**
 * Shared form body collecting an Asset's name and description, both of which
 * Core requires.
 *
 * Renders the fields and whatever the caller puts below them, so the Asset's
 * pane and the dialog that adds one ask for the same two things in the same
 * words. Place it in a `DialogBody` with the SubmitButton in a sibling
 * `DialogFooter`, so the body scrolls while the footer stays pinned.
 *
 * Generic over the form values, since the create (`filePath`) and update
 * (`id`/`newFilePath`) shapes diverge and cannot be one union prop. The two
 * paths it edits come in from the caller, where the form type is concrete, so a
 * path the form does not hold is a compile error at the call site rather than an
 * assertion here. See contributing/renderer/forms.md#form-typing.
 */
export function AssetForm<TFieldValues extends FieldValues>({
  assetForm,
  onFormSubmit,
  schema,
  nameField,
  descriptionField,
  extension,
  blockedBy,
  unsavedChangesTitle,
  className,
  children,
  id,
}: AssetFormProps<TFieldValues>): React.JSX.Element {
  return (
    <AppForm
      form={assetForm}
      onSubmit={onFormSubmit}
      schema={schema}
      id={id}
      blockedBy={blockedBy}
      unsavedChangesTitle={unsavedChangesTitle}
    >
      <div className={cn('flex flex-col gap-4', className)}>
        <AppField form={assetForm} name={nameField} label={<Trans>Name</Trans>}>
          {({ field, controlProps }) =>
            extension === undefined ? (
              <TextControl field={field} type="text" {...controlProps} />
            ) : (
              <InputGroup>
                <TextControl
                  field={field}
                  type="text"
                  data-slot="input-group-control"
                  className="flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  {...controlProps}
                />
                {/* The file's extension is Core's rather than anybody's to
                type, so it stands at the end of the field instead of in it. */}
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{`.${extension}`}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            )
          }
        </AppField>

        <AppField
          form={assetForm}
          name={descriptionField}
          label={<Trans>Description</Trans>}
        >
          {({ field, controlProps }) => (
            <TextareaControl field={field} {...controlProps} />
          )}
        </AppField>

        {children}
      </div>
    </AppForm>
  );
}

import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { FieldDefinitionsEditor } from '@renderer/components/forms/field-definitions-editor';
import { AppField, AppForm } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import {
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/translatable-field';

import { type Project } from '@elek-io/core';

// TFieldValues is the schema input (loose), TTransformedValues the schema output
// handleSubmit yields. See contributing/renderer/forms.md#form-typing.
interface ComponentFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
> {
  componentForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  project: Project;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<TTransformedValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
}

/**
 * Shared form body of a Component: its name, slug and description, then its
 * field definitions through the editor a Collection uses too.
 *
 * Generic over the form values, because the create (`projectId`), update
 * (`id`) and view-only shapes diverge and cannot be one union prop. Only the
 * field names are asserted as paths, never the whole form, so the cast
 * guardrail stays intact. See contributing/renderer/forms.md#form-typing.
 */
export function ComponentForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  componentForm,
  project,
  children,
  isViewOnly = false,
  onFormSubmit = () => {},
  id,
}: ComponentFormProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();

  const defaultLanguage = project.settings.language.default;
  const path = (name: string): FieldPath<TFieldValues> =>
    name as FieldPath<TFieldValues>;

  return (
    <AppForm
      form={componentForm}
      onSubmit={onFormSubmit}
      id={id}
      mode={isViewOnly ? 'view' : 'edit'}
    >
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-12 items-start gap-6">
          <AppField
            form={componentForm}
            name={path(`name.${defaultLanguage}`)}
            label={<Trans>Component name</Trans>}
            required
            description={
              <Trans>
                What this group of fields is, in singular, such as
                &quot;Teaser&quot;.
              </Trans>
            }
            className="col-span-12 sm:col-span-6"
          >
            {({ field, controlProps }) => (
              <TranslatableFormInputField
                form={componentForm}
                title={t`Component name`}
                description={t`What this group of fields is, in singular, such as "Teaser".`}
                type="text"
                field={field}
                controlProps={controlProps}
                errors={componentForm.formState.errors}
                supportedLanguages={project.settings.language.supported}
              />
            )}
          </AppField>

          <AppField
            form={componentForm}
            name={path('slug')}
            label={<Trans>Component slug</Trans>}
            required
            description={
              <Trans>
                A lowercase version of the name without special characters. It
                identifies this Component and has to be unique in this Project.
              </Trans>
            }
            className="col-span-12 sm:col-span-6"
          >
            {({ field, controlProps }) => (
              <TextControl field={field} type="text" {...controlProps} />
            )}
          </AppField>

          <AppField
            form={componentForm}
            name={path(`description.${defaultLanguage}`)}
            label={<Trans>Description</Trans>}
            description={
              <Trans>
                Optional. What this Component is used for. Leave every language
                empty for no description, or fill them all.
              </Trans>
            }
            className="col-span-12"
          >
            {({ field, controlProps }) => (
              <TranslatableFormTextareaField
                form={componentForm}
                title={t`Description`}
                description={t`What this Component is used for. Leave every language empty for no description, or fill them all.`}
                field={field}
                controlProps={controlProps}
                errors={componentForm.formState.errors}
                supportedLanguages={project.settings.language.supported}
              />
            )}
          </AppField>
        </div>
      </div>

      <FieldDefinitionsEditor
        form={componentForm}
        project={project}
        owner="component"
        isViewOnly={isViewOnly}
      />
      {children}
    </AppForm>
  );
}

import { type ReactElement } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { FieldDefinitionsEditor } from '@renderer/components/forms/field-definitions-editor';
import { AppForm } from '@renderer/components/ui/app-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/form';

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
          <FormField
            control={componentForm.control}
            name={path(`name.${defaultLanguage}`)}
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-6">
                <FormLabel isRequired>Component name</FormLabel>
                <TranslatableFormInputField
                  title="Component name"
                  description='What this group of fields is, in singular, such as "Teaser".'
                  type="text"
                  field={field}
                  errors={componentForm.formState.errors}
                  supportedLanguages={project.settings.language.supported}
                />
                <FormDescription>
                  What this group of fields is, in singular, such as
                  &quot;Teaser&quot;.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={componentForm.control}
            name={path('slug')}
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-6">
                <FormLabel isRequired>Component slug</FormLabel>
                <FormControl>
                  <FormInputField field={field} type="text" />
                </FormControl>
                <FormDescription>
                  A lowercase version of the name without special characters. It
                  identifies this Component and has to be unique in this
                  Project.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={componentForm.control}
            name={path(`description.${defaultLanguage}`)}
            render={({ field }) => (
              <FormItem className="col-span-12">
                <FormLabel isRequired={false}>Description</FormLabel>
                <TranslatableFormTextareaField
                  title="Description"
                  description="What this Component is used for. Leave every language empty for no description, or fill them all."
                  field={field}
                  errors={componentForm.formState.errors}
                  supportedLanguages={project.settings.language.supported}
                />
                <FormDescription>
                  Optional. What this Component is used for. Leave every
                  language empty for no description, or fill them all.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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

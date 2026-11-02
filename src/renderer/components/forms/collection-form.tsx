import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import {
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { FieldDefinitionsEditor } from '@renderer/components/forms/field-definitions-editor';
import { AppField, AppForm } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/translatable-field';

import {
  type Project,
  type UpdateCollectionProps,
  supportedIconSchema,
} from '@elek-io/core';

/** Every icon Core offers, as the value-to-label map a select needs. */
const iconItems: Record<string, string> = Object.fromEntries(
  supportedIconSchema.options.map((option) => [option, option])
);

interface CollectionFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
> {
  collectionForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
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

export function CollectionForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  collectionForm: genericForm,
  project,
  children,
  isViewOnly = false,
  onFormSubmit = () => {},
  id,
}: CollectionFormProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();

  // The concrete fields use literal paths RHF cannot resolve for a generic T, so
  // view the form as the collection props for those. This is the documented
  // exception to the form-cast guardrail, scoped to the cast line below so the
  // ban stays global for the rest of the file. The field definitions editor
  // needs no such view: it takes the form as it is and asserts only its own
  // field name.
  // @todo Retire it (e.g. a per-mode non-generic component) and drop the suppression.
  const collectionForm =
    // eslint-disable-next-line no-restricted-syntax -- documented whole-form cast
    genericForm as unknown as UseFormReturn<UpdateCollectionProps>;

  return (
    <AppForm
      form={genericForm}
      onSubmit={onFormSubmit}
      id={id}
      mode={isViewOnly ? 'view' : 'edit'}
    >
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-12 items-start gap-6">
          <AppField
            form={collectionForm}
            name="icon"
            label={<Trans>Icon</Trans>}
            required
            className="col-span-12 sm:col-span-2"
          >
            {({ field, controlProps }) => (
              <Select
                items={iconItems}
                onValueChange={field.onChange}
                value={field.value}
                {...controlProps}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedIconSchema.options.map((option) => {
                    return (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </AppField>

          <AppField
            form={collectionForm}
            name={`name.plural.${project.settings.language.default}`}
            label={<Trans>Collection name (Plural)</Trans>}
            required
            description={
              <Trans>
                The name of your new collection. Choose a short name in plural
                that explains the content of the collection - e.g.
                &quot;Blogposts&quot;.
              </Trans>
            }
            className="col-span-12 sm:col-span-5"
          >
            {({ field, controlProps }) => (
              <TranslatableFormInputField
                form={collectionForm}
                title={t`Collection name (Plural)`}
                description={t`The name of your new collection. Choose a short name in plural that explains the content of the collection - e.g. "Blogposts".`}
                type="text"
                field={field}
                controlProps={controlProps}
                errors={collectionForm.formState.errors}
                supportedLanguages={project.settings.language.supported}
              />
            )}
          </AppField>

          <AppField
            form={collectionForm}
            name={`name.singular.${project.settings.language.default}`}
            label={<Trans>Entry name (Singular)</Trans>}
            required
            description={
              <Trans>
                The name of each Entry inside your new Collection. Choose a
                short name in singular - e.g. &quot;Blogpost&quot;.
              </Trans>
            }
            className="col-span-12 sm:col-span-5"
          >
            {({ field, controlProps }) => (
              <TranslatableFormInputField
                form={collectionForm}
                title={t`Entry name (Singular)`}
                description={t`The name of each Entry inside your new Collection. Choose a short name in singular - e.g. "Blogpost".`}
                type="text"
                field={field}
                controlProps={controlProps}
                errors={collectionForm.formState.errors}
                supportedLanguages={project.settings.language.supported}
              />
            )}
          </AppField>

          <AppField
            form={collectionForm}
            name={`description.${project.settings.language.default}`}
            label={<Trans>Description</Trans>}
            required
            description={
              <Trans>
                A description of what this new Collection is used for.
              </Trans>
            }
            className="col-span-12 sm:col-span-12"
          >
            {({ field, controlProps }) => (
              <TranslatableFormTextareaField
                form={collectionForm}
                title={t`Description`}
                description={t`A description of what this new Collection is used for.`}
                field={field}
                controlProps={controlProps}
                errors={collectionForm.formState.errors}
                supportedLanguages={project.settings.language.supported}
              />
            )}
          </AppField>
        </div>

        <AppField
          form={collectionForm}
          name="slug.plural"
          label={<Trans>Collection-Slug</Trans>}
          required
          description={
            <Trans>
              A lowercase version without any special characters of the
              Collection name. It's used to identify this Collection and needs
              to be unique.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="text" {...controlProps} />
          )}
        </AppField>

        <AppField
          form={collectionForm}
          name="slug.singular"
          label={<Trans>Entry-Slug</Trans>}
          required
          description={
            <Trans>
              A lowercase version without any special characters of the Entry's
              name. It's used to identify this Collection's Entries and needs to
              be unique.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="text" {...controlProps} />
          )}
        </AppField>
      </div>

      <FieldDefinitionsEditor
        form={genericForm}
        project={project}
        owner="collection"
        isViewOnly={isViewOnly}
      />
      {children}
    </AppForm>
  );
}

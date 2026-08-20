import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { AppForm } from '@renderer/components/ui/app-form';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import { FormFieldFromDefinition } from '@renderer/components/ui/form';
import { useProject } from '@renderer/hooks/useProject';
import { FieldDefinitionsProvider } from '@renderer/providers/FieldDefinitionsProvider';

import { type FieldDefinitionOrGroup, type Project } from '@elek-io/core';

// The minimal shape an entry form holds for its dynamic Values: a slug-keyed
// record, which is the input shape of the generated entry schemas. Constraining
// to this lets EntryForm address value paths without a Props union.
type EntryFormValues = FieldValues & { values: Record<string, unknown> };

// TFieldValues is the schema input (loose Values), TTransformedValues the schema
// output handleSubmit yields. See contributing/renderer/forms.md#form-typing.
interface EntryFormProps<
  TFieldValues extends EntryFormValues,
  TTransformedValues extends FieldValues,
> {
  entryForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  fieldDefinitions: FieldDefinitionOrGroup[];
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

export function EntryForm<
  TFieldValues extends EntryFormValues,
  TTransformedValues extends FieldValues,
>({
  entryForm,
  fieldDefinitions,
  project,
  children,
  isViewOnly = false,
  onFormSubmit = () => {},
  id,
}: EntryFormProps<TFieldValues, TTransformedValues>): React.JSX.Element {
  const { translateContent } = useProject();
  const defaultLanguage = project.settings.language.default;

  // The path is provably a key of `values` (a Record), but react-hook-form's
  // FieldPath cannot reduce that for an unresolved generic, so assert it once here.
  const valuePath = (slug: string): FieldPath<TFieldValues> =>
    `values.${slug}.content.${defaultLanguage}` as FieldPath<TFieldValues>;

  return (
    <FieldDefinitionsProvider fieldDefinitions={fieldDefinitions}>
      <AppForm
        form={entryForm}
        onSubmit={onFormSubmit}
        id={id}
        mode={isViewOnly ? 'view' : 'edit'}
      >
        <div className="grid grid-cols-12 gap-x-4 gap-y-8 p-6 sm:gap-x-6 xl:gap-x-8">
          {fieldDefinitions.map((fieldDefinition) => {
            // Groups are presentational, render their member fields inside a
            // labeled FieldSet that spans the full width of the form grid.
            if ('isGroup' in fieldDefinition) {
              return (
                <FieldSet key={fieldDefinition.id} className="col-span-12">
                  <FieldLegend>
                    {translateContent({
                      key: 'fieldDefinitionGroup.label',
                      record: fieldDefinition.label,
                    })}
                  </FieldLegend>
                  <FieldGroup className="grid grid-cols-12 gap-x-4 gap-y-8 sm:gap-x-6 xl:gap-x-8">
                    {fieldDefinition.fieldDefinitions.map((member) => (
                      <FormFieldFromDefinition
                        key={member.id}
                        fieldDefinition={member}
                        form={entryForm}
                        name={valuePath(member.slug)}
                        supportedLanguages={project.settings.language.supported}
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              );
            }

            return (
              <FormFieldFromDefinition
                key={fieldDefinition.id}
                fieldDefinition={fieldDefinition}
                form={entryForm}
                name={valuePath(fieldDefinition.slug)}
                supportedLanguages={project.settings.language.supported}
              />
            );
          })}
        </div>
        {children}
      </AppForm>
    </FieldDefinitionsProvider>
  );
}

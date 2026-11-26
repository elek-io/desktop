import { useMemo } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { FieldFromDefinition } from '@renderer/components/fields/field-from-definition';
import { AppForm } from '@renderer/components/ui/app-form';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import { FormLanguageContext } from '@renderer/hooks/useFormLanguage';
import { useProject } from '@renderer/hooks/useProject';
import { FieldDefinitionsProvider } from '@renderer/providers/FieldDefinitionsProvider';

import {
  type FieldDefinitionOrGroup,
  type Project,
  type SupportedLanguage,
} from '@elek-io/core';

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
  /**
   * The language every field of the Entry is bound to, which the switch above
   * them sets for the whole form.
   */
  language: SupportedLanguage;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<TTransformedValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
  /** Why the Entry cannot be saved yet, see `AppForm`. */
  blockedBy?: string | undefined;
  /** The page's title, which turns the leave guard on, see `AppForm`. */
  unsavedChangesTitle?: string | undefined;
}

export function EntryForm<
  TFieldValues extends EntryFormValues,
  TTransformedValues extends FieldValues,
>({
  entryForm,
  fieldDefinitions,
  project,
  language,
  children,
  isViewOnly = false,
  onFormSubmit = () => {},
  id,
  blockedBy,
  unsavedChangesTitle,
}: EntryFormProps<TFieldValues, TTransformedValues>): React.JSX.Element {
  const { translateContent } = useProject();
  const defaultLanguage = project.settings.language.default;
  // Every generated field inside reads the language from here rather than
  // taking it as a prop, so one switch takes the whole Entry into another
  // language, see contributing/renderer/internationalization.md.
  const formLanguage = useMemo(
    () => ({ language, defaultLanguage }),
    [language, defaultLanguage]
  );

  // The path is provably a key of `values` (a Record), but react-hook-form's
  // FieldPath cannot reduce that for an unresolved generic, so assert it once
  // here. It stops at `content`: whether the Value is per-language is the render
  // registry's to know, so FieldFromDefinition appends the language itself.
  const valuePath = (slug: string): FieldPath<TFieldValues> =>
    // A form field's path, which react-hook-form reads.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    `values.${slug}.content` as FieldPath<TFieldValues>;

  return (
    <FormLanguageContext value={formLanguage}>
      <FieldDefinitionsProvider fieldDefinitions={fieldDefinitions}>
        <AppForm
          form={entryForm}
          onSubmit={onFormSubmit}
          id={id}
          mode={isViewOnly ? 'view' : 'edit'}
          blockedBy={blockedBy}
          unsavedChangesTitle={unsavedChangesTitle}
        >
          <div className="@container grid grid-cols-12 gap-x-6 gap-y-4 p-6">
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
                    <FieldGroup className="grid grid-cols-12 gap-x-6 gap-y-4">
                      {fieldDefinition.fieldDefinitions.map((member) => (
                        <FieldFromDefinition
                          key={member.id}
                          fieldDefinition={member}
                          form={entryForm}
                          name={valuePath(member.slug)}
                        />
                      ))}
                    </FieldGroup>
                  </FieldSet>
                );
              }

              return (
                <FieldFromDefinition
                  key={fieldDefinition.id}
                  fieldDefinition={fieldDefinition}
                  form={entryForm}
                  name={valuePath(fieldDefinition.slug)}
                />
              );
            })}
          </div>
          {children}
        </AppForm>
      </FieldDefinitionsProvider>
    </FormLanguageContext>
  );
}

import { arrayMove } from '@dnd-kit/sortable';
import { type ReactElement } from 'react';
import {
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
  useController,
} from 'react-hook-form';

import {
  DraggableComponent,
  SortableFieldArray,
} from '@renderer/components/drag-and-drop';
import { AddFieldSheet } from '@renderer/components/forms/add-field-sheet';
import { PageSection } from '@renderer/components/page-section';
import { AppForm } from '@renderer/components/ui/app-form';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import {
  FormControl,
  FormDescription,
  FormField,
  FormFieldDefinitionPreview,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubtreeMessage,
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useProject } from '@renderer/hooks/useProject';

import {
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type Project,
  type UpdateCollectionProps,
  supportedIconSchema,
} from '@elek-io/core';

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
  const { translateContent } = useProject();
  // The concrete fields use literal paths RHF cannot resolve for a generic T, so
  // view the form as the collection props for those. This is the documented
  // exception to the form-cast guardrail, which eslint.config.mjs exempts.
  // @todo Retire it (e.g. a per-mode non-generic component) and drop the exemption.
  const collectionForm =
    genericForm as unknown as UseFormReturn<UpdateCollectionProps>;

  // The whole fieldDefinitions array is one Controller-bound value, not a
  // useFieldArray, so RHF never walks the recursive union and the definitions keep
  // their real ids. See contributing/renderer/forms.md.
  const { field: fieldDefinitionsField } = useController({
    control: collectionForm.control,
    name: 'fieldDefinitions',
  });
  const definitions: FieldDefinitionOrGroup[] = fieldDefinitionsField.value;

  // Typed edit helpers. Each produces a new array so RHF marks the form dirty.
  // Update and group-nesting helpers do not exist yet, see
  // contributing/not-yet-implemented.md.
  const appendDefinition = (definition: FieldDefinition): void => {
    fieldDefinitionsField.onChange([...definitions, definition]);
  };
  // Removing a definition also scrubs it from every slug field's
  // ofFieldDefinitions. Core's slugSourceReferencesSuperRefinement rejects a
  // source id that no longer exists in the Collection, and a fieldDefinitions[i]
  // error has no control to land on here, so a stale id would silently block
  // every later save with no visible reason.
  const removeDefinition = (id: string): void => {
    const withoutSource = (definition: FieldDefinition): FieldDefinition =>
      definition.fieldType === 'slug' &&
      definition.ofFieldDefinitions.includes(id)
        ? {
            ...definition,
            ofFieldDefinitions: definition.ofFieldDefinitions.filter(
              (sourceId) => sourceId !== id
            ),
          }
        : definition;

    fieldDefinitionsField.onChange(
      definitions
        .filter((definition) => definition.id !== id)
        .map((definition) =>
          'isGroup' in definition
            ? {
                ...definition,
                fieldDefinitions:
                  definition.fieldDefinitions.map(withoutSource),
              }
            : withoutSource(definition)
        )
    );
  };
  const moveDefinition = (activeId: string, overId: string): void => {
    const oldIndex = definitions.findIndex((d) => d.id === activeId);
    const newIndex = definitions.findIndex((d) => d.id === overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    fieldDefinitionsField.onChange(arrayMove(definitions, oldIndex, newIndex));
  };

  return (
    <AppForm
      form={genericForm}
      onSubmit={onFormSubmit}
      id={id}
      mode={isViewOnly ? 'view' : 'edit'}
    >
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-12 items-start gap-6">
          <FormField
            control={collectionForm.control}
            name="icon"
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-2">
                <FormLabel isRequired>Icon</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={collectionForm.control}
            name={`name.plural.${project.settings.language.default}`}
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-5">
                <FormLabel isRequired>Collection name (Plural)</FormLabel>
                <TranslatableFormInputField
                  title="Collection name (Plural)"
                  description='The name of your new collection. Choose a short name in plural that explains the content of the collection - e.g. "Blogposts".'
                  type="text"
                  field={field}
                  errors={collectionForm.formState.errors}
                  supportedLanguages={project.settings.language.supported}
                />
                <FormDescription>
                  The name of your new collection. Choose a short name in plural
                  that explains the content of the collection - e.g.
                  &quot;Blogposts&quot;.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={collectionForm.control}
            name={`name.singular.${project.settings.language.default}`}
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-5">
                <FormLabel isRequired>Entry name (Singular)</FormLabel>
                <TranslatableFormInputField
                  title="Entry name (Singular)"
                  description='The name of each Entry inside your new Collection. Choose a short name in singular - e.g. "Blogpost".'
                  type="text"
                  field={field}
                  errors={collectionForm.formState.errors}
                  supportedLanguages={project.settings.language.supported}
                />
                <FormDescription>
                  The name of each Entry inside your new Collection. Choose a
                  short name in singular - e.g. &quot;Blogpost&quot;.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={collectionForm.control}
            name={`description.${project.settings.language.default}`}
            render={({ field }) => (
              <FormItem className="col-span-12 sm:col-span-12">
                <FormLabel isRequired>Description</FormLabel>
                <TranslatableFormTextareaField
                  title="Description"
                  description="A description of what this new Collection is used for."
                  field={field}
                  errors={collectionForm.formState.errors}
                  supportedLanguages={project.settings.language.supported}
                />
                <FormDescription>
                  A description of what this new Collection is used for.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={collectionForm.control}
          name="slug.plural"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Collection-Slug</FormLabel>
              <FormControl>
                <FormInputField field={field} type="text" />
              </FormControl>
              <FormDescription>
                A lowercase version without any special characters of the
                Collection name. It's used to identify this Collection and needs
                to be unique.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={collectionForm.control}
          name="slug.singular"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Entry-Slug</FormLabel>
              <FormControl>
                <FormInputField field={field} type="text" />
              </FormControl>
              <FormDescription>
                A lowercase version without any special characters of the
                Entry's name. It's used to identify this Collection's Entries
                and needs to be unique.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <PageSection
        title="Define this Collections Fields"
        description="Add Fields to structure the Collections content and define how users interact with those Fields."
        actions={
          isViewOnly ? (
            <></>
          ) : (
            <AddFieldSheet
              project={project}
              fieldDefinitions={definitions}
              onAppend={appendDefinition}
            />
          )
        }
      >
        {/* The definitions render as previews, not as bound fields, so a Core
        refinement that lands on the array or on a definition inside it (a
        duplicate slug, a stale slug source, a language a Field is missing) has no
        FormMessage to land on. Without this, such an error would make Save a
        silent no-op. See contributing/renderer/forms.md. */}
        <FormSubtreeMessage
          form={collectionForm}
          name="fieldDefinitions"
          className="mt-6"
        />

        <div className="mt-6 grid grid-cols-12 gap-6">
          <SortableFieldArray items={definitions} onReorder={moveDefinition}>
            {definitions.map((fieldDefinition) => {
              // Groups are presentational. Authoring them is not supported yet,
              // so members are shown read-only as a preview.
              if ('isGroup' in fieldDefinition) {
                return (
                  <DraggableComponent
                    key={fieldDefinition.id}
                    id={fieldDefinition.id}
                  >
                    <FieldSet className="col-span-12">
                      <FieldLegend>
                        {translateContent({
                          key: 'fieldDefinitionGroup.label',
                          record: fieldDefinition.label,
                        })}
                      </FieldLegend>
                      <FieldGroup className="grid grid-cols-12 gap-6">
                        {fieldDefinition.fieldDefinitions.map((member) => (
                          <FormFieldDefinitionPreview
                            key={member.id}
                            fieldDefinition={member}
                          />
                        ))}
                      </FieldGroup>
                    </FieldSet>
                  </DraggableComponent>
                );
              }

              return (
                <DraggableComponent
                  key={fieldDefinition.id}
                  id={fieldDefinition.id}
                >
                  <FormFieldDefinitionPreview
                    fieldDefinition={fieldDefinition}
                    isDraggable={isViewOnly === false}
                    isEditable={isViewOnly === false}
                    onDelete={
                      isViewOnly
                        ? undefined
                        : () => removeDefinition(fieldDefinition.id)
                    }
                  />
                </DraggableComponent>
              );
            })}
          </SortableFieldArray>
        </div>
      </PageSection>
      {children}
    </AppForm>
  );
}

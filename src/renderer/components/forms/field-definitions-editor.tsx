import { arrayMove } from '@dnd-kit/sortable';
import { type ReactElement } from 'react';
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import {
  DraggableComponent,
  SortableFieldArray,
} from '@renderer/components/drag-and-drop';
import { AddFieldSheet } from '@renderer/components/forms/add-field-sheet';
import { type FieldDefinitionsOwner } from '@renderer/components/forms/default-field-definition-form';
import { PageSection } from '@renderer/components/page-section';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
import {
  FormFieldDefinitionPreview,
  FormSubtreeMessage,
} from '@renderer/components/ui/form';
import { useProject } from '@renderer/hooks/useProject';

import {
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type Project,
} from '@elek-io/core';

// TFieldValues is the schema input (the stored definitions), TTransformedValues
// the schema output handleSubmit yields. Both are carried so a caller's form is
// assignable as it is, and neither is constrained to a shape holding
// `fieldDefinitions`: a generated Core schema's input type for that array is not
// `FieldDefinitionOrGroup[]` itself, so such a constraint would reject every
// real caller. See contributing/renderer/forms.md#form-typing.
interface FieldDefinitionsEditorProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  project: Project;
  owner: FieldDefinitionsOwner;
  isViewOnly?: boolean;
}

/**
 * The one field definitions editor. A Collection's and a Component's fields are
 * authored here, so the Add Field sheet, the previews, the reordering and the
 * typed edit helpers exist once rather than per object type.
 *
 * The form it is given has to hold the definitions under `fieldDefinitions`,
 * which both Collection and Component schemas do. A Collection's are a
 * `FieldDefinitionOrGroup[]` and a Component's a flat `FieldDefinition[]`, and
 * the wider of the two covers both: nothing here ever appends a group, because
 * groups cannot be authored at all (see contributing/not-yet-implemented.md).
 *
 * The whole array is one `Controller`-bound value, not a `useFieldArray`, so
 * react-hook-form never walks the recursive union and the definitions keep
 * their real ids. See contributing/renderer/forms.md.
 */
export function FieldDefinitionsEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  project,
  owner,
  isViewOnly = false,
}: FieldDefinitionsEditorProps<
  TFieldValues,
  TTransformedValues
>): ReactElement {
  const { translateContent } = useProject();
  // Every form this serves holds the array under this key, but FieldPath cannot
  // resolve a literal path for an unresolved generic, so the name is asserted
  // once here. Casting the name rather than the whole form is the documented
  // way out, as AssetForm does. See contributing/renderer/forms.md#form-typing.
  const name = 'fieldDefinitions' as FieldPath<TFieldValues>;
  const { field: fieldDefinitionsField } = useController({
    control: form.control,
    name,
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
  // every later save with no visible reason. A Component holds no slug field at
  // all (Core forbids one), so there it finds nothing to scrub.
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
  // Dragging is not the only way to reorder, as WCAG 2.1.1 and 2.5.7 ask. Both
  // buttons go through the same helper, so there is one move path either way.
  const moveDefinitionBy = (index: number, offset: number): void => {
    const target = definitions[index + offset];
    const current = definitions[index];
    if (target === undefined || current === undefined) {
      return;
    }
    moveDefinition(current.id, target.id);
  };

  const subject =
    owner === 'collection'
      ? 'every Entry of this Collection'
      : 'every section built from this Component';

  return (
    <PageSection
      title={
        owner === 'collection'
          ? "Define this Collection's Fields"
          : "Define this Component's Fields"
      }
      description={`Add Fields to say what ${subject} holds. Changing a Field after it was added is not possible yet, so check its Label and Slug first.`}
      actions={
        isViewOnly ? (
          <></>
        ) : (
          <AddFieldSheet
            project={project}
            owner={owner}
            fieldDefinitions={definitions}
            onAppend={appendDefinition}
          />
        )
      }
    >
      {/* The definitions render as previews, not as bound fields, so a Core
      refinement that lands on the array or on a definition inside it (a
      duplicate slug, a stale slug source, a language a field is missing) has no
      FormMessage to land on. Without this, such an error would make Save a
      silent no-op. See contributing/renderer/forms.md. */}
      <FormSubtreeMessage form={form} name={name} className="mt-6" />

      <div className="mt-6 grid grid-cols-12 gap-6">
        <SortableFieldArray items={definitions} onReorder={moveDefinition}>
          {definitions.map((fieldDefinition, index) => {
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
                  onMoveUp={
                    isViewOnly === false && index > 0
                      ? () => moveDefinitionBy(index, -1)
                      : undefined
                  }
                  onMoveDown={
                    isViewOnly === false && index < definitions.length - 1
                      ? () => moveDefinitionBy(index, 1)
                      : undefined
                  }
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
  );
}

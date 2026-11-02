import { arrayMove } from '@dnd-kit/sortable';
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactElement } from 'react';
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
import { fieldModule } from '@renderer/components/fields';
import { FieldDefinitionPreview } from '@renderer/components/fields/field-from-definition';
import { AddFieldSheet } from '@renderer/components/forms/add-field-sheet';
import { type FieldDefinitionsOwner } from '@renderer/components/forms/default-field-definition-form';
import { PageSection } from '@renderer/components/page-section';
import { FieldSubtreeError } from '@renderer/components/ui/app-form';
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from '@renderer/components/ui/field';
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
  const { t } = useLingui();

  const { translateContent } = useProject();
  // Which definition's allowed Components are being grown, by its own id. The
  // sheet is mounted for that one definition rather than one per preview, so
  // only one is ever live.
  const [growingDefinitionId, setGrowingDefinitionId] = useState<string | null>(
    null
  );
  // Every form this serves holds the array under this key, but FieldPath cannot
  // resolve a literal path for an unresolved generic, so the name is asserted
  // once here. Casting the name rather than the whole form is the documented
  // way out, as CollectionForm does. See
  // contributing/renderer/forms.md#form-typing.
  const name = 'fieldDefinitions' as FieldPath<TFieldValues>;
  const { field: fieldDefinitionsField } = useController({
    control: form.control,
    name,
  });
  const definitions: FieldDefinitionOrGroup[] = fieldDefinitionsField.value;

  // Typed edit helpers. Each produces a new array so RHF marks the form dirty.
  // Group-nesting helpers do not exist yet, see
  // contributing/not-yet-implemented.md.
  const appendDefinition = (definition: FieldDefinition): void => {
    fieldDefinitionsField.onChange([...definitions, definition]);
  };
  // Puts a definition back in place of the one with the same id, which is how
  // the only editable part of a definition is saved. A definition inside a
  // group is not reached: a group's members are previews with no edit control,
  // since groups cannot be authored at all.
  const replaceDefinition = (definition: FieldDefinition): void => {
    fieldDefinitionsField.onChange(
      definitions.map((candidate) =>
        'isGroup' in candidate || candidate.id !== definition.id
          ? candidate
          : definition
      )
    );
  };
  // Removing a definition also asks every other definition to forget it, which
  // only a slug field has to do. Each type's folder answers that, so this never
  // reads a field type.
  const removeDefinition = (id: string): void => {
    const withoutSource = (definition: FieldDefinition): FieldDefinition =>
      fieldModule(definition).withoutDefinition?.(definition, id) ?? definition;

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

  // The definition the sheet is open on. Read out of the array each render, so
  // the sheet sees the ids and the allowed Components the array holds now.
  const growing = definitions.find(
    (definition): definition is FieldDefinition =>
      'isGroup' in definition === false && definition.id === growingDefinitionId
  );
  // Which definitions can be edited after they exist is each type's own answer:
  // a type whose folder carries a sheet is offered the control, every other one
  // is offered none rather than a disabled one.
  const editSheetOf = (
    definition: FieldDefinition
  ):
    | ((props: {
        onChange: (changed: FieldDefinition) => void;
        onClose: () => void;
      }) => ReactElement)
    | undefined => {
    const EditSheet = fieldModule(definition).EditSheet;
    if (EditSheet === undefined) {
      return undefined;
    }
    return ({ onChange, onClose }) => (
      <EditSheet
        fieldDefinition={definition}
        onChange={onChange}
        onClose={onClose}
      />
    );
  };

  return (
    <PageSection
      title={
        owner === 'collection'
          ? t`Define this Collection's Fields`
          : t`Define this Component's Fields`
      }
      // One sentence per owner rather than a phrase dropped into one, since a
      // phrase that carries grammar cannot be translated on its own.
      description={
        owner === 'collection'
          ? t`Add Fields to say what every Entry of this Collection holds. A dynamic Field can allow more Components later. Nothing else about a Field can be changed after it was added, so check its Label and Slug first.`
          : t`Add Fields to say what every section built from this Component holds. A dynamic Field can allow more Components later. Nothing else about a Field can be changed after it was added, so check its Label and Slug first.`
      }
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
      AppField to land on. Without this, such an error would make Save a
      silent no-op. See contributing/renderer/forms.md. */}
      <FieldSubtreeError form={form} name={name} className="mt-6" />

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
                        <FieldDefinitionPreview
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
                <FieldDefinitionPreview
                  fieldDefinition={fieldDefinition}
                  isDraggable={isViewOnly === false}
                  // A type whose folder carries an edit sheet is the only one
                  // offered an edit control at all.
                  onEdit={
                    isViewOnly === false &&
                    editSheetOf(fieldDefinition) !== undefined
                      ? () => setGrowingDefinitionId(fieldDefinition.id)
                      : undefined
                  }
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

      {/* Keyed by the definition, so the sheet's form is seeded from the one it
      was opened on rather than from whichever was opened first. */}
      {growing === undefined
        ? null
        : editSheetOf(growing)?.({
            onChange: (definition) => {
              replaceDefinition(definition);
              setGrowingDefinitionId(null);
            },
            onClose: () => setGrowingDefinitionId(null),
          })}
    </PageSection>
  );
}

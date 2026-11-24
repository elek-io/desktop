import { useEffect, useState } from 'react';
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { fieldModule } from '@renderer/components/fields';
import { type FieldDefinitionsOwner } from '@renderer/components/fields/module';
import { useListFocus, type ListFocus } from '@renderer/hooks/useListFocus';

import {
  uuid,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type FieldType,
  type SupportedLanguage,
} from '@elek-io/core';

// The field definitions of a Collection or a Component, as the one form the
// page is saved from holds them, with the helpers that edit them and which of
// them is open.
//
// The whole array is one `Controller`-bound value rather than a
// `useFieldArray`, so react-hook-form never walks Core's recursive union and
// every definition keeps the id Core matches it by. Each helper writes a new
// array, which is what dirties the page and draws the preview again.
//
// See contributing/renderer/forms.md#a-collections-settings.

/** What the pane beside the fields is showing. */
type OpenPane =
  | { kind: 'none' }
  /** The field types, to add one. */
  | { kind: 'types' }
  /** The settings of the definition with this id. */
  | { kind: 'field'; id: string };

export interface DefinitionsEditorState {
  /** The definitions the form holds right now. */
  list: FieldDefinitionOrGroup[];
  /** The definition whose settings are open, if any. */
  chosen: FieldDefinition | undefined;
  /** Where that definition sits on the form, such as `fieldDefinitions.2`. */
  chosenPrefix: string;
  /** Whether the pane is offering the field types. */
  isAddingField: boolean;
  /** Opens the settings of one definition. */
  choose: (id: string) => void;
  /** Offers the field types, to add one. */
  addField: () => void;
  /** Closes the pane. */
  close: () => void;
  /** Adds a field of this type and opens its settings. */
  add: (fieldType: FieldType) => void;
  /** Takes the open definition to another type, keeping its id. */
  changeType: (fieldType: FieldType) => void;
  /** Removes one definition, and every reference the others held to it. */
  remove: (id: string) => void;
  /**
   * Where the focus goes once a field is removed, which is the list's own
   * business while the removal is pressed in the pane beside it, see
   * `useListFocus`.
   */
  focus: ListFocus;
  /** Moves one definition one place up or down. */
  moveBy: (id: string, offset: number) => void;
  /** Moves one definition to where another one stands, which dragging does. */
  move: (activeId: string, overId: string) => void;
}

export interface UseDefinitionsEditorProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  owner: FieldDefinitionsOwner;
  supportedLanguages: SupportedLanguage[];
}

export function useDefinitionsEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  owner,
  supportedLanguages,
}: UseDefinitionsEditorProps<
  TFieldValues,
  TTransformedValues
>): DefinitionsEditorState {
  const [pane, setPane] = useState<OpenPane>({ kind: 'none' });
  const focus = useListFocus();
  // Every form this serves holds the array under this key, but FieldPath cannot
  // resolve a literal path for an unresolved generic, so the name is asserted
  // once here, see contributing/renderer/forms.md#form-typing.
  const name = 'fieldDefinitions' as FieldPath<TFieldValues>;
  const { field: bound } = useController({ control: form.control, name });
  // Kept as state and read again on every change at or below the array, rather
  // than off the bound field: a `Controller` is told about its own path, so a
  // write inside the array, which is what a field's settings do, would leave
  // the previews drawing what the array held before. A new array is set each
  // time, since the definitions inside it are written in place.
  const [list, setList] = useState<FieldDefinitionOrGroup[]>(() => [
    ...(form.getValues(name) ?? []),
  ]);

  useEffect(() => {
    const keep = (): void => {
      setList([...(form.getValues(name) ?? [])]);
    };

    // Read here as well as on every change, because the stored definitions
    // land from a read of their own, which no change follows.
    keep();
    return form.subscribe({
      name,
      formState: { values: true },
      callback: keep,
    });
  }, [form, name]);
  const write = (next: FieldDefinitionOrGroup[]): void => {
    bound.onChange(next);
  };
  // A group's members are previews with no settings of their own, since a group
  // cannot be authored at all, see contributing/not-yet-implemented.md.
  const index = list.findIndex(
    (candidate) => pane.kind === 'field' && candidate.id === pane.id
  );
  const found = index === -1 ? undefined : list[index];
  const chosen = found === undefined || 'isGroup' in found ? undefined : found;
  // A path, which nobody reads as words.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const chosenPrefix = `fieldDefinitions.${String(index)}`;

  const replace = (definition: FieldDefinition): void => {
    write(
      list.map((candidate) =>
        'isGroup' in candidate || candidate.id !== definition.id
          ? candidate
          : definition
      )
    );
  };

  const add = (fieldType: FieldType): void => {
    const definition = fieldModule({ fieldType }).newDefinition({
      id: uuid(),
      supportedLanguages,
    });
    write([...list, definition]);
    setPane({ kind: 'field', id: definition.id });
  };

  const changeType = (fieldType: FieldType): void => {
    if (chosen === undefined) {
      return;
    }
    const module = fieldModule({ fieldType });
    // The id is what Core matches a definition by, so the field keeps the
    // Values every Entry holds for it and the change is a type change rather
    // than a removal and an addition.
    const next = module.newDefinition({
      id: chosen.id,
      supportedLanguages,
    });
    // Everything every definition holds is kept, so a type change changes the
    // type and nothing else. Core takes `isDisabled` on every type, so it
    // needs no answer from the type the field becomes.
    replace({
      ...next,
      slug: chosen.slug,
      label: chosen.label,
      description: chosen.description,
      inputWidth: chosen.inputWidth,
      isDisabled: chosen.isDisabled,
    });
    // Required and Unique are carried over only where the new type leaves
    // either a choice, since Core pins both on a type that has none. They are
    // written by path rather than onto the definition, so a type whose schema
    // pins one is never handed the other field's answer.
    if (module.requiredNote?.(next) == null) {
      form.setValue(
        `${chosenPrefix}.isRequired` as FieldPath<TFieldValues>,
        chosen.isRequired as never,
        { shouldDirty: true }
      );
    }
    if (owner === 'collection' && module.uniquenessNote?.(next) == null) {
      form.setValue(
        `${chosenPrefix}.isUnique` as FieldPath<TFieldValues>,
        chosen.isUnique as never,
        { shouldDirty: true }
      );
    }
  };

  // Removing a definition also asks every other definition to forget it, which
  // only a slug field has to do. Each type's folder answers that, so this never
  // reads a field type.
  //
  // The focus goes to the field that takes the removed one's place, else the
  // one before it, else Add field. The menu it was pressed in returns the
  // focus once it has closed, so the place is kept for it.
  const remove = (id: string): void => {
    const withoutSource = (definition: FieldDefinition): FieldDefinition =>
      fieldModule(definition).withoutDefinition?.(definition, id) ?? definition;
    const staying = list.filter((definition) => definition.id !== id);

    focus.afterRemovalOnceClosed(
      list.findIndex((definition) => definition.id === id),
      staying.map((definition) => definition.id)
    );
    write(
      staying.map((definition) =>
        'isGroup' in definition
          ? {
              ...definition,
              fieldDefinitions: definition.fieldDefinitions.map(withoutSource),
            }
          : withoutSource(definition)
      )
    );
    setPane((open) =>
      open.kind === 'field' && open.id === id ? { kind: 'none' } : open
    );
  };

  const move = (activeId: string, overId: string): void => {
    const from = list.findIndex((candidate) => candidate.id === activeId);
    const to = list.findIndex((candidate) => candidate.id === overId);
    if (from === -1 || to === -1 || from === to) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(to, 0, moved);
    write(next);
  };

  // Dragging is not the only way to reorder, as WCAG 2.1.1 and 2.5.7 ask. Both
  // ways go through the same helper, so there is one move path either way.
  const moveBy = (id: string, offset: number): void => {
    const from = list.findIndex((candidate) => candidate.id === id);
    const target = list[from + offset];
    if (from === -1 || target === undefined) {
      return;
    }
    move(id, target.id);
  };

  return {
    list,
    chosen,
    chosenPrefix,
    isAddingField: pane.kind === 'types',
    choose: (id) => setPane({ kind: 'field', id }),
    addField: () => setPane({ kind: 'types' }),
    close: () => setPane({ kind: 'none' }),
    add,
    changeType,
    remove,
    focus,
    moveBy,
    move,
  };
}

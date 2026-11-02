import type { ReactElement, ReactNode } from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import type { FieldControlProps } from '@renderer/components/ui/field-controls';

import type {
  FieldDefinition,
  FieldDefinitionOrGroup,
  FieldType,
  SupportedLanguage,
} from '@elek-io/core';

// What Desktop knows about one field type, and nothing else. Each type's own
// folder next to this file implements it once, and `index.ts` assembles them
// into the registry everything else asks.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/** The field definition of one field type, narrowed out of Core's union. */
export type DefinitionOf<T extends FieldType> = Extract<
  FieldDefinition,
  { fieldType: T }
>;

/**
 * The props a type's control receives. It is value-typed: it is handed the
 * already-bound `field` and owns no form path, so one control serves a
 * hand-written form and a generated one alike.
 */
export interface FieldTypeControlProps<
  T extends FieldType,
  TFieldValues extends FieldValues,
> {
  field: ControllerRenderProps<TFieldValues>;
  fieldDefinition: DefinitionOf<T>;
  disabled: boolean;
  /** The id and `aria-*` to place on the real focusable element. */
  controlProps: FieldControlProps;
}

/** What one Value contributes to a row of the list of Entries. */
export interface FieldTypeListCellProps<T extends FieldType> {
  /** The Value's content, which is a per-language record for every type but `dynamic`. */
  content: unknown;
  fieldDefinition: DefinitionOf<T>;
  /** The language the list shows, which is the Project's default. */
  language: SupportedLanguage;
  /** Formats a date in the user's locale, with a date-fns pattern. */
  formatInUserLocale: (date: Date, pattern: string) => string;
}

/** The authoring form for a new field definition of one type. */
export interface FieldTypeDefinitionDraftProps {
  id: string;
  existingSlugs: string[];
  /** The Collection's or Component's current definitions, with their real ids. */
  fieldDefinitions: FieldDefinitionOrGroup[];
  supportedLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
  owner: FieldDefinitionsOwner;
  onAdd: (definition: FieldDefinition) => void;
}

/**
 * Which object holds the field definitions being authored. A Collection and a
 * Component share the authoring layer, and the owner decides the restrictions
 * Core puts on a Component's fields.
 */
export type FieldDefinitionsOwner = 'collection' | 'component';

/** The sheet that edits a definition of this type after it was added. */
export interface FieldTypeEditSheetProps<T extends FieldType> {
  fieldDefinition: DefinitionOf<T>;
  onChange: (definition: DefinitionOf<T>) => void;
  onClose: () => void;
}

/**
 * Everything Desktop knows about one field type.
 *
 * `T` is the field type, so every member sees its own narrowed field
 * definition and no member checks the type again.
 */
export interface FieldTypeModule<T extends FieldType> {
  /**
   * Whether the Value is per-language. Core stores every value type except
   * `component` as a record per language, see Core's docs/fields.md.
   */
  translatable: boolean;
  /**
   * Whether the control's role accepts `aria-required`, which stands in for
   * the native `required` no field emits. Where it does not, the field conveys
   * required through its label.
   */
  acceptsAriaRequired: boolean;
  /** The control, with this type's Value contract. */
  Control: <TFieldValues extends FieldValues>(
    props: FieldTypeControlProps<T, TFieldValues>
  ) => ReactNode;
  /** The Value's content for a new Entry. */
  defaultContent: (
    fieldDefinition: DefinitionOf<T>,
    supportedLanguages: SupportedLanguage[]
  ) => unknown;
  /**
   * The static content the Collection's preview shows. The preview only shows
   * the shape of a control, so it holds no real Value.
   */
  previewContent: (fieldDefinition: DefinitionOf<T>) => unknown;
  /**
   * What one row of the list of Entries shows for this Value, or `undefined`
   * for an empty cell.
   */
  listCell: (props: FieldTypeListCellProps<T>) => unknown;
  /**
   * This Value's text where an Entry is named by one of its Values, or `null`
   * where the type names no Entry. See `entryTitle` in `entry-title.ts`.
   */
  titleText: (props: {
    content: unknown;
    language: SupportedLanguage;
  }) => string | null;
  /**
   * The authoring form for a new definition of this type. A type Core defines
   * but the client cannot author yet leaves it off, which is what the Add Field
   * picker reads to offer the type as unavailable.
   */
  DefinitionDraft?: (props: FieldTypeDefinitionDraftProps) => ReactElement;
  /**
   * Core forbids a field of this type inside a Component, so the Add Field
   * picker never offers it there.
   */
  forbiddenInComponent?: boolean;
  /**
   * The Components a definition of this type allows as a section. Only the
   * `dynamic` type embeds Components, so every other module leaves this off.
   */
  allowedComponentIds?: (
    fieldDefinition: DefinitionOf<T>,
    everyComponentId: string[]
  ) => string[];
  /**
   * Rewrites a definition after another definition of the same object was
   * removed. Only `slug` points at sibling definitions, so every other module
   * leaves this off.
   */
  withoutDefinition?: (
    fieldDefinition: DefinitionOf<T>,
    removedDefinitionId: string
  ) => DefinitionOf<T>;
  /**
   * The sheet that edits a definition of this type after it exists. Only a
   * `dynamic` field can be edited, so every other module leaves this off and
   * is offered no edit control at all.
   */
  EditSheet?: (props: FieldTypeEditSheetProps<T>) => ReactElement;
}

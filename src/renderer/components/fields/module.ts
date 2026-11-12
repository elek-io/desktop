import type { ReactElement, ReactNode } from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

import type { FieldControlProps } from '@renderer/components/ui/field-controls';
import type { FieldRules } from '@renderer/lib/fieldRules';

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
  /**
   * The field's label as text, which the shell draws above the control.
   *
   * A control whose element takes no name from a `<label>` says it itself: a
   * group of radio buttons, a combobox, the markdown editor's editable element
   * and each button of a picker. It is the language dialog's own label inside
   * that dialog, so a control there is named after the language it edits.
   */
  label: string;
}

/** What one Value reads as where it is shown rather than edited. */
export interface FieldTypeRenderValueProps<T extends FieldType> {
  /** The Value's content, which is a per-language record for every type but `dynamic`. */
  content: unknown;
  fieldDefinition: DefinitionOf<T>;
  /** The language to read, such as the Project's default. */
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
   * the native `required` no field emits.
   *
   * Where it does not, the word stands in the rules beside the label, which the
   * control names in `aria-describedby`, so it is still read out with the
   * control, and the buttons of a picker say it in their accessible name as
   * well, since a button carries no rule of its own either. A type that always
   * holds a Value says nothing either way, since it shows no rule at all: a
   * toggle and a range are the two, and neither can be left empty.
   */
  acceptsAriaRequired: boolean;
  /**
   * What a field of this type says about itself at the top right of its label,
   * such as "Required, up to 200 characters".
   *
   * Every rule comes off the field definition, so a limit Core keeps there is
   * never written out a second time. A type that can never be empty says
   * nothing, see `alwaysFilledFieldRules`.
   */
  rules: (fieldDefinition: DefinitionOf<T>) => FieldRules;
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
   * Whether one language's content of this Value holds nothing, which is what
   * Core refuses a required field for.
   *
   * A type picks its contract in `empty-values.ts`, and markdown's calls
   * Core's own check. It is handed one language's content for every type but
   * `dynamic`, whose Value is one flat list, and it runs without a validator,
   * so the answer is cheap on every change. See
   * contributing/renderer/forms.md#a-missing-value-and-saves-block.
   */
  isEmpty: (content: unknown) => boolean;
  /**
   * This Value in one language as text, or `null` where the type shows none.
   *
   * It is what stands below a field whose Value is missing in the language on
   * screen, as the Value to translate from, so a type that can never be
   * missing answers `null`.
   */
  renderValue: (props: FieldTypeRenderValueProps<T>) => string | null;
  /**
   * This Value's text where an Entry is named by one of its Values, or `null`
   * where the type names no Entry. See `entryTitle` in `entry-title.ts`.
   */
  titleText: (props: {
    content: unknown;
    language: SupportedLanguage;
  }) => string | null;
  /**
   * This type's words for a refusal Core wrote its own English for, or `null`
   * for one it does not know.
   *
   * zod lets a message that arrives with an issue outrank every error map, so
   * Core's own refusals are the one thing `lib/refusedValueText.ts` cannot
   * reach. They are matched by their text, because Core gives them no code of
   * their own, and a refusal no module knows gets one sentence of its own
   * rather than Core's English.
   *
   * A type whose refusals Core words only through zod leaves this off.
   */
  coreRefusalText?: (props: {
    /** Core's own English, which is never shown. */
    message: string;
    fieldDefinition: DefinitionOf<T>;
    /** The content that was refused, in the language on screen. */
    content: unknown;
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

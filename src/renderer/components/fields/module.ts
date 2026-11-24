import type { MessageDescriptor } from '@lingui/core';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
  UseFormReturn,
} from 'react-hook-form';

import type { z } from 'zod';

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
   * and each button of a picker.
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

/**
 * Which object holds the field definitions being edited. A Collection and a
 * Component share the whole editor, and the owner decides the two restrictions
 * Core puts on a Component's fields: which field types it may hold at all, and
 * that none of its fields can be unique.
 */
export type FieldDefinitionsOwner = 'collection' | 'component';

/**
 * Which of ci's groups a field type is offered in, in the pane that adds a
 * field. The order of the groups themselves is in `index.ts`.
 */
export type FieldTypeGroup =
  'text' | 'numbers' | 'choices' | 'temporal' | 'contact' | 'links';

/**
 * One field definition with its Default Value widened, for naming paths on it.
 *
 * A markdown field's Default Value is Core's recursive mdast tree, which
 * react-hook-form's path type cannot walk, and no field's settings bind a path
 * inside a Default Value, so the tree is left out of the paths.
 */
type WithWidenedDefault<D> = D extends unknown
  ? Omit<D, 'defaultValue'> & { defaultValue?: unknown }
  : never;

/** A key of one field definition of this type, as a form path names it. */
export type DefinitionKey<T extends FieldType> = FieldPath<
  WithWidenedDefault<DefinitionOf<T>>
>;

/**
 * One field definition bound to the one form the page saves.
 *
 * A field's settings are that type's own editor, drawn into the form the whole
 * page is saved from rather than a form of its own, so the page has one Save
 * and one unsaved state. `path` is the one place a path on that form is
 * asserted, which is what lets a type's editor name its own keys and have them
 * checked against its own definition type. See
 * contributing/renderer/forms.md#a-collections-settings.
 */
export interface DefinitionBinding<
  T extends FieldType,
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  /** The form the page is saved from. */
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** This definition as that form holds it right now. */
  fieldDefinition: DefinitionOf<T>;
  /** Where one of this definition's own keys sits on that form. */
  path: (key: DefinitionKey<T>) => FieldPath<TFieldValues>;
  /**
   * Writes one of this definition's own keys back, which dirties the page and
   * draws the preview again.
   */
  set: (key: DefinitionKey<T>, value: unknown) => void;
  /** Which object holds the definition. */
  owner: FieldDefinitionsOwner;
  /**
   * Every definition of the same object, with their real ids, as the form
   * holds them. Only a slug field reads them, to offer the fields a slug can
   * be written from.
   */
  siblings: FieldDefinitionOrGroup[];
  /** The Project's languages, for a key that holds one text per language. */
  supportedLanguages: SupportedLanguage[];
  /** The language the switch above the page shows. */
  language: SupportedLanguage;
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
   * The icon ci draws for this type in the pane that adds a field, and beside
   * it in the Type picker.
   */
  Icon: LucideIcon;
  /** Which of ci's groups the type is offered in. */
  group: FieldTypeGroup;
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
   * The Core schema one definition of this type is checked against, which the
   * fields of its settings read their own rules off, so no limit Core keeps on
   * a field definition is written out again. It takes the definition, because
   * Core backs one field type with more than one schema where its Value can be
   * of more than one type, as a select's options can.
   */
  definitionSchema: (fieldDefinition: DefinitionOf<T>) => z.ZodType;
  /**
   * A new definition of this type, as choosing the type in the pane adds it.
   *
   * The id comes in rather than being minted here, so changing a field's type
   * keeps the id Core matches the definition by, and with it the Values every
   * Entry holds.
   */
  newDefinition: (props: {
    id: string;
    supportedLanguages: SupportedLanguage[];
  }) => DefinitionOf<T>;
  /**
   * This type's own settings, below the ones every field definition shares.
   *
   * Drawn as a component rather than called as a function, so the hooks a
   * type's own editor needs belong to it and changing a field's type cannot
   * reorder anybody else's.
   */
  DefinitionEditor: <
    TFieldValues extends FieldValues,
    TTransformedValues extends FieldValues = TFieldValues,
  >(
    binding: DefinitionBinding<T, TFieldValues, TTransformedValues>
  ) => ReactNode;
  /**
   * Why Required is fixed for this field, where Core pins it to a literal.
   * A sentence means the control shows a fact and says why, rather than
   * offering a choice nobody has, and a type change keeps the new type's own
   * answer rather than carrying the old field's over.
   *
   * It takes the definition, because a type whose Value can be of more than
   * one type answers per Value type, as a select's options do.
   */
  requiredNote?: (fieldDefinition: DefinitionOf<T>) => MessageDescriptor | null;
  /** Why Unique is fixed for this field, the same way. */
  uniquenessNote?: (
    fieldDefinition: DefinitionOf<T>
  ) => MessageDescriptor | null;
  /**
   * Core forbids a field of this type inside a Component, so the pane of field
   * types never offers it there.
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
}

import { useLingui } from '@lingui/react/macro';
import * as React from 'react';
import type { ReactNode } from 'react';
import {
  useWatch,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { DragHandle } from '@renderer/components/drag-and-drop';
import { fieldModule } from '@renderer/components/fields';
import { isMissingValue } from '@renderer/components/fields/missing-values';
import {
  AppField,
  FieldShell,
  type AppFieldRenderProps,
  type FieldRefusal,
} from '@renderer/components/ui/app-form';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import {
  useAppFormMode,
  useErrorTarget,
} from '@renderer/hooks/useAppFormContext';
import { useFormLanguage } from '@renderer/hooks/useFormLanguage';
import { useProject } from '@renderer/hooks/useProject';
import { unknownRefusalText } from '@renderer/lib/refusedValueText';
import { cn, fieldWidth, languageName } from '@renderer/lib/utils';

import type { FieldDefinition } from '@elek-io/core';

// A field drawn from a field definition, and the non-editable preview of one.
// Both go through the one field shell, so a generated field and a hand-written
// one are the same field.
//
// See contributing/renderer/dynamic-form-field-generation.md.

/**
 * The control-association props the shell minted, with `aria-required` kept
 * only where the control's role allows it.
 *
 * The shell offers it to every required field, since required is one fact
 * about a field. Which roles accept it is the field type's own answer, so its
 * folder says so, and the attribute is dropped rather than set to false, so it
 * never lands on a role that does not allow it at all.
 */
function controlPropsFor(
  fieldDefinition: FieldDefinition,
  controlProps: FieldControlProps
): FieldControlProps {
  if (fieldModule(fieldDefinition).acceptsAriaRequired) {
    return controlProps;
  }

  const { 'aria-required': _dropped, ...allowed } = controlProps;
  return allowed;
}

/**
 * The words for a refusal Core wrote its own English for, from the field type
 * it landed on.
 *
 * Everything zod refuses is worded by the error map
 * `lib/refusedValueText.ts` installs. Core's own refusals carry a message that
 * outranks that map, so the type's folder words them instead, and one sentence
 * stands for a refusal no folder knows. Either way Core's English never
 * reaches the field.
 */
function coreRefusalTextOf(
  fieldDefinition: FieldDefinition,
  refusal: FieldRefusal
): string {
  const module = fieldModule(fieldDefinition);

  return (
    module.coreRefusalText?.({ ...refusal, fieldDefinition }) ??
    unknownRefusalText()
  );
}

// TTransformedValues is defaulted and never read: only `control` and
// `formState.errors` are used, and both are typed by TFieldValues alone.
// Carrying the generic lets a caller pass its form as it is, instead of erasing
// the third generic through a cast. See contributing/renderer/forms.md#form-typing.
export interface FieldFromDefinitionProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  fieldDefinition: FieldDefinition;
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /**
   * The path to the field's `content`, without a language. Which type's Value
   * is per-language is its folder's to know, so the language is appended here
   * rather than at every call site.
   */
  name: FieldPath<TFieldValues>;
  className?: string;
}

/**
 * One field built from a field definition and bound to any path: the label, the
 * control from the type's folder, the description and the error, all in the one
 * field shell.
 *
 * The same field fills an Entry and a section of a dynamic field. The language
 * it edits comes from the switch above the whole form rather than from a dialog
 * of its own, see `useFormLanguage`.
 */
export function FieldFromDefinition<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  fieldDefinition,
  className,
}: FieldFromDefinitionProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
  const { t } = useLingui();
  const { translateContent, formatInUserLocale } = useProject();
  // A view-only form disables its fields through a disabled fieldset, which
  // only turns off native controls, so a control that is not one (the markdown
  // editor's contenteditable) is told here. Every control takes `disabled`, so
  // the mode is folded in once rather than per type.
  const mode = useAppFormMode();
  const { language, defaultLanguage } = useFormLanguage();
  const module = fieldModule(fieldDefinition);
  // A per-language Value is bound one level deeper, at the language the switch
  // above the fields shows. A dynamic field's Value is one flat array, so it
  // binds to `content` itself. FieldPath cannot reduce the appended path for an
  // unresolved generic, so it is asserted here.
  const leafName = module.translatable
    ? (`${name}.${language}` as FieldPath<TFieldValues>)
    : name;
  // The path of the same Value in the Project's default language, which stands
  // below this one while this language is still missing it. A field that cannot
  // be translated from anything points at the path it already draws, so there
  // is no second path to watch for it.
  const translateFromName =
    module.translatable && language !== defaultLanguage
      ? (`${name}.${defaultLanguage}` as FieldPath<TFieldValues>)
      : leafName;
  // Both are watched rather than read once, because whether this field is
  // missing its Value and what it would be translated from both change while
  // somebody types, in this language and in the default one.
  //
  // Each is watched at the one path it is read from, and `exact` keeps a Value
  // below that path out of it. A field holding sections is bound to the list
  // itself, so without that it was handed every Value typed inside any of its
  // sections and drew the whole list again on each of them.
  const leafValue: unknown = useWatch({
    control: form.control,
    name: leafName,
    exact: true,
  });
  const defaultLanguageValue: unknown = useWatch({
    control: form.control,
    name: translateFromName,
    exact: true,
  });
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  const description =
    fieldDefinition.description === null
      ? null
      : translateContent({
          key: 'fieldDefinition.description',
          record: fieldDefinition.description,
        });

  const renderControl = (
    field: ControllerRenderProps<TFieldValues>,
    controlProps: FieldControlProps,
    controlLabel: string
  ): React.ReactElement => (
    <>
      {module.Control({
        field,
        fieldDefinition,
        disabled:
          fieldDefinition.isDisabled ||
          field.disabled === true ||
          mode === 'view',
        controlProps: controlPropsFor(fieldDefinition, controlProps),
        label: controlLabel,
      })}
    </>
  );

  const coreRefusalText = (refusal: FieldRefusal): string =>
    coreRefusalTextOf(fieldDefinition, refusal);

  // Whether this field is one of the Values the language on screen is still
  // missing. It is the one answer the count under Save and the switch above
  // the fields read, asked for this one field, so the three never disagree. It
  // reads the whole Value, so the Value watched above is put back under the
  // language it was bound at where the field holds one per language.
  const isMissing = isMissingValue({
    fieldDefinition,
    content: module.translatable ? { [language]: leafValue } : leafValue,
    language,
    defaultLanguage,
  });
  // What the Value reads as in the Project's default language, so somebody
  // translating has the text they are translating in front of them. It stands
  // only below a Value that is missing, and never below the default language
  // itself, which is what it would be read from.
  const translateFrom =
    isMissing && translateFromName !== leafName
      ? module.renderValue({
          content: { [defaultLanguage]: defaultLanguageValue },
          fieldDefinition,
          language: defaultLanguage,
          formatInUserLocale,
        })
      : null;
  const defaultLanguageName = languageName(defaultLanguage);
  const shownLanguageName = languageName(language);
  // The whole Value is claimed, not only the language on screen, because a
  // refusal in a language this form is not drawing is answered by the mark the
  // switch above the fields puts on that language rather than by the form's
  // backstop for a bug, see
  // contributing/renderer/forms.md#when-an-error-has-no-field-to-land-on.
  useErrorTarget(name);

  return (
    <AppField
      form={form}
      name={leafName}
      label={label}
      rules={module.rules(fieldDefinition)}
      coreRefusalText={coreRefusalText}
      {...(description === null ? {} : { description })}
      {...(isMissing ? { warning: t`Missing in ${shownLanguageName}` } : {})}
      {...(translateFrom === null
        ? {}
        : {
            translateFrom: t`In ${defaultLanguageName}: ${translateFrom}`,
          })}
      className={cn(
        `col-span-12 ${fieldWidth(fieldDefinition.inputWidth)}`,
        className
      )}
    >
      {({ field, controlProps }: AppFieldRenderProps<TFieldValues>) =>
        renderControl(field, controlProps, label)
      }
    </AppField>
  );
}

export interface FieldDefinitionPreviewProps {
  fieldDefinition: FieldDefinition;
  /**
   * Opens this field's settings. Undefined where the fields are read rather
   * than edited, and then the row is not a control at all.
   */
  onChoose?: (() => void) | undefined;
  /** Whether this is the field whose settings the pane beside it shows. */
  isChosen?: boolean;
  /** Whether the chosen field can be dragged to another place. */
  isDraggable?: boolean;
  className?: string;
}

/**
 * One field as editors see it, which is how a Collection's and a Component's
 * settings show the fields they define.
 *
 * It draws the same shell as a real field, with no form behind it: the control
 * holds a static, disabled Value from the type's folder, so there are no
 * phantom form paths and the label still names a real, disabled control.
 *
 * The whole row opens the field's settings, so there is one way in and a
 * pointer hits it wherever it lands. The chosen row takes the muted surface
 * and the bar, as ci draws a chosen row, and keeps the grip for those who drag.
 */
export function FieldDefinitionPreview({
  fieldDefinition,
  onChoose,
  isChosen = false,
  isDraggable = false,
  className,
}: FieldDefinitionPreviewProps): React.ReactElement {
  const { t } = useLingui();
  const { translateContent } = useProject();
  const module = fieldModule(fieldDefinition);
  const label = translateContent({
    key: 'fieldDefinition.label',
    record: fieldDefinition.label,
  });
  const description =
    fieldDefinition.description === null
      ? null
      : translateContent({
          key: 'fieldDefinition.description',
          record: fieldDefinition.description,
        });
  const previewField: ControllerRenderProps<FieldValues> = {
    name: `preview-${fieldDefinition.id}`,
    value: module.previewContent(fieldDefinition),
    onChange: () => {},
    onBlur: () => {},
    ref: () => {},
  };

  return (
    <div
      data-slot="field-definition-preview"
      data-chosen={isChosen}
      className={cn(
        'relative col-span-12 rounded-md',
        fieldWidth(fieldDefinition.inputWidth),
        isChosen
          ? 'bg-muted shadow-[inset_2px_0_0_var(--color-foreground)]'
          : null,
        className
      )}
    >
      {/* The row's own padding keeps the grip's column free whether or not
      this row is the chosen one, so choosing a field moves nothing. */}
      <div className="relative py-2 pr-2 pl-6">
        <FieldShell
          label={label}
          rules={module.rules(fieldDefinition)}
          {...(description === null ? {} : { description })}
        >
          {(controlProps): ReactNode =>
            module.Control({
              field: previewField,
              fieldDefinition,
              disabled: true,
              controlProps: controlPropsFor(fieldDefinition, controlProps),
              label,
            })
          }
        </FieldShell>
        {onChoose === undefined ? null : (
          // The whole row, as one control over the field it shows. Its own
          // name says what it opens, since the field below it is a preview
          // rather than something to fill in here.
          <button
            type="button"
            aria-pressed={isChosen}
            aria-label={t`Settings of the ${label} field`}
            className="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={onChoose}
          />
        )}
      </div>
      {/* Above the row's own control, so dragging the chosen field stays
      possible for whoever prefers it, as ci keeps it. */}
      {isChosen && isDraggable ? (
        <DragHandle
          id={fieldDefinition.id}
          className="absolute top-2.5 left-0.5 z-10 size-5 bg-transparent"
        />
      ) : null}
    </div>
  );
}

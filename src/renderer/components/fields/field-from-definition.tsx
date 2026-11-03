import { Trans } from '@lingui/react/macro';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  TrashIcon,
} from 'lucide-react';
import * as React from 'react';
import type { ReactNode } from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
  UseFormReturn,
} from 'react-hook-form';

import { DragHandle } from '@renderer/components/drag-and-drop';
import { fieldModule } from '@renderer/components/fields';
import {
  AppField,
  FieldShell,
  type AppFieldRenderProps,
  type FieldRefusal,
} from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { ButtonGroup } from '@renderer/components/ui/button-group';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { TranslatableField } from '@renderer/components/ui/translatable-field';
import { useAppFormMode } from '@renderer/hooks/useAppFormContext';
import { useProject } from '@renderer/hooks/useProject';
import { unknownRefusalText } from '@renderer/lib/refusedValueText';
import { cn, fieldWidth } from '@renderer/lib/utils';

import type { FieldDefinition, SupportedLanguage } from '@elek-io/core';

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
   * is per-language is its folder's to know, so the language below is appended
   * here rather than at every call site.
   */
  name: FieldPath<TFieldValues>;
  /** The language being edited, appended to `name` for a per-language Value. */
  language: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  className?: string;
}

/**
 * One field built from a field definition and bound to any path: the label, the
 * control from the type's folder, the description and the error, all in the one
 * field shell.
 *
 * The same field fills an Entry and a section of a dynamic field.
 */
export function FieldFromDefinition<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  language,
  fieldDefinition,
  supportedLanguages,
  className,
}: FieldFromDefinitionProps<
  TFieldValues,
  TTransformedValues
>): React.ReactElement {
  const { translateContent } = useProject();
  // A view-only form disables its fields through a disabled fieldset, which
  // only turns off native controls, so a control that is not one (the markdown
  // editor's contenteditable) is told here. Every control takes `disabled`, so
  // the mode is folded in once rather than per type.
  const mode = useAppFormMode();
  const module = fieldModule(fieldDefinition);
  // A per-language Value is bound one level deeper, at the language being
  // edited, because TranslatableField derives the sibling languages from that
  // last segment. A dynamic field's Value is one flat array, so it binds to
  // `content` itself. FieldPath cannot reduce the appended path for an
  // unresolved generic, so it is asserted here.
  const leafName = module.translatable
    ? (`${name}.${language}` as FieldPath<TFieldValues>)
    : name;
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

  return (
    <AppField
      form={form}
      name={leafName}
      label={label}
      rules={module.rules(fieldDefinition)}
      coreRefusalText={coreRefusalText}
      {...(description === null ? {} : { description })}
      className={cn(
        `col-span-12 ${fieldWidth(fieldDefinition.inputWidth)}`,
        className
      )}
    >
      {({ field, controlProps }: AppFieldRenderProps<TFieldValues>) =>
        module.translatable ? (
          <TranslatableField
            form={form}
            field={field}
            controlProps={controlProps}
            title={label}
            description={description}
            supportedLanguages={supportedLanguages}
            errors={form.formState.errors}
            coreRefusalText={coreRefusalText}
            // The Entry renderer requires every supported language, so the
            // dialog marks each one required.
            dialogItemRequired
            renderControl={renderControl}
          />
        ) : (
          // A non-translatable type (only `dynamic` today) renders straight
          // through its folder, bound to `content` itself, with no language
          // dialog.
          renderControl(field, controlProps, label)
        )
      }
    </AppField>
  );
}

export interface FieldDefinitionPreviewProps {
  fieldDefinition: FieldDefinition;
  isDraggable?: boolean;
  /**
   * Opens the editor for this definition. Undefined where nothing about it can
   * be changed, so no edit control is rendered at all rather than a disabled
   * one that says nothing and no keyboard reaches.
   */
  onEdit?: (() => void) | undefined;
  /**
   * Moves this definition one place up or down. Undefined where that move does
   * not exist, so the button renders disabled rather than vanishing and
   * shifting the rest of the chrome. Reordering by dragging alone would fail
   * WCAG 2.1.1 and 2.5.7, so both exist wherever one does.
   */
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  onDelete?: ((fieldDefinition: FieldDefinition) => void) | undefined;
  className?: string;
}

/**
 * A non-editable preview of a field definition, for the Collection and
 * Component editors.
 *
 * It draws the same shell as a real field, with no form behind it: the control
 * holds a static, disabled Value from the type's folder, so there are no
 * phantom form paths and the label still names a real, disabled control.
 */
export function FieldDefinitionPreview({
  fieldDefinition,
  isDraggable = false,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  className,
}: FieldDefinitionPreviewProps): React.ReactElement {
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
      className={cn(
        `col-span-12 flex items-center gap-2 ${fieldWidth(fieldDefinition.inputWidth)}`,
        className
      )}
    >
      {/* A vertical ButtonGroup, so the stack's rounding and borders follow
      the buttons that are actually there rather than a condition per button. */}
      <ButtonGroup orientation="vertical">
        {isDraggable === true ? (
          <>
            <DragHandle id={fieldDefinition.id} />
            <Button
              Icon={ChevronUpIcon}
              variant="secondary"
              size="icon"
              disabled={onMoveUp === undefined}
              onClick={onMoveUp}
            >
              <span className="sr-only">
                <Trans>Move the {label} field up</Trans>
              </span>
            </Button>
            <Button
              Icon={ChevronDownIcon}
              variant="secondary"
              size="icon"
              disabled={onMoveDown === undefined}
              onClick={onMoveDown}
            >
              <span className="sr-only">
                <Trans>Move the {label} field down</Trans>
              </span>
            </Button>
          </>
        ) : null}
        {onEdit !== undefined ? (
          // A dynamic field is the only one with something to edit: the
          // Components it allows. The name says that rather than "Edit", so
          // pressing it holds no surprise.
          <Button
            Icon={EditIcon}
            variant="secondary"
            size="icon"
            onClick={onEdit}
          >
            <span className="sr-only">
              <Trans>Allow more Components on the {label} field</Trans>
            </span>
          </Button>
        ) : null}
        {onDelete !== undefined ? (
          <Button
            Icon={TrashIcon}
            variant="destructive"
            size="icon"
            onClick={() => onDelete(fieldDefinition)}
          >
            <span className="sr-only">
              <Trans>Remove the {label} field</Trans>
            </span>
          </Button>
        ) : null}
      </ButtonGroup>
      <div className="flex w-full flex-col">
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
      </div>
    </div>
  );
}

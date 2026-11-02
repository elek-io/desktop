import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  Fragment,
  useCallback,
  useEffect,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import {
  useWatch,
  type FieldPath,
  type FieldValues,
  type PathValue,
  type UseFormReturn,
} from 'react-hook-form';

import { AppField } from '@renderer/components/ui/app-form';
import {
  SwitchControl,
  TextControl,
} from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Separator } from '@renderer/components/ui/separator';
import {
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/translatable-field';
import { rawTextFromInput } from '@renderer/lib/fieldValues';

import {
  fieldWidthSchema,
  slug,
  type FieldDefinitionBase,
  type SupportedLanguage,
} from '@elek-io/core';

/**
 * Which object holds the field definitions being authored. A Collection and a
 * Component share this whole authoring layer, and the owner is what decides the
 * two restrictions Core puts on a Component's fields: which field types it may
 * hold at all, and that none of its fields can be unique. Declared here, the
 * lowest file of the layer, so every file above it imports downward.
 */
export type FieldDefinitionsOwner = 'collection' | 'component';

/** The label the Width select shows for the chosen number of columns. */
const fieldWidthItems: Record<string, string> = Object.fromEntries(
  fieldWidthSchema.options.map((option) => [option, `${option} / 12`])
);

/**
 * Why a field of a Component can never be unique, which is Core's rule rather
 * than the field type's: uniqueness is enforced over a Collection's top level
 * fields only. It is the same answer for every type, so it is given here rather
 * than in each type's own folder.
 */
const componentUniquenessNote = msg`Fields of a Component cannot be unique, since the same Component is used in more than one place.`;

interface DefaultFieldDefinitionFormProps<
  T extends FieldValues,
> extends HTMLAttributes<HTMLFormElement> {
  form: UseFormReturn<T>;
  supportedLanguages: SupportedLanguage[];
  currentLanguage: SupportedLanguage;
  /**
   * Why Required is fixed for this field type, if it is. Present means the
   * switch shows a fact rather than offering a choice, and says why.
   */
  requiredNote?: MessageDescriptor | undefined;
  /** Why Unique is fixed for this field type, if it is. */
  typeUniquenessNote?: MessageDescriptor | undefined;
  owner: FieldDefinitionsOwner;
}

function DefaultFieldDefinitionForm<
  T extends FieldDefinitionBase & FieldValues,
>({
  form,
  currentLanguage,
  supportedLanguages,
  children,
  requiredNote,
  typeUniquenessNote,
  owner,
}: DefaultFieldDefinitionFormProps<T>): ReactElement {
  const { t } = useLingui();
  // A Component answers uniqueness for every type at once, so it is read before
  // the type's own reason.
  const uniqueNote =
    owner === 'component'
      ? componentUniquenessNote
      : (typeUniquenessNote ?? null);
  // Every FieldDefinition shares the base fields this component edits, but RHF's
  // FieldPath cannot reduce those literal paths for an unresolved generic T, so
  // assert them once through this helper.
  const base = useCallback(
    (path: string): FieldPath<T> => path as FieldPath<T>,
    []
  );
  const labelValue = useWatch({
    control: form.control,
    name: base(`label.${currentLanguage}`),
  }) as string | null | undefined;
  // Auto-generate the slug from the label until the user edits the slug manually
  useEffect(() => {
    if (form.getFieldState(base('slug')).isDirty === false) {
      form.setValue(
        base('slug'),
        slug(labelValue ?? '') as PathValue<T, FieldPath<T>>
      );
    }
  }, [form, labelValue, base]);

  return (
    <Fragment>
      <AppField
        form={form}
        name={base(`label.${currentLanguage}`)}
        label={<Trans>Label</Trans>}
        required
        description={
          <Trans>
            The label is displayed above the input Field and should indicate
            what the user is supposed to enter. For example &quot;Title&quot;,
            &quot;Date of birth&quot; or &quot;Summary&quot;.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <TranslatableFormInputField
            form={form}
            title={t`Label`}
            description={t`The label is displayed above the input Field and should indicate what the user is supposed to enter. For example "Title", "Date of birth" or "Summary".`}
            type="text"
            field={field}
            controlProps={controlProps}
            errors={form.formState.errors}
            supportedLanguages={supportedLanguages}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={base('slug')}
        label={<Trans>Slug</Trans>}
        required
        description={
          <Trans>
            The technical key this Field&apos;s Values are stored under. It is
            generated from the label until edited manually.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <TextControl
            field={field}
            type="text"
            transform={rawTextFromInput}
            {...controlProps}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={base(`description.${currentLanguage}`)}
        label={<Trans>Description</Trans>}
        description={
          <Trans>
            Optional. Describe what to input into this field. This text is
            displayed under the field to guide users. Leave every language empty
            for no description, or fill them all.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <TranslatableFormTextareaField
            form={form}
            title={t`Description`}
            description={t`Describe what to input into this field. This text will be displayed under the field to guide users.`}
            field={field}
            controlProps={controlProps}
            errors={form.formState.errors}
            supportedLanguages={supportedLanguages}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={base('inputWidth')}
        label={<Trans>Width</Trans>}
        required
        description={<Trans>Defines how wide the input field will be.</Trans>}
      >
        {({ field, controlProps, disabled }) => (
          <Select
            items={fieldWidthItems}
            onValueChange={field.onChange}
            value={field.value}
            disabled={disabled}
          >
            {/* The trigger is the real focusable control, so the
            control-association props land there rather than on the root, which
            forwards none of them. */}
            <SelectTrigger {...controlProps}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldWidthSchema.options.map((option) => {
                return (
                  <SelectItem key={option} value={option}>
                    {option} / 12
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </AppField>

      {children}

      <AppField
        form={form}
        name={base('isRequired')}
        label={<Trans>Required</Trans>}
        required
        orientation="horizontal"
        description={
          <>
            <Trans>
              Required fields need to be filled before an Item of the Collection
              can be created or updated.
            </Trans>
            {requiredNote === undefined ? null : (
              <>
                <Separator className="my-2" />
                <i>{i18n._(requiredNote)}</i>
              </>
            )}
          </>
        }
        className="gap-4 rounded-lg border border-border p-3 shadow-xs"
      >
        {({ field, controlProps, disabled }) => (
          <SwitchControl
            field={field}
            {...controlProps}
            disabled={disabled || requiredNote !== undefined}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={base('isUnique')}
        label={<Trans>Unique</Trans>}
        required
        orientation="horizontal"
        description={
          <>
            <Trans>
              You won&apos;t be able to create an Entry if there is an existing
              Entry with identical content.
            </Trans>
            {uniqueNote === null ? null : (
              <>
                <Separator className="my-2" />
                <i>{i18n._(uniqueNote)}</i>
              </>
            )}
          </>
        }
        className="gap-4 rounded-lg border border-border p-3 shadow-xs"
      >
        {({ field, controlProps, disabled }) => (
          <SwitchControl
            field={field}
            {...controlProps}
            disabled={disabled || uniqueNote !== null}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={base('isDisabled')}
        label={<Trans>Disabled</Trans>}
        required
        orientation="horizontal"
        description={
          <Trans>
            You won&apos;t be able to change the Value if this is active.
          </Trans>
        }
        className="gap-4 rounded-lg border border-border p-3 shadow-xs"
      >
        {({ field, controlProps }) => (
          <SwitchControl field={field} {...controlProps} />
        )}
      </AppField>
    </Fragment>
  );
}
DefaultFieldDefinitionForm.displayName = 'DefaultFieldDefinitionForm';

export { DefaultFieldDefinitionForm };

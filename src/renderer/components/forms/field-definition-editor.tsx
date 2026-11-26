import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import {
  useWatch,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { fieldModule, fieldTypeGroups } from '@renderer/components/fields';
import {
  type DefinitionBinding,
  type FieldDefinitionsOwner,
} from '@renderer/components/fields/module';
import { AppField } from '@renderer/components/ui/app-form';
import {
  CheckboxControl,
  TextareaControl,
  TextControl,
  type FieldControlProps,
} from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@renderer/components/ui/toggle-group';
import {
  FieldSchemaScopeContext,
  type FieldSchemaScopeValue,
} from '@renderer/hooks/useFieldSchemaScope';
import { rawTextFromInput } from '@renderer/lib/fieldValues';

import {
  fieldWidthSchema,
  slug,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type FieldType,
  type SupportedLanguage,
} from '@elek-io/core';

// The settings of one field definition, as ci draws them in the pane beside a
// Collection's or a Component's fields: the parts every definition shares, the
// type's own below them, then Required, Unique and Disabled.
//
// Every field here is bound to the one form the page is saved from, at the path
// the chosen definition sits at, so the page has one Save and one unsaved
// state. See contributing/renderer/forms.md#a-collections-settings.

/**
 * Why a field of a Component can never be unique, which is Core's rule rather
 * than the field type's: uniqueness is enforced over a Collection's top level
 * fields only. It is the same answer for every type, so it is given here rather
 * than in each type's own folder.
 */
const componentUniquenessNote = msg`A Component's fields can't be unique, since one Component is used in more than one place.`;

/** What one width reads as on ci's segmented control. */
function widthWord(width: string): string {
  switch (width) {
    case '12':
      return i18n._(msg`Full`);
    case '6':
      return i18n._(msg`1/2`);
    case '4':
      return i18n._(msg`1/3`);
    default:
      return i18n._(msg`1/4`);
  }
}

/** The Type picker, with ci's groups and each type's icon beside its word. */
function FieldTypeSelect({
  chosen,
  owner,
  onFieldTypeChange,
  controlProps,
  disabled,
}: {
  /** The type the field holds now, which reads as the chosen option. */
  chosen: FieldType;
  owner: FieldDefinitionsOwner;
  onFieldTypeChange: (fieldType: FieldType) => void;
  controlProps: FieldControlProps;
  disabled: boolean;
}): ReactElement {
  // Only the types the object can hold, since Core refuses the rest and an
  // offer it then refuses is no offer.
  const groups = fieldTypeGroups()
    .map((group) => ({
      ...group,
      fieldTypes: group.fieldTypes.filter(
        (candidate) =>
          owner === 'collection' ||
          fieldModule({ fieldType: candidate }).forbiddenInComponent !== true
      ),
    }))
    .filter((group) => group.fieldTypes.length > 0);
  const items = Object.fromEntries(
    groups.flatMap((group) =>
      group.fieldTypes.map((candidate) => [candidate, candidate])
    )
  );
  const ChosenIcon = fieldModule({ fieldType: chosen }).Icon;

  return (
    <Select
      items={items}
      value={chosen}
      disabled={disabled}
      onValueChange={(value) => {
        if (value !== null && value !== chosen) {
          onFieldTypeChange(value);
        }
      }}
    >
      {/* The trigger is the real focusable control, so the control-association
      props land there rather than on the root, which forwards none of them. */}
      <SelectTrigger {...controlProps}>
        <ChosenIcon className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.group}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.fieldTypes.map((candidate) => {
              const Icon = fieldModule({ fieldType: candidate }).Icon;
              return (
                <SelectItem key={candidate} value={candidate}>
                  <Icon className="size-4 text-muted-foreground" />
                  {candidate}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface FieldDefinitionEditorProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  /** The definition being edited, as the form holds it right now. */
  fieldDefinition: FieldDefinition;
  /** Where that definition sits on the form, such as `fieldDefinitions.2`. */
  prefix: string;
  owner: FieldDefinitionsOwner;
  /** Every definition of the same object, which a slug field reads. */
  siblings: FieldDefinitionOrGroup[];
  supportedLanguages: SupportedLanguage[];
  /** The language the switch above the page shows. */
  language: SupportedLanguage;
  /** Takes this field to another type, keeping its id. */
  onFieldTypeChange: (fieldType: FieldType) => void;
}

/**
 * One field definition's settings, filled with what is stored.
 *
 * Every control is an `AppField` bound into the page's own form at
 * `<prefix>.<key>`, so a refusal Core answers the save with lands below the
 * field it is about and the preview beside the pane follows each edit. The
 * type's own schema is put in scope, so each of these fields reads its rules
 * off Core rather than repeating a limit Core sets.
 *
 * See contributing/renderer/forms.md#a-collections-settings.
 */
export function FieldDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  prefix,
  owner,
  siblings,
  supportedLanguages,
  language,
  onFieldTypeChange,
}: FieldDefinitionEditorProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const module = fieldModule(fieldDefinition);
  // The one place a path on the page's form is asserted. A type's own editor
  // names its keys against its own definition type, so a key that type does
  // not hold is a compile error where it is written, see
  // contributing/renderer/forms.md#form-typing.
  const path = (key: string): FieldPath<TFieldValues> =>
    `${prefix}.${key}` as FieldPath<TFieldValues>;
  const set = (key: string, value: unknown): void => {
    form.setValue(
      path(key),
      // This definition's own value, typed against its key where it is
      // written. react-hook-form cannot reduce the value type of a path on an
      // unresolved generic form, so it is handed over as it is.
      value as never,
      { shouldDirty: true, shouldTouch: true }
    );
  };
  // A Component answers uniqueness for every type at once, so it is read before
  // the type's own reason.
  const uniqueNote =
    owner === 'component'
      ? componentUniquenessNote
      : (module.uniquenessNote?.(fieldDefinition) ?? null);
  const requiredNote = module.requiredNote?.(fieldDefinition) ?? null;
  const labelPath = path(`label.${language}`);
  const slugPath = path('slug');
  const labelText = useWatch({ control: form.control, name: labelPath }) as
    string | null | undefined;
  const derivedSlug = slug(labelText ?? '');
  // The slug a label wrote last, or `null` for a field that came with one of
  // its own. The slug follows the label while nobody has written one, which is
  // how a new field gets a key without being asked for one, and stops for good
  // once somebody writes their own.
  const slugFromLabel = useRef<string | null>(
    fieldDefinition.slug === '' ? '' : null
  );

  useEffect(() => {
    if (form.getValues(slugPath) === slugFromLabel.current) {
      slugFromLabel.current = derivedSlug;
      form.setValue(slugPath, derivedSlug as never, { shouldDirty: true });
    }
  }, [form, slugPath, derivedSlug]);

  const binding: DefinitionBinding<
    FieldType,
    TFieldValues,
    TTransformedValues
  > = {
    form,
    fieldDefinition,
    path: (key) => path(key),
    set: (key, value) => set(key, value),
    owner,
    siblings,
    supportedLanguages,
    language,
  };
  const TypeEditor = module.DefinitionEditor;
  // Memoized, so the fields below it do not lose their identity on a keystroke
  // somewhere else on the page.
  const scope = useMemo<FieldSchemaScopeValue>(
    () => ({ schema: module.definitionSchema(fieldDefinition), prefix }),
    [module, fieldDefinition, prefix]
  );

  return (
    // Every field below reads its rules off the schema Core checks one
    // definition of this type against, since the Collection's own schema
    // describes the array as a union it cannot see into.
    <FieldSchemaScopeContext value={scope}>
      <AppField
        form={form}
        name={labelPath}
        label={<Trans>Label</Trans>}
        description={
          <Trans>
            Shown above the input, such as &quot;Date of birth&quot;.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="text" {...controlProps} />
        )}
      </AppField>

      <AppField
        form={form}
        name={path('fieldType')}
        label={<Trans>Type</Trans>}
        description={
          <Trans>
            Changing it checks every Entry&apos;s Value against the new type.
          </Trans>
        }
      >
        {/* Bound to the type it shows, although the change goes through the
        helper that rewrites the whole definition: a refusal Core answers with
        for the type, such as a slug field inside a Component, then stands
        below this field. */}
        {({ controlProps, disabled }) => (
          <FieldTypeSelect
            chosen={fieldDefinition.fieldType}
            owner={owner}
            onFieldTypeChange={onFieldTypeChange}
            controlProps={controlProps}
            disabled={disabled}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={slugPath}
        label={<Trans>Slug</Trans>}
        description={<Trans>The key its Values are stored under.</Trans>}
      >
        {({ field, controlProps }) => (
          <TextControl
            field={field}
            type="text"
            transform={rawTextFromInput}
            className="font-mono"
            {...controlProps}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={path(`description.${language}`)}
        label={<Trans>Description</Trans>}
        description={<Trans>Shown below the input to guide editors.</Trans>}
      >
        {({ field, controlProps }) => (
          <TextareaControl field={field} rows={2} {...controlProps} />
        )}
      </AppField>

      <AppField
        form={form}
        name={path('inputWidth')}
        label={<Trans>Width</Trans>}
        description={
          <Trans>How much of a row it takes, where the row has the room.</Trans>
        }
      >
        {({ field, controlProps, disabled }) => (
          // One segment per width, which is how ci draws a choice of a few.
          <ToggleGroup
            {...controlProps}
            aria-label={t`Width`}
            value={[field.value]}
            disabled={disabled}
            onValueChange={(pressed) => {
              const next = pressed[0];
              if (next !== undefined && next !== field.value) {
                field.onChange(next);
              }
            }}
            spacing={0}
            className="w-fit rounded-md border p-0.5"
          >
            {fieldWidthSchema.options.map((option) => (
              <ToggleGroupItem key={option} value={option} size="xs">
                {widthWord(option)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </AppField>

      <TypeEditor {...binding} />

      <AppField
        form={form}
        name={path('isRequired')}
        label={<Trans>Required</Trans>}
        orientation="horizontal"
        description={
          <>
            <Trans>Editors can&apos;t save an Entry without it.</Trans>
            {requiredNote === null ? null : <> {i18n._(requiredNote)}</>}
          </>
        }
      >
        {({ field, controlProps, disabled }) => (
          <CheckboxControl
            field={field}
            {...controlProps}
            disabled={disabled || requiredNote !== null}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={path('isUnique')}
        label={<Trans>Unique</Trans>}
        orientation="horizontal"
        description={
          <>
            <Trans>No two Entries can hold the same Value in it.</Trans>
            {uniqueNote === null ? null : <> {i18n._(uniqueNote)}</>}
          </>
        }
      >
        {({ field, controlProps, disabled }) => (
          <CheckboxControl
            field={field}
            {...controlProps}
            disabled={disabled || uniqueNote !== null}
          />
        )}
      </AppField>

      <AppField
        form={form}
        name={path('isDisabled')}
        label={<Trans>Disabled</Trans>}
        orientation="horizontal"
        description={
          <Trans>Editors read the Value but can&apos;t change it.</Trans>
        }
      >
        {({ field, controlProps }) => (
          <CheckboxControl field={field} {...controlProps} />
        )}
      </AppField>
    </FieldSchemaScopeContext>
  );
}

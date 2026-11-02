import { type MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import {
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';

import { type FieldTypeDefinitionDraftProps } from '@renderer/components/fields/module';
import { DefaultFieldDefinitionForm } from '@renderer/components/forms/default-field-definition-form';
import { AppField, AppForm } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { withEmptyDescriptionAsNull } from '@renderer/lib/resolver';

import {
  type FieldDefinition,
  type FieldDefinitionBase,
  type SupportedLanguage,
} from '@elek-io/core';

// The shared engine every field-definition authoring form uses: the DefinitionSpec
// contract and the one generic DefinitionDraft that turns a spec into an AppForm.
// Shared draft defaults live in field-definition-defaults.ts.
//
// See contributing/renderer/dynamic-form-field-generation.md.

// Shared authoring controls, generic over the concrete definition type. They take
// the field name as an already-typed FieldPath, so a spec passes a real key with
// no cast.

/**
 * A "Default value" control backed by a text input. Pass the HTML input type
 * the field type's own control uses, which is what makes a numeric default
 * yield a number.
 */
export function DefaultValueInputField<Def extends FieldValues>({
  form,
  name,
  type,
  isRequired = false,
  description,
  placeholder,
}: {
  form: UseFormReturn<Def>;
  name: FieldPath<Def>;
  type: React.ComponentProps<'input'>['type'];
  isRequired?: boolean;
  description?: string;
  placeholder?: string;
}): ReactElement {
  const { t } = useLingui();
  const shown = description ?? t`The initial value for the field.`;

  return (
    <AppField
      form={form}
      name={name}
      label={<Trans>Default value</Trans>}
      required={isRequired}
      description={shown}
    >
      {({ field, controlProps }) => (
        <TextControl
          field={field}
          type={type}
          placeholder={placeholder}
          {...controlProps}
        />
      )}
    </AppField>
  );
}

/** A "Minimum" / "Maximum" pair bound to numeric inputs. `isRequired` flips the
 * labels between the optional bounds (text, number) and the mandatory ones
 * (range). */
export function MinMaxRow<Def extends FieldValues>({
  form,
  minName,
  maxName,
  unit,
  isRequired = false,
}: {
  form: UseFormReturn<Def>;
  minName: FieldPath<Def>;
  maxName: FieldPath<Def>;
  unit: string;
  isRequired?: boolean;
}): ReactElement {
  return (
    <div className="flex flex-row items-center justify-between space-x-2">
      <AppField
        form={form}
        name={minName}
        label={<Trans>Minimum</Trans>}
        required={isRequired}
        description={<Trans>The minimum {unit}.</Trans>}
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="number" {...controlProps} />
        )}
      </AppField>
      <AppField
        form={form}
        name={maxName}
        label={<Trans>Maximum</Trans>}
        required={isRequired}
        description={<Trans>The maximum {unit}.</Trans>}
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="number" {...controlProps} />
        )}
      </AppField>
    </div>
  );
}

/** The context a type's `Extras` receives. Every `Extras` gets all of it and the
 * ones that do not need a field ignore it, so widen this type rather than
 * branching in the shared base. See
 * contributing/renderer/dynamic-form-field-generation.md. */
export interface DefinitionExtrasProps<Def extends FieldValues> {
  form: UseFormReturn<Def>;
  currentLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  // The definitions already added to the Collection, with their real ids. Only
  // slug reads these, to build its source list.
  fieldDefinitions: FieldTypeDefinitionDraftProps['fieldDefinitions'];
}

/**
 * One field type's authoring contract. Each spec binds its own concrete
 * definition type, so field paths inside `Extras` resolve without a cast. See
 * contributing/renderer/dynamic-form-field-generation.md.
 */
export interface DefinitionSpec<Def extends FieldDefinitionBase> {
  // Built with zodResolver where Def is concrete, so DefinitionDraft needs no cast.
  resolver: Resolver<Def>;
  makeDefaults: (supportedLanguages: SupportedLanguage[]) => Def;
  Extras?: (props: DefinitionExtrasProps<Def>) => ReactElement;
  /**
   * Why Required is fixed for this field type, where Core pins it to a literal.
   * Present means the switch shows a fact and says why, rather than offering a
   * choice nobody has.
   */
  requiredNote?: MessageDescriptor;
  /** Why Unique is fixed for this field type, the same way. */
  uniquenessNote?: MessageDescriptor;
}

export type DefinitionDraftProps = FieldTypeDefinitionDraftProps;

/**
 * One authoring form, driven by a single spec. The Add Field sheet remounts it
 * when the picker changes type, so exactly one is live at a time.
 */
export function DefinitionDraft<
  Def extends FieldDefinition & FieldDefinitionBase,
>({
  spec,
  id,
  existingSlugs,
  supportedLanguages,
  defaultLanguage,
  owner,
  onAdd,
  fieldDefinitions,
}: DefinitionDraftProps & { spec: DefinitionSpec<Def> }): ReactElement {
  const { t } = useLingui();
  const form = useAppForm<Def, Def>({
    resolver: withEmptyDescriptionAsNull(spec.resolver),
    // makeDefaults returns a full Def and DefaultValues<Def> is its DeepPartial,
    // but RHF cannot prove the subtype for an unresolved generic Def.
    defaultValues: spec.makeDefaults(supportedLanguages) as DefaultValues<Def>,
  });

  const onSubmit = (definition: Def): void => {
    // Core rejects duplicate slugs when the Collection is saved. Surface it here,
    // where the user can still fix it, as well.
    const slug = definition.slug;
    if (existingSlugs.includes(slug)) {
      form.setError('slug' as FieldPath<Def>, {
        type: 'duplicate',
        message: t`A Field with the slug "${slug}" already exists`,
      });
      return;
    }
    onAdd(definition);
  };

  const Extras = spec.Extras;

  return (
    <AppForm id={id} form={form} onSubmit={onSubmit}>
      <DefaultFieldDefinitionForm
        form={form}
        currentLanguage={defaultLanguage}
        supportedLanguages={supportedLanguages}
        {...(spec.requiredNote === undefined
          ? {}
          : { requiredNote: spec.requiredNote })}
        {...(spec.uniquenessNote === undefined
          ? {}
          : { typeUniquenessNote: spec.uniquenessNote })}
        owner={owner}
      >
        {Extras ? (
          <Extras
            form={form}
            currentLanguage={defaultLanguage}
            supportedLanguages={supportedLanguages}
            fieldDefinitions={fieldDefinitions}
          />
        ) : null}
      </DefaultFieldDefinitionForm>
    </AppForm>
  );
}

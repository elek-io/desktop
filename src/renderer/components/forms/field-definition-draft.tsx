import { type ReactElement } from 'react';
import {
  useForm,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';

import {
  DefaultFieldDefinitionForm,
  type AuthorableFieldType,
} from '@renderer/components/forms/default-field-definition-form';
import { AppForm } from '@renderer/components/ui/app-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';

import {
  type FieldDefinition,
  type FieldDefinitionBase,
  type FieldDefinitionOrGroup,
  type FieldType,
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

/** A "Default value" control backed by FormInputField. Pass the Core field type,
 * not an HTML one: FormInputField does that mapping internally. */
export function DefaultValueInputField<Def extends FieldValues>({
  form,
  name,
  type,
  isRequired = false,
  description = 'The initial value for the field.',
  placeholder,
}: {
  form: UseFormReturn<Def>;
  name: FieldPath<Def>;
  type: FieldType;
  isRequired?: boolean;
  description?: string;
  placeholder?: string;
}): ReactElement {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel isRequired={isRequired}>Default value</FormLabel>
          <FormControl>
            <FormInputField
              field={field}
              type={type}
              placeholder={placeholder}
            />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
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
      <FormField
        control={form.control}
        name={minName}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired={isRequired}>Minimum</FormLabel>
            <FormControl>
              <FormInputField field={field} type="number" />
            </FormControl>
            <FormDescription>The minimum {unit}.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={maxName}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired={isRequired}>Maximum</FormLabel>
            <FormControl>
              <FormInputField field={field} type="number" />
            </FormControl>
            <FormDescription>The maximum {unit}.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
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
  fieldDefinitions: FieldDefinitionOrGroup[];
}

/**
 * One field type's authoring contract. Each spec binds its own concrete
 * definition type, so field paths inside `Extras` resolve without a cast. See
 * contributing/renderer/dynamic-form-field-generation.md.
 */
export interface DefinitionSpec<Def extends FieldDefinitionBase> {
  authorableFieldType: AuthorableFieldType;
  // Built with zodResolver where Def is concrete, so DefinitionDraft needs no cast.
  resolver: Resolver<Def>;
  makeDefaults: (supportedLanguages: SupportedLanguage[]) => Def;
  Extras?: (props: DefinitionExtrasProps<Def>) => ReactElement;
}

export interface DefinitionDraftProps {
  id: string;
  existingSlugs: string[];
  // The Collection's current definitions, threaded to the spec's Extras.
  fieldDefinitions: FieldDefinitionOrGroup[];
  supportedLanguages: SupportedLanguage[];
  defaultLanguage: SupportedLanguage;
  onAdd: (definition: FieldDefinition) => void;
}

/**
 * Wraps a field-definition resolver so an all-blank `description` reaches Core
 * as `null`, its canonical "no description" value.
 *
 * Core makes `description` optional (nullable) but rejects a present-but-empty
 * language, so an empty UI state must be coerced to `null` rather than kept as
 * `{ en: '' }`. The base form seeds every language, which makes Core's member
 * schema force each to be filled once any is (matching Core's all-or-nothing
 * rule), while a wholly blank description means the user wants none. This only
 * normalizes input to Core's own canonical value, it adds no rule of its own,
 * so validation stays entirely Core's.
 */
function withEmptyDescriptionAsNull<Def extends FieldDefinitionBase>(
  resolver: Resolver<Def>
): Resolver<Def> {
  return (values, context, options): ReturnType<Resolver<Def>> => {
    const description = values.description;
    const hasText =
      description !== null &&
      Object.values(description).some(
        (value) => typeof value === 'string' && value.trim() !== ''
      );
    return resolver(
      { ...values, description: hasText ? description : null },
      context,
      options
    );
  };
}

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
  onAdd,
  fieldDefinitions,
}: DefinitionDraftProps & { spec: DefinitionSpec<Def> }): ReactElement {
  const form = useForm<Def, unknown, Def>({
    resolver: withEmptyDescriptionAsNull(spec.resolver),
    // makeDefaults returns a full Def and DefaultValues<Def> is its DeepPartial,
    // but RHF cannot prove the subtype for an unresolved generic Def.
    defaultValues: spec.makeDefaults(supportedLanguages) as DefaultValues<Def>,
  });

  const onSubmit = (definition: Def): void => {
    // Core rejects duplicate slugs when the Collection is saved. Surface it here,
    // where the user can still fix it, as well.
    if (existingSlugs.includes(definition.slug)) {
      form.setError('slug' as FieldPath<Def>, {
        type: 'duplicate',
        message: `A Field with the slug "${definition.slug}" already exists`,
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
        fieldType={spec.authorableFieldType}
        currentLanguage={defaultLanguage}
        supportedLanguages={supportedLanguages}
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

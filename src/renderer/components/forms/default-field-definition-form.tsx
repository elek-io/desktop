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

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  TranslatableFormInputField,
  TranslatableFormTextareaField,
} from '@renderer/components/ui/form';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Separator } from '@renderer/components/ui/separator';
import { Switch } from '@renderer/components/ui/switch';

import {
  fieldWidthSchema,
  slug,
  type FieldDefinitionBase,
  type FieldType,
  type SupportedLanguage,
} from '@elek-io/core';

// The definition-form flavor being authored. Core's 'select' fieldType is backed
// by two schemas (string and number), so the select definition form resolves the
// ambiguous 'select' to the active variant before it reaches this shared base.
export type AuthorableFieldType =
  Exclude<FieldType, 'select'> | 'stringSelect' | 'numberSelect';

/**
 * Field types where Core pins `isRequired` to a literal, so the switch shows a
 * fixed fact instead of offering a choice. Both always carry a value.
 */
const alwaysRequiredFieldTypes: readonly AuthorableFieldType[] = [
  'toggle',
  'range',
];

/**
 * Field types where Core pins `isUnique` to a literal. `slug` is forced true,
 * every other entry is forced false: uniqueness is only meaningful for string
 * values, and Core rejects it on number, reference, component and mdast types.
 */
const fixedUniquenessFieldTypes: readonly AuthorableFieldType[] = [
  'slug',
  'toggle',
  'number',
  'range',
  'numberSelect',
  'asset',
  'entry',
  'dynamic',
  'markdown',
];

/**
 * The reason a type's uniqueness is fixed, shown under the locked switch so the
 * disabled control explains itself rather than looking broken.
 */
function uniquenessNote(fieldType: AuthorableFieldType): string | null {
  switch (fieldType) {
    case 'slug':
      return 'Slugs are always unique, so a single Entry can be identified by it.';
    case 'toggle':
      return 'Toggles cannot be unique, since they can only be checked or unchecked.';
    case 'number':
    case 'range':
    case 'numberSelect':
      return 'Number fields cannot be unique.';
    case 'asset':
    case 'entry':
      return 'Reference fields cannot be unique.';
    case 'dynamic':
      return 'Dynamic fields cannot be unique.';
    case 'markdown':
      return 'Markdown fields cannot be unique.';
    // String types where uniqueness is a real choice, so there is nothing to
    // explain. Listed rather than defaulted so a new Core field type is a lint
    // error here until it is classified.
    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
    case 'ipv4':
    case 'date':
    case 'time':
    case 'datetime':
    case 'telephone':
    case 'stringSelect':
      return null;
  }
}

interface DefaultFieldDefinitionFormProps<
  T extends FieldValues,
> extends HTMLAttributes<HTMLFormElement> {
  form: UseFormReturn<T>;
  supportedLanguages: SupportedLanguage[];
  currentLanguage: SupportedLanguage;
  fieldType: AuthorableFieldType;
}

function DefaultFieldDefinitionForm<
  T extends FieldDefinitionBase & FieldValues,
>({
  form,
  currentLanguage,
  supportedLanguages,
  children,
  fieldType,
}: DefaultFieldDefinitionFormProps<T>): ReactElement {
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
      <FormField
        control={form.control}
        name={base(`label.${currentLanguage}`)}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired>Label</FormLabel>
            <TranslatableFormInputField
              title="Label"
              description='The label is displayed above the input Field and should
                    indicate what the user is supposed to enter. For example
                    "Title", "Date of birth" or
                    "Summary".'
              type="text"
              field={field}
              errors={form.formState.errors}
              supportedLanguages={supportedLanguages}
            />
            <FormDescription>
              The label is displayed above the input Field and should indicate
              what the user is supposed to enter. For example &quot;Title&quot;,
              &quot;Date of birth&quot; or &quot;Summary&quot;.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={base('slug')}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired>Slug</FormLabel>
            <FormControl>
              <Input type="text" {...field} />
            </FormControl>
            <FormDescription>
              The technical key this Field&apos;s Values are stored under. It is
              generated from the label until edited manually.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={base(`description.${currentLanguage}`)}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired={false}>Description</FormLabel>
            <TranslatableFormTextareaField
              title="Description"
              description="Describe what to input into this field. This text will be
              displayed under the field to guide users."
              field={field}
              errors={form.formState.errors}
              supportedLanguages={supportedLanguages}
            />
            <FormDescription>
              Optional. Describe what to input into this field. This text is
              displayed under the field to guide users. Leave every language
              empty for no description, or fill them all.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={base('inputWidth')}
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired>Width</FormLabel>
            <FormControl>
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
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
            </FormControl>
            <FormDescription>
              Defines how wide the input field will be.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {children}

      <FormField
        control={form.control}
        name={base('isRequired')}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700">
            <div className="mr-4">
              <FormLabel isRequired>Required</FormLabel>
              <FormDescription>
                Required fields need to be filled before an Item of the
                Collection can be created or updated.{' '}
                {fieldType === 'toggle' && (
                  <>
                    <Separator className="my-2" />
                    <i>
                      Toggles are always required, since they can only be
                      checked or unchecked.
                    </i>
                  </>
                )}
                {fieldType === 'range' && (
                  <>
                    <Separator className="my-2" />
                    <i>
                      Ranges are always required, since the slider always
                      returns a number.
                    </i>
                  </>
                )}
              </FormDescription>
              <FormMessage />
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={alwaysRequiredFieldTypes.includes(fieldType)}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={base('isUnique')}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700">
            <div className="mr-4">
              <FormLabel isRequired>Unique</FormLabel>
              <FormDescription>
                You won&apos;t be able to create an Entry if there is an
                existing Entry with identical content.
                {uniquenessNote(fieldType) !== null && (
                  <>
                    <Separator className="my-2" />
                    <i>{uniquenessNote(fieldType)}</i>
                  </>
                )}
              </FormDescription>
              <FormMessage />
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={fixedUniquenessFieldTypes.includes(fieldType)}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={base('isDisabled')}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700">
            <div className="mr-4">
              <FormLabel isRequired>Disabled</FormLabel>
              <FormDescription>
                You won&apos;t be able to change the Value if this is active.
              </FormDescription>
              <FormMessage />
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </Fragment>
  );
}
DefaultFieldDefinitionForm.displayName = 'DefaultFieldDefinitionForm';

export { DefaultFieldDefinitionForm };

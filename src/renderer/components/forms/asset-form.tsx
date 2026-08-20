import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { AppForm } from '@renderer/components/ui/app-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormTextareaField,
} from '@renderer/components/ui/form';

interface AssetFormProps<TFieldValues extends FieldValues> {
  assetForm: UseFormReturn<TFieldValues>;
  onFormSubmit: SubmitHandler<TFieldValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the
   * dialog's `DialogFooter`). The footer button carries `type="submit"` and the
   * same `form={id}`, so it submits this form natively from outside its subtree.
   */
  id?: string;
}

/**
 * Shared form body collecting an Asset's `name` and `description`.
 *
 * Renders only the fields, so the surrounding dialog owns the scroll structure.
 * Place it in a `DialogBody` with the SubmitButton in a sibling `DialogFooter`, so
 * the body scrolls while the footer stays pinned.
 *
 * Generic over the form values, since the create (`filePath`) and update
 * (`id`/`newFilePath`) shapes diverge and cannot be one union prop. Both share
 * `name` and `description`, so those field names are asserted as paths.
 */
export function AssetForm<TFieldValues extends FieldValues>({
  assetForm,
  onFormSubmit,
  id,
}: AssetFormProps<TFieldValues>): React.JSX.Element {
  return (
    <AppForm form={assetForm} onSubmit={onFormSubmit} id={id}>
      <div className="grid grid-cols-12 gap-6">
        <FormField
          control={assetForm.control}
          name={'name' as FieldPath<TFieldValues>}
          render={({ field }) => (
            <FormItem className="col-span-12">
              <FormLabel isRequired>Asset name</FormLabel>
              <FormControl>
                <FormInputField field={field} type="text" />
              </FormControl>
              <FormDescription />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={assetForm.control}
          name={'description' as FieldPath<TFieldValues>}
          render={({ field }) => (
            <FormItem className="col-span-12">
              <FormLabel isRequired>Asset description</FormLabel>
              <FormControl>
                <FormTextareaField field={field} />
              </FormControl>
              <FormDescription />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </AppForm>
  );
}

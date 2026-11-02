import { Trans } from '@lingui/react/macro';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { AppField, AppForm } from '@renderer/components/ui/app-form';
import {
  TextControl,
  TextareaControl,
} from '@renderer/components/ui/field-controls';

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
        <AppField
          form={assetForm}
          name={'name' as FieldPath<TFieldValues>}
          label={<Trans>Asset name</Trans>}
          required
          className="col-span-12"
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="text" {...controlProps} />
          )}
        </AppField>

        <AppField
          form={assetForm}
          name={'description' as FieldPath<TFieldValues>}
          label={<Trans>Asset description</Trans>}
          required
          className="col-span-12"
        >
          {({ field, controlProps }) => (
            <TextareaControl field={field} {...controlProps} />
          )}
        </AppField>
      </div>
    </AppForm>
  );
}

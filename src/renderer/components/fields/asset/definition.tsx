import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { type FieldValues } from 'react-hook-form';

import { type DefinitionBinding } from '@renderer/components/fields/module';
import { DefinitionBounds } from '@renderer/components/forms/definition-controls';
import { MimeTypeRows } from '@renderer/components/forms/mime-type-rows';

// The settings of an asset field. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// Its bounds are a count of Assets rather than a length or a number, which is
// why they read differently from a text field's.

/** The settings of an asset field: how many Assets, and of which file types. */
export function AssetDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
}: DefinitionBinding<'asset', TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();

  return (
    <>
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number of Assets editors can choose.</Trans>}
      />
      <MimeTypeRows
        form={form}
        name={path('ofAssetMimeTypes')}
        label={t`File types`}
        description={
          <Trans>
            Editors can only choose an Asset of these types. Every type is
            allowed while this is empty.
          </Trans>
        }
        chosen={fieldDefinition.ofAssetMimeTypes}
        onChange={(mimeTypes) => set('ofAssetMimeTypes', mimeTypes)}
      />
    </>
  );
}

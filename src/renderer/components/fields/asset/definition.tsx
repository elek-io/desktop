import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import { type ReactElement } from 'react';

import { AssetMimeTypePicker } from '@renderer/components/forms/asset-mime-type-picker';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';

import {
  assetFieldDefinitionSchema,
  uuid,
  type AssetFieldDefinition,
} from '@elek-io/core';

// Authoring for the asset field type. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The min/max bounds are nullable int>=1 Asset counts, a different shape from
// the scalar char/number bounds, so they stay inline instead of using MinMaxRow.

function AssetExtras({
  form,
}: DefinitionExtrasProps<AssetFieldDefinition>): ReactElement {
  return (
    <>
      <div className="flex flex-row items-center justify-between space-x-2">
        <AppField
          form={form}
          name="min"
          label={<Trans>Minimum</Trans>}
          description={
            <Trans>
              The minimum number of Assets the user needs to select.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
        <AppField
          form={form}
          name="max"
          label={<Trans>Maximum</Trans>}
          description={
            <Trans>
              The maximum number of Assets the user is able to select.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
      </div>
      <AppField
        form={form}
        name="ofAssetMimeTypes"
        label={<Trans>Restrict to file types</Trans>}
        required
        description={
          <Trans>
            Only Assets of the selected file types can be referenced. If none
            are selected, Assets of any type are available.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <div {...controlProps}>
            <AssetMimeTypePicker
              value={field.value}
              onChange={field.onChange}
            />
          </div>
        )}
      </AppField>
    </>
  );
}

const assetSpec: DefinitionSpec<AssetFieldDefinition> = {
  resolver: zodResolver(assetFieldDefinitionSchema),
  // Reference fields are never unique. An empty ofAssetMimeTypes means any type.
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'reference',
    fieldType: 'asset',
    isUnique: false,
    min: null,
    max: null,
    ofAssetMimeTypes: [],
  }),
  Extras: AssetExtras,
};

/** The asset authoring entry: a DefinitionDraft over the asset spec. */
export function AssetDefinitionDraft(
  props: DefinitionDraftProps
): ReactElement {
  return <DefinitionDraft {...props} spec={assetSpec} />;
}

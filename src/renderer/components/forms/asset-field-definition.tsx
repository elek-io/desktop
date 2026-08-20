import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';

import { AssetMimeTypePicker } from '@renderer/components/forms/asset-mime-type-picker';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { FieldLegend, FieldSet } from '@renderer/components/ui/field';
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
        <FormField
          control={form.control}
          name="min"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Minimum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The minimum number of Assets the user needs to select.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="max"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Maximum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The maximum number of Assets the user is able to select.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="ofAssetMimeTypes"
        render={({ field }) => (
          <FormItem>
            <FieldSet className="gap-2">
              <FieldLegend variant="label" className="mb-0">
                Restrict to file types
              </FieldLegend>
              <FormDescription>
                Only Assets of the selected file types can be referenced. If
                none are selected, Assets of any type are available.
              </FormDescription>
              <AssetMimeTypePicker
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FieldSet>
          </FormItem>
        )}
      />
    </>
  );
}

const assetSpec: DefinitionSpec<AssetFieldDefinition> = {
  authorableFieldType: 'asset',
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

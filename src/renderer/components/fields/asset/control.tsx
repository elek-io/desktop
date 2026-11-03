import { Trans, useLingui } from '@lingui/react/macro';
import { ImageIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import { AssetDisplay } from '@renderer/components/asset-display';
import { AssetPickerDialog } from '@renderer/components/pickers/asset-picker-dialog';
import { Button } from '@renderer/components/ui/button';
import { type FieldControlProps } from '@renderer/components/ui/field-controls';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { cn, formatBytes } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import type {
  Asset,
  AssetFieldDefinition,
  ValueContentReferenceToAsset,
} from '@elek-io/core';

export interface FormAssetFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends FieldControlProps {
  field: ControllerRenderProps<TFieldValues, TName>;
  fieldDefinition: AssetFieldDefinition;
  /** The field's label, which every button of the field names itself with. */
  label: string;
  disabled: boolean;
}

/** Which Asset the picker is open for: another one, or the one it replaces. */
type OpenPicker = { kind: 'choose' } | { kind: 'replace'; assetId: string };

/**
 * The control of an Asset field: a row per chosen Asset with its preview, its
 * name, its type and size, Replace and Remove, then Choose while the field
 * allows another, which is how ci draws it.
 *
 * The field is several controls rather than one, so the control-association
 * props land on their container, and every button inside names the field's
 * rules, its description and its error, so each of them is read out with them.
 * `aria-required` never arrives, since a button's role does not take it: the
 * buttons that fill the field carry the word in their accessible name instead.
 */
export function AssetControl<TFieldValues extends FieldValues>({
  field,
  fieldDefinition,
  label,
  disabled,
  className,
  ...controlProps
}: FormAssetFieldProps<TFieldValues>): React.ReactElement {
  const { t } = useLingui();
  const [openPicker, setOpenPicker] = React.useState<OpenPicker | null>(null);

  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  const chosenRefs: ValueContentReferenceToAsset[] = Array.isArray(field.value)
    ? field.value
    : [];
  // Resolved against the whole list rather than the types the field takes, so
  // an Asset that predates a narrowing still shows instead of vanishing.
  const chosenAssets: Asset[] = isReadingAssets
    ? []
    : chosenRefs
        .map((reference) =>
          assetList.list.find((asset) => asset.id === reference.id)
        )
        .filter((asset): asset is Asset => asset !== undefined);
  const maxReached =
    fieldDefinition.max !== null && chosenRefs.length >= fieldDefinition.max;
  const takesOne = fieldDefinition.max === 1;
  const describedBy = controlProps['aria-describedby'];
  const isInvalid = controlProps['aria-invalid'] === true;
  const required = fieldDefinition.isRequired;
  // What the dialog is called, and what its button is called. Required belongs
  // to the field rather than to the dialog, so only the button says it.
  const chooseTitle = t`Choose ${label}`;
  const replaceTitle = t`Replace ${label}`;
  const chooseName = required ? t`Choose ${label}, Required` : chooseTitle;
  const rowClassName = cn(
    'flex items-center gap-3 rounded-md border p-2',
    isInvalid ? 'border-destructive' : 'border-border'
  );

  function remove(assetId: string): void {
    field.onChange(
      chosenRefs.filter(
        (reference) => reference.id !== assetId
      ) as typeof field.value
    );
  }

  function chosen(assets: Asset[]): void {
    const references = assets.map((asset) => ({
      id: asset.id,
      objectType: 'asset' as const,
    }));

    if (openPicker?.kind === 'replace') {
      const replacement = references[0];
      const replaced = openPicker.assetId;
      field.onChange(
        chosenRefs.map((reference) =>
          reference.id === replaced && replacement !== undefined
            ? replacement
            : reference
        ) as typeof field.value
      );
      return;
    }
    field.onChange(references as typeof field.value);
  }

  const replacedAsset =
    openPicker?.kind === 'replace'
      ? chosenAssets.find((asset) => asset.id === openPicker.assetId)
      : undefined;
  const replacedName = replacedAsset?.name;

  return (
    <div
      {...controlProps}
      className={cn('flex flex-col gap-2', className)}
      ref={field.ref}
      onBlur={field.onBlur}
    >
      {chosenAssets.length === 0 ? (
        <div className={rowClassName}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
            <ImageIcon className="size-4" />
          </span>
          <span className="flex-1 text-sm text-muted-foreground">
            <Trans>No Asset chosen</Trans>
          </span>
        </div>
      ) : (
        chosenAssets.map((asset) => {
          const name = asset.name;
          const type = asset.extension.toUpperCase();
          const size = formatBytes(asset.size);
          // ci names the button after the field where the field holds one
          // Asset, and after the Asset where it holds several, so no two rows
          // of one field read alike.
          const replaceName = takesOne
            ? required
              ? t`Replace ${label}, Required`
              : replaceTitle
            : t`Replace ${name} in ${label}`;

          return (
            <div key={asset.id} className={rowClassName}>
              {/* The preview says the same as the name beside it, so it
              stays out of the row's text. */}
              <span aria-hidden="true" className="shrink-0">
                <AssetDisplay
                  {...asset}
                  static
                  className="size-10 rounded-sm"
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{asset.name}</span>
                <span className="text-small text-muted-foreground">
                  {t`${type}, ${size}`}
                </span>
              </span>
              {disabled ? null : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-describedby={describedBy}
                    aria-label={replaceName}
                    onClick={() =>
                      setOpenPicker({ kind: 'replace', assetId: asset.id })
                    }
                  >
                    <Trans>Replace</Trans>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    Icon={XIcon}
                    aria-describedby={describedBy}
                    aria-label={t`Remove ${name} from ${label}`}
                    onClick={() => remove(asset.id)}
                  />
                </>
              )}
            </div>
          );
        })
      )}

      {/* Choose stands while the field allows another Asset, which is what ci
      draws, so a field that holds its maximum shows its rows alone. */}
      {disabled || maxReached ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          aria-describedby={describedBy}
          aria-label={chooseName}
          onClick={() => setOpenPicker({ kind: 'choose' })}
        >
          <Trans>Choose</Trans>
        </Button>
      )}

      <AssetPickerDialog
        open={openPicker !== null}
        onOpenChange={(open) => {
          if (open === false) {
            setOpenPicker(null);
          }
        }}
        title={replacedAsset === undefined ? chooseTitle : replaceTitle}
        description={
          replacedName === undefined ? (
            <Trans>The Assets this field takes.</Trans>
          ) : (
            t`The one you choose replaces ${replacedName}.`
          )
        }
        ofAssetMimeTypes={fieldDefinition.ofAssetMimeTypes}
        chosenIds={
          openPicker?.kind === 'replace'
            ? [openPicker.assetId]
            : chosenRefs.map((reference) => reference.id)
        }
        max={openPicker?.kind === 'replace' ? 1 : fieldDefinition.max}
        onChoose={chosen}
      />
    </div>
  );
}

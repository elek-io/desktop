import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { ImageIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
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

import { assetKindSentence } from './kind';

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

/** One row of the field: a stored reference, and the Asset it points at. */
type ChosenRow = { id: string; asset: Asset | undefined };

/**
 * The control of an Asset field: a row per chosen Asset with its preview, its
 * name, its type and size, Replace and Remove, then Choose while the field
 * allows another, which is how ci draws it. A reference whose Asset is no
 * longer in the Project keeps its row too, saying so, with Remove.
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
  // A row per stored reference, so what the field draws is what it holds.
  // Resolved against the whole list rather than the types the field takes, so
  // an Asset that predates a narrowing still shows instead of vanishing, and a
  // reference nothing resolves keeps its row and says so, which is the only
  // way somebody can take it out again.
  const chosenRows: ChosenRow[] = isReadingAssets
    ? []
    : chosenRefs.map((reference) => ({
        id: reference.id,
        asset: assetList.list.find((asset) => asset.id === reference.id),
      }));
  const chosenAssets: Asset[] = chosenRows
    .map((row) => row.asset)
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
    'flex w-full items-center gap-3 rounded-lg border p-2',
    isInvalid ? 'border-error' : 'border-border'
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
      const next = chosenRefs.map((reference) =>
        reference.id === replaced && replacement !== undefined
          ? replacement
          : reference
      );
      // A field never holds one Asset twice, so replacing an Asset with one
      // the field already holds leaves one row rather than two of the same.
      field.onChange(
        next.filter(
          (reference, index) =>
            next.findIndex((other) => other.id === reference.id) === index
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

  // The dialog's one line: which Assets the field takes, then how many of them
  // or what the choice replaces, which is how ci words it. How many are chosen
  // is the dialog's own, since that changes while it is open.
  const kindSentence = assetKindSentence(fieldDefinition.ofAssetMimeTypes);
  const maximumSentence =
    fieldDefinition.max === null || takesOne
      ? null
      : t`Up to ${plural(fieldDefinition.max, {
          one: '# Asset',
          other: '# Assets',
        })}.`;
  const describesTheChoice = [
    kindSentence,
    replacedName !== undefined
      ? t`The one you choose replaces ${replacedName}.`
      : (maximumSentence ??
        (kindSentence === null ? t`The Assets this field takes.` : null)),
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return (
    <div
      {...controlProps}
      className={cn('flex flex-col gap-2', className)}
      ref={field.ref}
      onBlur={field.onBlur}
    >
      {chosenRows.length === 0 ? (
        <div className={rowClassName} data-slot="field-row">
          <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
            <ImageIcon className="size-4" />
          </span>
          <span className="flex-1 text-sm text-muted-foreground">
            <Trans>No Asset chosen</Trans>
          </span>
        </div>
      ) : (
        chosenRows.map((row) => {
          const asset = row.asset;

          // A reference the Project no longer holds, which a synchronize can
          // leave behind. Core refuses to save it, so the row says what is
          // wrong and Remove is what repairs it.
          if (asset === undefined) {
            return (
              <div key={row.id} className={rowClassName} data-slot="field-row">
                <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  <Trans>This Asset no longer exists</Trans>
                </span>
                {disabled ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    Icon={XIcon}
                    aria-describedby={describedBy}
                    aria-label={t`Remove the missing Asset from ${label}`}
                    onClick={() => remove(row.id)}
                  />
                )}
              </div>
            );
          }

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
            <div key={asset.id} className={rowClassName} data-slot="field-row">
              {/* The preview says the same as the name beside it, so it
              stays out of the row's text. */}
              <span aria-hidden="true" className="shrink-0">
                <AssetDisplay
                  {...asset}
                  static
                  className="h-10 w-16 rounded-sm object-cover"
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
        description={describesTheChoice}
        ofAssetMimeTypes={fieldDefinition.ofAssetMimeTypes}
        chosenIds={
          openPicker?.kind === 'replace'
            ? [openPicker.assetId]
            : chosenAssets.map((asset) => asset.id)
        }
        max={openPicker?.kind === 'replace' ? 1 : fieldDefinition.max}
        onChoose={chosen}
      />
    </div>
  );
}

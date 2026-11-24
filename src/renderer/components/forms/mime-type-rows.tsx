import { Trans } from '@lingui/react/macro';
import { type ReactElement, type ReactNode } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import {
  DefinitionChoiceRows,
  type DefinitionChoice,
} from '@renderer/components/forms/definition-controls';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

// Core's `ofAssetMimeTypes` as rows with Add and Remove, which the asset field
// and the markdown field both take.
//
// What Add offers are the types the Project's own Assets are, rather than every
// type there is: restricting a field to a type the Project holds no Asset of
// would only leave the editor with an empty picker.

export interface MimeTypeRowsProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
> {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  description: ReactNode;
  chosen: string[];
  onChange: (mimeTypes: string[]) => void;
}

export function MimeTypeRows<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  name,
  label,
  description,
  chosen,
  onChange,
}: MimeTypeRowsProps<TFieldValues, TTransformedValues>): ReactElement {
  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );
  const inProject = isReadingAssets
    ? []
    : [...new Set(assetList.list.map((asset) => asset.mimeType))].sort();
  const row = (mimeType: string): DefinitionChoice => ({
    key: mimeType,
    title: mimeType,
  });

  return (
    <DefinitionChoiceRows
      form={form}
      name={name}
      label={label}
      labelText={label}
      description={description}
      chosen={chosen.map(row)}
      offered={inProject
        .filter((mimeType) => chosen.includes(mimeType) === false)
        .map(row)}
      addLabel={label}
      emptyNote={<Trans>Every file type is allowed.</Trans>}
      nothingToAddNote={
        inProject.length === 0 ? (
          <Trans>
            This Project holds no Asset yet, so there is no file type to choose.
          </Trans>
        ) : undefined
      }
      onAdd={(mimeType) => onChange([...chosen, mimeType])}
      onRemove={(mimeType) =>
        onChange(chosen.filter((candidate) => candidate !== mimeType))
      }
    />
  );
}

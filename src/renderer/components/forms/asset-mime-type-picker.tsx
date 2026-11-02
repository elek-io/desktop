import { type ReactElement } from 'react';

import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

// Shared authoring control for Core's `ofAssetMimeTypes`, used by the asset and
// markdown field definitions. An empty selection means "any type".
//
// The offered types are the distinct MIME types of the Project's own Assets
// rather than a hardcoded universe: restricting to a type the Project has no
// Asset of would only produce an empty picker for the content editor.

interface AssetMimeTypePickerProps {
  value: string[];
  onChange: (mimeTypes: string[]) => void;
  disabled?: boolean;
}

export function AssetMimeTypePicker({
  value,
  onChange,
  disabled,
}: AssetMimeTypePickerProps): ReactElement {
  const { projectId } = useProject();
  const { data: assetList, isPending: isReadingAssets } = useQueryNoError(
    queryOptions.assets.list({ projectId, limit: 0 })
  );

  const availableMimeTypes = isReadingAssets
    ? []
    : [...new Set(assetList.list.map((asset) => asset.mimeType))].sort();

  function toggleMimeType(mimeType: string): void {
    onChange(
      value.includes(mimeType)
        ? value.filter((selected) => selected !== mimeType)
        : [...value, mimeType]
    );
  }

  if (isReadingAssets === true) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => {
          const key = `skeleton-${String(index)}`;
          return <Skeleton key={key} className="h-10" />;
        })}
      </div>
    );
  }

  if (availableMimeTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Assets in this Project yet, so there are no file types to restrict
        to. Every type stays allowed.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {availableMimeTypes.map((mimeType) => (
        <div
          key={mimeType}
          className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
        >
          <span className="mr-4 text-sm font-medium">{mimeType}</span>
          <Switch
            aria-label={mimeType}
            checked={value.includes(mimeType)}
            onCheckedChange={() => toggleMimeType(mimeType)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

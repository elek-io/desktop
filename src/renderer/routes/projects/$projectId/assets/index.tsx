import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

import {
  AssetTeaser,
  AssetTeaserSkeleton,
} from '@renderer/components/asset-teaser';
import { AssetForm } from '@renderer/components/forms/asset-form';
import { Page } from '@renderer/components/page';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { createAssetSchema, type CreateAssetProps } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/assets/')({
  component: ProjectAssetsPage,
});

function ProjectAssetsPage(): React.JSX.Element {
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Assets');
  const { data: assets, isPending: isListingAssets } = useQueryNoError(
    queryOptions.assets.list({
      projectId: projectId,
      limit: 0,
    })
  );
  const { mutateAsync: createAsset } = useMutation(queryOptions.assets.create);
  const [isAddAssetDialogOpen, setIsAddAssetDialogOpen] =
    useState<boolean>(false);
  const addAssetFormId = useId();
  const createAssetForm = useForm<CreateAssetProps>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      name: '',
      description: '',
      projectId: projectId,
      filePath: '',
    },
  });

  function Description(): React.JSX.Element {
    return (
      <>
        An Asset is a file like an image, PDF or other document that can be used
        inside your Collections.
      </>
    );
  }

  function Actions(): React.JSX.Element {
    return (
      <>
        <Button
          variant="default"
          Icon={Plus}
          onClick={async () => onAddAsset()}
        >
          Add Asset
        </Button>
      </>
    );
  }

  async function onAddAsset(): Promise<void> {
    const result = await window.ipc.electron.dialog.showOpenDialog({
      title: 'Select Asset to add',
      buttonLabel: 'Add to Assets',
      properties: ['openFile'],
    });

    if (result.canceled === true) {
      return;
    }

    const filePath = result.filePaths[0];
    if (filePath === undefined) {
      return;
    }

    createAssetForm.reset({
      name: '',
      description: '',
      projectId: projectId,
      filePath: filePath,
    });
    setIsAddAssetDialogOpen(true);
  }

  const onCreateAsset: SubmitHandler<CreateAssetProps> = async (
    asset
  ): Promise<void> => {
    await createAsset(asset);
    setIsAddAssetDialogOpen(false);
  };

  return (
    <>
      <Page
        title="Assets"
        description={<Description />}
        actions={<Actions />}
        layout="bare"
      >
        {isListingAssets ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-5 xl:gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <AssetTeaserSkeleton key={i} />
            ))}
          </div>
        ) : assets.total === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Plus />
              </EmptyMedia>
              <EmptyTitle>No Assets yet</EmptyTitle>
              <EmptyDescription>
                You haven&apos;t added any Assets yet. Get started by adding an
                Asset by clicking the button in the top right corner.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-5 xl:gap-6">
            {assets.list.map((asset) => (
              <AssetTeaser key={asset.id} {...asset} projectId={projectId} />
            ))}
          </div>
        )}
      </Page>

      <Dialog
        open={isAddAssetDialogOpen}
        onOpenChange={setIsAddAssetDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
            <DialogDescription>
              Provide a name and description for this Asset.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <AssetForm
              id={addAssetFormId}
              assetForm={createAssetForm}
              onFormSubmit={onCreateAsset}
            />
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <FormActions form={createAssetForm} id={addAssetFormId}>
              <SubmitButton Icon={Plus}>Add Asset</SubmitButton>
            </FormActions>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

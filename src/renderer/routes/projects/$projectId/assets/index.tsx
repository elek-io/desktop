import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import { createAssetSchema, type CreateAssetProps } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/assets/')({
  component: ProjectAssetsPage,
});

function ProjectAssetsPage(): React.JSX.Element {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Assets`);
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
  const createAssetForm = useAppForm<CreateAssetProps>({
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
      <Trans>
        An Asset is a file like an image, PDF or other document that can be used
        inside your Collections.
      </Trans>
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
          <Trans>Add Asset</Trans>
        </Button>
      </>
    );
  }

  async function onAddAsset(): Promise<void> {
    const result = await window.ipc.electron.dialog.showOpenDialog({
      title: t`Select Asset to add`,
      buttonLabel: t`Add to Assets`,
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
        title={t`Assets`}
        description={<Description />}
        actions={<Actions />}
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
              <EmptyTitle>
                <Trans>No Assets yet</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  You haven&apos;t added any Assets yet. Get started by adding
                  an Asset by clicking the button in the top right corner.
                </Trans>
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
            <DialogTitle>
              <Trans>Add Asset</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Provide a name and description for this Asset.</Trans>
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <AssetForm
              id={addAssetFormId}
              assetForm={createAssetForm}
              nameField="name"
              descriptionField="description"
              onFormSubmit={onCreateAsset}
            />
          </DialogBody>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>
              <Trans>Cancel</Trans>
            </DialogClose>
            <FormActions form={createAssetForm} id={addAssetFormId}>
              <SubmitButton Icon={Plus}>
                <Trans>Add Asset</Trans>
              </SubmitButton>
            </FormActions>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

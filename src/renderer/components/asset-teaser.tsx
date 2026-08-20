import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useMutation } from '@tanstack/react-query';
import {
  DownloadIcon,
  Edit2Icon,
  ExpandIcon,
  ImageIcon,
  Replace,
  TrashIcon,
  X,
} from 'lucide-react';
import { Fragment, useId, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';

import { AssetDisplay } from '@renderer/components/asset-display';
import { AssetForm } from '@renderer/components/forms/asset-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renderer/components/ui/alert-dialog';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { ButtonGroup } from '@renderer/components/ui/button-group';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from '@renderer/components/ui/item';
import { Separator } from '@renderer/components/ui/separator';
import { Skeleton } from '@renderer/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useProject } from '@renderer/hooks/useProject';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { cn, formatBytes } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  updateAssetSchema,
  type Asset,
  type CoreErrorType,
  type UpdateAssetProps,
} from '@elek-io/core';

// Copy for a blocked delete, keyed by CoreError type.
const deleteErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'This Asset is used by one or more Entries and can’t be deleted. Remove or repoint those references first, then try again.',
};

const deleteErrorFallback =
  'This Asset could not be deleted. Please review and try again.';

export function AssetTeaser(
  props: Asset & { projectId: string; className?: string }
): React.JSX.Element {
  const { formatDatetime } = useProject();
  const { mutateAsync: saveAsset } = useMutation(queryOptions.assets.save);
  const { mutateAsync: updateAsset } = useMutation(queryOptions.assets.update);
  const [isUpdateAssetDialogOpen, setIsUpdateAssetDialogOpen] =
    useState<boolean>(false);
  const [isDeleteErrorDialogOpen, setIsDeleteErrorDialogOpen] =
    useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  // An Asset that Entries still reference is handled in place.
  // See contributing/error-handling.md.
  const { mutateAsync: deleteAsset, handleError: handleDeleteError } =
    useAppMutation(queryOptions.assets.delete, {
      handled: {
        Conflict: (error) => {
          setDeleteError(error);
          setIsDeleteErrorDialogOpen(true);
        },
      },
    });
  const updateAssetForm = useForm<UpdateAssetProps>({
    resolver: zodResolver(updateAssetSchema),
    defaultValues: {
      id: props.id,
      name: props.name,
      description: props.description,
      projectId: props.projectId,
      newFilePath: undefined,
    },
  });
  const updateAssetFormId = useId();
  const newFilePath = updateAssetForm.watch('newFilePath');
  const createdTime = formatDatetime({ datetime: props.created });
  const updatedTime = formatDatetime({ datetime: props.updated });
  const information = [
    {
      key: 'Size',
      value: formatBytes(props.size),
    },
    {
      key: 'Type',
      value: props.extension.toUpperCase(),
      tooltip: props.mimeType,
    },
    {
      key: 'Created',
      value: createdTime.relative,
      tooltip: createdTime.absolute,
    },
    {
      key: 'Updated',
      value: updatedTime.relative,
      tooltip: updatedTime.absolute,
    },
  ];

  async function onAssetSave(): Promise<void> {
    const result = await window.ipc.electron.dialog.showSaveDialog({
      title: `Save Asset ${props.name}.${props.extension} to disk`,
      buttonLabel: 'Save Asset',
      defaultPath: `${props.name}.${props.extension}`,
      // properties: ['createDirectory', 'showOverwriteConfirmation'],
      // filters: [
      //   {
      //     name: 'Supported files',
      //     extensions: [...supportedAssetExtensionSchema.options],
      //   },
      // ],
    });

    if (result.canceled === true) {
      return;
    }

    await saveAsset({
      projectId: props.projectId,
      id: props.id,
      filePath: result.filePath,
    });
  }

  async function onReplaceFile(): Promise<void> {
    const result = await window.ipc.electron.dialog.showOpenDialog({
      title: 'Select a replacement file',
      buttonLabel: 'Replace file',
      properties: ['openFile'],
    });

    if (result.canceled === true) {
      return;
    }

    const filePath = result.filePaths[0];
    if (filePath === undefined) {
      return;
    }

    updateAssetForm.setValue('newFilePath', filePath, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const onAssetUpdate: SubmitHandler<UpdateAssetProps> = async (
    asset
  ): Promise<void> => {
    const updatedAsset = await updateAsset(asset);
    // Reset the form to the saved values so the pending file replacement is
    // cleared and the dialog doesn't reopen in a dirty/stale state.
    updateAssetForm.reset({
      id: updatedAsset.id,
      name: updatedAsset.name,
      description: updatedAsset.description,
      projectId: props.projectId,
      newFilePath: undefined,
    });
    setIsUpdateAssetDialogOpen(false);
  };

  const onDelete = async (): Promise<void> => {
    try {
      await deleteAsset({ ...props });
    } catch (error) {
      handleDeleteError(error);
    }
  };

  const { type: deleteErrorType } = parseIpcError(deleteError);

  return (
    <Item variant="outline" className={cn(props.className)}>
      <ItemHeader>
        <AssetDisplay {...props} static className="rounded-t-md" />
      </ItemHeader>
      <ItemContent>
        <ItemTitle className="line-clamp-1">{props.name}</ItemTitle>

        <ItemDescription>
          <span className="line-clamp-1">{props.description || '-'}</span>
        </ItemDescription>

        {information.map((info, index, array) => {
          return (
            <Fragment key={info.key}>
              <div className="flex justify-between">
                <div className="">{info.key}</div>
                <div className="whitespace-nowrap">
                  {info.tooltip !== undefined && info.tooltip !== '-' ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>{info.value}</TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          <p>{info.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    info.value
                  )}
                </div>
              </div>
              {array.length !== index + 1 ? <Separator /> : null}
            </Fragment>
          );
        })}
      </ItemContent>
      <ItemFooter>
        <ButtonGroup className="w-full">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="flex-1"
                Icon={ExpandIcon}
              >
                <span className="sr-only">View</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>{props.name}</DialogTitle>
                <DialogDescription>{props.description}</DialogDescription>
              </DialogHeader>

              <DialogBody>
                <AssetDisplay {...props} />
              </DialogBody>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isUpdateAssetDialogOpen}
            onOpenChange={setIsUpdateAssetDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="flex-1"
                Icon={Edit2Icon}
              >
                <span className="sr-only">Update</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{props.name}</DialogTitle>
                <DialogDescription>{props.description}</DialogDescription>
              </DialogHeader>

              <DialogBody>
                <Item className="flex-col">
                  <div className="m-auto aspect-4/3 size-48">
                    <AssetDisplay {...props} static />
                  </div>

                  <div className="flex w-full flex-col items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      Icon={Replace}
                      onClick={async () => onReplaceFile()}
                    >
                      Replace file
                    </Button>
                    {newFilePath !== undefined ? (
                      <div className="flex max-w-full items-center gap-1 text-sm text-muted-foreground">
                        <span className="line-clamp-1 break-all">
                          New file: {newFilePath.split(/[/\\]/).pop()}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          Icon={X}
                          onClick={() =>
                            updateAssetForm.resetField('newFilePath')
                          }
                        >
                          <span className="sr-only">Undo file replacement</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <ItemContent className="w-full p-0">
                    <AssetForm
                      id={updateAssetFormId}
                      assetForm={updateAssetForm}
                      onFormSubmit={onAssetUpdate}
                    />
                  </ItemContent>
                </Item>
              </DialogBody>

              <DialogFooter>
                <FormActions form={updateAssetForm} id={updateAssetFormId}>
                  <SubmitButton requireDirty variant="outline" Icon={Edit2Icon}>
                    Update
                  </SubmitButton>
                </FormActions>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="icon-sm"
            className="flex-1"
            Icon={DownloadIcon}
            onClick={onAssetSave}
          >
            <span className="sr-only">Save as</span>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon-sm"
                className="flex-1"
                Icon={TrashIcon}
              >
                <span className="sr-only">Delete</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  You are about to delete this Asset
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This action can be undone later by restoring the Asset via
                  it&apos;s history.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AssetDisplay {...props} static />

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    Icon={TrashIcon}
                    onClick={() => void onDelete()}
                  >
                    Delete
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ButtonGroup>

        <Dialog
          open={isDeleteErrorDialogOpen}
          onOpenChange={setIsDeleteErrorDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Could not delete this Asset</DialogTitle>
              <DialogDescription>
                {describeCoreError(
                  deleteErrorType,
                  deleteErrorDescriptions,
                  deleteErrorFallback
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ItemFooter>
    </Item>
  );
}

export function AssetTeaserSkeleton(): React.JSX.Element {
  return (
    <Item variant="outline">
      <ItemHeader className="aspect-4/3">
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
        </div>
      </ItemHeader>
      <ItemContent>
        <ItemTitle>
          <Skeleton className="h-4 w-3/4" />
        </ItemTitle>
        <ItemDescription>
          <Skeleton className="h-3 w-1/2" />
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

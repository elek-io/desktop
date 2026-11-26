import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useMutation } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { Download, Ellipsis, Replace, Trash2, X } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { AssetDisplay } from '@renderer/components/asset-display';
import { AssetForm } from '@renderer/components/forms/asset-form';
import { PaneHead } from '@renderer/components/pane';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useAssetsScreen } from '@renderer/hooks/useAssetsScreen';
import { useProject } from '@renderer/hooks/useProject';
import {
  assetCopyFileName,
  assetFileName,
  assetNameFromFilePath,
} from '@renderer/lib/assetFile';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import { cn, formatBytes } from '@renderer/lib/utils';
import { buttonVariants } from '@renderer/lib/variants';
import { queryOptions } from '@renderer/queries';

import {
  createAssetSchema,
  updateAssetSchema,
  type Asset,
  type CoreErrorType,
  type CreateAssetProps,
  type UpdateAssetProps,
} from '@elek-io/core';

// The pane beside the Assets grid: what the chosen Asset is, the name and
// description somebody edits, the file it stands for, and Delete in its More
// menu. The same pane asks for the name and description of an Asset that is
// being added, where the file is picked but nothing is stored yet.
//
// See contributing/error-handling.md#example-delete-an-asset-still-in-use.

/** Copy for a blocked delete, keyed by CoreError type. */
const deleteErrorDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  Conflict: msg`This Asset is used by one or more Entries and can’t be deleted. Remove or repoint those references first, then try again.`,
};

const deleteErrorFallback = msg`This Asset could not be deleted. Please review and try again.`;

/** The head of the pane: what it is about, and the way out of it. */
function AssetPaneHead({
  title,
  closeLabel,
  more,
}: {
  title: string;
  closeLabel: string;
  more?: ReactNode;
}): ReactElement {
  const { projectId } = useProject();

  return (
    <PaneHead>
      <span className="min-w-0 flex-1 truncate text-label">{title}</span>
      {more}
      {/*
        A link rather than a button, because closing the pane is leaving the
        Asset's own address, which is what lets the question before losing
        changes catch it. It takes the ghost icon button's own look, as ci
        draws it.
      */}
      <Link
        to="/projects/$projectId/assets"
        params={{ projectId: projectId }}
        aria-label={closeLabel}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
      >
        <X />
      </Link>
    </PaneHead>
  );
}

/**
 * The pane itself, inside the pane the route draws: its head stays while its
 * body scrolls.
 *
 * A landmark of its own, named by what it is about, so everything on the screen
 * stands in one and a screen reader can jump between the grid and the Asset it
 * opened.
 */
function AssetPaneShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <aside
      aria-label={label}
      data-slot="asset-pane"
      className="flex min-h-0 flex-1 flex-col"
    >
      {children}
    </aside>
  );
}

/** The column the pane's contents stand in, which scrolls below its head. */
function AssetPaneBody({ children }: { children: ReactNode }): ReactElement {
  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 px-(--pane-edge) pb-6">
        {children}
      </div>
    </ScrollArea>
  );
}

/**
 * The chosen Asset: its preview, what it is, and the name and description Core
 * requires of it.
 *
 * Saving changes the two of them and leaves the file alone, since Core keeps
 * the stored file whenever no new one is passed. Replace file is what passes
 * one, and it reaches Core with the same save rather than on its own.
 */
export function AssetPane({ asset }: { asset: Asset }): ReactElement {
  const { t } = useLingui();
  const router = useRouter();
  const { projectId } = useProject();
  const { onAssetDeleted } = useAssetsScreen();
  const { mutateAsync: updateAsset } = useMutation(queryOptions.assets.update);
  const { mutateAsync: saveAsset } = useMutation(queryOptions.assets.save);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteErrorDialogOpen, setIsDeleteErrorDialogOpen] = useState(false);
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
  const fileName = assetFileName(asset);
  const type = asset.extension.toUpperCase();
  const size = formatBytes(asset.size);
  const storedValues: UpdateAssetProps = {
    id: asset.id,
    name: asset.name,
    description: asset.description,
    projectId: projectId,
    newFilePath: undefined,
  };
  // Filled from the Asset the route read, so a refetch never overwrites what is
  // being typed and the form needs no reset of its own, see
  // contributing/renderer/loading-and-updating-data.md.
  const updateAssetForm = useAppForm<UpdateAssetProps>({
    resolver: zodResolver(updateAssetSchema),
    defaultValues: storedValues,
    values: storedValues,
  });
  const typed = updateAssetForm.watch();
  const blockedBy = emptyFieldsReason(
    countEmptyFields([typed.name, typed.description])
  );
  // The file's own name, so the sentence below takes one placeholder rather
  // than being assembled around a path.
  const newFileName = typed.newFilePath?.split(/[/\\]/).pop();

  const onAssetUpdate: SubmitHandler<UpdateAssetProps> = async (values) => {
    const updatedAsset = await updateAsset(values);
    // This pane stays open after it saved, so the form is made pristine again
    // with what Core stored. Without it Save would stay available, leaving
    // would ask about changes that are already saved, and the replacement that
    // went through would still be pending.
    updateAssetForm.reset(
      {
        id: updatedAsset.id,
        name: updatedAsset.name,
        description: updatedAsset.description,
        projectId: projectId,
        newFilePath: undefined,
      },
      // Every form pins `keepDirtyValues`, so a refetch never overwrites what
      // somebody is typing. Here the save is through and what it brought back
      // is the newest there is, and the form takes no edit while it runs, so
      // this reset is the one that may drop a dirty value. Without it the file
      // that was just replaced would still be pending.
      { keepDirtyValues: false }
    );
  };

  async function onReplaceFile(): Promise<void> {
    const result = await window.ipc.electron.dialog.showOpenDialog({
      title: t`Choose a file to replace ${fileName}`,
      buttonLabel: t`Replace file`,
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

  /**
   * Writes the Asset's file to wherever the person picks, under its own name.
   *
   * The dialog is offered one filter, on the Asset's own type, which keeps a
   * JPG from being saved as a PNG and leaves macOS without the format chooser
   * it adds to a dialog with more than one. It sets no `properties`: none of
   * them touches the name field, and the file goes to the path the person
   * picked through Core's own save.
   */
  async function onSaveACopy(): Promise<void> {
    const copyFileName = assetCopyFileName(asset);
    const result = await window.ipc.electron.dialog.showSaveDialog({
      title: t`Save a copy of ${fileName}`,
      buttonLabel: t`Save a copy`,
      defaultPath: copyFileName,
      filters: [{ name: t`${type} file`, extensions: [asset.extension] }],
    });

    if (result.canceled === true) {
      return;
    }

    await saveAsset({
      projectId: projectId,
      id: asset.id,
      filePath: result.filePath,
    });
  }

  const onDelete = async (): Promise<void> => {
    try {
      await deleteAsset({
        projectId: projectId,
        id: asset.id,
        extension: asset.extension,
      });
      setIsDeleteConfirmOpen(false);
      // The pane takes this way out itself, so the question before leaving does
      // not ask: the Asset and everything typed about it are gone.
      await router.navigate({
        to: '/projects/$projectId/assets',
        params: { projectId: projectId },
        ignoreBlocker: true,
      });
      // Once the grid is what is left, it takes the focus back to the card that
      // stands where this one stood.
      onAssetDeleted(asset.id);
    } catch (error) {
      // The dialog closes either way, so a refusal is not answered behind it.
      setIsDeleteConfirmOpen(false);
      handleDeleteError(error);
    }
  };

  const { type: deleteErrorType } = parseIpcError(deleteError);

  return (
    <AssetPaneShell label={fileName}>
      <AssetPaneHead
        title={fileName}
        closeLabel={t`Close ${fileName}`}
        more={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  Icon={Ellipsis}
                  aria-label={t`More for ${fileName}`}
                />
              }
            />
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  <Trans>Delete Asset</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        }
      />

      <AssetPaneBody>
        {/* The preview says the same as the pane's own head, so it stays out
        of what a screen reader reads here. */}
        <span aria-hidden="true">
          <AssetDisplay
            {...asset}
            static
            fit="cover"
            className="h-[150px] w-full rounded-md"
          />
        </span>
        <span className="text-small text-muted-foreground">
          {t`${type}, ${size}`}
        </span>

        <AssetForm
          assetForm={updateAssetForm}
          schema={updateAssetSchema}
          nameField="name"
          descriptionField="description"
          extension={asset.extension}
          blockedBy={blockedBy}
          unsavedChangesTitle={fileName}
          className="gap-3"
          onFormSubmit={onAssetUpdate}
        >
          {newFileName === undefined ? null : (
            <div className="flex max-w-full items-center gap-1 text-small text-muted-foreground">
              <span className="line-clamp-1 break-all">
                <Trans>New file: {newFileName}</Trans>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                Icon={X}
                aria-label={t`Undo the file replacement of ${fileName}`}
                onClick={() => updateAssetForm.resetField('newFilePath')}
              />
            </div>
          )}

          {/* Two halves of the pane, as ci draws them, with Save below on a
          line of its own. */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              Icon={Replace}
              aria-label={t`Replace file of ${fileName}`}
              onClick={async () => onReplaceFile()}
            >
              <Trans>Replace file</Trans>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              Icon={Download}
              aria-label={t`Save a copy of ${fileName}`}
              onClick={async () => onSaveACopy()}
            >
              <Trans>Save a copy</Trans>
            </Button>
          </div>

          <FormActions form={updateAssetForm} blockedBy={blockedBy}>
            <SubmitButton
              requireDirty
              variant="outline"
              className="w-full"
              aria-label={t`Save ${fileName}`}
            >
              <Trans>Save</Trans>
            </SubmitButton>
          </FormActions>
        </AssetForm>
      </AssetPaneBody>

      {/*
        The confirm names what goes and who it reaches, as ci rules for
        deleting. Its red button is a Button rather than the dialog's own
        action, so the dialog stays until the delete answered and a refusal can
        take its place.
      */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete {fileName}?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                The file goes from this Project, and for everyone on it once you
                sync.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              Icon={Trash2}
              onClick={() => void onDelete()}
            >
              <Trans>Delete Asset</Trans>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={isDeleteErrorDialogOpen}
        onOpenChange={setIsDeleteErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Could not delete this Asset</Trans>
            </DialogTitle>
            <DialogDescription>
              {describeCoreError(
                deleteErrorType,
                deleteErrorDescriptions,
                deleteErrorFallback
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              <Trans>Close</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AssetPaneShell>
  );
}

/**
 * The pane for an Asset that is being added: the file is picked, and Core asks
 * for a name and a description before it stores anything.
 *
 * It shows no preview, because the file is still outside the Project and the
 * window only loads what is inside one, see contributing/overview.md.
 */
export function NewAssetPane({ filePath }: { filePath: string }): ReactElement {
  const { t } = useLingui();
  const router = useRouter();
  const { projectId } = useProject();
  const { mutateAsync: createAsset } = useMutation(queryOptions.assets.create);
  const fileName = filePath.split(/[/\\]/).pop() ?? '';
  const pickedValues: CreateAssetProps = {
    // The file's own name is offered, so an Asset added from `logo.png` is
    // called `logo` without anybody typing it again.
    name: assetNameFromFilePath(filePath),
    description: '',
    projectId: projectId,
    filePath: filePath,
  };
  // Filled from the picked file rather than from a mount of its own, so Add
  // Asset pressed again while this pane is open takes the new file and the
  // name that comes with it, and keeps whatever was already typed over it.
  const createAssetForm = useAppForm<CreateAssetProps>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: pickedValues,
    values: pickedValues,
  });
  const typed = createAssetForm.watch();
  const blockedBy = emptyFieldsReason(
    countEmptyFields([typed.name, typed.description])
  );

  const onCreateAsset: SubmitHandler<CreateAssetProps> = async (values) => {
    const createdAsset = await createAsset(values);
    // The new Asset's own pane takes this one's place, so what was just added
    // is what is open. This pane takes that way out itself, so nothing asks
    // about the form it leaves behind.
    await router.navigate({
      to: '/projects/$projectId/assets/$assetId',
      params: { projectId: projectId, assetId: createdAsset.id },
      ignoreBlocker: true,
    });
  };

  return (
    <AssetPaneShell label={t`Add Asset`}>
      <AssetPaneHead title={t`Add Asset`} closeLabel={t`Close Add Asset`} />

      <AssetPaneBody>
        <AssetForm
          assetForm={createAssetForm}
          schema={createAssetSchema}
          nameField="name"
          descriptionField="description"
          blockedBy={blockedBy}
          unsavedChangesTitle={t`Add Asset`}
          className="gap-3"
          onFormSubmit={onCreateAsset}
        >
          <span className="text-small text-muted-foreground">
            {t`The file ${fileName} is added once it has a name and a description.`}
          </span>

          <FormActions form={createAssetForm} blockedBy={blockedBy}>
            <SubmitButton variant="outline" className="w-full">
              <Trans>Save</Trans>
            </SubmitButton>
          </FormActions>
        </AssetForm>
      </AssetPaneBody>
    </AssetPaneShell>
  );
}

/** The pane while the Asset it is about is still being read. */
export function AssetPaneSkeleton(): ReactElement {
  const { t } = useLingui();

  return (
    <AssetPaneShell label={t`Asset`}>
      <PaneHead>
        <Skeleton className="h-4 w-32" />
      </PaneHead>
      <AssetPaneBody>
        <Skeleton className="h-[150px] w-full" />
        <Skeleton className="h-3 w-24" />
      </AssetPaneBody>
    </AssetPaneShell>
  );
}

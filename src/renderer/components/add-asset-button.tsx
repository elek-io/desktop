import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useState, type ReactElement, type RefObject } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { AssetForm } from '@renderer/components/forms/asset-form';
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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useProject } from '@renderer/hooks/useProject';
import { assetNameFromFilePath } from '@renderer/lib/assetFile';
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import { queryOptions } from '@renderer/queries';

import { createAssetSchema, type CreateAssetProps } from '@elek-io/core';

/**
 * Add Asset: the system's file dialog, and then the name and description Core
 * asks for.
 *
 * The Assets screen takes the picked file through `onFilePicked` and opens its
 * own pane for it, which is where that screen asks for both. A picker has no
 * pane to ask in, so there this button asks in a dialog of its own and the new
 * Asset lands in the grid the picker is showing.
 */
export function AddAssetButton({
  onFilePicked,
  variant = 'outline',
  buttonRef,
}: {
  onFilePicked?: (filePath: string) => void;
  variant?: 'default' | 'outline';
  /** The button itself, for a screen that puts the focus back on it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}): ReactElement {
  const { t } = useLingui();
  const { projectId } = useProject();
  const { mutateAsync: createAsset } = useMutation(queryOptions.assets.create);
  const [pickedFilePath, setPickedFilePath] = useState<string | null>(null);
  const formId = useId();
  const createAssetForm = useAppForm<CreateAssetProps>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      name: '',
      description: '',
      projectId: projectId,
      filePath: '',
    },
  });
  const typed = createAssetForm.watch();
  const blockedBy = emptyFieldsReason(
    countEmptyFields([typed.name, typed.description])
  );
  const fileName = pickedFilePath?.split(/[/\\]/).pop() ?? '';

  async function onAddAsset(): Promise<void> {
    const result = await window.ipc.electron.dialog.showOpenDialog({
      title: t`Choose a file to add as an Asset`,
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

    if (onFilePicked !== undefined) {
      onFilePicked(filePath);
      return;
    }

    // The file's own name is offered, so an Asset added from `logo.png` is
    // called `logo` without anybody typing it again.
    createAssetForm.reset({
      name: assetNameFromFilePath(filePath),
      description: '',
      projectId: projectId,
      filePath: filePath,
    });
    setPickedFilePath(filePath);
  }

  const onCreateAsset: SubmitHandler<CreateAssetProps> = async (
    asset
  ): Promise<void> => {
    await createAsset(asset);
    setPickedFilePath(null);
  };

  return (
    <>
      <Button
        ref={buttonRef}
        variant={variant}
        Icon={Plus}
        onClick={async () => onAddAsset()}
      >
        <Trans>Add Asset</Trans>
      </Button>

      {/* Only where this button asks for the name and the description itself.
      A screen that opens its own pane for the picked file takes it through
      `onFilePicked`, and no dialog of this one is ever on screen there. */}
      {onFilePicked === undefined ? (
        <Dialog
          open={pickedFilePath !== null}
          onOpenChange={(isOpen) => {
            if (isOpen === false) {
              setPickedFilePath(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Trans>Add Asset</Trans>
              </DialogTitle>
              <DialogDescription>
                {t`The file ${fileName} is added once it has a name and a description.`}
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <AssetForm
                id={formId}
                assetForm={createAssetForm}
                schema={createAssetSchema}
                nameField="name"
                descriptionField="description"
                blockedBy={blockedBy}
                onFormSubmit={onCreateAsset}
              />
            </DialogBody>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>
                <Trans>Cancel</Trans>
              </DialogClose>
              <FormActions
                form={createAssetForm}
                id={formId}
                blockedBy={blockedBy}
              >
                <SubmitButton Icon={Plus}>
                  <Trans>Add Asset</Trans>
                </SubmitButton>
              </FormActions>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

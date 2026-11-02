import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Trash } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import {
  ProjectForm,
  type ProjectFormValues,
} from '@renderer/components/forms/project-form';
import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
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
  DialogTrigger,
} from '@renderer/components/ui/dialog';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { queryOptions } from '@renderer/queries';

import { createProjectSchema, type CoreErrorType } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/settings/general')({
  component: ProjectSettingsGeneralPage,
});

// Copy for a blocked delete, keyed by CoreError type.
const forceDeleteDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  PreconditionFailed: msg`This Project only exists on this device (no remote copy). Force delete removes it permanently.`,
  Conflict: msg`This Project has local changes not yet pushed to its remote. Force delete discards those unpushed changes permanently.`,
};

const forceDeleteFallback = msg`This Project is not synchronized to a remote, or it has changes that were never pushed. Deleting it now removes those changes permanently, with no way to recover them.`;

function ProjectSettingsGeneralPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`General`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const formId = useId();
  // The form holds what a person edits. The Project's id goes with the save,
  // not into a field, so the create and the update form are the same shape and
  // check against the same Core schema.
  const updateProjectForm = useAppForm<ProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      description: '',
      settings: {
        // Language codes, which are the same in every language.
        /* eslint-disable lingui/no-unlocalized-strings */
        language: {
          default: 'en',
          supported: ['en'],
        },
        /* eslint-enable lingui/no-unlocalized-strings */
      },
    },
    // Filled from the query, so a refetch never overwrites what is being typed
    // and the form needs no reset of its own.
    ...(isReadingProject
      ? {}
      : {
          values: {
            name: project.name,
            description: project.description,
            settings: project.settings,
          },
        }),
    disabled: isReadingProject,
  });

  const { mutateAsync: updateProject, isPending: isUpdatingProject } =
    useMutation(queryOptions.projects.update);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isForceDeleteDialogOpen, setIsForceDeleteDialogOpen] = useState(false);
  const [forceDeleteError, setForceDeleteError] = useState<unknown>(null);

  // The delete guard opens the force-delete dialog instead.
  // See contributing/error-handling.md.
  const openForceDeleteDialog = (error: unknown): void => {
    setForceDeleteError(error);
    setIsDeleteDialogOpen(false);
    setIsForceDeleteDialogOpen(true);
  };
  const {
    mutateAsync: deleteProject,
    isPending: isDeletingProject,
    handleError: handleDeleteError,
  } = useAppMutation(queryOptions.projects.delete, {
    handled: {
      PreconditionFailed: openForceDeleteDialog,
      Conflict: openForceDeleteDialog,
    },
  });

  // The forced delete handles no type on purpose. Reusing the guard-handling
  // mutation above would intercept a Conflict or PreconditionFailed from the
  // forced call too, and with no handleError that would swallow it silently.
  const { mutateAsync: forceDeleteProject, isPending: isForceDeletingProject } =
    useAppMutation(queryOptions.projects.delete, { handled: {} });

  function Description(): ReactElement {
    return (
      <Trans>Here you will be able to tweak this project to your liking</Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateProjectForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          <Trans>Save changes</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const onUpdate: SubmitHandler<ProjectFormValues> = async (values) => {
    await updateProject({ ...values, id: projectId });
  };

  const onDelete = async (): Promise<void> => {
    try {
      await deleteProject({ id: projectId });
      await router.navigate({ to: '/projects' });
    } catch (error) {
      handleDeleteError(error);
    }
  };

  const onForceDelete = async (): Promise<void> => {
    try {
      await forceDeleteProject({ id: projectId, force: true });
      await router.navigate({ to: '/projects' });
    } catch {
      // A force delete bypasses the guard, so any failure here is unexpected.
      // forceDeleteProject handles no type, so throwOnError routes it to the
      // boundary. Close this dialog so it is not left in front of it.
      setIsForceDeleteDialogOpen(false);
    }
  };

  const { type: forceDeleteErrorType } = parseIpcError(forceDeleteError);

  return (
    <Page
      title={t`General Settings`}
      description={<Description />}
      actions={<Actions />}
    >
      <ProjectForm
        id={formId}
        projectForm={updateProjectForm}
        isViewOnly={isUpdatingProject}
        onFormSubmit={onUpdate}
      >
        <PageSection
          title={t`Delete this Project from this device`}
          description={t`The action does not delete this Project from other devices - just
              from the device you are currently using. But if this is the only
              device your Project is stored at, you will remove it permanently -
              there is no going back. Please be certain.`}
          actions={
            <>
              <Dialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
              >
                <DialogTrigger
                  render={<Button Icon={Trash} variant="destructive" />}
                >
                  <Trans>Delete Project</Trans>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      <Trans>Remove this Project?</Trans>
                    </DialogTitle>
                    <DialogDescription>
                      <Trans>
                        You are about to delete the Project from this device.
                      </Trans>
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={<Button type="button" variant="secondary" />}
                    >
                      <Trans>Cancel</Trans>
                    </DialogClose>
                    <Button
                      Icon={Trash}
                      variant="destructive"
                      isLoading={isDeletingProject}
                      onClick={() => void onDelete()}
                    >
                      <Trans>Delete</Trans>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isForceDeleteDialogOpen}
                onOpenChange={setIsForceDeleteDialogOpen}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      <Trans>Force delete this Project?</Trans>
                    </DialogTitle>
                    <DialogDescription>
                      {describeCoreError(
                        forceDeleteErrorType,
                        forceDeleteDescriptions,
                        forceDeleteFallback
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={<Button type="button" variant="secondary" />}
                    >
                      <Trans>Cancel</Trans>
                    </DialogClose>
                    <Button
                      Icon={Trash}
                      variant="destructive"
                      isLoading={isForceDeletingProject}
                      onClick={() => void onForceDelete()}
                    >
                      <Trans>Yes, delete</Trans>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          }
        />
      </ProjectForm>
    </Page>
  );
}

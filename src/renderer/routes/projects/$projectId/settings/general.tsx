import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Trash } from 'lucide-react';
import { type ReactElement, useEffect, useId, useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { ProjectForm } from '@renderer/components/forms/project-form';
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
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type UpdateProjectProps,
  updateProjectSchema,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/settings/general')({
  component: ProjectSettingsGeneralPage,
});

// Copy for a blocked delete, keyed by CoreError type.
const forceDeleteDescriptions: Partial<Record<CoreErrorType, string>> = {
  PreconditionFailed:
    'This Project only exists on this device (no remote copy). Force delete removes it permanently.',
  Conflict:
    'This Project has local changes not yet pushed to its remote. Force delete discards those unpushed changes permanently.',
};

const forceDeleteFallback =
  'This Project is not synchronized to a remote, or it has changes that were never pushed. Deleting it now removes those changes permanently, with no way to recover them.';

function ProjectSettingsGeneralPage(): ReactElement {
  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'General');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const formId = useId();
  const updateProjectForm = useForm<UpdateProjectProps>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      id: projectId,
      name: '',
      description: '',
      settings: {
        language: {
          default: 'en',
          supported: ['en'],
        },
      },
    },
  });

  // Reset form with Project data when it loads
  useEffect(() => {
    if (isReadingProject === false) {
      updateProjectForm.reset({
        id: project.id,
        name: project.name,
        description: project.description,
        settings: project.settings,
      });
    }
  }, [project, isReadingProject, updateProjectForm]);

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
    return <>Here you will be able to tweak this project to your liking</>;
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateProjectForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          Save changes
        </SubmitButton>
      </FormActions>
    );
  }

  const onUpdate: SubmitHandler<UpdateProjectProps> = async (project) => {
    await updateProject(project);
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
      title="General Settings"
      description={<Description />}
      actions={<Actions />}
    >
      <ProjectForm
        id={formId}
        projectForm={updateProjectForm}
        isViewOnly={isReadingProject || isUpdatingProject}
        onFormSubmit={onUpdate}
      >
        <PageSection
          title="Delete this Project from this device"
          description="The action does not delete this Project from other devices - just
              from the device you are currently using. But if this is the only
              device your Project is stored at, you will remove it permanently -
              there is no going back. Please be certain."
          actions={
            <>
              <Dialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button Icon={Trash} variant="destructive">
                    Delete Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove this Project?</DialogTitle>
                    <DialogDescription>
                      You are about to delete the Project from this device.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="secondary">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      Icon={Trash}
                      variant="destructive"
                      isLoading={isDeletingProject}
                      onClick={() => void onDelete()}
                    >
                      Delete
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
                    <DialogTitle>Force delete this Project?</DialogTitle>
                    <DialogDescription>
                      {describeCoreError(
                        forceDeleteErrorType,
                        forceDeleteDescriptions,
                        forceDeleteFallback
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="secondary">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      Icon={Trash}
                      variant="destructive"
                      isLoading={isForceDeletingProject}
                      onClick={() => void onForceDelete()}
                    >
                      Yes, delete
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

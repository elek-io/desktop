import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ArrowRight, Plus } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { ProjectForm } from '@renderer/components/forms/project-form';
import { Page } from '@renderer/components/page';
import { Pane, Panel } from '@renderer/components/pane';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { emptyFieldsReason } from '@renderer/lib/emptyFields';
import {
  missingProjectValues,
  newProjectFormValues,
  projectFormSchema,
  type ProjectFormValues,
} from '@renderer/lib/projectForm';
import { syncRefusalHandlers } from '@renderer/lib/sync';
import { queryOptions } from '@renderer/queries';

import { type CoreErrorType } from '@elek-io/core';

export const Route = createFileRoute('/projects/create')({
  component: CreateProjectPage,
});

/**
 * Why the Git repository did not take the new Project, per `CoreError` type.
 *
 * The Project itself is already on this computer by then, so each sentence says
 * what to check rather than what was lost. None of them shows Core's own
 * message, which can carry the address with a password in it, see
 * contributing/error-handling.md.
 */
const SYNC_FAILURES: Partial<Record<CoreErrorType, MessageDescriptor>> = {
  PreconditionFailed: msg`The Git repository may already hold something, or it may not be able to store the Assets. Ask whoever set it up.`,
  Unauthorized: msg`The Git repository refused access, so ask whoever set it up.`,
  Internal: msg`The Git repository could not be reached, so check your connection and the address.`,
};

const SYNC_FAILURE_FALLBACK = msg`Check the address with whoever set the Git repository up.`;

function CreateProjectPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const title = t`Create Project`;
  useBreadcrumb(Route, title);
  const createProjectForm = useAppForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: newProjectFormValues(),
  });
  const queryClient = useQueryClient();
  const { mutateAsync: createProject } = useMutation(
    queryOptions.projects.create
  );
  // Both calls that put the Project on a Git repository answer the same way,
  // because the Project is created by then and the editor has to be told that
  // it is here, not sent to the error screen. Every type a sync can be refused
  // with is answered in place, `Internal` among them, which is the exception
  // error-handling.md allows where every failure of one call has the same true
  // answer. A type outside that set still reaches the root error screen.
  const [syncFailure, setSyncFailure] = useState<unknown>(null);
  const handled = syncRefusalHandlers(setSyncFailure);
  const {
    mutateAsync: setRemoteOriginUrl,
    handleError: handleRemoteOriginUrlError,
  } = useAppMutation(queryOptions.projects.setRemoteOriginUrl, { handled });
  const { mutateAsync: synchronizeProject, handleError: handleSyncError } =
    useAppMutation(queryOptions.projects.synchronize, { handled });
  const formId = useId();
  // The Project Core made, held so the dialog below can open it once the editor
  // has read why it is not synced yet.
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const values = createProjectForm.watch();
  const blockedBy = emptyFieldsReason(missingProjectValues(values));

  function Actions(): ReactElement {
    return (
      <FormActions form={createProjectForm} id={formId} blockedBy={blockedBy}>
        <SubmitButton Icon={Plus}>
          <Trans>Create Project</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const openProject = async (projectId: string): Promise<void> => {
    await router.navigate({
      to: '/projects/$projectId',
      params: { projectId },
      // The page takes this way out itself, once the Project is made, so
      // leaving it asks nothing: what the form holds is saved by then.
      ignoreBlocker: true,
    });
  };

  const onCreate: SubmitHandler<ProjectFormValues> = async (values) => {
    const newProject = await createProject({
      name: values.name,
      description: values.description,
      settings: values.settings,
    });

    // Core's create takes no remote, so a Project on another Git host takes two
    // more calls: the address, then the first sync that puts it there.
    if (values.keptOn === 'git-host' && values.remoteOriginUrl !== null) {
      setCreatedProjectId(newProject.id);
      // The two reads the calls below invalidate and refetch. The create
      // writes the new Project into both of them rather than reading either,
      // so neither carries a function of its own while this page is open, and
      // a query with no function cannot be refetched: the refetch fails, and
      // with it the editor would reach the error screen with the Project
      // already made. Reading both once is what gives each key its own query,
      // and each has to be a real read, because the app caches every read
      // forever and a query that already holds data would be handed back
      // without ever being given its function.
      await Promise.all([
        queryClient.query({
          ...queryOptions.projects.read({ id: newProject.id }),
          staleTime: 0,
        }),
        queryClient.query({
          ...queryOptions.projects.list({ limit: 0 }),
          staleTime: 0,
        }),
      ]);
      try {
        await setRemoteOriginUrl({
          id: newProject.id,
          url: values.remoteOriginUrl,
        });
      } catch (error) {
        handleRemoteOriginUrlError(error);
        return;
      }
      try {
        await synchronizeProject({ id: newProject.id });
      } catch (error) {
        handleSyncError(error);
        return;
      }
    }

    await openProject(newProject.id);
  };

  /** The way out of the dialog below, which every way out of it takes. */
  const openCreatedProject = (): void => {
    if (createdProjectId === null) {
      return;
    }

    void openProject(createdProjectId);
  };

  const { type: syncFailureType } = parseIpcError(syncFailure);
  const projectName = values.name;

  return (
    <>
      <Panel>
        <Pane name={t`what this screen shows`}>
          <Page title={title} actions={<Actions />}>
            <ProjectForm
              schema={projectFormSchema}
              id={formId}
              projectForm={createProjectForm}
              asksWhereToKeepIt
              blockedBy={blockedBy}
              unsavedChangesTitle={title}
              onFormSubmit={onCreate}
            />
          </Page>
        </Pane>
      </Panel>

      {/*
        The Project is on this computer whatever the Git repository answered, so
        this says so and opens it, rather than leaving the editor on a form that
        would create a second one. It has room for the cause, which is where ci
        puts a failure somebody is waiting for.

        Every way out of it opens the Project, Escape and the backdrop
        included, because the form behind it would otherwise make a second
        Project out of the same filled fields.
      */}
      <Dialog
        open={syncFailure !== null}
        onOpenChange={(isOpen) => {
          if (isOpen === false) {
            setSyncFailure(null);
            openCreatedProject();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>{projectName} was created, but not synced</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Everything you entered is on this computer. Nothing was synced
                with the Git repository yet.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="text-small text-muted-foreground">
            <p>
              {describeCoreError(
                syncFailureType,
                SYNC_FAILURES,
                SYNC_FAILURE_FALLBACK
              )}
            </p>
            <p className="mt-2">
              <Trans>
                You can set the address again in the Project&apos;s Sync
                settings, and sync from the sidebar.
              </Trans>
            </p>
          </DialogBody>
          <DialogFooter>
            <Button Icon={ArrowRight} onClick={openCreatedProject}>
              <Trans>Open the Project</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

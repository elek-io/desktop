import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Trash2, TriangleAlert } from 'lucide-react';
import { type ReactElement, type ReactNode, useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { ProjectForm } from '@renderer/components/forms/project-form';
import { Page } from '@renderer/components/page';
import {
  AlertDialog,
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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useProjectState } from '@renderer/hooks/useProjectState';
import { emptyFieldsReason } from '@renderer/lib/emptyFields';
import {
  missingProjectValues,
  newProjectFormValues,
  projectFormSchema,
  projectFormValuesOf,
  type ProjectFormValues,
} from '@renderer/lib/projectForm';
import { queryOptions } from '@renderer/queries';

import { type Project } from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/settings/general')({
  component: ProjectSettingsGeneralPage,
});

/**
 * What cannot be brought back by removing the Project, in the warning color.
 *
 * It reads the one check of the Git repository, which the sidebar's Project
 * card reads above this screen, so this dialog costs no second call. A check
 * that could not be made says that changes may be lost rather than that there
 * are none, because a Project whose repository cannot be reached is exactly the
 * one whose changes have not left this computer. See
 * contributing/error-handling.md.
 */
function WhatCannotBeRecovered({
  project,
}: {
  project: Project;
}): ReactElement | null {
  const { t } = useLingui();

  const state = useProjectState(project);
  const line = (words: ReactNode): ReactElement => (
    <span className="mt-2 flex items-start gap-1.5 text-warning">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 flex-none" />
      <span>{words}</span>
    </span>
  );

  if (state.hasGitRepository === false) {
    return line(<Trans>Once deleted, it can&apos;t be brought back.</Trans>);
  }

  if (state.check.error !== null) {
    return line(
      <Trans>
        Changes that aren&apos;t synced may be lost. Desktop can&apos;t reach
        the Git repository to count them.
      </Trans>
    );
  }

  if (state.check.isPending) {
    return line(
      <Trans>
        Changes that aren&apos;t synced may be lost. Desktop is still counting
        them.
      </Trans>
    );
  }

  if (state.notSynced === 0) {
    return null;
  }

  const notSynced = state.notSynced;

  return line(
    t`${plural(notSynced, {
      one: "# change isn't synced. Removing loses it.",
      other: "# changes aren't synced. Removing loses them.",
    })}`
  );
}

/**
 * Removing the Project from this computer, or deleting one that has no Git
 * repository anywhere else to come back from.
 *
 * The dialog names what goes and what cannot be brought back, which is what
 * makes the press an informed one, so the removal itself is forced: Core
 * refuses an unforced delete of a Project whose work has not left this
 * computer, and that refusal is the warning this dialog has already given. Any
 * other failure of it is unexpected and reaches the root error screen, see
 * contributing/error-handling.md.
 */
function RemoveProject({ project }: { project: Project }): ReactElement {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { mutateAsync: deleteProject, isPending: isDeletingProject } =
    useMutation(queryOptions.projects.delete);
  const hasGitRepository = project.remoteOriginUrl !== null;
  const { name } = project;

  const onRemove = async (): Promise<void> => {
    try {
      await deleteProject({ id: project.id, force: true });
      // The page takes this way out itself, so leaving it asks nothing: the
      // Project and everything typed into its settings are gone.
      await router.navigate({ to: '/projects', ignoreBlocker: true });
    } catch {
      // The mutation handles no type, so `throwOnError` has already carried
      // the failure to the root error screen. Close this dialog, so it is not
      // left in front of it.
      setIsOpen(false);
    }
  };

  return (
    <section className="mt-7 border-t pt-5">
      <div className="mb-5">
        <h2 className="text-h4">
          {hasGitRepository ? (
            <Trans>Remove from this computer</Trans>
          ) : (
            <Trans>Delete Project</Trans>
          )}
        </h2>
        <p className="mt-1 text-small text-muted-foreground">
          {hasGitRepository ? (
            <Trans>
              Its folder here goes. Its Git repository and the copies on other
              computers stay.
            </Trans>
          ) : (
            <Trans>
              Its folder here is its only copy, since it has no Git repository.
            </Trans>
          )}
        </p>
      </div>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        {/* The outline button in the error text color, as ci draws it. */}
        <AlertDialogTrigger
          render={
            <Button variant="outline" Icon={Trash2} className="text-error" />
          }
        >
          {hasGitRepository ? (
            <Trans>Remove from this computer</Trans>
          ) : (
            <Trans>Delete Project</Trans>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasGitRepository ? (
                <Trans>Remove {name} from this computer?</Trans>
              ) : (
                <Trans>Delete {name}?</Trans>
              )}
            </AlertDialogTitle>
            {/*
              A div rather than the default paragraph, so what cannot be
              brought back stands in its own line inside the dialog's
              description, which is what a screen reader reads out with it.
            */}
            <AlertDialogDescription render={<div />}>
              <span className="block">
                {hasGitRepository ? (
                  <Trans>
                    Its folder here goes. Its Git repository and the copies on
                    other computers stay.
                  </Trans>
                ) : (
                  <Trans>
                    Its folder here is its only copy, since it has no Git
                    repository.
                  </Trans>
                )}
              </span>
              <WhatCannotBeRecovered project={project} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              Icon={Trash2}
              isLoading={isDeletingProject}
              onClick={() => void onRemove()}
            >
              {hasGitRepository ? (
                <Trans>Remove Project</Trans>
              ) : (
                <Trans>Delete Project</Trans>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * The General page of a Project's Settings: what the Project is called, what
 * it holds, and the way to remove it from this computer.
 */
function ProjectSettingsGeneralPage(): ReactElement {
  const { t } = useLingui();

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
    resolver: zodResolver(projectFormSchema),
    defaultValues: newProjectFormValues(),
    // Filled from the query, so a refetch never overwrites what is being typed
    // and the form needs no reset of its own. Where the Project is kept comes
    // along, because this page shows no field for it and so keeps it as it is:
    // the address itself is changed on the Sync page.
    ...(isReadingProject ? {} : { values: projectFormValuesOf(project) }),
    disabled: isReadingProject,
  });

  const { mutateAsync: updateProject } = useMutation(
    queryOptions.projects.update
  );

  const blockedBy = emptyFieldsReason(
    missingProjectValues(updateProjectForm.watch())
  );

  function Actions(): ReactElement {
    return (
      <FormActions form={updateProjectForm} id={formId} blockedBy={blockedBy}>
        <SubmitButton requireDirty>
          <Trans>Save</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const onUpdate: SubmitHandler<ProjectFormValues> = async (values) => {
    await updateProject({
      id: projectId,
      name: values.name,
      description: values.description,
      settings: values.settings,
    });
    // This page stays open after it saved, so the form is made pristine again
    // with what went in. Without it Save would stay available and leaving would
    // ask about changes that are already saved.
    updateProjectForm.reset(values);
  };

  return (
    <Page title={t`General`} actions={<Actions />}>
      <ProjectForm
        schema={projectFormSchema}
        id={formId}
        projectForm={updateProjectForm}
        onFormSubmit={onUpdate}
        blockedBy={blockedBy}
        unsavedChangesTitle={t`General`}
      >
        {isReadingProject ? null : <RemoveProject project={project} />}
      </ProjectForm>
    </Page>
  );
}

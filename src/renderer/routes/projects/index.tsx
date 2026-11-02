import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { DownloadCloud, Plus } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { Page } from '@renderer/components/page';
import { Pane, Panel } from '@renderer/components/pane';
import {
  ProjectCard,
  ProjectCardSkeleton,
} from '@renderer/components/project-card';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@renderer/components/ui/empty';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import queryOptions from '@renderer/queries/options';

import { type CloneProjectProps, cloneProjectSchema } from '@elek-io/core';

export const Route = createFileRoute('/projects/')({
  component: ListProjectsPage,
});

/**
 * The Projects themselves, read inside the pane that shows them.
 *
 * A component of its own, because the read is what the pane answers for: the
 * boundary only catches what is thrown below it, so a read in the route
 * component above the pane would take the whole window to the error screen
 * instead. See contributing/error-handling.md.
 */
function ProjectList(): ReactElement {
  const { data: projects, isPending: isListingProjects } = useQueryNoError(
    queryOptions.projects.list({
      limit: 0,
    })
  );

  if (isListingProjects) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => {
          return <ProjectCardSkeleton key={i} />;
        })}
      </div>
    );
  }

  if (projects.total === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Plus />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>No Projects yet</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>
              You haven&apos;t created any Projects yet. Get started by creating
              a new or cloning an existing Project.
            </Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {projects.list.map((project) => {
        return <ProjectCard key={project.id} project={project} />;
      })}
    </div>
  );
}

function ListProjectsPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const cloneProjectForm = useAppForm<CloneProjectProps>({
    resolver: zodResolver(cloneProjectSchema),
    defaultValues: {
      url: '',
    },
  });
  // Core refuses a repository without a draft branch, which holds no Project
  // or one made before the branches were renamed. Said in the dialog, so the
  // address can be corrected. A git that cannot load a shared library raises
  // the same type, which the renderer cannot tell apart.
  // See contributing/error-handling.md.
  const [isCloneRefused, setIsCloneRefused] = useState(false);
  const { mutateAsync: cloneProject, handleError: handleCloneError } =
    useAppMutation(queryOptions.projects.clone, {
      handled: {
        PreconditionFailed: () => setIsCloneRefused(true),
      },
    });
  const [isCloningDialogOpen, setIsCloningDialogOpen] = useState(false);
  const cloneFormId = useId();

  const onCloneProject: SubmitHandler<CloneProjectProps> = async (props) => {
    setIsCloneRefused(false);
    try {
      await cloneProject(props);
      setIsCloningDialogOpen(false);
    } catch (error) {
      handleCloneError(error);
    }
  };

  function Description(): ReactElement {
    return (
      <Trans>
        A Project ...
        <br />
        Read more about <a href="#">Projects in the documentation</a>.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <>
        <Button
          Icon={Plus}
          onClick={async () => router.navigate({ to: '/projects/create' })}
        >
          <Trans>Create Project</Trans>
        </Button>
        <Button
          Icon={DownloadCloud}
          variant="secondary"
          onClick={() => setIsCloningDialogOpen(true)}
        >
          <Trans>Clone Project</Trans>
        </Button>
      </>
    );
  }

  return (
    <>
      <Panel>
        <Pane name={t`your Projects`}>
          <Page
            title={t`Projects`}
            description={<Description />}
            actions={<Actions />}
          >
            <ProjectList />
          </Page>
        </Pane>
      </Panel>

      <Dialog
        open={isCloningDialogOpen}
        onOpenChange={(isOpen) => {
          setIsCloningDialogOpen(isOpen);
          setIsCloneRefused(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Clone a Project by URL</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                You can clone an existing Project by providing the URL. Make
                sure you have the necessary permissions to access the Project.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <AppForm
              form={cloneProjectForm}
              schema={cloneProjectSchema}
              onSubmit={onCloneProject}
              id={cloneFormId}
            >
              <AppField
                form={cloneProjectForm}
                name="url"
                label={<Trans>URL</Trans>}
              >
                {({ field, controlProps }) => (
                  <TextControl field={field} type="text" {...controlProps} />
                )}
              </AppField>
              {isCloneRefused ? (
                <p role="alert" className="mt-4 text-sm text-error">
                  <Trans>
                    This repository holds no Project, or one made with an older
                    version of elek.io Desktop. Ask whoever set it up.
                  </Trans>
                </p>
              ) : null}
            </AppForm>
          </DialogBody>

          <DialogFooter>
            <FormActions form={cloneProjectForm} id={cloneFormId}>
              <SubmitButton Icon={DownloadCloud}>
                <Trans>Clone</Trans>
              </SubmitButton>
            </FormActions>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

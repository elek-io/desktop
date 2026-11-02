import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { ProjectForm } from '@renderer/components/forms/project-form';
import { Page } from '@renderer/components/page';
import { Pane, Panel } from '@renderer/components/pane';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { queryOptions } from '@renderer/queries';

import { type CreateProjectProps, createProjectSchema } from '@elek-io/core';

export const Route = createFileRoute('/projects/create')({
  component: CreateProjectPage,
});

function CreateProjectPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  useBreadcrumb(Route, t`Create`);
  const createProjectForm = useAppForm<CreateProjectProps>({
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
  });
  const { mutateAsync: createProject, isPending: isCreatingProject } =
    useMutation(queryOptions.projects.create);
  const formId = useId();

  function Description(): ReactElement {
    return (
      <Trans>
        New Projects start with no history or data.
        <br />
        Read more about <a href="#">Projects in the documentation</a>.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={createProjectForm} id={formId}>
        <SubmitButton Icon={Check}>
          <Trans>Create Project</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const onCreate: SubmitHandler<CreateProjectProps> = async (project) => {
    const newProject = await createProject(project);
    await router.navigate({
      to: '/projects/$projectId',
      params: { projectId: newProject.id },
    });
  };

  return (
    <Panel>
      <Pane name={t`what this screen shows`}>
        <Page
          title={t`Create a new Project`}
          description={<Description />}
          actions={<Actions />}
        >
          <ProjectForm
            id={formId}
            projectForm={createProjectForm}
            isViewOnly={isCreatingProject}
            onFormSubmit={onCreate}
          />
        </Page>
      </Pane>
    </Panel>
  );
}

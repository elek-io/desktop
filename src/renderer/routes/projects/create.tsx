import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { ProjectForm } from '@renderer/components/forms/project-form';
import { Page } from '@renderer/components/page';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { queryOptions } from '@renderer/queries';

import { type CreateProjectProps, createProjectSchema } from '@elek-io/core';

export const Route = createFileRoute('/projects/create')({
  component: CreateProjectPage,
});

function CreateProjectPage(): ReactElement {
  const router = useRouter();
  useBreadcrumb(Route, 'Create');
  const createProjectForm = useForm<CreateProjectProps>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
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
  const { mutateAsync: createProject, isPending: isCreatingProject } =
    useMutation(queryOptions.projects.create);
  const formId = useId();

  function Description(): ReactElement {
    return (
      <>
        New Projects start with no history or data.
        <br />
        Read more about <a href="#">Projects in the documentation</a>.
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={createProjectForm} id={formId}>
        <SubmitButton Icon={Check}>Create Project</SubmitButton>
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
    <Page
      title="Create a new Project"
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
  );
}

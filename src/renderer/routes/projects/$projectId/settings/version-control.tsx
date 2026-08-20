import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { queryOptions } from '@renderer/queries';

import {
  type SetRemoteOriginUrlProjectProps,
  setRemoteOriginUrlProjectSchema,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/settings/version-control'
)({
  component: ProjectSettingsVersionControlPage,
});

function ProjectSettingsVersionControlPage(): ReactElement {
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Version Control');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const { mutateAsync: setRemoteOriginUrl } = useMutation(
    queryOptions.projects.setRemoteOriginUrl
  );
  const remoteOriginUrlForm = useForm<SetRemoteOriginUrlProjectProps>({
    resolver: zodResolver(setRemoteOriginUrlProjectSchema),
    defaultValues: {
      id: projectId,
      url: '',
    },
  });
  // Reset form with Project data when it loads
  useEffect(() => {
    if (isReadingProject === false) {
      remoteOriginUrlForm.reset({
        id: project.id,
        url: project.remoteOriginUrl !== null ? project.remoteOriginUrl : '',
      });
    }
  }, [project, isReadingProject, remoteOriginUrlForm]);

  function Description(): ReactElement {
    return <></>;
  }

  function Actions(): ReactElement {
    return <></>;
  }

  const onSetRemoteOriginUrl: SubmitHandler<
    SetRemoteOriginUrlProjectProps
  > = async (props) => {
    await setRemoteOriginUrl(props);
  };

  return (
    <Page
      title="Version Control Settings"
      description={<Description />}
      actions={<Actions />}
    >
      <AppForm form={remoteOriginUrlForm} onSubmit={onSetRemoteOriginUrl}>
        <PageSection
          title="Remote"
          description="A Projects remote is a place that makes it accessible for other users. By adding a remote you are able to work with multiple others together on the same Project."
          actions={
            <FormActions form={remoteOriginUrlForm}>
              <SubmitButton requireDirty Icon={Check}>
                Save changes
              </SubmitButton>
            </FormActions>
          }
        >
          <div className="grid grid-cols-12 gap-6">
            <FormField
              control={remoteOriginUrlForm.control}
              name="url"
              render={({ field }) => (
                <FormItem className="col-span-12">
                  <FormLabel isRequired>Remote URL</FormLabel>
                  <FormControl>
                    <FormInputField field={field} type="url" />
                  </FormControl>
                  <FormDescription />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </PageSection>
      </AppForm>
    </Page>
  );
}

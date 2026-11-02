import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
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
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Version Control`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const { mutateAsync: setRemoteOriginUrl } = useMutation(
    queryOptions.projects.setRemoteOriginUrl
  );
  const remoteOriginUrlForm = useAppForm<SetRemoteOriginUrlProjectProps>({
    resolver: zodResolver(setRemoteOriginUrlProjectSchema),
    defaultValues: {
      id: projectId,
      url: '',
    },
    // Filled from the query rather than reset in an effect.
    ...(isReadingProject
      ? {}
      : {
          values: {
            id: project.id,
            url: project.remoteOriginUrl ?? '',
          },
        }),
    disabled: isReadingProject,
  });

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
      title={t`Version Control Settings`}
      description={<Description />}
      actions={<Actions />}
    >
      <AppForm form={remoteOriginUrlForm} onSubmit={onSetRemoteOriginUrl}>
        <PageSection
          title={t`Remote`}
          description={t`A Projects remote is a place that makes it accessible for other users. By adding a remote you are able to work with multiple others together on the same Project.`}
          actions={
            <FormActions form={remoteOriginUrlForm}>
              <SubmitButton requireDirty Icon={Check}>
                <Trans>Save changes</Trans>
              </SubmitButton>
            </FormActions>
          }
        >
          <div className="grid grid-cols-12 gap-6">
            <AppField
              form={remoteOriginUrlForm}
              name="url"
              label={<Trans>Remote URL</Trans>}
              required
              className="col-span-12"
            >
              {({ field, controlProps }) => (
                <TextControl field={field} type="url" {...controlProps} />
              )}
            </AppField>
          </div>
        </PageSection>
      </AppForm>
    </Page>
  );
}

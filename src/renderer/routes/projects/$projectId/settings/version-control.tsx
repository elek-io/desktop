import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { Page } from '@renderer/components/page';
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
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import {
  addressWithStoredCredential,
  maskAddressCredential,
} from '@renderer/lib/gitAddress';
import { queryOptions } from '@renderer/queries';

import {
  type SetRemoteOriginUrlProjectProps,
  setRemoteOriginUrlProjectSchema,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/settings/version-control'
)({
  component: ProjectSettingsSyncPage,
});

/**
 * The Sync page of a Project's Settings: the address of its Git repository.
 *
 * The address is shown with any credential in it masked, and the stored one is
 * put back on the way to Core, so a save that did not touch it keeps it and
 * nothing on screen or on the clipboard carries it, see `lib/gitAddress.ts`.
 */
function ProjectSettingsSyncPage(): ReactElement {
  const { t } = useLingui();

  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Sync`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const { mutateAsync: setRemoteOriginUrl } = useMutation(
    queryOptions.projects.setRemoteOriginUrl
  );
  const formId = useId();
  const storedUrl = isReadingProject ? null : project.remoteOriginUrl;
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
            url: maskAddressCredential(project.remoteOriginUrl ?? ''),
          },
        }),
    disabled: isReadingProject,
  });

  // Core takes the address as a string it has to have, and answers an empty one
  // with an internal failure, so Save says what is missing rather than letting
  // the press find out, see contributing/renderer/forms.md#saves-block.
  const blockedBy = emptyFieldsReason(
    countEmptyFields([remoteOriginUrlForm.watch('url')])
  );

  function Actions(): ReactElement {
    return (
      <FormActions form={remoteOriginUrlForm} id={formId} blockedBy={blockedBy}>
        <SubmitButton requireDirty>
          <Trans>Save</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const onSetRemoteOriginUrl: SubmitHandler<
    SetRemoteOriginUrlProjectProps
  > = async (props) => {
    const url = addressWithStoredCredential(props.url, storedUrl);
    await setRemoteOriginUrl({ ...props, url });
    // This page stays open after it saved, so the form is made pristine again
    // with what went in, masked as it is shown. Without it Save would stay
    // available and leaving would ask about changes that are already saved.
    remoteOriginUrlForm.reset({ ...props, url: maskAddressCredential(url) });
  };

  return (
    <Page title={t`Sync`} actions={<Actions />}>
      <AppForm
        form={remoteOriginUrlForm}
        schema={setRemoteOriginUrlProjectSchema}
        onSubmit={onSetRemoteOriginUrl}
        id={formId}
        blockedBy={blockedBy}
        unsavedChangesTitle={t`Sync`}
      >
        <div className="flex flex-col gap-4">
          <AppField
            form={remoteOriginUrlForm}
            name="url"
            label={<Trans>Git repository</Trans>}
            description={
              storedUrl === null ? (
                <Trans>
                  An empty repository that supports Git LFS. Once it is saved,
                  Sync uploads the Project there.
                </Trans>
              ) : (
                <Trans>
                  Desktop syncs this Project with it. A password or token in the
                  address stays hidden.
                </Trans>
              )
            }
          >
            {({ field, controlProps }) => (
              <TextControl
                field={field}
                type="text"
                className="font-mono"
                {...controlProps}
              />
            )}
          </AppField>
          {storedUrl === null ? null : (
            <p className="text-small text-muted-foreground">
              <Trans>
                Desktop checks it for incoming changes every 3 minutes.
              </Trans>
            </p>
          )}
        </div>
      </AppForm>
    </Page>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { CommitHistory } from '@renderer/components/commit-history';
import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Card } from '@renderer/components/ui/card';
import {
  SwitchControl,
  TextControl,
} from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useUser } from '@renderer/hooks/useUser';
import { queryOptions } from '@renderer/queries';

import {
  type GitCommit,
  type SetUserProps,
  setUserSchema,
  supportedLanguageSchema,
} from '@elek-io/core';

/** Every language Core offers, as the value-to-label map a select needs. */
const languageItems: Record<string, string> = Object.fromEntries(
  supportedLanguageSchema.options.map((option) => [option, option])
);

export const Route = createFileRoute('/user/profile')({
  component: UserProfilePage,
});

function UserProfilePage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  useBreadcrumb(Route, t`Profile`);
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const { data: isLocalApiRunning } = useQueryNoError(
    queryOptions.api.isRunning()
  );
  const { mutateAsync: stopApi } = useMutation(queryOptions.api.stop);
  const { mutateAsync: setUser } = useMutation(queryOptions.user.set);
  const formId = useId();
  const setUserForm = useAppForm<SetUserProps>({
    resolver: zodResolver(setUserSchema),
    defaultValues: {
      userType: 'local',
      // A local User never has an elek.io account id, which is what tells the
      // two kinds of User apart. Runtime only, since the form is typed by the
      // whole SetUserProps union.
      id: null,
      name: '',
      email: '',
      language: 'en',
      localApi: {
        port: 31310,
        isEnabled: false,
      },
    },
    // Filled from the query, so a refetch never overwrites what is being typed
    // and the form needs no reset of its own.
    ...(user === null || user === undefined ? {} : { values: user }),
    disabled: isGettingUser,
  });

  const { mutateAsync: startApi, handleError: handleStartApiError } =
    useAppMutation(queryOptions.api.start, {
      handled: {
        // Something else holds the port. Mark the field, so the User can pick
        // another port and save again.
        Conflict: () =>
          setUserForm.setError(
            'localApi.port',
            {
              message: t`This port is already in use by another application. Choose a different one.`,
            },
            { shouldFocus: true }
          ),
      },
    });

  const exampleCommit: GitCommit = {
    hash: '1234567890',
    author: {
      name: setUserForm.watch('name'),
      email: setUserForm.watch('email'),
    },
    datetime: new Date().toISOString(),
    tag: null,
    message: {
      method: 'create',
      reference: {
        objectType: 'project',
        id: '1',
      },
    },
  };
  const localApiUrl = `http://localhost:${setUserForm.watch('localApi.port')}`;

  function Description(): ReactElement {
    if (user === null) {
      return (
        <Trans>
          Before we start you need to set up a local User first. Don&apos;t
          worry, you are not creating an account and this information is only
          saved locally on this device! Read more about{' '}
          <a href="#">local Users in our documentation</a> if you have questions
          about this step.
        </Trans>
      );
    }

    return (
      <Trans>
        By editing your Users details, ... Read more about{' '}
        <a href="#">local Users in our documentation</a>.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={setUserForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          <Trans>Save local User</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  function LocalApiDescription(): ReactElement {
    return (
      <Trans>
        Use the local API to read data from your local Projects. The local API
        is only accessible on this device. You can access it at{' '}
        <a href={localApiUrl} target="_blank" rel="noreferrer">
          {localApiUrl}
        </a>{' '}
        once it is enabled.
      </Trans>
    );
  }

  const onSetUser: SubmitHandler<SetUserProps> = async (props) => {
    // Start the API before saving, so a port in use saves nothing and the form
    // keeps what was entered to correct the port and save again.
    if (props.localApi.isEnabled === true && isLocalApiRunning === false) {
      try {
        await startApi(props.localApi.port);
      } catch (error) {
        handleStartApiError(error);
        return;
      }
    }

    const user = await setUser(props);

    if (user.localApi.isEnabled === false && isLocalApiRunning === true) {
      await stopApi();
    }

    await router.navigate({ to: '/projects' });
  };

  return (
    <Page
      title={user === null ? t`Welcome to elek.io Desktop` : t`User profile`}
      description={<Description />}
      actions={<Actions />}
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-8">
        <Card className="py-0 lg:col-span-2">
          <AppForm form={setUserForm} onSubmit={onSetUser} id={formId}>
            <PageSection
              title={t`Local User`}
              description={t`Fill out your information below and watch it influence how your future changes will look like on the right.`}
              className="rounded-t-xl border-t-0"
            >
              <div className="grid gap-6">
                <AppField
                  form={setUserForm}
                  name="language"
                  label={<Trans>Preferred language</Trans>}
                  required
                  description={
                    <Trans>
                      Changing your preferred language will attempt to translate
                      everything you see in elek.io Desktop. You can help
                      translate elek.io Desktop by contributing to our{' '}
                      <a
                        href="https://github.com/elek-io/desktop"
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHub repository
                      </a>
                      .
                    </Trans>
                  }
                >
                  {({ field, controlProps }) => (
                    <Select
                      items={languageItems}
                      value={field.value}
                      onValueChange={field.onChange}
                      {...controlProps}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedLanguageSchema.options.map((option) => {
                          return (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </AppField>
                <AppField
                  form={setUserForm}
                  name="name"
                  label={<Trans>Full name</Trans>}
                  required
                  description={
                    <Trans>
                      Your name will be used by others to identify changes made
                      by you.
                    </Trans>
                  }
                >
                  {({ field, controlProps }) => (
                    <TextControl field={field} type="text" {...controlProps} />
                  )}
                </AppField>
                <AppField
                  form={setUserForm}
                  name="email"
                  label={<Trans>Email</Trans>}
                  required
                  description={
                    <Trans>
                      Your email allows other members of Projects to contact
                      you.
                    </Trans>
                  }
                >
                  {({ field, controlProps }) => (
                    <TextControl field={field} type="email" {...controlProps} />
                  )}
                </AppField>
              </div>
            </PageSection>
            <PageSection
              title={t`Local API`}
              description={<LocalApiDescription />}
            >
              <div className="grid gap-6">
                <AppField
                  form={setUserForm}
                  name="localApi.port"
                  label={<Trans>Port</Trans>}
                  required
                  description={
                    <Trans>
                      The port used to access the local API. Make sure it is not
                      in use by another application.
                    </Trans>
                  }
                >
                  {({ field, controlProps }) => (
                    <TextControl
                      field={field}
                      type="number"
                      {...controlProps}
                    />
                  )}
                </AppField>
                <AppField
                  form={setUserForm}
                  name="localApi.isEnabled"
                  label={<Trans>Enabled</Trans>}
                  required
                  orientation="horizontal"
                  description={
                    <Trans>
                      By enabling the local API it will start whenever elek.io
                      Desktop is opened. This allows you to read local Project
                      data from other applications.
                    </Trans>
                  }
                  className="gap-4 rounded-lg border border-border p-3 shadow-xs"
                >
                  {({ field, controlProps }) => (
                    <SwitchControl field={field} {...controlProps} />
                  )}
                </AppField>
              </div>
            </PageSection>
          </AppForm>
        </Card>
        <aside className="grid grid-cols-1">
          <PageSection
            title={t`Example change`}
            description={t`This is how a change made by you will look like based on the information you've given on the left.`}
            standalone
          >
            <CommitHistory projectId="1" commits={[exampleCommit]} disabled />
          </PageSection>
        </aside>
      </div>
    </Page>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { type ReactElement, useEffect, useId } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { CommitHistory } from '@renderer/components/commit-history';
import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Card } from '@renderer/components/ui/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
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
  const setUserForm = useForm<SetUserProps>({
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

  // Reset form with user data when it loads
  useEffect(() => {
    if (user) {
      setUserForm.reset(user);
    }
  }, [user, setUserForm]);

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
          <AppForm
            form={setUserForm}
            onSubmit={onSetUser}
            id={formId}
            mode={isGettingUser ? 'view' : 'edit'}
          >
            <PageSection
              title={t`Local User`}
              description={t`Fill out your information below and watch it influence how your future changes will look like on the right.`}
              className="rounded-t-xl border-t-0"
            >
              <div className="grid gap-6">
                <FormField
                  control={setUserForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>
                        <Trans>Preferred language</Trans>
                      </FormLabel>
                      <FormControl>
                        <Select
                          items={languageItems}
                          value={field.value}
                          onValueChange={field.onChange}
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
                      </FormControl>
                      <FormDescription>
                        <Trans>
                          Changing your preferred language will attempt to
                          translate everything you see in elek.io Desktop. You
                          can help translate elek.io Desktop by contributing to
                          our{' '}
                          <a
                            href="https://github.com/elek-io/desktop"
                            target="_blank"
                            rel="noreferrer"
                          >
                            GitHub repository
                          </a>
                          .
                        </Trans>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={setUserForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>
                        <Trans>Full name</Trans>
                      </FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="text" />
                      </FormControl>
                      <FormDescription>
                        <Trans>
                          Your name will be used by others to identify changes
                          made by you.
                        </Trans>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={setUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>
                        <Trans>Email</Trans>
                      </FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="email" />
                      </FormControl>
                      <FormDescription>
                        <Trans>
                          Your email allows other members of Projects to contact
                          you.
                        </Trans>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </PageSection>
            <PageSection
              title={t`Local API`}
              description={<LocalApiDescription />}
            >
              <div className="grid gap-6">
                <FormField
                  control={setUserForm.control}
                  name="localApi.port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>
                        <Trans>Port</Trans>
                      </FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="number" />
                      </FormControl>
                      <FormDescription>
                        <Trans>
                          The port used to access the local API. Make sure it is
                          not in use by another application.
                        </Trans>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={setUserForm.control}
                  name="localApi.isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs">
                      <div className="mr-4">
                        <FormLabel isRequired>
                          <Trans>Enabled</Trans>
                        </FormLabel>
                        <FormDescription>
                          <Trans>
                            By enabling the local API it will start whenever
                            elek.io Desktop is opened. This allows you to read
                            local Project data from other applications.
                          </Trans>
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

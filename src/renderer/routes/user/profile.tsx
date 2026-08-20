import { zodResolver } from '@hookform/resolvers/zod';
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

export const Route = createFileRoute('/user/profile')({
  component: UserProfilePage,
});

function UserProfilePage(): ReactElement {
  const router = useRouter();
  useBreadcrumb(Route, 'Profile');
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const { data: isLocalApiRunning } = useQueryNoError(
    queryOptions.api.isRunning()
  );
  const { mutateAsync: startApi } = useMutation(queryOptions.api.start);
  const { mutateAsync: stopApi } = useMutation(queryOptions.api.stop);
  const { mutateAsync: setUser } = useMutation(queryOptions.user.set);
  const formId = useId();
  const setUserForm = useForm<SetUserProps>({
    resolver: zodResolver(setUserSchema),
    defaultValues: {
      userType: 'local',
      name: '',
      email: '',
      language: 'en',
      localApi: {
        port: 31310,
        isEnabled: false,
      },
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
        <>
          Before we start you need to set up a local User first. Don&apos;t
          worry, you are not creating an account and this information is only
          saved locally on this device! Read more about{' '}
          <a href="#">local Users in our documentation</a> if you have questions
          about this step.
        </>
      );
    }

    return (
      <>
        By editing your Users details, ... Read more about{' '}
        <a href="#">local Users in our documentation</a>.
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={setUserForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          Save local User
        </SubmitButton>
      </FormActions>
    );
  }

  function LocalApiDescription(): ReactElement {
    return (
      <>
        Use the local API to read data from your local Projects. The local API
        is only accessible on this device. You can access it at{' '}
        <a href={localApiUrl} target="_blank" rel="noreferrer">
          {localApiUrl}
        </a>{' '}
        once it is enabled.
      </>
    );
  }

  const onSetUser: SubmitHandler<SetUserProps> = async (props) => {
    const user = await setUser(props);

    if (user.localApi.isEnabled === true && isLocalApiRunning === false) {
      await startApi(user.localApi.port);
    }

    if (user.localApi.isEnabled === false && isLocalApiRunning === true) {
      await stopApi();
    }

    await router.navigate({ to: '/projects' });
  };

  return (
    <Page
      title={user === null ? 'Welcome to elek.io Desktop' : 'User profile'}
      description={<Description />}
      actions={<Actions />}
      layout="bare"
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
              title="Local User"
              description="Fill out your information below and watch it influence how your future changes will look like on the right."
              className="rounded-t-xl border-t-0"
            >
              <div className="grid gap-6">
                <FormField
                  control={setUserForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Preferred language</FormLabel>
                      <FormControl>
                        <Select
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
                        Changing your preferred language will attempt to
                        translate everything you see in elek.io Desktop. You can
                        help translate elek.io Desktop by contributing to our{' '}
                        <a
                          href="https://github.com/elek-io/desktop"
                          target="_blank"
                          rel="noreferrer"
                        >
                          GitHub repository
                        </a>
                        .
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
                      <FormLabel isRequired>Full name</FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="text" />
                      </FormControl>
                      <FormDescription>
                        Your name will be used by others to identify changes
                        made by you.
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
                      <FormLabel isRequired>Email</FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="email" />
                      </FormControl>
                      <FormDescription>
                        Your email allows other members of Projects to contact
                        you.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </PageSection>
            <PageSection
              title="Local API"
              description={<LocalApiDescription />}
            >
              <div className="grid gap-6">
                <FormField
                  control={setUserForm.control}
                  name="localApi.port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Port</FormLabel>
                      <FormControl>
                        <FormInputField field={field} type="number" />
                      </FormControl>
                      <FormDescription>
                        The port used to access the local API. Make sure it is
                        not in use by another application.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={setUserForm.control}
                  name="localApi.isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-800">
                      <div className="mr-4">
                        <FormLabel isRequired>Enabled</FormLabel>
                        <FormDescription>
                          By enabling the local API it will start whenever
                          elek.io Desktop is opened. This allows you to read
                          local Project data from other applications.
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
            title="Example change"
            description="This is how a change made by you will look like based on the information you've given on the left."
            standalone
          >
            <CommitHistory projectId="1" commits={[exampleCommit]} disabled />
          </PageSection>
        </aside>
      </div>
    </Page>
  );
}

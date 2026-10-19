import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { InfoIcon, LogInIcon, UserPlusIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { Page } from '@renderer/components/page';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import {
  FormControl,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import { requiredField } from '@renderer/lib/requiredField';
import { queryOptions } from '@renderer/queries';

import { type SetUserProps, setUserSchema } from '@elek-io/core';

type LocalUserProps = Extract<SetUserProps, { userType: 'local' }>;

// Core's schema of a local User, its name and address first checked for a
// value, so an empty one says what it asks for
const [setLocalUserSchema] = setUserSchema.options;
const firstStartSchema = setLocalUserSchema.extend({
  name: requiredField(setLocalUserSchema.shape.name, 'Enter your name.'),
  email: requiredField(
    setLocalUserSchema.shape.email,
    'Enter your email address.'
  ),
});

export const Route = createFileRoute('/welcome/')({
  component: FirstStartPage,
});

/**
 * The First start, before any User exists: work on this computer, or with
 * elek.io Cloud, which stays optional. See contributing/cloud-account.md.
 */
function FirstStartPage(): ReactElement {
  const router = useRouter();
  const userForm = useForm<LocalUserProps>({
    resolver: zodResolver(firstStartSchema),
    defaultValues: {
      userType: 'local',
      // A local User never has an elek.io account id
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
  const { mutateAsync: setUser } = useMutation(queryOptions.user.set);

  const onContinue: SubmitHandler<LocalUserProps> = async (props) => {
    await setUser(props);
    await router.navigate({ to: '/projects' });
  };

  return (
    <Page
      title="Welcome to elek.io Desktop"
      description={
        <>
          Start on this computer, or with elek.io Cloud. You can sign in later,
          or never.
        </>
      }
      layout="bare"
    >
      <Card className="mx-auto grid max-w-3xl gap-0 overflow-hidden py-0 md:grid-cols-2">
        <section className="grid content-start gap-6 p-6">
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold">Work on this computer</h3>
            <p className="text-sm text-muted-foreground">
              Every part of Desktop works without an account.
            </p>
          </div>
          <AppForm
            form={userForm}
            onSubmit={onContinue}
            fieldsetClassName="grid gap-6"
          >
            <FormField
              control={userForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Name</FormLabel>
                  <FormControl>
                    <FormInputField
                      field={field}
                      type="text"
                      autoComplete="name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={userForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Email address</FormLabel>
                  <FormControl>
                    <FormInputField
                      field={field}
                      type="email"
                      autoComplete="email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Your name and email address mark your changes in the History.
              They&apos;re saved with each change, so whoever you sync a Project
              with sees them. Desktop sends them nowhere else.
            </p>
            <FormActions form={userForm}>
              <SubmitButton className="w-full">Continue</SubmitButton>
            </FormActions>
          </AppForm>
        </section>
        <section className="flex flex-col gap-6 border-t bg-muted/50 p-6 md:border-t-0 md:border-l">
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">elek.io Cloud</h3>
              <Badge variant="outline">Optional</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Keeps your Projects, so you can sync them between computers and
              work on them together.
            </p>
          </div>
          <div className="grid gap-2">
            <Button
              variant="outline"
              Icon={LogInIcon}
              onClick={async () => router.navigate({ to: '/welcome/sign-in' })}
            >
              Sign in
            </Button>
            <Button
              variant="ghost"
              Icon={UserPlusIcon}
              onClick={async () =>
                router.navigate({ to: '/welcome/create-account' })
              }
            >
              Create account
            </Button>
          </div>
          <p className="mt-auto text-xs text-muted-foreground">
            Invited to an organization? Use the email address the invitation
            went to.
          </p>
        </section>
      </Card>
    </Page>
  );
}

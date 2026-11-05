import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ArrowRight, Info } from 'lucide-react';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { BrandMark } from '@renderer/components/brand-mark';
import { GradientPane } from '@renderer/components/gradient-pane';
import { Pane, Panel } from '@renderer/components/pane';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import { queryOptions } from '@renderer/queries';

import { type SetUserProps, setUserSchema } from '@elek-io/core';

export const Route = createFileRoute('/welcome')({
  component: FirstStartPage,
});

/**
 * The first screen of all, before any User exists.
 *
 * Nothing in Desktop can be written without a name and an email address: Core
 * stamps them on every change it commits, so this asks for them before anything
 * else. The route is reached by the gate on the root route, which sends every
 * other address here while there is no User and sends this one away once there
 * is, see `routes/__root.tsx`.
 *
 * It stands on the one gradient, as the Welcome screen that follows it does,
 * with one card of 360 px on it. The card keeps the light colors in light mode
 * through `on-plate`, because a form to fill in reads like the rest of the app
 * on its own surface.
 */
function FirstStartPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  useBreadcrumb(Route, t`Welcome`);
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
      // The language the app starts in, which the user menu changes.
      language: 'en',
      // What the Profile offers, where the local API is set up. It is off until
      // somebody switches it on there.
      localApi: {
        port: 31310,
        isEnabled: false,
      },
    },
  });
  const { mutateAsync: setUser } = useMutation(queryOptions.user.set);
  const formId = useId();

  const values = setUserForm.watch();
  const blockedBy = emptyFieldsReason(
    countEmptyFields([values.name, values.email])
  );

  const onContinue: SubmitHandler<SetUserProps> = async (user) => {
    await setUser(user);
    // The gate on the root route lets the Projects page through from here,
    // because the mutation wrote the User into the cache it reads.
    await router.navigate({ to: '/projects' });
  };

  return (
    <Panel>
      {/* Nothing in here is read, so the name is never shown. */}
      <Pane name={t`what this screen shows`}>
        <GradientPane>
          <BrandMark className="size-12" />
          <h1 className="mt-6 text-h3">
            <Trans>Welcome to elek.io Desktop</Trans>
          </h1>
          <p className="mt-2 text-body text-muted-foreground">
            <Trans>Start with your name and email address.</Trans>
          </p>

          <div className="on-plate mt-8 w-90 rounded-lg border bg-card text-left">
            <AppForm
              form={setUserForm}
              schema={setUserSchema}
              onSubmit={onContinue}
              id={formId}
              blockedBy={blockedBy}
              fieldsetClassName="flex flex-col gap-4 p-6"
            >
              <AppField
                form={setUserForm}
                name="name"
                label={<Trans>Name</Trans>}
              >
                {({ field, controlProps }) => (
                  <TextControl field={field} type="text" {...controlProps} />
                )}
              </AppField>
              <AppField
                form={setUserForm}
                name="email"
                label={<Trans>Email address</Trans>}
              >
                {({ field, controlProps }) => (
                  <TextControl field={field} type="email" {...controlProps} />
                )}
              </AppField>
              {/*
                What Desktop keeps of the two and where they go. It is true of
                the build: nothing but a commit Core writes carries them, and
                Report an issue fills them in for the person to change or clear
                before they send it.
              */}
              <p className="flex gap-2 text-small text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 size-3 flex-none" />
                <span>
                  <Trans>
                    Your name and email address mark your changes in the
                    History. They&apos;re saved with each change, so whoever you
                    sync a Project with sees them. Desktop sends them nowhere
                    else without asking.
                  </Trans>
                </span>
              </p>
              <FormActions form={setUserForm} id={formId} blockedBy={blockedBy}>
                <SubmitButton Icon={ArrowRight} className="w-full">
                  <Trans>Continue</Trans>
                </SubmitButton>
              </FormActions>
            </AppForm>
          </div>
        </GradientPane>
      </Pane>
    </Panel>
  );
}

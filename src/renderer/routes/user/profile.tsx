import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import {
  UserIdentityFields,
  UserIdentityNote,
} from '@renderer/components/forms/user-form';
import {
  AppField,
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useUser } from '@renderer/hooks/useUser';
import { countEmptyFields, emptyFieldsReason } from '@renderer/lib/emptyFields';
import { queryOptions } from '@renderer/queries';

import { type SetUserProps, setUserSchema } from '@elek-io/core';

export const Route = createFileRoute('/user/profile')({
  component: UserProfilePage,
});

/**
 * The Profile: who the person's changes are from, and the Local API.
 *
 * ci's form of 360 px, centered like the sign in pages, with the same two
 * fields and the same note the first start shows. The app's language and the
 * switch that turns the Local API on are in the user menu, which is why
 * neither is here.
 */
function UserProfilePage(): ReactElement {
  const { t } = useLingui();

  useBreadcrumb(Route, t`Profile`);
  const {
    userQuery: { data: user, isPending: isReadingUser },
  } = useUser();
  const { data: isLocalApiRunning } = useQueryNoError(
    queryOptions.api.isRunning()
  );
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
      // The language the app is read in, which the user menu changes, and
      // whether the Local API comes back with the app, which its switch in
      // that menu writes. Both come along with a save here, because this page
      // shows no field for either and so keeps them as it found them.
      language: 'en',
      localApi: {
        port: 31310,
        isEnabled: false,
      },
    },
    // Filled from the query, so a refetch never overwrites what is being typed
    // and the form needs no reset of its own.
    ...(user === null || user === undefined ? {} : { values: user }),
    disabled: isReadingUser,
  });

  const { mutateAsync: startApi, handleError: handleStartApiError } =
    useAppMutation(queryOptions.api.start, {
      handled: {
        // Something else holds the port. Mark the field, so the User can
        // pick another port and save again, which is where ci puts a field
        // that is wrong, see contributing/error-handling.md.
        Conflict: () =>
          setUserForm.setError(
            'localApi.port',
            {
              message: t`This port is already in use. Choose a different one.`,
            },
            { shouldFocus: true }
          ),
      },
    });

  const values = setUserForm.watch();
  // Read off the field, so the address follows the port while it is typed. The
  // scheme and the host are the same in every language.
  const localApiUrl = `http://localhost:${values.localApi.port}`;
  // Core refuses a User without a name or an email address, and the Local API
  // needs a port to listen on, so Save says what is missing rather than letting
  // the press find out, see contributing/renderer/forms.md#saves-block.
  const blockedBy = emptyFieldsReason(
    countEmptyFields([values.name, values.email, values.localApi.port])
  );

  const onSetUser: SubmitHandler<SetUserProps> = async (props) => {
    // The Local API comes back with the app while its switch is on, and a port
    // something else held at launch leaves it off, so saving a free port here
    // is how it is started again. Before the save, so a port still in use
    // saves nothing and the form keeps what was entered to correct it and save
    // again. See contributing/error-handling.md.
    if (props.localApi.isEnabled === true && isLocalApiRunning === false) {
      try {
        await startApi(props.localApi.port);
      } catch (error) {
        handleStartApiError(error);
        return;
      }
    }

    await setUser(props);
    // This page stays open after it saved, so the form is made pristine again
    // with what went in.
    setUserForm.reset(props);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/*
        ci's column of 360 px, centered on the panel like the sign in pages,
        with the pane's own text edge around it rather than inside it. An auto
        margin rather than centered content, so a form taller than the window
        keeps both its ends reachable while the pane scrolls.
      */}
      <div className="m-auto px-(--pane-edge) py-6">
        <div className="w-90">
          <div className="mb-6 text-center">
            <h1 className="text-h3">
              <Trans>Profile</Trans>
            </h1>
            <p className="mt-2 text-muted-foreground">
              <Trans>Who your changes are from, and the Local API.</Trans>
            </p>
          </div>

          <AppForm
            form={setUserForm}
            schema={setUserSchema}
            onSubmit={onSetUser}
            id={formId}
            blockedBy={blockedBy}
            unsavedChangesTitle={t`Profile`}
            fieldsetClassName="flex flex-col gap-4"
          >
            <UserIdentityFields form={setUserForm} />
            <UserIdentityNote />

            <h2 className="mt-2 border-t pt-4 text-label">
              <Trans>Local API</Trans>
            </h2>
            <AppField
              form={setUserForm}
              name="localApi.port"
              label={<Trans>Port</Trans>}
              description={
                <Trans>
                  While it&apos;s on, other apps on this computer read your
                  Projects at <span className="font-mono">{localApiUrl}</span>.
                  You turn it on in the user menu.
                </Trans>
              }
            >
              {({ field, controlProps }) => (
                <TextControl field={field} type="number" {...controlProps} />
              )}
            </AppField>

            <FormActions form={setUserForm} id={formId} blockedBy={blockedBy}>
              <SubmitButton requireDirty className="w-full">
                <Trans>Save</Trans>
              </SubmitButton>
            </FormActions>
          </AppForm>
        </div>
      </div>
    </main>
  );
}

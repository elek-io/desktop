import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { customMutationOptions } from '../util';

/**
 * Reads the account state again after it changed. Core sets the User when
 * signing in or out, so both queries go stale together.
 */
export async function refreshCloudAccount(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['user'] }),
    client.invalidateQueries({ queryKey: ['cloud', 'account'] }),
  ]);
}

/**
 * Query and mutation options for the parts of Core that talk to elek.io Cloud.
 *
 * A report is the one thing sent only because the user typed it and pressed
 * send. The account is reached through the main process, which keeps the
 * session's token and never hands it to the renderer, see
 * contributing/cloud-account.md.
 */
export const cloudOptions = {
  reports: {
    create: customMutationOptions({
      mutationFn: window.ipc.core.cloud.reports.create,
      meta: {
        method: 'create',
        objectType: 'report',
      },
      onSuccess: () => {
        // A report is write only. Nothing in the app reads one back, so there is
        // no cache to update.
      },
    }),
  },
  account: {
    /**
     * Whether Core holds a session token. Together with the User's type it
     * says where the person works, see `useCloudAccount`.
     */
    hasToken: () =>
      queryOptions({
        queryKey: ['cloud', 'account'],
        queryFn: async () => window.ipc.core.cloud.account.hasToken(),
        throwOnError: true,
      }),
    signIn: customMutationOptions({
      mutationFn: window.ipc.core.cloud.account.signIn,
      meta: {
        method: 'signIn',
        objectType: 'account',
        successToast: 'Signed in to elek.io Cloud',
      },
      onSuccess: async (_answer, _variables, _result, context) =>
        refreshCloudAccount(context.client),
    }),
    signUp: customMutationOptions({
      mutationFn: window.ipc.core.cloud.account.signUp,
      meta: {
        method: 'signUp',
        objectType: 'account',
        // Signing up may end without a session, so the page says which
        successToast: false,
      },
      onSuccess: async (_answer, _variables, _result, context) =>
        refreshCloudAccount(context.client),
    }),
    signOut: customMutationOptions({
      mutationFn: window.ipc.core.cloud.account.signOut,
      meta: {
        method: 'signOut',
        objectType: 'account',
        successToast: 'Signed out of elek.io Cloud',
      },
      onSuccess: async (_answer, _variables, _result, context) =>
        refreshCloudAccount(context.client),
    }),
  },
};

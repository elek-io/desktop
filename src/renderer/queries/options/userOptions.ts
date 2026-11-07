import { t } from '@lingui/core/macro';
import { queryOptions } from '@tanstack/react-query';

import { customMutationOptions } from '../util';

export const userOptions = {
  get: () =>
    queryOptions({
      queryKey: ['user'],
      queryFn: async () => {
        return await window.ipc.core.user.get();
      },
      throwOnError: true,
    }),
  set: customMutationOptions({
    mutationFn: window.ipc.core.user.set,
    meta: {
      method: 'set',
      objectType: 'user',
    },
    toasts: {
      success: () => t`Profile saved`,
      error: () => t`Could not save your profile`,
    },
    onSuccess: (updatedUser, _variables, _result, context) => {
      context.client.setQueryData(['user'], updatedUser);
    },
  }),
  /**
   * A preference the user menu sets: the language the app is read in, and
   * whether the Local API comes back with the app.
   *
   * Its own entry rather than `set`, because each of these is its own answer.
   * The app's words change language in front of the person, and the Local
   * API's own toast says it started or stopped, so a second one saying a
   * profile was saved would name something nobody did. Only a failure has
   * words. See contributing/error-handling.md.
   */
  setPreference: customMutationOptions({
    mutationFn: window.ipc.core.user.set,
    meta: {
      method: 'set',
      objectType: 'user',
    },
    toasts: {
      success: null,
      error: () => t`Could not save your choice`,
    },
    onSuccess: (updatedUser, _variables, _result, context) => {
      context.client.setQueryData(['user'], updatedUser);
    },
  }),
};

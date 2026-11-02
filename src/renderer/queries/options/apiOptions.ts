import { t } from '@lingui/core/macro';
import { queryOptions } from '@tanstack/react-query';

import { customMutationOptions } from '../util';

export const apiOptions = {
  isRunning: () =>
    queryOptions({
      queryKey: ['user', 'localApi', 'isRunning'],
      queryFn: async () => {
        return await window.ipc.core.api.isRunning();
      },
      throwOnError: true,
    }),
  start: customMutationOptions({
    mutationFn: window.ipc.core.api.start,
    meta: {
      method: 'start',
      objectType: 'api',
    },
    toasts: {
      success: () => t`Local API started`,
      error: () => t`Could not start the local API`,
    },
    onSuccess: (_data, _variables, _result, context) => {
      context.client.setQueryData(['user', 'localApi', 'isRunning'], true);
    },
  }),
  stop: customMutationOptions({
    mutationFn: window.ipc.core.api.stop,
    meta: {
      method: 'stop',
      objectType: 'api',
    },
    toasts: {
      success: () => t`Local API stopped`,
      error: () => t`Could not stop the local API`,
    },
    onSuccess: (_data, _variables, _result, context) => {
      context.client.setQueryData(['user', 'localApi', 'isRunning'], false);
    },
  }),
};

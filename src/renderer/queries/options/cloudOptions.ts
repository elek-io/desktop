import { customMutationOptions } from '../util';

/**
 * Mutation options for the parts of Core that talk to elek.io Cloud.
 *
 * Reports are the only Cloud surface Desktop uses today. They are the one thing
 * that leaves the machine, and only because the user typed it and pressed send,
 * so this is deliberately not a query namespace that fetches anything on its own.
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
};

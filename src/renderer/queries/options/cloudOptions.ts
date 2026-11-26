import { t } from '@lingui/core/macro';

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
      toasts: {
        // The dialog holds a bug report and a suggestion, so each says which
        // one went out rather than one sentence covering both.
        success: (_data, report) =>
          report.type === 'bug' ? t`Report sent` : t`Feedback sent`,
        error: (report) =>
          report.type === 'bug'
            ? t`Could not send the report`
            : t`Could not send the feedback`,
      },
      onSuccess: () => {
        // A report is write only. Nothing in the app reads one back, so there is
        // no cache to update.
      },
    }),
  },
};

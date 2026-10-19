import { apiOptions } from './apiOptions';
import { assetOptions } from './assetOptions';
import { cloudOptions } from './cloudOptions';
import { collectionOptions } from './collectionOptions';
import { entryOptions } from './entryOptions';
import { projectOptions } from './projectOptions';
import { userOptions } from './userOptions';

/**
 * Query and Mutation options for Tanstack Query that wrap IPC calls to the main process.
 */
export default {
  projects: projectOptions,
  collections: collectionOptions,
  assets: assetOptions,
  entries: entryOptions,
  user: userOptions,
  api: apiOptions,
  cloud: cloudOptions,
};

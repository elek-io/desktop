import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { useUser } from '@renderer/hooks/useUser';
import { queryOptions } from '@renderer/queries';

/**
 * Where the person works, following from the User and whether Core holds a
 * session token:
 *
 * - `local`: a local User, "On this computer"
 * - `cloud`: a cloud User with a token, "elek.io Cloud"
 * - `paused`: a cloud User without one, "Sync paused", once a session ended
 *
 * `null` while loading, and on the first start, when no User exists yet.
 * See contributing/cloud-account.md.
 */
export type CloudAccountState = 'local' | 'cloud' | 'paused';

export function useCloudAccount(): CloudAccountState | null {
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const { data: hasToken, isPending: isReadingToken } = useQueryNoError(
    queryOptions.cloud.account.hasToken()
  );

  if (isGettingUser || isReadingToken || user === null) {
    return null;
  }
  if (user.userType === 'local') {
    return 'local';
  }
  return hasToken ? 'cloud' : 'paused';
}

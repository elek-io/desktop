import type { CloudAccount, SignInProps, SignUpProps } from '@elek-io/core';

/**
 * What signing in hands the renderer: the account, never the token. The token
 * stays in the main process, see contributing/cloud-account.md.
 */
export interface CloudSignInAnswer {
  account: CloudAccount;
}

/** What signing up hands the renderer, again without the token */
export type CloudSignUpAnswer =
  { outcome: 'session'; account: CloudAccount } | { outcome: 'verification' };

/**
 * The account calls the main process answers over IPC. They wrap
 * `core.cloud.account`, and the two that answer a session drop its token.
 */
export interface CloudAccountHandlers {
  signUp: (props: SignUpProps) => Promise<CloudSignUpAnswer>;
  signIn: (props: SignInProps) => Promise<CloudSignInAnswer>;
  signOut: () => Promise<void>;
  read: () => Promise<CloudAccount | null>;
  hasToken: () => boolean;
}

/**
 * Sent from the main process whenever the session or the User may have
 * changed: a token kept or dropped, or the check of a stored session at start.
 */
export const cloudAccountChangedChannel = 'cloud:account:changed';

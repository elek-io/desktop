// The address of a Project's Git repository, as the Sync page shows it and
// saves it back.
//
// Core stores the address as it was set, so an address that carries a
// credential carries it into the renderer. ci shows the address with any
// credential in it masked, which means the mask has to come off again on the
// way back: an address saved with the mask still in it would point at a
// repository nobody can reach. See contributing/renderer/forms.md.

/**
 * What stands in place of a credential, which is what ci draws.
 *
 * Eight bullets, the same count whatever the credential's length, so the mask
 * says nothing about it.
 */
export const CREDENTIAL_MASK = '••••••••';

/**
 * The user information of an address, as RFC 3986 puts it: what stands between
 * `scheme://` and the `@` of `scheme://user:password@host`.
 *
 * Neither group may cross a `/`, a `?`, a `#` or another `@`, so the host's
 * port is never matched and nothing after the authority is either. An address
 * in git's `user@host:path` shape has no scheme, so it carries nothing to match
 * at all, and no password can be written into it.
 */
const USER_INFO = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/?#@]*)@/;

/** Whether git takes the address over HTTP, where a URL carries credentials. */
function isHttp(scheme: string): boolean {
  return /^https?:\/\/$/i.test(scheme);
}

/** What of an address is hidden, and where it stands in it. */
interface Credential {
  value: string;
  start: number;
}

/**
 * The credential an address carries, or `null` where it carries none.
 *
 * The password is the credential whatever the scheme, as RFC 3986 reads it:
 * what stands after the colon in `scheme://user:password@host`. Where there is
 * no password, what stands alone before the `@` of an `http` or `https` address
 * is the credential, because that is where git takes a token over HTTP, which
 * is how GitHub and GitLab are handed one. Under every other scheme a lone
 * element is the login name, which is no secret and which git's own
 * `git@host:path` shape carries in plain sight.
 */
function credentialOf(address: string): Credential | null {
  const match = USER_INFO.exec(address);

  if (match === null) {
    return null;
  }

  const [, scheme = '', userInfo = ''] = match;
  const colon = userInfo.indexOf(':');
  const password = colon === -1 ? '' : userInfo.slice(colon + 1);

  if (password !== '') {
    return { value: password, start: scheme.length + colon + 1 };
  }

  if (userInfo !== '' && isHttp(scheme)) {
    return { value: userInfo, start: scheme.length };
  }

  return null;
}

/** The address with what stands where the credential does put in its place. */
function addressWith(
  address: string,
  credential: Credential,
  replacement: string
): string {
  return (
    address.slice(0, credential.start) +
    replacement +
    address.slice(credential.start + credential.value.length)
  );
}

/**
 * The address with its credential replaced by the mask, for a field somebody
 * reads.
 *
 * An address without one comes back as it was, so the Sync page shows what
 * Core stored.
 */
export function maskAddressCredential(address: string): string {
  const credential = credentialOf(address);

  if (credential === null) {
    return address;
  }

  return addressWith(address, credential, CREDENTIAL_MASK);
}

/**
 * The address to save: what was typed, with the stored credential put back
 * where the mask still stands.
 *
 * So a save that did not touch the credential keeps it, whether nothing was
 * touched at all or another part of the address was. A credential typed over
 * the mask goes as it was typed, and so does an address whose credential was
 * removed.
 */
export function addressWithStoredCredential(
  typed: string,
  stored: string | null
): string {
  const storedCredential = stored === null ? null : credentialOf(stored);
  const typedCredential = credentialOf(typed);

  if (
    storedCredential === null ||
    typedCredential === null ||
    typedCredential.value !== CREDENTIAL_MASK
  ) {
    return typed;
  }

  return addressWith(typed, typedCredential, storedCredential.value);
}

// The address of a Project's Git repository, as the Sync page shows it and
// saves it back.
//
// Core stores the address as it was set, so an address that carries a password
// carries it into the renderer. ci shows the address with any password in it
// masked, which means the mask has to come off again on the way back: an
// address saved with the mask still in it would point at a repository nobody
// can reach. See contributing/renderer/forms.md.

/**
 * What stands in place of a password, which is what ci draws.
 *
 * Eight bullets, the same count whatever the password's length, so the mask
 * says nothing about it.
 */
export const PASSWORD_MASK = '••••••••';

/**
 * The password of an address, as RFC 3986 puts it: what stands after the colon
 * in `scheme://user:password@host`.
 *
 * A lone element before the `@` is the user rather than the password, so it
 * stays as it is, and an address in git's `user@host:path` shape carries no
 * password at all. The host's port, after the `@`, is never matched, since
 * neither group may cross one.
 */
const PASSWORD = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#@]*?:)([^/?#@]*)(@)/;

/**
 * The address with its password replaced by the mask, for a field somebody
 * reads.
 *
 * An address without one comes back as it was, so the Sync page shows what
 * Core stored.
 */
export function maskAddressPassword(address: string): string {
  return address.replace(
    PASSWORD,
    (_match, before: string, _password: string, at: string) =>
      `${before}${PASSWORD_MASK}${at}`
  );
}

/** The password of an address, or `null` where it carries none. */
function passwordOf(address: string): string | null {
  return PASSWORD.exec(address)?.[2] ?? null;
}

/**
 * The address to save: what was typed, with the stored password put back where
 * the mask still stands.
 *
 * So a save that did not touch the password keeps it, whether nothing was
 * touched at all or another part of the address was. A password typed over the
 * mask goes as it was typed, and so does an address whose password was removed.
 */
export function addressWithStoredPassword(
  typed: string,
  stored: string | null
): string {
  const storedPassword = stored === null ? null : passwordOf(stored);

  if (storedPassword === null || passwordOf(typed) !== PASSWORD_MASK) {
    return typed;
  }

  return typed.replace(
    PASSWORD,
    (_match, before: string, _password: string, at: string) =>
      `${before}${storedPassword}${at}`
  );
}

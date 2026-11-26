import { expect, test } from '@playwright/test';

import {
  addressWithStoredCredential,
  CREDENTIAL_MASK,
  maskAddressCredential,
} from '../../src/renderer/lib/gitAddress.js';

/**
 * What of a Git address the Sync page hides, and what it saves back, shape by
 * shape.
 *
 * A credential can stand in two places of an address and an address can be
 * written a dozen ways, so the shapes are driven here rather than through the
 * screen, which needs a Project and a window per shape. That the mask reaches
 * the field and that a save keeps the stored credential is what the projects
 * spec drives, in the app.
 */

/** One address, and what the Sync page shows of it. */
const shapes: Array<{ what: string; stored: string; shown: string }> = [
  {
    what: 'a user and a password, which is where RFC 3986 puts a password',
    stored: 'https://mara:SECRET@example.invalid/website.git',
    shown: `https://mara:${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'a token alone before the at sign, which is how git takes one',
    stored: 'https://ghp_0123456789abcdefSECRET@example.invalid/website.git',
    shown: `https://${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'a token alone with the colon of an empty password after it',
    stored: 'https://ghp_0123456789abcdefSECRET:@example.invalid/website.git',
    shown: `https://${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'the user GitLab asks for in front of a token',
    stored: 'https://oauth2:glpat_SECRET@example.invalid/website.git',
    shown: `https://oauth2:${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'a password with no user in front of it',
    stored: 'https://:SECRET@example.invalid/website.git',
    shown: `https://:${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'an uppercase scheme, which a scheme may be written in',
    stored: 'HTTPS://mara:upperSECRET@example.invalid/website.git',
    shown: `HTTPS://mara:${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'a port after the host, which no credential may be read out of',
    stored: 'https://mara:SECRET@example.invalid:8443/website.git',
    shown: `https://mara:${CREDENTIAL_MASK}@example.invalid:8443/website.git`,
  },
  {
    what: 'a port with no credential at all, which is no user and password',
    stored: 'https://example.invalid:8443/website.git',
    shown: 'https://example.invalid:8443/website.git',
  },
  {
    what: 'an unencoded at sign inside the password, which the last one ends',
    stored: 'https://mara:SECRET@keep@example.invalid/website.git',
    shown: `https://mara:${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'a query and a fragment behind the path',
    stored: 'https://mara:SECRET@example.invalid/website.git?x=1#f',
    shown: `https://mara:${CREDENTIAL_MASK}@example.invalid/website.git?x=1#f`,
  },
  {
    what: 'http, where git takes a credential out of the address as well',
    stored: 'http://ghp_SECRET@example.invalid/website.git',
    shown: `http://${CREDENTIAL_MASK}@example.invalid/website.git`,
  },
  {
    what: 'an ssh password, which stands where every other password does',
    stored: 'ssh://mara:sshSECRET@example.invalid:22/website.git',
    shown: `ssh://mara:${CREDENTIAL_MASK}@example.invalid:22/website.git`,
  },
  {
    what: 'an ssh login name, which is no secret and stays readable',
    stored: 'ssh://git@example.invalid:22/website.git',
    shown: 'ssh://git@example.invalid:22/website.git',
  },
  {
    what: 'git in front of a colon, the shape that carries no password at all',
    stored: 'git@example.invalid:elek-io/website.git',
    shown: 'git@example.invalid:elek-io/website.git',
  },
  {
    what: 'no credential at all',
    stored: 'https://example.invalid/website.git',
    shown: 'https://example.invalid/website.git',
  },
  {
    what: 'a plain path, which a bare repository on this computer is',
    stored: '/home/mara/repositories/website.git',
    shown: '/home/mara/repositories/website.git',
  },
  {
    what: 'an at sign in the path rather than the authority',
    stored: 'https://example.invalid/website.git@v1',
    shown: 'https://example.invalid/website.git@v1',
  },
];

test.describe('A Git address on the Sync page', () => {
  test('hides every credential it can carry', () => {
    expect(shapes.map(({ stored }) => maskAddressCredential(stored))).toEqual(
      shapes.map(({ shown }) => shown)
    );

    // Nothing of a credential is left on screen, whichever shape carried it.
    for (const { what, stored, shown } of shapes) {
      const secrets = stored.match(/[A-Za-z0-9_]*SECRET/g) ?? [];
      for (const secret of secrets) {
        expect(shown, what).not.toContain(secret);
      }
    }
  });

  test('puts the stored credential back where the mask still stands', () => {
    for (const { what, stored, shown } of shapes) {
      // A save that touched nothing, which is the mask as it was shown.
      expect(addressWithStoredCredential(shown, stored), what).toBe(stored);
    }
  });

  test('keeps the stored credential through an edit beside it', () => {
    const stored = 'https://mara:SECRET@example.invalid/website.git';

    // Another part of the address edited, with the mask left alone.
    expect(
      addressWithStoredCredential(
        `https://mara:${CREDENTIAL_MASK}@example.invalid/shop.git`,
        stored
      )
    ).toBe('https://mara:SECRET@example.invalid/shop.git');

    // A credential typed over the mask goes as it was typed.
    expect(
      addressWithStoredCredential(
        'https://mara:TYPED@example.invalid/website.git',
        stored
      )
    ).toBe('https://mara:TYPED@example.invalid/website.git');

    // So does an address whose credential was taken out altogether.
    expect(
      addressWithStoredCredential('https://example.invalid/website.git', stored)
    ).toBe('https://example.invalid/website.git');

    // And a Project that stored no credential saves what was typed.
    expect(
      addressWithStoredCredential(
        `https://mara:${CREDENTIAL_MASK}@example.invalid/website.git`,
        null
      )
    ).toBe(`https://mara:${CREDENTIAL_MASK}@example.invalid/website.git`);
  });
});

import { t } from '@lingui/core/macro';
import {
  siBitbucket,
  siCodeberg,
  siGitea,
  siGitee,
  siGithub,
  siGitlab,
  siSourcehut,
} from 'simple-icons';

// Which Git host a Project syncs with, in the words and the logo a card shows.
//
// ci names the host and draws its logo from Simple Icons, and a host Simple
// Icons has no logo for takes Lucide's `git-branch`, see ci's docs/icons.md.
// The logo never stands on its own, so every answer here carries a name.

/** One host's logo, as Simple Icons ships it. */
export interface GitHostLogo {
  /** The brand's own name, which is never translated. */
  title: string;
  /** The single SVG path of a 24 by 24 icon. */
  path: string;
}

/** Where a Project syncs, as a card says it. */
export interface GitHost {
  /** The host's name, or the words for one Desktop cannot name. */
  name: string;
  /** Its logo, or `null` for a host Simple Icons has none for. */
  logo: GitHostLogo | null;
}

/**
 * The hosts Desktop can name from an address alone, by the hostname they serve
 * their repositories under.
 *
 * Only the hosted service of each is in here. A self-hosted GitLab, Gitea or
 * Forgejo serves under its own domain, which no address tells apart from any
 * other, so it reads as its hostname with Lucide's `git-branch` instead of
 * claiming a brand it may not be.
 */
const KNOWN_HOSTS: Record<string, GitHostLogo> = {
  'github.com': siGithub,
  'gitlab.com': siGitlab,
  'bitbucket.org': siBitbucket,
  'codeberg.org': siCodeberg,
  'gitea.com': siGitea,
  'gitee.com': siGitee,
  'git.sr.ht': siSourcehut,
};

/**
 * The hostname an address points at, or `null` where it has none.
 *
 * Three shapes reach this: an `https://` address, git's own `git@host:path`
 * shape, and a plain filesystem path, which a bare repository beside the
 * Project is. Only the hostname is read, never the rest of the address, so
 * neither a password nor a token in it can reach the screen, and neither can
 * the home folder of a repository on this computer.
 */
function hostnameOf(remoteOriginUrl: string): string | null {
  const ssh = /^[^@/\s]+@([^:/\s]+):/.exec(remoteOriginUrl);
  const hostname =
    ssh?.[1] ??
    (URL.canParse(remoteOriginUrl) ? new URL(remoteOriginUrl).hostname : '');

  if (hostname === '') {
    return null;
  }

  // Hostnames are case-insensitive, and `www.` in front of one names the same
  // host, so neither spelling changes which host a card names.
  return hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Where a Project with a Git repository syncs.
 *
 * Call it during a render, since the words for a host Desktop cannot name are
 * read from the catalog as they are built.
 */
export function gitHostOf(remoteOriginUrl: string): GitHost {
  const hostname = hostnameOf(remoteOriginUrl);

  if (hostname === null) {
    // An address with no hostname, such as a bare repository on this computer.
    // The address itself is never shown, because it can carry a credential or
    // the person's home folder.
    return { name: t`Another Git host`, logo: null };
  }

  const logo = KNOWN_HOSTS[hostname];

  if (logo === undefined) {
    return { name: hostname, logo: null };
  }

  return { name: logo.title, logo };
}

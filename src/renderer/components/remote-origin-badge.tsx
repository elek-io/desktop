import { Trans, useLingui } from '@lingui/react/macro';
import { CloudOffIcon, FolderGit2Icon } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@renderer/components/ui/badge';

// A Git host's logo is a brand logo rather than a UI icon, so it does not come
// from Lucide. Brand icons were removed from lucide-react in v1, so these ship
// as inline SVGs with paths from Simple Icons, marked `data-brand-logo` so a
// test can tell them from the Lucide icons around them.
function GithubIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-brand-logo
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function GitlabIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-brand-logo
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.6004 9.5927l-.0337-.0862L20.3.9814a.851.851 0 00-.3362-.405.8748.8748 0 00-.9997.0539.8748.8748 0 00-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 00-.29-.4412.8748.8748 0 00-.9997-.0537.8585.8585 0 00-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 002.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 001.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 002.0094-7.003z" />
    </svg>
  );
}

function RemoteOriginBadge({
  remoteOriginUrl,
  ...props
}: React.ComponentProps<typeof Badge> & {
  remoteOriginUrl: string | null;
}): React.JSX.Element {
  const { t } = useLingui();

  if (remoteOriginUrl !== null) {
    let hostname: string;
    let path: string;

    // Parse SSH URLs (git@host:path) vs HTTPS URLs (https://host/path)
    if (remoteOriginUrl.startsWith('git@')) {
      // SSH format: git@github.com:user/repo.git
      const match = remoteOriginUrl.match(/^git@([^:]+):(.+)$/);
      if (match !== null && match[1] !== undefined && match[2] !== undefined) {
        hostname = match[1];
        path = match[2];
      } else {
        // Fallback for malformed SSH URLs
        hostname = t`unknown`;
        path = remoteOriginUrl;
      }
    } else {
      // HTTPS/HTTP format
      try {
        const url = new URL(remoteOriginUrl);
        hostname = url.hostname;
        path = url.pathname.startsWith('/')
          ? url.pathname.slice(1)
          : url.pathname;
      } catch {
        // Fallback for an origin that is not a parseable URL, like a bare
        // filesystem path. Render it as is instead of crashing the card.
        hostname = t`unknown`;
        path = remoteOriginUrl;
      }
    }

    const HostIcon = hostname.includes('github.com')
      ? GithubIcon
      : hostname.includes('gitlab.com')
        ? GitlabIcon
        : FolderGit2Icon;

    // Remove .git extension if present
    path = path.endsWith('.git') ? path.slice(0, -4) : path;

    return (
      <Badge {...props}>
        <HostIcon />
        {path}
      </Badge>
    );
  }

  return (
    <Badge {...props}>
      <CloudOffIcon />
      <Trans>Local</Trans>
    </Badge>
  );
}

export { RemoteOriginBadge };

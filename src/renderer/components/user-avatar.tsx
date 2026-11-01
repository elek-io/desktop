import * as React from 'react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@renderer/components/ui/avatar';
import { initials } from '@renderer/lib/utils';

/**
 * A person's avatar: their picture where there is one, their initials
 * otherwise. The initials sit on the muted surface, because a label never sits
 * on the brand color.
 */
function UserAvatar({
  src,
  name,
  ...props
}: React.ComponentProps<typeof Avatar> & {
  name: string;
  src?: string;
}): React.JSX.Element {
  return (
    <Avatar {...props}>
      {src !== undefined ? <AvatarImage src={src} /> : null}
      <AvatarFallback className="text-xs font-semibold">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The same circle while the person is still being read.
 */
function UserAvatarSkeleton(
  props: React.ComponentProps<typeof Avatar>
): React.JSX.Element {
  return (
    <Avatar {...props}>
      <AvatarFallback />
    </Avatar>
  );
}

export { UserAvatar, UserAvatarSkeleton };

import { useLingui } from '@lingui/react/macro';
import { FileQuestion, FolderArchive } from 'lucide-react';
import { forwardRef, useEffect, useRef } from 'react';

import { cn } from '@renderer/lib/utils';

import { type Asset } from '@elek-io/core';

/**
 * Turn an absolute file path into a URL for the custom `elek-io-local-file`
 * protocol.
 *
 * A Windows path (`D:\dir\file.png`) can't be concatenated straight onto the
 * scheme: the `D:` would be parsed as the URL authority and the load would fail.
 * Normalizing to forward slashes with a leading slash gives the empty-authority
 * form (`elek-io-local-file:///D:/dir/file.png`) that parses on every platform.
 * A POSIX path (`/dir/file.png`) already starts with a slash, so this is a no-op
 * for it.
 *
 * Each path segment is then percent-encoded. A raw `#` or `?` in the path (a
 * profile folder like `C:\Users\a#b`) would otherwise start the URL fragment or
 * query and truncate the path, and a literal `%` would read as a broken escape.
 * Encoding per segment keeps the `/` separators intact while escaping the rest.
 * The main-process handler decodes it back with `fileURLToPath` to recover the
 * exact native path.
 */
function toLocalFileSrc(absolutePath: string): string {
  const forwardSlashed = absolutePath.replace(/\\/g, '/');
  const withLeadingSlash = forwardSlashed.startsWith('/')
    ? forwardSlashed
    : `/${forwardSlashed}`;
  const encodedPath = withLeadingSlash
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `elek-io-local-file://${encodedPath}`;
}

export function AssetDisplay(
  props: Asset & {
    /**
     * Classes for the box the Asset is drawn in, which is what gives it its
     * size. A caller that names none gets a 4 by 3 box as wide as it has room
     * for. The Asset fills that box, so a size on the box reaches what is
     * drawn in it, including the icon that stands for a type with no preview.
     */
    className?: string | undefined;
    /**
     * How the Asset fills its box. ci's previews fill theirs, so a field's row
     * and a picker's card ask for `cover`, while an Asset shown whole keeps
     * its own shape with `contain`, which is the default.
     */
    fit?: 'contain' | 'cover';
    /**
     * If set to true, GIFs will be displayed as static images (no animation).
     * Video and audio files will be displayed without controls and not be played automatically.
     */
    static?: boolean;
  }
): React.JSX.Element {
  const { t } = useLingui();

  const absolutePath = toLocalFileSrc(props.absolutePath);
  const ref = useRef(null);

  // The caller's classes land on the box rather than on the media inside it,
  // so a row or a card that asks for 64 by 40 px gets a box of that size
  // instead of a 4 by 3 one around it. `overflow-hidden` keeps an Asset that
  // fills the box inside the box's own corners.
  const box = cn('flex aspect-4/3 basis-full overflow-hidden', props.className);
  const media = cn(
    'h-full w-full',
    props.fit === 'cover' ? 'object-cover' : 'object-contain'
  );

  if (props.mimeType === 'image/gif' && props.static === true) {
    const gif = new Image();
    gif.src = absolutePath;

    const StaticGifCanvas = forwardRef<HTMLCanvasElement>(
      (_props, forwardedRef) => {
        if (typeof forwardedRef === 'function') {
          throw new Error(
            `Only React Refs that are created with createRef or useRef are supported`
          );
        }

        useEffect(() => {
          const context = forwardedRef?.current?.getContext('2d');
          if (!context) {
            return undefined;
          }

          context.drawImage(gif, 0, 0);
        }, [forwardedRef]);

        return (
          <canvas
            ref={forwardedRef}
            width={gif.width}
            height={gif.height}
            className={media}
          />
        );
      }
    );
    StaticGifCanvas.displayName = 'StaticGifCanvas';

    return (
      <div className={box}>
        <StaticGifCanvas ref={ref} />
      </div>
    );
  }

  const assetName = props.name;

  if (props.mimeType.startsWith('image/')) {
    return (
      <div className={box}>
        <img
          src={absolutePath}
          alt={t`Asset "${assetName}"`}
          className={media}
        />
      </div>
    );
  }

  if (props.mimeType.startsWith('video/')) {
    return (
      <div className={box}>
        <video
          muted
          controls={props.static === true ? false : true}
          autoPlay={props.static === true ? false : true}
          className={media}
        >
          <source src={absolutePath} type={props.mimeType} />
        </video>
      </div>
    );
  }

  if (props.mimeType.startsWith('audio/')) {
    return (
      <div className={box}>
        <audio
          muted
          controls={props.static === true ? false : true}
          autoPlay={props.static === true ? false : true}
          className={media}
        >
          <source src={absolutePath} type={props.mimeType} />
        </audio>
      </div>
    );
  }

  if (props.mimeType === 'application/pdf') {
    return (
      <div className={box}>
        <embed src={absolutePath} type={props.mimeType} className={media} />
      </div>
    );
  }

  if (props.mimeType === 'application/zip') {
    return (
      <div className={box}>
        <FolderArchive className="m-auto h-10 w-10" />
      </div>
    );
  }

  return (
    <div className={box}>
      <FileQuestion className="m-auto h-10 w-10" />
    </div>
  );
}

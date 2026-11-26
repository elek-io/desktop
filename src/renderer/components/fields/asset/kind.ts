import { t } from '@lingui/core/macro';

/**
 * Which kind of Asset a field takes, worked out from the MIME types it allows.
 *
 * Core allows any list of MIME types, so a field could take a handful from
 * several kinds at once. Where every allowed type is of one kind, that kind is
 * the word somebody reads, and a mixed list says only that the choice is
 * narrowed, since the picker shows which Assets are left.
 */
function assetKind(
  mimeTypes: string[]
): 'any' | 'image' | 'video' | 'audio' | 'mixed' {
  const everyTypeIs = (kind: string): boolean =>
    mimeTypes.every((mimeType) => mimeType.startsWith(kind));

  if (mimeTypes.length === 0) {
    return 'any';
  }
  if (everyTypeIs('image/')) {
    return 'image';
  }
  if (everyTypeIs('video/')) {
    return 'video';
  }
  if (everyTypeIs('audio/')) {
    return 'audio';
  }
  return 'mixed';
}

/**
 * Which Assets the field takes, in one word for the rules beside its label, or
 * nothing where it takes any.
 */
export function assetKindNote(mimeTypes: string[]): string[] {
  switch (assetKind(mimeTypes)) {
    case 'any':
      return [];
    case 'image':
      return [t`images only`];
    case 'video':
      return [t`videos only`];
    case 'audio':
      return [t`audio only`];
    case 'mixed':
      return [t`certain file types only`];
  }
}

/**
 * The same, as the sentence a picker's description leads with, which is how ci
 * words the restriction in that dialog. Never the MIME types themselves: they
 * are what the file says about itself, not what a field says to somebody.
 */
export function assetKindSentence(mimeTypes: string[]): string | null {
  switch (assetKind(mimeTypes)) {
    case 'any':
      return null;
    case 'image':
      return t`Images only.`;
    case 'video':
      return t`Videos only.`;
    case 'audio':
      return t`Audio only.`;
    case 'mixed':
      return t`Certain file types only.`;
  }
}

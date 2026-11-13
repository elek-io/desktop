import { createContext, useContext } from 'react';

// What the Assets screen shares with the pane beside its grid. It is a hook
// module of its own rather than part of the screen, so the pane imports no
// route.

export interface AssetsScreenContextValue {
  /**
   * The file Add Asset picked, which the pane for a new Asset is about, or
   * `null` when nothing was picked in this window yet.
   */
  pickedFilePath: string | null;
  /**
   * Says that an Asset was deleted, so the grid takes the focus back to the
   * card that stands where the deleted one stood.
   */
  onAssetDeleted: (id: string) => void;
}

export const AssetsScreenContext =
  createContext<AssetsScreenContextValue | null>(null);

/** What the Assets screen shares with its pane. */
export function useAssetsScreen(): AssetsScreenContextValue {
  const context = useContext(AssetsScreenContext);

  if (context === null) {
    throw new Error(
      'useAssetsScreen must be used within the Assets screen, which provides it'
    );
  }

  return context;
}

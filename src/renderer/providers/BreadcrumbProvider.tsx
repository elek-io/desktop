import { useMatches } from '@tanstack/react-router';
import React, { useCallback, useMemo, useState } from 'react';

import { BreadcrumbContext } from '@renderer/hooks/useBreadcrumb';

export interface Breadcrumb {
  label: string;
  /** The route the crumb was registered from, which keys it to its match. */
  path: string;
  /**
   * Where the crumb leads, where that is not the route it stands for. The one
   * crumb that needs it is the Projects step of the Profile's trail: the
   * Profile sits outside the Projects route, so no match of its own carries
   * that step, see contributing/renderer/breadcrumb-navigation.md.
   */
  to?: string;
}

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [breadcrumbMap, setBreadcrumbMap] = useState<Map<string, Breadcrumb>>(
    new Map()
  );
  const matches = useMatches();

  const breadcrumbs = useMemo(() => {
    return matches
      .map((match) => {
        const crumb = breadcrumbMap.get(match.pathname);
        if (crumb === undefined) return null;

        return crumb;
      })
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }, [matches, breadcrumbMap]);

  const setBreadcrumb = useCallback(
    (path: string, label: string, to?: string) => {
      setBreadcrumbMap((prev) => {
        const next = new Map(prev);
        next.set(path, { path, label, ...(to === undefined ? {} : { to }) });
        return next;
      });
    },
    []
  );

  const clearBreadcrumb = useCallback((path: string) => {
    setBreadcrumbMap((prev) => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  return (
    <BreadcrumbContext.Provider
      value={{ breadcrumbs, setBreadcrumb, clearBreadcrumb }}
    >
      {children}
    </BreadcrumbContext.Provider>
  );
}

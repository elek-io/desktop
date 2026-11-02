import { useEffect, useState } from 'react';

import { ThemeProviderContext, type Theme } from '@renderer/hooks/useTheme';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'desktop-theme',
  ...props
}: ThemeProviderProps): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null;
    return stored ?? defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (resolved: 'light' | 'dark'): void => {
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
      // The window controls sit in an overlay the system draws, outside the
      // document, so the class above cannot reach them. The main process is
      // told which theme the app resolved to and colors the overlay itself,
      // see shared/windowTheme.ts.
      void window.ipc.electron.window.setTheme(resolved);
    };

    if (theme !== 'system') {
      applyTheme(theme);
      return;
    }

    // While the theme is 'system', follow the OS preference live
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mediaQuery.matches ? 'dark' : 'light');

    const onSystemThemeChange = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', onSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', onSystemThemeChange);
    };
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

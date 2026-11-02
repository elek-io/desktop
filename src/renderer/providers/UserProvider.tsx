import { activateAppLocale } from '@root/src/shared/i18n';
import { format, formatDistanceToNow, type Locale } from 'date-fns';
import React from 'react';

import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { UserContext } from '@renderer/hooks/useUser';
import { loadLocale } from '@renderer/lib/utils';
import queryOptions from '@renderer/queries/options';

export interface FormatDatetimeProps {
  datetime: string | null | undefined;
}

export interface FormatTemporalFieldValueProps {
  value: unknown;
  fieldType: string | undefined;
}

export function UserProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const userQuery = useQueryNoError(queryOptions.user.get());
  const language = userQuery.data?.language;

  // The date-fns locale is loaded on demand (see loadLocale) instead of
  // bundling every language, so hold it in state and format with it once it
  // resolves. Until then date-fns falls back to its default (en-US) and the
  // value re-renders when the locale arrives.
  const [locale, setLocale] = React.useState<Locale | undefined>(undefined);

  React.useEffect(() => {
    if (language === undefined) {
      return;
    }
    let active = true;
    void loadLocale(language).then((loaded) => {
      if (active) {
        setLocale(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [language]);

  // The app's own words follow the same language. The catalog is activated here
  // rather than where it is read, so one language drives the whole app, and
  // `lang` on the document follows the catalog that answered rather than the
  // language asked for: a language Desktop has no catalog for shows English, so
  // that is what a screen reader has to be told. See
  // contributing/renderer/internationalization.md.
  React.useEffect(() => {
    document.documentElement.lang = activateAppLocale(language);
  }, [language]);

  /**
   * Formats given datetime string to be human readable
   * and be in the user selected locale
   */
  const formatDatetime = React.useCallback(
    ({ datetime }: FormatDatetimeProps) => {
      if (
        datetime === null ||
        datetime === undefined ||
        userQuery.isPending === true ||
        userQuery.data === null
      ) {
        // e.g. in case of a file not being updated yet
        // or the user data not being loaded yet, show a dash
        return {
          relative: '-',
          absolute: '-',
        };
      }

      // exactOptionalPropertyTypes forbids passing locale: undefined, so only
      // include it once loaded. date-fns uses its en-US default meanwhile.
      const localeOption = locale ? { locale } : {};
      return {
        relative: formatDistanceToNow(datetime, {
          addSuffix: true,
          ...localeOption,
        }),
        absolute: format(datetime, 'Pp', localeOption),
      };
    },
    [userQuery.data, userQuery.isPending, locale]
  );

  /**
   * Formats a date, datetime or time field value string in the user's locale.
   * Other field types (and non-strings) are returned unchanged.
   */
  const formatTemporalFieldValue = React.useCallback(
    ({ value, fieldType }: FormatTemporalFieldValueProps): unknown => {
      if (typeof value !== 'string' || value === '') {
        return value;
      }

      const localeOption = locale ? { locale } : {};

      if (fieldType === 'date') {
        // "YYYY-MM-DD" carries no time or zone. Anchor it to local midnight so
        // the shown day cannot shift by one in a negative UTC offset timezone.
        const date = new Date(`${value}T00:00:00`);
        return isNaN(date.getTime()) ? value : format(date, 'P', localeOption);
      }
      if (fieldType === 'datetime') {
        // Full ISO datetime with zone.
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : format(date, 'Pp', localeOption);
      }
      if (fieldType === 'time') {
        // ISO time ("HH:mm:ss", no zone). Anchor to an arbitrary local date to
        // build a formattable Date.
        const date = new Date(`1970-01-01T${value}`);
        return isNaN(date.getTime()) ? value : format(date, 'p', localeOption);
      }
      return value;
    },
    [locale]
  );

  return (
    <UserContext.Provider
      value={{
        userQuery,
        formatDatetime,
        formatTemporalFieldValue,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

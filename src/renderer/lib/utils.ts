import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { clsx, type ClassValue } from 'clsx';
import { type Locale } from 'date-fns';
import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  RefAttributes,
  SVGProps,
} from 'react';
import { twMerge } from 'tailwind-merge';

import { type SupportedLanguage } from '@elek-io/core';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.split(' ');
  const firstPart = parts.shift();
  const lastPart = parts.pop();

  return (
    (firstPart !== undefined ? firstPart.substring(0, 1) : '') +
    (lastPart !== undefined ? lastPart.substring(0, 1) : '')
  ).toUpperCase();
}

export type Icon = ForwardRefExoticComponent<
  PropsWithoutRef<SVGProps<SVGSVGElement>> & {
    title?: string;
    titleId?: string;
  } & RefAttributes<SVGSVGElement>
>;

/**
 * On-demand date-fns Locale loaders, one per Core language.
 *
 * Each entry is a dynamic import so the locales are code split out of the
 * startup chunk and only the active language is fetched at runtime, instead of
 * bundling all of them. Because the type is Record<SupportedLanguage, ...> this
 * stays the single place that must stay in sync with Core: add a language and
 * it fails to type-check until a loader is added here. en and zh use their
 * regional date-fns variants (en-US, zh-CN).
 */
const localeLoaders: Record<SupportedLanguage, () => Promise<Locale>> = {
  bg: async () => (await import('date-fns/locale/bg')).bg,
  cs: async () => (await import('date-fns/locale/cs')).cs,
  da: async () => (await import('date-fns/locale/da')).da,
  de: async () => (await import('date-fns/locale/de')).de,
  el: async () => (await import('date-fns/locale/el')).el,
  en: async () => (await import('date-fns/locale/en-US')).enUS,
  es: async () => (await import('date-fns/locale/es')).es,
  et: async () => (await import('date-fns/locale/et')).et,
  fi: async () => (await import('date-fns/locale/fi')).fi,
  fr: async () => (await import('date-fns/locale/fr')).fr,
  hu: async () => (await import('date-fns/locale/hu')).hu,
  it: async () => (await import('date-fns/locale/it')).it,
  ja: async () => (await import('date-fns/locale/ja')).ja,
  lt: async () => (await import('date-fns/locale/lt')).lt,
  lv: async () => (await import('date-fns/locale/lv')).lv,
  nl: async () => (await import('date-fns/locale/nl')).nl,
  pl: async () => (await import('date-fns/locale/pl')).pl,
  pt: async () => (await import('date-fns/locale/pt')).pt,
  ro: async () => (await import('date-fns/locale/ro')).ro,
  ru: async () => (await import('date-fns/locale/ru')).ru,
  sk: async () => (await import('date-fns/locale/sk')).sk,
  sl: async () => (await import('date-fns/locale/sl')).sl,
  sv: async () => (await import('date-fns/locale/sv')).sv,
  zh: async () => (await import('date-fns/locale/zh-CN')).zhCN,
};

const loadedLocales = new Map<SupportedLanguage, Locale>();

/**
 * Loads and caches the date-fns Locale for the given Core language, so the
 * active language is fetched once and reused.
 */
export async function loadLocale(language: SupportedLanguage): Promise<Locale> {
  const cached = loadedLocales.get(language);
  if (cached !== undefined) {
    return cached;
  }
  const locale = await localeLoaders[language]();
  loadedLocales.set(language, locale);
  return locale;
}

/**
 * The one size unit that is a word rather than a symbol, so it is the one a
 * language can have its own form of. Held as a descriptor at module scope and
 * resolved per call, so it reads the catalog in use rather than the one active
 * at import time.
 */
const BYTES_UNIT = msg`Bytes`;

/**
 * Formats given number of bytes into a human readable format
 *
 * @param bytes Number of bytes
 */
export function formatBytes(bytes: number): string {
  const bytesUnit = i18n._(BYTES_UNIT);
  if (bytes === 0) return `0 ${bytesUnit}`;
  const k = 1024,
    decimals = 2,
    // The remaining unit symbols are the same in every language, so they stay
    // out of the catalog.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    sizes = [bytesUnit, 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  );
}

/**
 * Often used by tailwind components to join multiple strings of classes
 *
 * @param classes Array of classes to join
 * @returns Joined class string
 */
export function classNames(...classes: string[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * The classes one field's width takes, out of the four widths Core offers.
 *
 * Each is a container query rather than a viewport one, because ci measures a
 * field against the area it sits in and not against the window: the same Entry
 * is edited in a narrow editor beside two other panes and in a wide one on its
 * own. A field that would get less than 160 px stacks at full width, which is
 * what each threshold below is: the width the twelve column grid needs, with
 * its 24 px gaps, for a field of that span to reach 160 px.
 *
 * The class names are written out rather than built, since Tailwind reads them
 * from the source.
 *
 * @see https://tailwindcss.com/docs/responsive-design#container-queries
 */
export function fieldWidth(
  width: string
):
  | '@min-[712px]:col-span-3'
  | '@min-[528px]:col-span-4'
  | '@min-[344px]:col-span-6'
  | 'col-span-12' {
  switch (width) {
    case '3':
      return '@min-[712px]:col-span-3';
    case '4':
      return '@min-[528px]:col-span-4';
    case '6':
      return '@min-[344px]:col-span-6';
    case '12':
      return 'col-span-12';
    default:
      throw new Error(`Unsupported Field width "${width}"`);
  }
}

/**
 * Generates a translatable default object with all supported languages set to the given default value
 * e.g. { en: null, de: null, fr: null }
 *
 * @note This is used to initialize forms with the default value for every supported language
 */
export function translatableDefault<T = null | string | number | boolean | []>({
  supportedLanguages,
  defaultValue,
}: {
  supportedLanguages: SupportedLanguage[];
  defaultValue: T;
}): Record<SupportedLanguage, T> {
  return supportedLanguages.reduce(
    (acc, language) => {
      acc[language] = defaultValue;
      return acc;
    },
    {} as Record<SupportedLanguage, T>
  );
}

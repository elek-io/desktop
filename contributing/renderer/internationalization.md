# Internationalization

## Overview

elek.io is multi-language in two ways. The application UI is shown in the current user's language, and user-defined content (Collection and Entry values, labels, descriptions) is stored per language as a `TranslatableString`. A Project has a default language and a list of supported languages, and each user picks their own preferred language.

The set of language codes (`SupportedLanguage`) comes from `@elek-io/core`. The client maps each code to formatting and rendering behavior.

## Locales for dates (`loadLocale`)

[`lib/utils.ts`](../../src/renderer/lib/utils.ts) holds `localeLoaders`, a `Record<SupportedLanguage, () => Promise<Locale>>` that maps every Core language code to a dynamic import of its [date-fns](https://date-fns.org/) `Locale`. Two codes are remapped to a regional variant: `en` -> `en-US` and `zh` -> `zh-CN`. `loadLocale(language)` awaits the matching loader and caches the result, so each locale is fetched once.

The loaders are dynamic imports on purpose. date-fns ships a locale for every language, and importing all of them statically pulled roughly 400 kB into the renderer startup chunk even though only the active language is ever used. Code splitting keeps them out of that chunk and loads just the active locale at runtime.

Because the type is `Record<SupportedLanguage, ...>`, this map is still the single place that must stay in sync with Core. If Core adds a `SupportedLanguage`, this file fails to type-check until you add a loader for it here.

## Formatting datetimes (`formatDatetime`)

`formatDatetime` is provided by the [`UserProvider`](../../src/renderer/providers/UserProvider.tsx) and read through the `useUser()` (or `useProject()`) hook. It formats an ISO datetime string in the current user's locale using date-fns:

- `relative` uses `formatDistanceToNow(..., { addSuffix: true })` (for example "3 days ago")
- `absolute` uses `format(..., 'Pp')` (localized date and time)

It returns `{ relative: '-', absolute: '-' }` while the user data is still loading or when the datetime is `null`, so callers do not need to guard for those cases.

The user's locale is loaded on demand through `loadLocale`, so the first render after the user data resolves briefly formats with date-fns's en-US default until the locale chunk arrives, then re-renders in the user's locale.

```tsx
const { formatDatetime } = useUser();
const { relative, absolute } = formatDatetime({ datetime: entry.updated });
```

## Formatting field values (`formatInUserLocale`)

`formatInUserLocale` is provided by the same `UserProvider` and read through `useUser()` or `useProject()`. It takes a `Date` and a date-fns pattern and answers with the formatted string in the current user's locale. Like `formatDatetime`, it falls back to date-fns's en-US default until the user's locale chunk loads. Unlike `formatDatetime` it shows no `-` placeholder, because a stored field value always exists and should be displayed rather than hidden while the user data loads.

Which pattern a Value takes, and how its stored string becomes a date at all, is the field type's own answer and lives in that type's folder, see [dynamic-form-field-generation.md](./dynamic-form-field-generation.md). A date Value is stored as `YYYY-MM-DD` with no time or zone, so the `date` folder anchors it to local midnight before formatting, otherwise the shown day could shift by one in a negative UTC offset. A time Value is anchored to an arbitrary day for the same reason, and a datetime carries its own zone. The [entry table](../../src/renderer/components/entry-table.tsx) hands each type's `listCell` this formatter, so a stored `2026-07-09` renders as a localized date rather than the raw ISO string.

```tsx
// In a field type's folder, where the pattern belongs
listCell: ({ content, language, formatInUserLocale }) =>
  temporalCell({
    content,
    language,
    pattern: 'P',
    anchor: (value) => `${value}T00:00:00`,
    formatInUserLocale,
  });
```

## Translating content (`translateContent`)

`translateContent` is provided by the [`ProjectProvider`](../../src/renderer/providers/ProjectProvider.tsx) and read through `useProject()`. It takes a `TranslatableString` (a record keyed by language) and a `key`, and resolves a single string through a fallback chain:

1. the current user's language
2. the Project's default language
3. `en`
4. the `key` argument itself

The final step is important: when no translation exists in any of the above, it returns the `key` string as a visible placeholder, which signals that a translation is missing rather than rendering an empty string. Do not add your own redundant fallback on top of this.

```tsx
const { translateContent } = useProject();

const title = translateContent({
  key: 'collection.name.plural',
  record: collection.name.plural, // a TranslatableString
});
```

The chain itself lives in [`lib/translateContent.ts`](../../src/renderer/lib/translateContent.ts), and the provider only binds the two languages to it. A language a query has not answered yet is skipped rather than ending the chain, so a name resolves as soon as the record can answer it.

## Seeding multi-language form state (`translatableDefault`)

When a form needs a `TranslatableString` field initialized for every supported language, use `translatableDefault` from [`lib/utils.ts`](../../src/renderer/lib/utils.ts) instead of building the record by hand:

```ts
import { translatableDefault } from '@renderer/lib/utils';

// { en: null, de: null, fr: null, ... } for every supported language
label: translatableDefault({
  supportedLanguages: project.settings.language.supported,
  defaultValue: null,
});
```

This is how the field definition forms initialize their `label` and `description` defaults. See [Dynamic Form Field Generation](./dynamic-form-field-generation.md) for the matching field-name convention (`...content.<language>`) that the translatable inputs rely on.

## The app's own words (Lingui)

Every word elek.io Desktop shows comes from one message catalog, read through [Lingui](https://lingui.dev). That covers the renderer and the main process, which shows the native box that says Desktop could not start. What stays in the code reads the same in every language and says so at the line it sits on: elek.io's own names and a third party's, a version marker, a keyboard shortcut's symbols, a language code and a file size's unit symbol.

| Piece                                                                                      | Where                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| The locales the app carries, and which one answers for a language                          | [`shared/locale.ts`](../../src/shared/locale.ts)           |
| The catalogs and what activates one                                                        | [`shared/i18n.ts`](../../src/shared/i18n.ts)               |
| The English catalog                                                                        | [`src/locales/en.po`](../../src/locales/en.po)             |
| Which locales exist and where their catalogs live                                          | [`lingui.config.ts`](../../lingui.config.ts)               |
| The plugin that compiles a catalog and turns the macros into runtime calls, in both builds | [`electron.vite.config.ts`](../../electron.vite.config.ts) |

A message is identified by its English text: Lingui hashes the text into the id, so rewording the English asks for a new translation rather than leaving a stale one behind.

### Adding a string

Write the macro, then run `pnpm i18n:extract`. Nothing else: the catalog is generated from the code, never edited by hand.

```tsx
import { Trans, useLingui } from '@lingui/react/macro';

function SyncButton({ label }: { label: string }): ReactElement {
  const { t } = useLingui();

  return (
    <Button aria-label={t`Sync this Project`}>
      <Trans>Sync</Trans>
    </Button>
  );
}
```

- **Text a person reads in the markup** is `<Trans>`. Wrap the whole sentence, inline tags and placeholders included, so it is one entry of the catalog.
- **Text that goes into a prop**, such as an accessible name, a `title`, an `alt` or a `placeholder`, is `` t`...` `` from `useLingui()`. The hook is what re-renders the component when the language changes.
- **Outside a component**, in the query layer or in the main process, `` t`...` `` comes from `@lingui/core/macro` instead and reads the active catalog when it is called.
- **A map of sentences at module scope** holds `` msg`...` `` descriptors, not strings, and renders each one with `i18n._()` where it is shown. A string there would be read before a catalog is active. [`lib/coreErrorText.ts`](../../src/renderer/lib/coreErrorText.ts) and [`lib/release.ts`](../../src/renderer/lib/release.ts) are the examples.

### Adding a placeholder

A title, a name or a count is a placeholder inside the sentence, never a piece the sentence is assembled from. A word dropped into a sentence cannot be translated on its own, because a language that inflects it needs the whole sentence to do so.

```tsx
const { name } = project;

// One entry: "Project {name} saved"
toast.success(t`Project ${name} saved`);
```

Only a plain identifier may stand in a placeholder, which `lingui/no-expression-in-message` enforces: assign `object.property` or a function's result to a `const` first, so the catalog gets a named placeholder rather than a numbered one.

### Adding a count

A count uses ICU plural rules, so each language picks its own forms.

```ts
import { plural } from '@lingui/core/macro';

// "1 Collection" / "3 Collections", as one entry of the catalog
const reach = t`Saving reaches ${plural(count, {
  one: '# Collection',
  other: '# Collections',
})}`;
```

Where a sentence changes with something that is not a count, such as whether a Collection or a Component owns a field, write one message per case rather than splicing a phrase in.

### How the main process reads the catalog

`@lingui/vite-plugin` runs in the main build as well as the renderer's, so main imports the catalog like any other module and the macros compile there too. That is why `@lingui/core` is a `dependency` rather than a `devDependency`: the main bundle externalizes its imports. `@lingui/react` stays a `devDependency`, because only the renderer imports it and the renderer is bundled. See [build-and-packaging.md](../build-and-packaging.md#the-rule-for-dependencies-vs-devdependencies).

Main's one string is the box shown when the app could not start. It takes the **system's** language through `app.getLocale()`, because nothing read a User at that point and Core may be what failed. The renderer takes the **User's** language instead, which `UserProvider` activates, and sets `lang` on the document to the locale that answered rather than the language asked for: a language Desktop carries no catalog for shows English, so that is what a screen reader has to be told.

### Adding a language

1. Add its code to `locales` in [`lingui.config.ts`](../../lingui.config.ts) and to `appLocales` in [`shared/locale.ts`](../../src/shared/locale.ts).
2. Run `pnpm i18n:extract`, which writes `src/locales/<code>.po`.
3. Translate that file and add it to `catalogs` in [`shared/i18n.ts`](../../src/shared/i18n.ts).

No component changes. A message the new catalog does not carry shows English, because `lingui compile` fills a locale's gaps from the source catalog, which is also why a message id can never reach a screen.

### The checks

| Command             | Fails when                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm lint`         | A string a person reads sits in the code rather than the catalog                          |
| `pnpm i18n:check`   | The catalog is out of step with the code, or a translation is missing after the fallbacks |
| `pnpm i18n:extract` | Never. It writes the catalog from the code                                                |

`pnpm check` runs both of the first two. The lint rule is `lingui/no-unlocalized-strings`, configured in [`eslint.config.mjs`](../../eslint.config.mjs) with every exception it allows and the reason for each, plus `no-restricted-syntax` selectors for what it lets through:

| It lets through                                                 | Covered by                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| The attributes of a native element it does not blacklist        | A selector per attribute, `title` among them                              |
| A pane's name, which arrives under the prop name a field uses   | A selector on `Pane`'s `name`                                             |
| Everything inside a `<Select>`, which it reads as its own macro | A selector per Select part, for its words, its `items` map and its labels |
| The message `setError` puts below a field                       | A selector on that call's `message`                                       |
| A string under `key` or `name`, which is wiring                 | A selector that refuses sentence case there                               |
| The text of a native dialog nested in an options object         | A selector for a `dialog` call's descendants                              |

Each of those comes in two shapes where it can, the plain string and the braces around a string or a template, since a sentence built around a value is a string outside the catalog too. A single line that genuinely holds no text carries an `eslint-disable-next-line` with its own reason.

Two conventions follow from that table, because a selector cannot tell wiring from words on its own:

- Words an item in a list shows go in a `label` of their own. `key` and `name` are what React and react-hook-form key and address an item by, so the guard exempts them and the words would ride along.
- A select's options carry their words twice, once as the item's own markup and once in the `items` map the closed trigger reads. Both come from the catalog.

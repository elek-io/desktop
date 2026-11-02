import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import tseslint from '@electron-toolkit/eslint-config-ts';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import pluginLingui from 'eslint-plugin-lingui';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// Form guardrails. These make the fixed bug classes hard to
// reintroduce; see contributing/renderer/forms.md. They are wired as
// `no-restricted-syntax` selectors below. Because a rule's options fully replace
// (not merge with) an earlier config's, every renderer block that touches
// `no-restricted-syntax` re-lists the shared enum ban.
const noEnumDeclaration = {
  selector: 'TSEnumDeclaration',
  message: 'Use const objects instead of enums for better tree-shaking',
};
// Only app-form.tsx may write a <form> element; every other form is an <AppForm>.
const noRawForm = {
  selector: "JSXOpeningElement[name.name='form']",
  message:
    'Render forms through <AppForm> (components/ui/app-form.tsx), which owns noValidate, submit wiring and stopPropagation.',
};
// Only SubmitButton (in app-form.tsx) may set a literal type="submit". A computed
// type={...} slips through - acceptable, this is a backstop, not a proof.
const noLiteralSubmitType = {
  selector: "JSXAttribute[name.name='type'][value.value='submit']",
  message:
    'Use <SubmitButton>, which sets type=submit and the form association structurally.',
};
// Ban laundering a form object through `as unknown as UseFormReturn` / `... as
// Control`. Two explicit selectors rather than one regex, so the config cannot
// fail to parse. A backstop: an aliased or single-step cast slips through.
const castLaunderingMessage =
  'Do not launder a form object through `as unknown as UseFormReturn` / `as unknown as Control`. Shape the types so the cast is not needed (AGENTS.md, contributing/renderer/forms.md).';
const noFormReturnLaunderingCast = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword'][typeAnnotation.typeName.name='UseFormReturn']",
  message: castLaunderingMessage,
};
const noControlLaunderingCast = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword'][typeAnnotation.typeName.name='Control']",
  message: castLaunderingMessage,
};
// The main process's only user-facing text is what a native dialog shows, so
// that is where the catalog is enforced there. Lingui's own rule covers the
// renderer; see the i18n block below.
// A pane's name is read by a screen reader and shown when a read inside it
// fails, so it is text. Lingui's rule cannot see that, because it arrives under
// the prop name react-hook-form uses for a field's path, which is ignored.
const paneNameMessage =
  "A pane's name comes from the message catalog. Wrap it with t`` from useLingui() (contributing/renderer/internationalization.md).";
const noUnlocalizedPaneName = {
  selector:
    "JSXOpeningElement[name.name='Pane'] > JSXAttribute[name.name='name'] > Literal",
  message: paneNameMessage,
};
// The same name written in braces, as a string or a template. A `t` tagged
// template is a TaggedTemplateExpression in between, so it never matches.
const noUnlocalizedPaneNameInBraces = {
  selector:
    "JSXOpeningElement[name.name='Pane'] > JSXAttribute[name.name='name'] > JSXExpressionContainer > :matches(Literal,TemplateLiteral)",
  message: paneNameMessage,
};
// Lingui's rule lets a few attributes of a native element through, `title`
// among them, because it only blacklists `placeholder`, `alt`, `aria-label` and
// `value` there. Each of the ones below is read by a person or heard by a
// screen reader, so a literal in one is a string outside the catalog.
const textAttributes =
  '/^(title|alt|abbr|label|aria-description|aria-roledescription|aria-valuetext|aria-placeholder)$/';
const textAttributeMessage =
  'Text a person reads comes from the message catalog. Wrap it with t`` from useLingui() (contributing/renderer/internationalization.md).';
const noUnlocalizedTextAttribute = {
  selector: `JSXAttribute[name.name=${textAttributes}] > Literal[value=/\\p{L}/u]`,
  message: textAttributeMessage,
};
// The same attribute written in braces, as a string or a template, which the
// selector above does not reach. A `t` tagged template is a
// TaggedTemplateExpression in between, so it never matches.
const noUnlocalizedTextAttributeInBraces = {
  selector: `JSXAttribute[name.name=${textAttributes}] > JSXExpressionContainer > :matches(Literal[value=/\\p{L}/u],TemplateLiteral)`,
  message: textAttributeMessage,
};
// `no-unlocalized-strings` reads a `<Select>` element as Lingui's own `Select`
// macro and marks every string inside one as already translated, which shadcn's
// select is not. The three selectors below re-cover what a person reads in one,
// since `no-restricted-syntax` is unaffected by the confusion: an option's own
// words, the words the trigger shows for the selected item, and a placeholder
// or accessible name on any of the parts. Scoped to a part's own children
// rather than the whole subtree, so a `<Trans>` inside an item still passes.
const selectParts = '/^Select(Content|Group|Item|Label|Trigger|Value)?$/';
const selectTextMessage =
  'Text in a select comes from the message catalog. Wrap it with <Trans> or t`` from useLingui() (contributing/renderer/internationalization.md).';
const noUnlocalizedSelectText = {
  selector: `JSXElement[openingElement.name.name=${selectParts}] > JSXText[value=/\\p{L}/u]`,
  message: selectTextMessage,
};
// The same words written in braces, as a string or a template. A `t` tagged
// template is a TaggedTemplateExpression in between, so it never matches.
const noUnlocalizedSelectTextInBraces = {
  selector: `JSXElement[openingElement.name.name=${selectParts}] > JSXExpressionContainer > :matches(Literal[value=/\\p{L}/u],TemplateLiteral)`,
  message: selectTextMessage,
};
// `items` maps each value to the words the closed trigger shows for it, so a
// literal in that map is shown text rather than wiring. The Property is
// reported rather than the string, because a selector cannot name a node's
// field.
const noUnlocalizedSelectItem = {
  selector: `JSXOpeningElement[name.name='Select'] > JSXAttribute[name.name='items'] Property[value.type='Literal'][value.value=/\\p{L}/u]`,
  message: selectTextMessage,
};
const selectAttributes = '/^(placeholder|aria-label)$/';
const noUnlocalizedSelectAttribute = {
  selector: `JSXOpeningElement[name.name=${selectParts}] > JSXAttribute[name.name=${selectAttributes}] > Literal[value=/\\p{L}/u]`,
  message: selectTextMessage,
};
const noUnlocalizedSelectAttributeInBraces = {
  selector: `JSXOpeningElement[name.name=${selectParts}] > JSXAttribute[name.name=${selectAttributes}] > JSXExpressionContainer > :matches(Literal[value=/\\p{L}/u],TemplateLiteral)`,
  message: selectTextMessage,
};
// A sentence is one entry of the catalog, never pieces it is assembled from,
// because a language that inflects a piece needs the whole sentence to do so.
// Lingui's own rules refuse a message that is only a tag or only a variable,
// and these two refuse the other half: a sentence split across entries. Two
// <Trans> under one parent form one run of text, and a message joined to
// another in a template or with `+` is the same thing written in code.
const wholeSentenceMessage =
  'A sentence is one entry of the message catalog. Write the whole sentence in one <Trans> or one t``, with a placeholder where a value goes (contributing/renderer/internationalization.md).';
const noSplitTransSentence = {
  selector:
    "JSXElement > JSXElement[openingElement.name.name='Trans'] ~ JSXElement[openingElement.name.name='Trans']",
  message: wholeSentenceMessage,
};
const noJoinedMessages = {
  selector:
    ":matches(BinaryExpression[operator='+'],TemplateLiteral) > TaggedTemplateExpression[tag.name=/^(t|msg|plural)$/]",
  message: wholeSentenceMessage,
};
// react-hook-form's `setError` takes a field's path first, which is wiring, and
// an error second, whose `message` is shown below that field. `ignoreFunctions`
// exempts the call so the path passes, which leaves the message to this.
const noUnlocalizedFieldErrorMessage = {
  selector:
    ":matches(CallExpression[callee.property.name='setError'],CallExpression[callee.name='setError']) Property[key.name='message'] > :matches(Literal[value=/\\p{L}/u],TemplateLiteral)",
  message:
    'A message shown below a field comes from the message catalog. Wrap it with t`` from useLingui() (contributing/renderer/internationalization.md).',
};
// A string under `key` or `name` is wiring, which is why `ignoreNames` exempts
// both: a React key, a query key or a form field's path. The app's copy is
// sentence case, so a value that opens on a capital letter is words somebody
// reads rather than wiring, and belongs in a `label` of its own. A backstop: a
// lowercase sentence under one of those names slips through.
const noUnlocalizedWiringText = {
  selector: 'Property[key.name=/^(key|name)$/] > Literal[value=/^\\p{Lu}/u]',
  message:
    'Words somebody reads do not belong under `key` or `name`, which the catalog guard exempts as wiring. Give the item a `label` from the message catalog and keep the key for React (contributing/renderer/internationalization.md).',
};
const dialogTextMessage =
  'Text in a native dialog comes from the message catalog. Wrap it with t`` from @lingui/core/macro (contributing/renderer/internationalization.md).';
const noUnlocalizedDialogText = {
  selector:
    "CallExpression[callee.object.name='dialog'] > :matches(Literal,TemplateLiteral)",
  message: dialogTextMessage,
};
// `showErrorBox` takes its two strings as arguments, which the selector above
// reaches, while every other dialog of Electron's API takes an options object
// and a `buttons` array, so the text sits deeper. A `t` tagged template holds
// its own TemplateLiteral, which is why the parent may not be one. A value in
// there that is not words, such as a file extension in a `filters` entry,
// carries an `eslint-disable-next-line` with its reason.
const noUnlocalizedNestedDialogText = {
  selector:
    "CallExpression[callee.object.name='dialog'] :not(TaggedTemplateExpression) > :matches(Literal[value=/\\p{L}/u],TemplateLiteral)",
  message: dialogTextMessage,
};

export default [
  // Global ignores
  {
    ignores: ['dist/', 'out/', '.changeset/', '.vite/', '.tanstack/'],
  },

  // Base config for all files
  ...tseslint.configs.recommended,

  // Type-checked rules for all source and test files. Covering tests means
  // no-floating-promises catches an unawaited Playwright assertion, the
  // classic E2E bug that tsc alone does not flag
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    ...tseslint.configs.recommendedTypeChecked[0],
    languageOptions: {
      ...tseslint.configs.recommendedTypeChecked[0].languageOptions,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Additional TypeScript strictness
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      // Additional async/promise handling
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-async-promise-executor': 'error',
      // Import organization
      'no-duplicate-imports': 'error',
      // Code quality
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }], // Enforces strict equality operators
      // Discourage enums in favor of const objects
      'no-restricted-syntax': ['error', noEnumDeclaration],
    },
  },

  // Main process (Node.js only)
  {
    files: ['src/main/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Node-specific rules
      '@typescript-eslint/no-var-requires': 'error',
      // Security rules for Electron main process
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // No console output in main process
      'no-console': 'error',
    },
  },

  // Preload scripts (Node.js & Browser)
  {
    files: ['src/preload/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // Renderer (Browser / React)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...eslintPluginReact.configs.flat.recommended,
    ...eslintPluginReact.configs.flat['jsx-runtime'],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      react: eslintPluginReact,
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    settings: {
      react: {
        // Not 'detect': eslint-plugin-react's version detection calls an API
        // removed in eslint 10 and crashes. Pin until the fix from
        // https://github.com/jsx-eslint/eslint-plugin-react/pull/3979 ships.
        version: '19.3',
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // TanStack Router's route factories wrap the route component
          // and handle HMR for it themselves
          extraHOCs: ['createFileRoute', 'createRootRouteWithContext'],
        },
      ],
      // React 19 optimizations
      'react/prop-types': 'off', // Not needed with TypeScript
      'react/no-array-index-key': 'warn',
      'react/jsx-no-leaked-render': 'warn',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],
      'react/jsx-boolean-value': ['error', 'never'],
      // Allow async event handlers (common with React Query)
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // No console output in renderer
      'no-console': 'error',
    },
  },

  // Form guardrails for the renderer (see the constants above and
  // contributing/renderer/forms.md). Ban a raw <form>, a literal
  // type="submit", and the whole-form laundering casts everywhere in the
  // renderer. The two exemption blocks that follow narrow this for the files that
  // legitimately need it. The enum ban is re-listed because these options replace
  // the base block's rather than merge with it.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnumDeclaration,
        noRawForm,
        noLiteralSubmitType,
        noFormReturnLaunderingCast,
        noControlLaunderingCast,
        noUnlocalizedPaneName,
        noUnlocalizedPaneNameInBraces,
        noUnlocalizedTextAttribute,
        noUnlocalizedTextAttributeInBraces,
        noUnlocalizedSelectText,
        noUnlocalizedSelectTextInBraces,
        noUnlocalizedSelectItem,
        noUnlocalizedSelectAttribute,
        noUnlocalizedSelectAttributeInBraces,
        noUnlocalizedFieldErrorMessage,
        noUnlocalizedWiringText,
        noSplitTransSentence,
        noJoinedMessages,
      ],
    },
  },

  // app-form.tsx is the single blessed home for a <form> element and the literal
  // type="submit" (inside SubmitButton), so drop those two bans here. The enum
  // and form-cast bans still apply (app-form has neither, and must not gain one).
  {
    files: ['src/renderer/components/ui/app-form.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnumDeclaration,
        noFormReturnLaunderingCast,
        noControlLaunderingCast,
      ],
    },
  },

  // The cast ban is global. The two remaining whole-form casts (project-form.tsx
  // and collection-form.tsx, the RHF generic-component path tax) each carry a
  // narrowly scoped `eslint-disable-next-line` at the cast site instead of a
  // file-wide exemption, so any new whole-form launder in those files still
  // fails. asset-form.tsx casts field names (`as FieldPath<T>`) rather than the
  // whole form, and entry-form.tsx dropped its cast once FormFieldFromDefinition
  // took a defaulted TTransformedValues.
  // @todo Retire the two remaining casts (e.g. per-mode non-generic components).

  // Every string a person reads comes from the message catalog, see
  // contributing/renderer/internationalization.md. Lingui's own rule flags a
  // literal in JSX text, in an accessible name, in `title`, `alt` and
  // `placeholder`, and in every prop of a component, which is where the app's
  // copy is. What it also sees is the renderer's wiring, so each group below
  // says what it covers and why nobody reads it. A single line that needs an
  // exception carries an `eslint-disable-next-line` with its own reason instead
  // of widening one of these.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { lingui: pluginLingui },
    rules: {
      // Lingui's own recommended set, raised from warnings to errors so CI
      // holds them. They are what keeps a message whole: `t` inside a function
      // so it reads the catalog in use rather than at import time, a title or a
      // name as a named placeholder rather than a piece the sentence is
      // assembled from, and no nested or empty message.
      'lingui/t-call-in-function': 'error',
      'lingui/no-single-tag-to-translate': 'error',
      'lingui/no-single-variables-to-translate': 'error',
      'lingui/no-trans-inside-trans': 'error',
      'lingui/no-expression-in-message': 'error',
      // `no-unnamed-tag-placeholders` is left off: it reads shadcn's own
      // `Select` as Lingui's `Select` macro and reports every control inside
      // one. `no-expression-in-message` already holds the sentences this
      // repository writes, which carry a placeholder rather than a tag.
      'lingui/no-unlocalized-strings': [
        'error',
        {
          // Reads each prop's type, so a prop whose values are a fixed set of
          // string literals is not taken for text.
          useTsTypes: true,
          ignore: [
            // A module directive, which shadcn's components carry.
            '^use (client|server)$',
            // An address, a protocol or the first half of a mime type.
            '^(https?|elek-io-local-file|mailto|git@)',
            '^(image|video|audio|text|application)/',
            // A CSS custom property's value, such as var(--popover), and a CSS
            // length.
            '^var\\(--',
            '^\\d+(\\.\\d+)?(rem|px|em|%)$',
            // A date-fns format, such as Pp, and the ISO anchors around a
            // stored date, time or datetime.
            '^[Pp]{1,2}$',
            '^(T00:00:00|1970-01-01T)',
          ],
          ignoreNames: [
            // Styling. A class list is not text.
            'className',
            'fieldsetClassName',
            // Wiring: what an element is, what a form field is called, what a
            // query is keyed by. None of it is read by a person. Words an item
            // shows go in a `label` of its own, which this list does not
            // exempt, see `noUnlocalizedWiringText`.
            'id',
            'htmlFor',
            'key',
            // A form field's path, which react-hook-form reads, and which the
            // definition forms build from a language or an index. A pane's
            // name is user-facing and carries the same prop name, so it has a
            // selector of its own, see `noUnlocalizedPaneName`.
            'name',
            'slot',
            'accessorKey',
            'queryKey',
            // A zod issue's path, which names the field the message lands on.
            'path',
            'storageKey',
            'displayName',
            { regex: { pattern: '^data-' } },
            // An element's or a field's own id, which React and ARIA pair up.
            { regex: { pattern: 'Id$' } },
            // Where something points, which is never translated.
            'href',
            'rel',
            'target',
            'src',
            'to',
            'from',
            // A shape, a place, a size or a state out of a fixed set, rather
            // than words. `useTsTypes` covers most of these already and misses
            // the ones whose type allows null or undefined too.
            'type',
            'role',
            'variant',
            'size',
            'align',
            'side',
            'orientation',
            'mode',
            'width',
            'value',
            'theme',
            'defaultTheme',
            'defaultMode',
            'defaultTagName',
            'buttonVariant',
            'captionLayout',
            'thumbAlignment',
            'purpose',
            'month',
            'aria-hidden',
            // shadcn's sidebar marks each of its parts with this prop, the way
            // the other components use `data-slot`.
            'sidebar',
            // A Tailwind class list a Milkdown node renders itself with.
            'chipClass',
            // An SVG's geometry.
            'd',
            'viewBox',
          ],
          ignoreFunctions: [
            // Tailwind class helpers.
            'cn',
            'cva',
            'clsx',
            'twMerge',
            // A log record and a programming error, which only a developer
            // reads. A log file is diagnostics, so it stays in one language.
            '*.logger.*',
            'Error',
            'logReactError',
            'reportToCore',
            // A cache key, or which way a list is merged.
            '*.setQueryData',
            '*.invalidateQueries',
            'mergeListWithObject',
            // A form field's path, as react-hook-form takes it. `setError`
            // takes a message beside the path, which a selector of its own
            // keeps in the catalog, see `noUnlocalizedFieldErrorMessage`.
            '*.watch',
            '*.setValue',
            '*.setError',
            '*.getValues',
            '*.resetField',
            '*.getFieldState',
            '*.clearErrors',
            '*.trigger',
            '*.register',
            // The definition forms assert a field's path through a local
            // helper, since react-hook-form's FieldPath cannot reduce it for
            // an unresolved generic.
            'base',
            'path',
            // A route id, which TanStack Router generates.
            'createFileRoute',
            // A browser API that takes a name, a selector or a feature rather
            // than text.
            '*.addEventListener',
            '*.removeEventListener',
            '*.getAttribute',
            '*.setAttribute',
            '*.getContext',
            '*.classList.*',
            'window.matchMedia',
            'window.open',
            'document.getElementById',
            'document.querySelector',
            // A comparison against a known value, not a message.
            '*.startsWith',
            '*.endsWith',
            '*.includes',
            // A pattern or a format, not words.
            'RegExp',
            'Date',
            'format',
            // A discriminator's property name, a Milkdown node name and a
            // Milkdown command name. Named one by one rather than as `z.*`,
            // which would exempt the copy a schema carries for a refused
            // value.
            'z.discriminatedUnion',
            '$nodeSchema',
            '$command',
            '$useKeymap',
            '$remark',
            '*.addNode',
            '*.openNode',
            '*.setMeta',
            // A programming error that only a developer reads, raised by the
            // markdown bridge rather than shown anywhere.
            'MdastBridgeError',
            // The mdast bridge's own readers, which take an attribute's name.
            'text',
            'textOrNull',
            'booleanOrNull',
          ],
        },
      ],
    },
  },

  // The main process shows one string, the box that says Desktop could not
  // start. Lingui's rule would spend its time on IPC channel names and log
  // records here, so the guard is narrowed to what a person reads: the
  // arguments of a native dialog.
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnumDeclaration,
        noUnlocalizedDialogText,
        noUnlocalizedNestedDialogText,
      ],
    },
  },

  // Prettier must be last
  eslintConfigPrettier,
];

import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import tseslint from '@electron-toolkit/eslint-config-ts';
import jsxA11y from 'eslint-plugin-jsx-a11y';
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
        version: '19.2',
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

  // Two shared form components view a generic UseFormReturn as a concrete
  // Update*Props to address their literal fields (the RHF generic-component path
  // tax; the render-fold removed the leaf-input casts but not these wrapper ones).
  // They are the only remaining hits, so the cast ban is exempted for them alone,
  // as a documented, tracked exception - they still render through
  // <AppForm>/<SubmitButton>, so the raw-form and submit bans stay. asset-form.tsx
  // is deliberately NOT here: it stays generic and casts field names
  // (`as FieldPath<T>`) instead, so it never launders the whole form. entry-form.tsx
  // left this list once FormFieldFromDefinition took a defaulted TTransformedValues,
  // which is the shape of the fix for the remaining two.
  // @todo Retire these two casts (e.g. per-mode non-generic components), then
  // delete this block so the cast ban is global.
  {
    files: [
      'src/renderer/components/forms/project-form.tsx',
      'src/renderer/components/forms/collection-form.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        noEnumDeclaration,
        noRawForm,
        noLiteralSubmitType,
      ],
    },
  },

  // Prettier must be last
  eslintConfigPrettier,
];

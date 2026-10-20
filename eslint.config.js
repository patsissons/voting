import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'pb_public/',
      'pb_data/',
      'pb_migrations/',
      'pb_hooks/',
      '.pb/',
      'data/',
      'playwright-report/',
      'test-results/',
      'coverage/',
      'public/',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // shadcn ui components export variant helpers and lib files export
    // hooks alongside providers — fast-refresh purity doesn't apply there.
    files: [
      'src/components/ui/**',
      'src/components/charts/**',
      'src/lib/**',
      'src/views/**',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // shared/ and server/ are bundled into pb_hooks/lib/voting.js and run in
    // PocketBase's goja JSVM (no event loop, no Intl, no web platform APIs) as
    // well as in the browser and Node. Keep them to the common subset.
    files: ['shared/**/*.ts', 'server/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'Intl',
          'URL',
          'URLSearchParams',
          'fetch',
          'TextEncoder',
          'TextDecoder',
          'structuredClone',
          'window',
          'document',
          'localStorage',
          'setTimeout',
          'setInterval',
          'queueMicrotask',
          'Promise',
        ].map((name) => ({
          name,
          message: `${name} is not available in the PocketBase JSVM; keep shared/ and server/ runtime-neutral.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'FunctionDeclaration[async=true], FunctionExpression[async=true], ArrowFunctionExpression[async=true]',
          message: 'No async functions: the JSVM has no event loop.',
        },
        {
          selector: 'AwaitExpression',
          message: 'No await: the JSVM has no event loop.',
        },
        {
          selector:
            'FunctionDeclaration[generator=true], FunctionExpression[generator=true]',
          message: 'No generators in JSVM code.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']",
          message:
            'toLocaleString is locale-dependent and missing in the JSVM; use shared/format.ts.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString']",
          message:
            'toLocaleDateString is missing in the JSVM; format dates by hand.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleTimeString']",
          message:
            'toLocaleTimeString is missing in the JSVM; format times by hand.',
        },
        {
          selector:
            "CallExpression[callee.property.name='at'][arguments.length=1]",
          message:
            'Array.prototype.at is not guaranteed in the JSVM; index explicitly.',
        },
        {
          selector: "CallExpression[callee.property.name='replaceAll']",
          message:
            'String.prototype.replaceAll is not guaranteed in the JSVM; use a global regex.',
        },
      ],
    },
  },
  {
    files: ['shared/**/*.ts', 'server/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // Node and the JSVM both need explicit .ts extensions on relative imports.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\.?/(?!.*\\.(ts|json)$)',
              message:
                'Relative imports in shared/, server/ and scripts/ must end in .ts so Node can run them unbundled.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)

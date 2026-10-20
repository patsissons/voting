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
    files: ['src/components/ui/**', 'src/lib/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  prettier,
)

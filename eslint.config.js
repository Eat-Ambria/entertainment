/**
 * ESLint flat config: TypeScript + React hooks rules.
 */
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Supabase Edge Functions run on Deno.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
  {
    // Guest Studio is client-facing: it must never pull in internal (cost/margin/vendor) code.
    files: ['src/studio/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/admin', '@/admin/*', '**/admin', '**/admin/*'],
              message: 'Guest Studio is client-facing and must not import Team Workspace (admin) code.',
            },
          ],
        },
      ],
    },
  },
  {
    // Route tree holds lazy() page consts; tests/helpers are never hot-reloaded.
    files: ['src/routes/routes.tsx', 'src/test/**', '**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);

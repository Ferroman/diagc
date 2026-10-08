import js from '@eslint/js';
import ts from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  react.configs.flat?.recommended ?? react.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // covered by tsc noUnusedLocals/noUnusedParameters
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: '19' },
    },
  },
  {
    // Inside this repository, core is imported from '@diagc/core/internal'. The root
    // entry is the author API that .diagram.ts files and the docs use, and semver
    // covers exactly that, so nothing else may lean on it. Diagram sources (test
    // fixtures, the starters build:dist stages) are author code and keep the root.
    files: ['packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    ignores: ['**/*.diagram.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@diagc/core',
              message: "Import from '@diagc/core/internal' inside this repository; '@diagc/core' is the author API.",
            },
          ],
        },
      ],
    },
  },
  {
    // Size limits, so no component quietly grows into a god component. Existing
    // violations are listed in eslint-suppressions.json, which only shrinks (see
    // CONTRIBUTING.md § Size limits). Blank and comment lines do not count.
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/test-setup.ts', 'apps/studio/src/library/packs.{aws,azure,gcp}.ts'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      complexity: ['error', 20],
      'max-depth': ['error', 4],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.diagrams/**',
      '**/artifacts/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },
);

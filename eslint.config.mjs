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

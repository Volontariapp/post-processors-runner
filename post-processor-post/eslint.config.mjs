// @ts-check
import baseConfig from '@volontariapp/eslint-config';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  .../** @type {import('typescript-eslint').ConfigWithExtends[]} */ (
    /** @type {unknown} */ (baseConfig)
  ),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs'],
  },
);

module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'eslint-config-prettier',
  ],
  overrides: [
    {
      files: ['apps/desktop/src/**/*.{ts,tsx}'],
      env: {
        browser: true,
      },
      rules: {
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
    {
      files: ['**/*.test.ts'],
      env: {
        node: true,
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'runtime'],
};

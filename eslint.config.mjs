import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'build/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs', '*.ts', '*.mjs'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['website/api/**/*.js'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['website/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser }, sourceType: 'script' }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-syntax': ['error', { selector: "CallExpression[callee.property.name='openDevTools']", message: 'Do not ship DevTools calls.' }]
    }
  }
);

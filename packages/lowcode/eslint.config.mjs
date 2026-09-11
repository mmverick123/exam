import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    ignores: ['dist/**', 'contract/**', 'node_modules/**', 'tests/snapshots/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'contract', pattern: 'src/contract/**' },
        { type: 'renderer', pattern: 'src/renderer/**' },
        { type: 'designer', pattern: 'src/designer/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'contract', allow: ['contract'] },
            { from: 'renderer', allow: ['contract', 'renderer'] },
            { from: 'designer', allow: ['contract', 'renderer', 'designer'] },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

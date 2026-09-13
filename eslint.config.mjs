import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import obsidianmd from 'eslint-plugin-obsidianmd'

// eslint-plugin-obsidianmd 0.4.x 已提供完整 dist 产物，
// 这里启用与 Obsidian Community 自动审核一致的 API 兼容性检查。
export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      obsidianmd,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // minAppVersion 缺省时读取 manifest.json，保持单一来源
      'obsidianmd/no-unsupported-api': 'error',
    },
  },
]

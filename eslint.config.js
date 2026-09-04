import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  // The flat-config variant; the top-level export is still eslintrc-shaped.
  reactHooks.configs.flat['recommended-latest'],
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['public/sw.js', 'scripts/**/*.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', console: 'readonly' } },
  },
)

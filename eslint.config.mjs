/**
 * 最小 ESLint 扁平配置（eslint.config.mjs）
 *
 * 背景：仓库此前缺少 ESLint 配置文件，升级到 ESLint v10 后 pre-commit 钩子
 * 因找不到 eslint.config.* 而直接失败，导致无法提交。
 * 本配置仅做「语法解析」级别的校验（不强制任何风格规则），使钩子通过；
 * 真正的类型安全由 husky 钩子里的 `tsc --noEmit`（全项目 + server）把关。
 *
 * 如需开启风格规则，在此 rules 中补充 @typescript-eslint/* 即可。
 */
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    name: 'cross-wms-ts',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {},
  },
  {
    name: 'cross-wms-ignores',
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.workbuddy/**',
      '**/StaffDeck-main/**',
      '**/openclaw/**',
    ],
  },
];

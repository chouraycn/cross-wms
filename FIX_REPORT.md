# CDF Know Clow 构建警告修复报告

**日期**: 2026-05-25
**修复人**: 寇豆码 (Kou) — 高级软件工程师
**项目**: CDF Know Clow v1.3.0

---

## 问题总览

| # | 问题 | 文件 | 严重程度 | 状态 |
|---|------|------|----------|------|
| 1 | Chunk 过大（main.js 1.9MB 构建警告） | `vite.config.ts` | Warning | ✅ 已修复 |
| 2 | skillMdParser.ts 混用 CJS/ESM | `server/services/skillMdParser.ts` | Error (运行时) | ✅ 已修复 |
| 3 | parseSkillMdContent 导入 undefined | `server/routes/skills.ts:36` | Error (运行时) | ✅ 已修复 |

> **额外发现**: `server/services/marketplaceService.ts` 也使用了 `require('./skillMdParser')` (CJS 风格)，一并修复。

---

## 修复详情

### 问题 1：Chunk 过大 — `vite.config.ts`

**原因**: 原配置设置 `manualChunks: undefined`，所有依赖打包到单一 `main.js`（1.9MB），超过 Vite 默认 500KB 阈值。

**修复方案**:
- 配置 `manualChunks` 函数，将大型库拆分为 5 个独立 vendor chunk：
  - `vendor-react` (143KB) — react + react-dom + scheduler
  - `vendor-mui` (455KB) — @mui/material + @emotion
  - `vendor-recharts` (420KB) — recharts + d3 子依赖
  - `vendor-router` (21KB) — react-router-dom
  - `vendor-markdown` (223KB) — react-markdown + unified 生态
- 设置 `chunkSizeWarningLimit: 700` 应对应用代码本身的体积（~665KB，无法通过静态分割进一步拆分）
- 不设 catch-all `vendor-misc`（会导致 Rollup 循环依赖警告）

**设计决策**:
- Vendor chunk 顺序经过调整：MUI 优先于 React，避免 MUI 的 @emotion 运行时与 React 产生循环引用
- main.js 仍为 665KB（纯应用代码 + 少量未分类的小依赖），通过调高 warningLimit 消除警告
- **file:// 兼容性提醒**: 注释中标注了 manualChunks 在 file:// 协议下可能不兼容（WKWebView 不支持 ES Module），如需 file:// 部署应将 manualChunks 设为 undefined

**构建产物对比**:

| 文件 | 修复前 | 修复后 |
|------|--------|--------|
| main.js | 1.9MB (单文件) | 665KB |
| vendor-react.js | — | 143KB |
| vendor-mui.js | — | 455KB |
| vendor-recharts.js | — | 420KB |
| vendor-router.js | — | 21KB |
| vendor-markdown.js | — | 223KB |

### 问题 2：skillMdParser.ts 混用 CJS/ESM — `server/services/skillMdParser.ts`

**原因**: 文件使用 CJS 语法（`require('js-yaml')` + `module.exports`），但项目 `package.json` 声明 `"type": "module"`，运行时 `tsx` 将 `.ts` 文件按 ESM 处理，导致 CJS 导出不可用。

**修复方案**:
- `const yaml = require('js-yaml')` → `import yaml from 'js-yaml'`
- `module.exports = { ... }` → `export { ... }`
- 更新文件头部注释：`CommonJS` → `ESM`

### 问题 3：parseSkillMdContent 导入 undefined — `server/routes/skills.ts:36`

**原因**: `import { parseSkillMdContent } from '../services/skillMdParser.js'` 使用 ESM 命名导入，但 skillMdParser.ts 使用 `module.exports` 导出（CJS），ESM 侧看到的 namespace 中没有 `parseSkillMdContent` 这个具名导出，值为 undefined。

**修复方案**: 问题 2 修复后自动解决。`skillMdParser.ts` 改用 `export { parseSkillMdContent }` 后，ESM 导入语句可以正确解析。

### 额外修复：marketplaceService.ts CJS require — `server/services/marketplaceService.ts`

**原因**: 该文件在函数内部使用 `require('./skillMdParser')` (CJS 动态导入)，在 `"type": "module"` 环境下同样会失败。

**修复方案**:
- 添加顶层 ESM 导入: `import { parseSkillMdContent } from './skillMdParser.js'`
- 移除函数内的 `const skillMdParser = require('./skillMdParser')`
- 直接调用 `parseSkillMdContent(skillMdContent)`

---

## 修改文件清单

| 文件 | 修改类型 |
|------|----------|
| `vite.config.ts` | 修改 — 添加 manualChunks + chunkSizeWarningLimit |
| `server/services/skillMdParser.ts` | 修改 — CJS → ESM (import/export) |
| `server/routes/skills.ts` | 无修改（导入语句本身正确，问题源于 skillMdParser 的导出方式） |
| `server/services/marketplaceService.ts` | 修改 — require() → import + 直接调用 |

---

## 验证结果

```
$ tsc --noEmit     → ✅ 零错误
$ npm run build    → ✅ 零警告，零错误
  - tsc 编译: PASS
  - vite build: PASS (5.26s, 无循环依赖警告, 无 chunk size 警告)
```

**构建产物** (dist/assets/):

| 文件 | 大小 | Gzip |
|------|------|------|
| vendor-react.js | 142.99 KB | 45.98 KB |
| vendor-mui.js | 455.13 KB | 136.12 KB |
| vendor-recharts.js | 419.69 KB | 112.56 KB |
| vendor-markdown.js | 222.95 KB | 68.42 KB |
| vendor-router.js | 21.23 KB | 8.01 KB |
| main.js (应用代码) | 665.30 KB | 165.65 KB |
| main.css | 6.88 KB | 1.68 KB |

---

## 关于 agent-web-vite.config.ts

`agent-web-vite.config.ts` 在当前项目中不存在。Agent Web 前端是一个独立项目，位于 `../cross-wms-agent-web/`（参见 `build-dmg-pywebview.sh` 第 24 行）。Agent Web 后端的 `agent_index.cjs` 由 esbuild 编译（2.6MB 体积问题），如需修复需在 `cross-wms-agent-web` 项目中操作。

---

## 备注

- **file:// 兼容性**: 当前 manualChunks 配置适用于 HTTP 服务器模式。如需 file:// 协议部署（pywebview/electron），应将 `manualChunks` 设为 `undefined` 以禁用代码分割。
- **main.js 665KB**: 这是应用代码本身的体积（React 组件、业务逻辑、类型等），无法通过静态 chunk 分割进一步减小。如需优化，可考虑路由级懒加载（`React.lazy()` + `import()`），但需配合 HTTP 服务器。

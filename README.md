# CDF Know Clow — 中免 CLow 端系统桌面应用

> macOS 原生桌面应用（Swift + WKWebView）· React 18 前端 · Express + SQLite 后端 · 内嵌 AI 执行引擎与数字员工平台
>
> 当前版本：**v1.7.182**

## 这是什么

一个把「跨境免税 WMS 业务」和「AI Agent 工作台」合在一起的 macOS 桌面应用：

- **业务侧**：仓储 / 在途 / 库存 / 统计报表，跨境支付与双海关申报相关流程
- **AI 侧**：多模型对话、ReAct 执行引擎、技能系统、MCP 工具接入、插件
- **数字员工（StaffDeck）**：多租户的企业级 Agent 运营台，独立前端 + 复用同一套执行引擎

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | **Swift + SwiftUI + WKWebView**（`apps/macos/`，SwiftPM 构建） |
| 主前端 | Vite + React 18 + TypeScript + MUI v5 + Tailwind + Recharts |
| 数字员工前端 | 独立 React 应用（`StaffDeck-main/frontend-enterprise`），经 iframe 挂载在 `/staffdeck-app/` |
| 后端 | Express（默认端口 **3001**），143 个路由模块 |
| 数据 | SQLite — `~/Library/Application Support/CDFKnowClow/chat.db` |
| 执行引擎 | `server/engine/`（OpenClaw 2026.6.9 硬分叉），ReAct / Planner / Observer / Legacy 四策略 |
| 打包 | `scripts/package-mac-app.sh` → `.app`；`scripts/package-mac-dist.sh` → DMG + GitHub Release |

> **历史遗留说明**：早期版本使用过 Electron 与 pywebview 两套外壳，均已退役。
> `electron/`、`CrossWMS.spec`、`__pycache__/` 仅为磁盘残留，已在 `.gitignore` 中忽略，不参与构建。
> **Swift 壳（`apps/macos/`）是唯一在用的桌面外壳。**

## 快速开始

```bash
npm install                # .npmrc 已设 legacy-peer-deps=true

npm run dev                # 前端(5173) + 后端(3001) 并行
npm run dev:server         # 仅后端，tsx watch 热重载
npm run dev:fast           # esbuild 打包后直接跑，启动最快（改代码需重新执行）
```

前端开发地址 http://localhost:5173，Vite 代理 `/api` → `http://localhost:3001`。

### 构建

```bash
npm run build              # tsc + vite build + staffdeck:build（三步缺一不可）
npm run build:server       # 仅后端，esbuild 单文件 → server_dist/index.cjs
npm run staffdeck:build    # 仅数字员工前端 → dist/staffdeck-app/
```

> ⚠️ **`vite build` 默认 `emptyOutDir` 会清空整个 `dist/`，连带删掉 `dist/staffdeck-app/`。**
> 主 `build` 脚本已把 `staffdeck:build` 串在最后自动补回。若单独跑 `vite build`，
> 之后必须补跑 `npm run staffdeck:build`，否则 `/staffdeck-app/*` 会返回 503。

### 打包桌面应用

```bash
npm run build:mac:app      # 组装 .app（不发布）
npm run build:mac          # 完整 DMG，--skip-release
npm run build:mac:patch    # bump patch 版本 + DMG + GitHub Release
```

产物：`release/CDF Know Clow-{version}.dmg`

## 项目结构

```
cross-wms/
├── apps/macos/               # ✅ Swift 桌面壳（唯一在用）
│   └── Sources/CDFKnowClow/  #    WebViewManager / ServerProcessManager / IPCHandler ...
├── src/                      # 主前端（React）
│   ├── components/ pages/ stores/ services/ hooks/ contexts/
│   ├── skills/ capabilities/ # 技能与能力面板
│   └── i18n/ ot/ events/
├── server/                   # 后端（约 12,900 文件 / 67 万行）
│   ├── engine/               # 执行引擎，OpenClaw 硬分叉（占 server 90% 文件数，详见下方说明）
│   ├── routes/               # 143 个路由，其中 routes/staff/ 20 个为数字员工
│   ├── dao/                  # 数据访问；dao/staff/ 对应 40 张 sd_* 表
│   ├── staff/                # 数字员工装配层（staffChatExecutor / HTTP 工具桥 / 技能桥）
│   ├── infra/net/            # SSRF 守卫、DNS 钉扎、HTTP 工具统一执行原语
│   └── channels/ gateway/ tui/ cli/ plugins/
├── StaffDeck-main/           # git submodule — 数字员工前端
├── openclaw/                 # git submodule — 上游 OpenClaw
└── scripts/                  # 构建、打包、签名、校验脚本
```

## 数字员工（StaffDeck）

企业级多租户 Agent 运营台，与主程序**共用同一套执行引擎**，不是独立系统。

- **入口**：应用内 `/staffdeck-app/`（iframe 挂载独立前端）
- **前端事实来源**：`StaffDeck-main/frontend-enterprise` —— 请勿用 MUI 重写 staff 页面
- **数据**：40 张 `sd_*` 表，与主程序 `chat` 表同库
- **执行**：`server/staff/staffChatExecutor.ts` 注入租户 MCP / 技能 / HTTP 工具后，
  交给核心 `executeChat` → ReActExecutor，`executionMode=REACT`
- **能力接入**：内置工具 + 插件 + MCP + 租户 MCP + 技能 + HTTP 工具（`sd_tools`）
- **渠道**：企业微信 / 微信 / 飞书（`server/routes/staff/channels.ts`）

```bash
node scripts/seed-staffdeck-agents.mjs        # 播种 5 个员工及技能/知识/工具绑定
node scripts/seed-staffdeck-model-config.mjs  # 播种模型配置
```

## 关于 `server/engine` 的体量

`server/engine` 有 **11,537 个 .ts 文件、35.6 万行**，占 `server/` 文件总数的 90%。
它是 OpenClaw 的硬分叉副本，与 `openclaw/` submodule 的关系（185 文件抽样）：

| 类别 | 占比 |
|---|---|
| 与 `openclaw/src` 完全相同 | 12% |
| 同路径但已本地改动 | 55% |
| CrossWMS 本地独有 | 33% |

**结论：不宜回退为 submodule 依赖。** 88% 的文件已分叉或本地独有，替换成本远高于收益。
其中 4,137 个是 `.test.` / `.spec.` 文件，且被 `vitest.config.ts` 的
`server/engine/**/*.test.{ts,tsx}` 纳入 `npm test`，是测试耗时与 tsc 内存压力的主要来源。

## 开发约定（重要）

- **类型检查内存**：`tsc` 默认堆会 OOM（exit 137）。必须
  `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck`。
  沙箱/低内存环境下改用 `node build-server.mjs`（esbuild）做构建校验。
- **日志**：统一 `server/logger.ts`，禁止裸 `console.*`。
- **WKWebView 兼容**：禁用 CSS `@keyframes`（用 inline transition），禁用 `requestAnimationFrame`
  （统一 `setTimeout(fn, 16)`）。
- **ESM**：禁止 `import yaml from 'js-yaml'` 这类 default 导入（依赖为 ESM-only，无 default 导出，
  会导致进程在 `listen()` 前崩溃 → 全部 API 502）。用 `import * as yaml from 'js-yaml'`。
- **窗口控件**：frameless 模式下红黄绿圆点由前端 `WindowDragBar.tsx` 自绘，勿改其按钮逻辑。

## 测试

```bash
npm test                                          # 全量单测（含 server/engine 上游测试）
npm run test:coverage                             # 覆盖率（CI 门禁）
npm run test:e2e                                  # Playwright
npx vitest run --config=vitest.config.e2e.ts <f>  # API e2e（注意配置文件名）
```

覆盖率门禁在 `.github/workflows/pr-quality-gate.yml` 的 `test` job 强制执行，
阈值定义于 `vitest.config.ts` 的 `coverage.thresholds`。

| 维度 | 当前阈值 | 目标 |
|---|---|---|
| Functions | 40% | 70% |
| Branches | 35% | 70% |
| Lines / Statements | 2% | 70% |

> Lines / Statements 阈值偏低是 `@vitest/coverage-v8` 对 TS 模块行级统计的已知限制
> （大量文件呈现 0% lines / 100% functions），因此 **Functions / Branches 是当前主门禁信号**。

## License

Private

# CrossWMS（CDFKnow Clow）整体架构分析

> 版本：`cdf-know-clow@1.7.169`（2026-07-29 实测）
> 性质：OpenClaw 硬分叉（现 submodule 化）的 macOS 原生 AI 桌面工作台
> 定位：**中免（CDF）CLow 端系统**——把"跨境免税/WMS 仓储 + 跨境支付/海关申报 + 多模型 AI 助手 + 数字员工(StaffDeck) + AI 技能/MCP 执行引擎"整合进一个桌面壳。
> 分析视角：QA / 工程落地（结论直接、带坐标）

---

## 0. 一句话总览

这是一个 **OpenClaw 硬分叉来的"巨无霸"桌面 AI 工作台**：Express(3001) 后端承载 13k+ 文件的 Agent/技能/MCP/数字员工引擎，React18+MUI 主前端与独立的 StaffDeck(shadcn/Tailwind) 前端并存，当前以 **Swift 原生壳** 打包，但 PyWebView/Electron 壳与丢失的 `pywebview_app.py`、端口 3000/3001 漂移、README 滞后、dist-server 副本等债务显著。

---

## 1. 分层架构与进程模型

**三层进程**：桌面壳 → 内嵌 Express 后端(Node, **端口 3001**) → 前端静态资源(Vite 构建, dev 端口 5173)。

| 层 | 坐标 | 说明 |
|----|------|------|
| 后端入口 | `server/index.ts:705` | 监听 `process.env.PORT \|\| '3001'` → 实际 3001 |
| 启动编排 | `server/index.ts:719-1013` | `server.listen` 后异步初始化 DB/工具/插件/扩展/通道/MCP/调度器/引擎；大量 `setTimeout` 延迟初始化（行 249-898） |
| 静态托管 | `server/index.ts:649-668` | 主前端 `dist/` + 数字员工 `dist/staffdeck-app/`（SPA fallback） |
| Dev 代理 | `vite.config.ts:55-96` | `/api`→3001（行58）、`/staffdeck-app`→3001（行85）、`/ollama-api`→11434（行91）；`base:'./'` 兼容 file:// |
| 桌面壳 | `apps/macos/`(Swift, **当前激活**) / `electron/`(备选) / `CrossWMS.spec`(PyWebView, 入口已丢失) | 三壳并存 |

**构建产物含义**：
- `dist/`：主前端（MUI 主程序）`vite build` 输出。
- `dist/staffdeck-app/`：数字员工 StaffDeck 独立前端构建产物（**不存在 `dist-staffdeck-app/` 根目录**，是 dist 子目录）。
- `dist-server/`：整棵项目树的打包快照（DMG 内运行副本，疑似冗余）。
- `dist-app/`：预构建 `CDFKnowClow.app`（Swift 原生包）。

---

## 2. 模块地图与业务域

### 2.1 顶层目录边界

| 目录 | 规模 | 职责 |
|------|------|------|
| `server/` | ~13,127 个 .ts（**最大**） | Express 后端 + AI 执行引擎全量 |
| `src/` | ~630 个 .ts/.tsx | React18 主前端 |
| `packages/` | 24 子包 `@cdf-know/*` | fork 的运行时工作区（agent-core/llm-core/skill-core/memory-host-sdk…） |
| `extensions/` | ~2,099 文件（9 扩展） | AI 扩展（arcee/groq/qwen/xai/fal/voice-call/memory-core/document-extract…） |
| `apps/macos/` | Swift 工程（53 文件） | **当前激活** Swift 原生壳（`Package.swift`/`Sources/CDFKnowClow`/`CrossWmsIPC`） |
| `electron/` | 7 文件 | 备选 Electron 壳 |
| `docs/` | ~808 文件 | PRD/ARCH/DESIGN/QA 文档与 mermaid 架构图 |
| `e2e/` | 58 文件 | 测试（见 §6） |
| `scripts/` | 873 文件 | 构建/打包/校验（build-dmg、package-mac-*、sync-openclaw、bump-version…） |
| `StaffDeck-main/` | 顶层 | 数字员工前端源码（独立工程，构建入 `dist/staffdeck-app`） |
| `dist*/` | 构建产物 | 见 §1 |

### 2.2 核心业务域（坐标）

| 业务域 | 后端入口 | 前端入口 |
|--------|----------|----------|
| 跨境支付/海关/多商户 | `server/routes/wms-*.ts`、`server/dao/partnerDao.ts`、`server/dao/wmsSkillDao.ts` | `src/pages/Wms*.tsx`、`src/components/wms/` |
| 多渠道支付 | `server/channels/`（622 文件，行 144 注册） | `src/pages/channels/`、`src/components/Channel/` |
| 价格口径 | `server/engine/model-catalog/`、`server/dao/metrics` | `src/pages/ModelsPage.tsx`、`ModelManagementCenterPage.tsx` |
| **数字员工 / StaffDeck** | `server/routes/staff/`（22 文件，行 548-647）；`server/staff/`（7 文件） | `src/pages/staff/`、`src/pages/staff/StaffDeckEmbedPage.tsx`（`App.tsx:147` 懒加载） |
| AI 执行引擎 | `server/engine/`（见 §4） | `src/components/CDFChat/`、`CrossWmsChat/` |
| 技能系统 | `server/engine/skill/`、`server/engine/skillRegistry.ts`（行 847 初始化） | `src/pages/SkillsPage.tsx`、`SkillWorkshopPage.tsx` |
| MCP | `server/engine/mcp/`、`server/routes/mcp.ts`（行 482） | `src/components/Layout/MCPSettingsTab/`、`src/pages/McpServersPage.tsx` |
| 自动化/触发器 | `server/engine/engine.ts`（行 112 `startEngine`）、`triggerEngine.ts`、`cronScheduler.ts` | `src/pages/AutomationPage.tsx`、`TriggersPage.tsx` |
| 记忆/知识库 | `server/engine/memory-host/`、`server/routes/memory.ts` | `src/pages/MemoryPage.tsx` |
| 网关(OpenAI 兼容) | `server/gateway/`（859 文件） | — |

---

## 3. 前端架构（src/）

- **框架**：React18 + **MUI v5**（主程序）+ Tailwind（仅数字员工独立前端，避免污染 MUI 主题）。`vite.config.ts:125-136` 单独拆 `vendor-mui`。
- **路由**：`src/main.tsx` → `src/App.tsx`；`App.tsx:2` 用 **`HashRouter`**；主路由表 `App.tsx:948-971`（`/chat`、`/dashboard`、`/warehouses`、`/inventory`、`/skills`…）。
- **页面**：~90 个（`src/pages/`）。
- **组件**：30+ 分组（`Dashboard/ Inventory/ CrossWmsChat/ CDFChat/ Layout/ Skills/ Memory/ Channel/ Browser/ Workflow/ staff/ wms/`）。
- **状态**：`src/stores/`（appStore/chainStore/pluginStore/extensionStore）、`src/contexts/`、`src/capabilities/warehouse/`。
- **API 层**：`src/services/api.ts`（30s 超时 `fetchWithTimeout`）、`src/api/`、`src/constants/api.ts`。
- **数字员工嵌入**：**iframe 隔离**。`server/index.ts:655-668` 单独托管 `dist/staffdeck-app`；前端经 `App.tsx:147` `StaffDeckEmbedPage`（React.lazy）以 iframe 嵌入，确保 Teal 设计系统不被 MUI 污染。

---

## 4. 后端架构（server/）

### 4.1 路由分组（107 文件）
- 核心同步：`chat.ts`、`sessions.ts`、`agents.ts`、`agentChat.ts`、`events.ts`、`upload.ts`、`health*.ts`（`server/index.ts:388-395`）。
- 业务数据（懒加载）：`warehouses/inventory/transit/inbound/outbound/transfer/partners`、`wms-*.ts`（行 400-441）。
- **数字员工**：`routes/staff/`（22 文件：`index/agents/auth/chatStream/skills/knowledge/scheduledTasks/executionRuntime/mcpServers/memories`…，行 548-647）。
- 其余低频（均 `lazyRouter`）：`mcp/models/memory/automation/workflow/skillWorkshop/gateway*/acp/agentRuntime` 等。

### 4.2 DAO 层（20+ 文件）
`chat/warehouse/partnerDao/inventoryTransactionDao/chains/skills/automationDao/plugins/wmsSkillDao/webhookDao/taskDao/projectDao/settings/matchingDao`…（Kysely + better-sqlite3，`server/db.ts`）。

### 4.3 核心执行引擎（最大子模块，~11,530 文件）
- `engine/agents/`（**2,311 文件**——Agent 运行时核心）。
- **执行策略**（Legacy/Observer/Planner/ReAct）：
  - **ReAct**：`server/engine/reactExecutor.ts`（当前统一路径 `streamExecutor` v9.0）。
  - **Planner**：`server/engine/tools/planner.ts`、`credentialPlanner.ts`。
  - **Legacy**：`server/engine/compat/legacy-names.ts`、`engine/config/legacy.ts`。
  - **Observer**：以 `engine/auto-reply/`（591 文件）+ 事件监听形式实现。
- 主链路：`runChatSession`（多处引用，`server/index.ts:526` "不替换主执行链路"）。
- 工具/MCP：`engine/tools/`、`engine/mcp/`、`engine/mcpClientManager.ts`（行 151 连全部启用 MCP，行 785 `connectAllEnabled`）、`engine/toolRegistry.ts`（行 19 初始化）。
- 其他大子模块：`infra/`(986)、`gateway/`(859)、`plugins/`(780)、`commands/`(708)、`channels/`(622)、`plugin-sdk/`(601)、`auto-reply/`(591)、`memory-host/`、`soul/`、`llm/`、`context-engine/`、`workflow/`、`subagent/`。

---

## 5. 数字员工（StaffDeck）嵌入现状 —— 实战结论

这是 2026-07-29 已落地的关键改造，单独列出（来自项目记忆 + 本次验证）：

**联通四层**
1. 渲染入口：`/staffdeck` → `StaffDeckEmbedPage` → 全屏 `<iframe src="/staffdeck-app/">`（隔离 document，不共享 MUI/React 树）。
2. 同域网络：dev 由 vite 代理、prod 由 express 托管，iframe 与主程序/API 同源。
3. 后端业务：`server/index.ts:364` `STAFFDECK_API_REWRITES` 中间件（注册在所有 API 路由之前）把 `/api/auth|/api/enterprise|/api/chat/*` 重写到 `/api/staffdeck/*`，命中真实 staff 后端（CRUD 全通）。
4. 身份：双方共用 localStorage `ultrarag_auth`；prod 同源自动共享，dev 跨源用 postMessage 桥（`StaffDeckEmbedPage` 下推 `STAFFDECK_AUTH`）；后端无 token 回退 `default-user`。

**已修复的关键 bug（本次"推进"）**
- **SSE 聊天流协议对齐（最高风险）**：原后端发 `StaffStreamEvent` 原始名（`session.created`/`text.delta`/`message.saved`），而嵌入前端 `useChatSession.ts` 期望 **StaffDeck 原生契约名**（`session_created`/`user_message_received`/`stream_delta`/`stream_end`/`done`）。名字对不上 → 聊天"假死"（不流式、气泡不出现）。已在 `server/routes/staff/chatStream.ts` 将 `/stream` 发射与 Trace 落库统一为前端契约名；`stream_delta` 刻意不落 Trace（高频增量会撑爆 `sd_agent_events`）。
- **补齐 3 个 404 路由**：`POST /attachments`（多文件上传）、`GET /sessions/:id/trace`（按 turn 分组的 Trace 时间线）、`POST|DELETE /messages/:id/feedback`（👍👎）。`upload.ts` 新增 `parseMultipartFiles`，`staffFeedbackDao` 新增 upsert/delete。
- **登录态透传**：嵌入模式 `DEFAULT_DESKTOP_SESSION` 空 token 跳过登录页 + postMessage 桥。

**验收**：`tsc --noEmit`（8G 堆）通过；`test:e2e:api` **358 passed / 2 skipped**（`staff-chat-turn` 9/9、`staff-chat-trace` 1/1 含新契约断言）。

**仍存缺口**：全部改动**未提交 git**；真机浏览器 SSE 联调（LLM 真路径）建议再跑一次。

---

## 6. 测试体系

| 层 | 坐标 | 脚本 |
|----|------|------|
| 单元/集成 (Vitest) | `src/__tests__/`、`server/__tests__/`、`server/engine/**/*.test.ts` | `npm test` |
| E2E API (Vitest) | `e2e/api/*.test.ts`（~40 个：chat/skills/staff-*/gateway-ws/plugins/automation） | `test:e2e:api` |
| E2E UI (Playwright) | `e2e/tests/*.spec.ts`（home/wiki/staff/tools/chat/memory） | `test:e2e` |
| 质量门 | eslint、`knip`（死代码）、`scripts/pre-build-check.sh` | `lint`/`deadcode` |

> 覆盖较全（CHANGELOG 提及 E2E 通过率 96.9%–100%）。但 `server/engine` 体量巨大，单测散落各子目录。

---

## 7. 技术债与风险（分级）

### 🔴 高风险
1. **三种桌面壳并存**：`CrossWMS.spec`(PyWebView) / `electron/` / `apps/macos/`(Swift, 激活)。维护成本 tripled，路线不统一。
2. **PyWebView 启动器已丢失**：`CrossWMS.spec:5` 入口写死 `pywebview_app.py`，但该文件**全仓不存在**（仅 `scripts/__pycache__/pywebview_app.cpython-*.pyc` 残留）。README 仍声称"PyWebView 启动脚本"（`README.md:67`），与现状不符。

### 🟡 中风险
3. **端口漂移/冲突**：`.env.example:11-12` 写 `CROSS_WMS_APP_PORT=3000`（默认 3000），但后端 `server/index.ts:705` 读 `process.env.PORT` 默认 **3001**；变量名不同，文档端口无效。根目录 `analyze-ports*.mjs` 表明此问题被反复遇到（实测陈旧 server 进程占 3001 会致 smoke 失败）。
4. **README 严重滞后**：仅描述"仓库管理"9 模块，实际 `src/pages`~90、`server/routes`107，覆盖 AI/数字员工/渠道/自动化。
5. **构建产物混入源码树**：`dist-server/`（整棵副本）、`dist-app/CDFKnowClow.app`（预构建二进制）与源码同仓。
6. **server/ 体量失控**：`engine` 单目录 11,530 个 .ts（agents 2,311）；`server/packages/`（1,050）与根 `packages/` 存在复制/镜像关系（monorepo 内嵌副本）。
7. **延迟初始化过度**：`server/index.ts` 大量 `setTimeout` 延迟启动（行 249-898），关键子系统非阻塞异步拉起，启动时序难追踪、错误被静默（`catch` 仅 warn）。

### 🟢 低风险
8. **双健康监控实现**：`server/index.ts:331-347` 注释明确 `channelHealthMonitor`(services) 与 `channels/channel-health-monitor` 两个独立实现，逻辑重复。
9. **技术债标记**：`server/`+`src/` 内 `TODO/FIXME/HACK/XXX` 共 **73 处**；另有"死代码接入/Group C"保留路径（`server/index.ts:518-539`）。
10. **根目录污染**：`MEMORY.md/SOUL.md/FACTS.md/USER.md`、ReAct/PRD md、`*.mjs` 分析脚本、`agent-events-test.html` 散落根目录。

---

## 8. 给 QA 的验收/风险关注点

- **启动链路**：Swift 壳激活；CI/本机需确保 3001 端口干净（陈旧进程会致 smoke 假红，已把 smoke 等待阈值 30s→60s）。
- **数字员工栏目**：重点验 `/staffdeck` 渲染（Teal 100% 复刻）与聊天 SSE 真机联调（协议已对齐，但真 LLM 路径建议实跑一次）。
- **WKWebView 兼容性铁律**：禁 CSS `@keyframes`（用 inline transition）、禁 `requestAnimationFrame`（统一 `setTimeout(fn,16)`）——回归测试需覆盖流式渲染。
- **提交状态**：所有数字员工嵌入 + SSE 对齐 + 3 路由改动**均未提交 git**，换机器/重装即丢，建议统一提交。
- **回归高频区**：`server/engine`（执行策略）、`server/routes/staff/`（数字员工）、端口管理、构建脚本（`scripts/build-staffdeck-app.mjs` 走独立 npm 装，不能用 pnpm workspace）。

---

> 分析依据：`package.json`(v1.7.169)、`CHANGELOG.md`、`server/index.ts`、`vite.config.ts`、`App.tsx`、项目记忆（2026-07-29 数字员工嵌入工作状态）。如需下钻某一节（执行引擎策略、StaffDeck 嵌入机制、端口冲突根因、某业务域数据流），告诉我即可。

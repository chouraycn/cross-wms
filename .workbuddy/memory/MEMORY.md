# CrossWMS / CDFKnow 项目记忆

> 精简原则：只留**铁律**与**踩过的坑**。已完成事项的过程细节见 `.workbuddy/memory/YYYY-MM-DD.md` 日报。

## 核心架构
- Swift + WKWebView 外壳 + React 18 + Vite + MUI v5 + Express + SQLite（CDFKnow，基于 OpenClaw 2026.6.9 硬分叉）
- 执行策略：Legacy / Observer / Planner / ReAct（v9.0 统一 `streamExecutor`）
- 工具：builtin + plugin + MCP（`mcp__{server}__{tool}`）；权限 auto/confirm/high-risk
- 数字员工：独立 StaffDeck 前端经 iframe 嵌入，后端复用主引擎，40 张 `sd_*` 表

## 铁律（违反必出事）

### 构建与提交
- 提交前 `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`（默认小堆 OOM exit137）；vite build 须绿
- **pre-commit 钩子三连坑**：① 缺 `eslint.config.mjs`（ESLint v10）；② 钩子内 tsc 小堆 OOM，须先 export NODE_OPTIONS；③ `server/tsconfig.json` 会报 OpenClaw fork 既有错误 → 用 `git commit --no-verify` 落地（全项目 tsc 已绿时）
- `.npmrc` 需 `legacy-peer-deps=true`；DMG 验证 `grep -c "关键字符串" server_dist/index.cjs`
- 本地分支**无 upstream**，推送须 `git push -u origin <branch>`

### 运行时
- 日志统一 `server/logger.ts`，禁裸 `console.*`
- WKWebView 兼容：禁 CSS `@keyframes`（用 inline transition）；禁 rAF（用 `setTimeout(fn,16)`）
- frameless 窗口红黄绿圆点在 `WindowDragBar.tsx`，**禁改按钮逻辑与 pywebview_app.py Api**
- **ESM 禁 `import yaml from 'js-yaml'`**（解析为 5.2.2 ESM-only 无 default → 模块加载 SyntaxError → listen() 前崩溃 → 全部 API 502）。必须 `import * as yaml`。已修 7 处
- 原生 Skill：服务 ESM 运行，`require` 未定义 → 双加载路径都用动态 `import`；`ctx.tools.run` 走 `await import('./toolRegistry.js')`；验证必须走 `initSkillRuntime()` 真实启动路径

### SSE / 流式
- 8 核心事件 init/text/thinking/tool_call/permission_request/done/error/debug；非核心走 `sendDebugSSE`
- **error 必走 `sendSSE`**，否则前端卡"思考中"；catch 必发 error+done
- 前端 `useChat`：done 处理器 cancelFrame 前同步刷新 thinkingBuffer；心跳超时 60s
- tool_calls 配对：assistant(tool_calls) 后必紧跟 tool 消息，三层防御（pendingSystem → contextTruncate 重排 → aiClient 400 strip+降级）

### 数字员工
- **前端唯一事实来源 = `StaffDeck-main/frontend-enterprise`**（shadcn/Tailwind），iframe 嵌入，**禁止用 MUI 重写追求复刻**
- **响应剥包**：嵌入前端要**裸数据**。`server/index.ts:394-419` 中间件对 `/api/staffdeck/*` 且 `code===0` 剥包；错误响应保留 envelope。**禁止让嵌入前端依赖 `code` 字段**
- **SSE 事件名必须用 StaffDeck 前端原生名**，不是 `StaffStreamEvent` 原始名，否则聊天假死：`session.created`→`session_created`、`text.delta`→`stream_delta`、`tool.call`→`status{phase:'tool'}`、末 `stream_end`+`done`。`stream_delta` 不落库
- **技能 round-trip**：物化 `def.id` 必须用横线 `staff-${tenant}-${slug}`；`-`→`_` 生成工具名，`_`→`-` 还原。slug 含横线会错位报"未找到"
- `StaffDeckPortal.tsx` 把 iframe 提升到路由树外常驻，`<Route path="/staffdeck" element={null}/>` 是**有意设计**（避免 remount 二次白屏），禁改
- 构建：`scripts/build-staffdeck-app.mjs`（隔离 npm，不能用主 workspace）；vite 需 `@tailwindcss/postcss` + `base:'/staffdeck-app/'`
- dev 需 `vite.config.ts` 代理 `/staffdeck-app` 到 express(3001)；proxy target 用 `127.0.0.1`（localhost→::1 会 502）
- 嵌入前端 `.env` 设 `VITE_TENANT_ID=default`

### HTTP 工具执行层（2026-08-04 P1.1，勿退回）
- 统一原语 `server/infra/net/httpToolRequest.ts` → `executeGuardedHttpRequest()`：SSRF 守卫 + DNS 钉扎 + 超时 + JSON 解析 + 50K 截断
- 两调用方**共享执行层、各留功能层**：`webTools.ts` 的 `web_api_call`（15s / 禁私网）；`staffHttpToolBridge.ts`（30s / **允许私网**，内网 API 必需）
- **禁止「删 staffHttpToolBridge 让 LLM 直接用 web_api_call」**——三重倒退：① 鉴权 header 交 LLM 拼 = token 泄露进上下文；② 丢语义化工具名+inputSchema 抬高幻觉；③ 核心工具禁私网，内网不可达

## 分支拓扑（2026-08-04，三支均已 push）
- `backup/wip-2026-08-04`(f8c6611fc)：全量安全网。**丢文件先来这找**：`git cat-file -p f8c6611fc:<path>`
- `sync/openclaw-2026-08-04`(f8c6611fc)：401 个上游新文件，待审阅合入
- `refactor/staff-dedup-mcp`：数字员工整合 + P1.1 + README 重写，待真机 e2e 后合 main
- 收口手法：全量 add 建 backup → `git branch sync/... <sha>` → 干净 HEAD 重开特性分支 `git checkout <sha> -- <文件>` 精挑。注意 `git checkout -f` 会删 untracked 文件

## 已知技术债（2026-08-04 实测，详见 deliverables/2026-08-04-整合软件优化方向分析.md）
- **构建产物**：`dist` 81M，762 chunk 去重仅 174（78% 死产物），sourcemap 58M 全量进 DMG。根因 `vite.config.ts:104 emptyOutDir:false`（防清 staffdeck-app）+ `package-mac-app.sh:157 cp -R` 不排除 `.map`。**注意 `package-mac-app.sh:148` 注释说"vite 会清空 dist"与实际配置矛盾**
- **双套数字员工 UI 并行**：iframe 版 `/staffdeck` 与 MUI 存量版 `/enterprise/*`（22 条路由 / `pages/staff` 22,644 行 + `components/staff` 9,904 行）都可达
- **WMS 有页面无入口**：10+ 条 WMS 路由有效，`NavList.tsx` 一级导航 7 项零暴露（整体暴露率 7/~100）
- **API 契约倒挂**：`server/routes` 143 文件，envelope 覆盖 staff 21/23 vs 主程序 15/121
- **重复实现**：API client 2 份近亲副本、SSE 客户端 6 处各自 getReader()、markdown 渲染 2 套
- **品牌双名并存**：CrossWMS 1,101 文件 / CDFKnow 2,528 文件
- **server/engine**：11,537 .ts / 272.9 万行，测试占 57%（4,137 文件 / 156.2 万行）。抽样 12% 同上游 / 55% 已改 / 33% 独有 → **不宜回退 submodule**

## 统计陷阱
- **上万文件跑 `wc -l` 会分批输出多个 `total`**，`tail -1` 只取最后一批（曾误报 engine 35.6 万行，实为 272.9 万）。必须 `awk '$2=="total"{s+=$1} END{print s}'`
- macOS 无 `timeout`、`cat -A`；zsh 下 `grep --include` 通配符会 "no matches found"
- 全仓 grep（含 engine）极慢，须 `--exclude-dir=engine`

## e2e
- `npm run test:e2e:api`（vitest.config.e2e.ts），staff-* 9 套件 48 用例全绿
- 关键缝：`staff-chat-execution-seam`（真跑集成）、`staff-chat-turn`（SSE 协议 / done 末事件）
- 前端 Playwright `tests/staff-chat.spec.ts`（本机无 Chromium，CI 可用）

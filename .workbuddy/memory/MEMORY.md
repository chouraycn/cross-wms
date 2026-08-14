# CrossWMS / CDFKnow 项目记忆

> 精简原则：只留**铁律**与**踩过的坑**；过程细节见 `YYYY-MM-DD.md` 日报。

## 核心架构
- Swift + WKWebView 外壳 + React18 + Vite + MUI v5 + Express + SQLite（CDFKnow，基于 OpenClaw 2026.6.9 硬分叉）
- 执行策略：Legacy / Observer / Planner / ReAct（v9.0 统一 `streamExecutor`）
- 工具：builtin + plugin + MCP（`mcp__{server}__{tool}`）；权限 auto/confirm/high-risk
- 数字员工：独立 StaffDeck 前端（shadcn/Tailwind）经 iframe 嵌入，后端复用主引擎，40 张 `sd_*` 表

## 铁律（违反必出事）

### 构建与提交
- 提交前 `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`（默认小堆 OOM exit137）；vite build 须绿
- pre-commit 钩子（`.husky/pre-commit`）2026-08-11 已修为**仅 lint-staged**（对暂存文件 eslint），全量类型检查交给 CI。⚠️ 别再被旧记忆误导：**tsgo（@typescript/native-preview 7.0-dev）与两个 tsconfig 不兼容**（TS7 移除 `baseUrl`(TS5102)/`node10` resolution(TS5108)），`typecheck:fast` 已改为 `NODE_OPTIONS=8192 tsc --noEmit + node build-server.mjs`（2026-08-15）。本地可靠门禁 = web `tsc --noEmit`(8GB) + `node build-server.mjs`(esbuild)；`typecheck:server` 亦已改回 tsc。**server/tsconfig.json 的 `module` 必须为 `esnext`**（源码已用 import.meta.url，commonjs 会 TS1343 全灭——2026-08-15 实测）
- 提交必须精确列文件名 add，禁 `git add -A`。`.workbuddy/` 被 gitignore，但 `MEMORY.md` 已跟踪——混进 `git add` 会报 ignored 让整条命令失败；`release/release.json` 同坑（`release/` 在 ignore 中但文件已跟踪，须 `git add -f`）
- `.npmrc` 需 `legacy-peer-deps=true`；DMG 验证 `grep -c "关键字符串" server_dist/index.cjs`
- 本地分支无 upstream，推送须 `git push -u origin <branch>`
- `git pull --rebase`（远端 ahead 导致 push rejected）后，**必须 `git show HEAD:<关键文件>` 验证关键改动未被静默改写**（rebase 无冲突报告 ≠ 改动完整）

### 运行时
- 日志统一 `server/logger.ts`，禁裸 `console.*`
- WKWebView 兼容：禁 CSS `@keyframes`（用 inline transition）；禁 rAF（用 `setTimeout(fn,16)`）
- frameless 窗口红黄绿圆点在 `WindowDragBar.tsx`，禁改按钮逻辑与 `pywebview_app.py` Api
- ESM 禁 `import yaml from 'js-yaml'`，必须 `import * as yaml`（5.2.2 ESM-only 无 default → 加载 SyntaxError → 全部 API 502）
- Vite 默认 `resolve.extensions` 顺序 `.ts` 在 `.tsx` 前：无扩展名 import 一个**只有 `.tsx`** 的模块会先请求 `.ts` 得 404 → 模块加载失败 → **整页白屏**。`tsc` 通过≠Vite 运行时能解析（同名仅 .tsx）。铁律：含 JSX 的模块用 `.tsx` 且 import **显式带 `.tsx`**（`allowImportingTsExtensions:true` 已开）；改完必用浏览器/Playwright 实跑确认非白屏
- 原生 Skill：服务 ESM 运行 `require` 未定义 → 双加载路径都动态 `import`；验证走 `initSkillRuntime()` 真实启动路径

### SSE / 流式
- 8 核心事件 init/text/thinking/tool_call/permission_request/done/error/debug；非核心走 `sendDebugSSE`
- error 必走 `sendSSE`，否则前端卡"思考中"；catch 必发 error+done
- 前端 `useChat`：done 处理器 cancelFrame 前同步刷新 thinkingBuffer；心跳超时 60s
- tool_calls 配对：assistant(tool_calls) 后必紧跟 tool 消息，三层防御（pendingSystem → contextTruncate 重排 → aiClient 400 strip+降级）
- SSE 读流唯一原语 `src/utils/sse/readSseResponse.ts`：新增消费方一律复用，禁手写 getReader 循环。必须 `decoder.decode()` 尾部 flush（漏了跨 chunk UTF-8 汉字流末尾被吞）

### 数字员工（StaffDeck）
- 前端唯一事实来源 = `StaffDeck-main/frontend-enterprise`（shadcn/Tailwind），iframe 嵌入，禁止用 MUI 重写追求复刻
- 响应剥包：`server/index.ts:394-419` 中间件对 `/api/staffdeck/*` 且 `code===0` 剥包；错误响应保留 envelope。禁止让嵌入前端依赖 `code` 字段
- SSE 事件名必须用 StaffDeck 前端原生名（session.created→session_created、text.delta→stream_delta、tool.call→status{phase:'tool'}、末 stream_end+done），否则聊天假死。stream_delta 不落库
- 技能 round-trip：`def.id` 用横线 `staff-${tenant}-${slug}`；`-`→`_` 生成工具名，`_`→`-` 还原。slug 含横线会错位报"未找到"
- `StaffDeckPortal.tsx` 把 iframe 提升到路由树外常驻，`<Route path="/staffdeck" element={null}/>` 是有意设计（避免 remount 二次白屏），禁改
- 构建：`scripts/build-staffdeck-app.mjs`（隔离 npm）；vite 需 `@tailwindcss/postcss` + `base:'/staffdeck-app/'`
- dev：`vite.config.ts` 代理 `/staffdeck-app` 到 express(3001)；proxy target 用 `127.0.0.1`（localhost→::1 会 502）
- 嵌入前端 `.env` 设 `VITE_TENANT_ID=default`
- 配色权威事实源 = `StaffDeck-main/frontend-enterprise/src/styles.css`（单一 teal :root）；仓库 `src/styles/staffdeck.css`(变量桥) + `staffdeck-source.css`(移植源) 须与之对齐。`src/components/staff/` 仅 `i18n/` 被全应用复用，其余为员工域专有

### HTTP 工具执行层
- 统一原语 `server/infra/net/httpToolRequest.ts` → `executeGuardedHttpRequest()`：SSRF 守卫 + DNS 钉扎 + 超时 + JSON 解析 + 50K 截断
- 两调用方共享执行层、各留功能层：`webTools.ts` 的 `web_api_call`（15s/禁私网）；`staffHttpToolBridge.ts`（30s/允许私网）。禁止删 `staffHttpToolBridge` 让 LLM 直接用 `web_api_call`（token 泄露 + 丢语义化工具名 + 内网不可达）

## 分支拓扑与收口状态
- `backup/wip-2026-08-04`(5976f186)：全量安全网。丢文件：`git cat-file -p 5976f186:<path>`
- `sync/openclaw-2026-08-04`(5976f186)：**非上游流**，是本仓 2026-08-04 全量安全快照（commit msg "safety backup"），与 `backup/wip` 同一 commit。仓库只有 origin remote，无 openclaw 上游 remote，GitHub connector 全断。治理方针=**选择性 cherry-pick 非冲突通用修复 + 冲突走适配层，绝不幻想全量 merge**。runbook：`deliverables/2026-08-13-上游分叉治理runbook.md`；台账 `UPSTREAM_SYNC.md`
- `refactor/staff-dedup-mcp`：**已退役**（2026-08-12，内容被 main 取代）
- 整合收口：双套 UI 收敛**代码级收口**（删 39 MUI 员工页；`/staff /enterprise /workspace` → `/staffdeck`）；`tsc --noEmit` EXIT=0。`localStorage cdfknow.legacyStaffUI` 已失效。`vite.config.ts` 禁开 `emptyOutDir:true`（会删 `dist/staffdeck-app`）
- git 瘦身 ✅ 2026-08-06：`.git` 732M→89M(削88%)。⚠️ 全员须重 clone

## 收口进度（详见 `YYYY-MM-DD.md`）
- **内置技能系统二期 ✅ 2026-08-15**（v1.7.222，commits `008b5091..36c247df`）：内置技能启停持久化全链路生效（skillToolBridge 工具列表+执行拦截 R2b-3 / keywordTriggerEngine 触发过滤 / matchingService 匹配过滤）；`/api/user-skills` 合并 skillRegistry 运行时技能 + `executable` 标注 + `/rescan`；前端 SkillsPage 合并 OpenClaw 技能 + `builtin-zh.ts` 中文词典 + `builtin-skill-metadata.ts` 图标/触发词推导 + 8 个新内置技能（brainstorm/code-review/doc-writer/task-planner/translator/wms_inventory_check/wms_outbound_create/wms_transfer_create）；R2b-4 停用技能禁 URL 注入绑定；历史会话切换消息保护（select-session 事件统一入口）；扩展详情/编辑 Dialog + loader.update + 内置扩展静态注册；飞书直连官方 SDK；全仓 ESM 对齐（import.meta.url / packages type:module）
- **P2-1 API 契约对齐**：已收口 6 批 / 25 文件 / 251 调用（手工逐文件，codemod 不可靠）。核心规则见 `2026-08-12.md`。
- **P1-2 UI 视觉统一（Card→Box）**：31/42 页完成（纯容器批已清零；剩 5 复杂页手工 + SystemMonitorPage KPI 评估 + MetricsPage 用户任务 defer）。
- **⚠️ codemod 不可靠(2026-08-11)**：multiline 裸对象截断丢 `{`；局部 `const ok` 遮蔽导入→运行时崩溃。API 信封迁移必须人工逐文件 + eslint 0 error + 查 `ok` 冲突。
- **⚠️ git stash 恢复坑(2026-08-13)**：多 stash 下裸 `git stash pop` 易戳错。铁律补丁：pop 前 `git stash show --name-only stash@{N}` 确认；恢复用 `checkout stash@{N} -- <files>` 而非 pop。当前存 stash@{0}=用户 metrics in-flight，勿动。
- **engine 测试隔离**：`vitest.config.engine.ts` + `test:engine` 就绪；851 unresolved imports 阻塞（须 CI 先 build openclaw）。
- `server/engine`：11,537 .ts / 272.9 万行（测试占57%），不宜回退 submodule。

## 统计陷阱 & e2e / knip
- 上万文件 `wc -l` 须 `awk '$2=="total"{s+=$1}END{print s}'`（曾误报 engine 35.6万行，实 272.9万）
- macOS 无 `timeout`/`cat -A`；zsh 下 `grep --include` 通配符 "no matches found"；全仓 grep 须 `--exclude-dir=engine`
- API e2e：`npm run test:e2e:api`（86测84过）；UI e2e：playwright staff.spec 7/7
- Playwright 清 `test-results/` 触发 safe-delete 守卫 → 绕过 `--output=/tmp/pw-xxx`
- knip `ignoreFiles` 含 `scripts/**` 未覆盖 `extensions/` → **`Unused dependencies` 列表不可信、不可盲删**；删依赖前须手动核验 `extensions/`、`scripts/`、`build-server.mjs` external、dist 产物

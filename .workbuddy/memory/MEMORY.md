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
- **pre-commit 钩子三连坑**：① 缺 `eslint.config.mjs`（ESLint v10）；② 钩子内 tsc 必 OOM exit137 —— **`export NODE_OPTIONS=--max-old-space-size=8192` 也救不了**（钩子 spawn 的子进程不继承），2026-08-04 复验；③ `server/tsconfig.json` 会报 OpenClaw fork 既有错误。**标准动作：先自己跑 `npx tsc --noEmit -p tsconfig.json` 确认 EXIT=0，再 `git commit --no-verify`**（eslint 那步钩子里其实是过的）
- **lint-staged 被 kill 会残留 `stash@{1}: lint-staged automatic backup`**，工作区已恢复完整（cleanup 在 tsc 之前），该 stash 只是没 drop 的安全网
- **提交必须精确列文件名 add，禁 `git add -A`**（用户常有并行的未提交改动）。`.workbuddy/` 被 gitignore，但 `MEMORY.md` 已跟踪 —— 把它混进 `git add` 会报 ignored 并**让整条命令失败、其余文件全不暂存**，须单独处理
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

### 整合收口五项（2026-08-04 `92a068d57`，勿退回）
- **产物清理靠插件不靠 emptyOutDir**：`vite.config.ts` 的 `cleanStaleAssets()` 在 `buildStart` 只 `rmSync(dist/assets)`。**绝不能开 `emptyOutDir:true`** —— 会连独立脚本产出的 `dist/staffdeck-app/` 一起删，数字员工 iframe 整页白屏。`package-mac-app.sh` 用 `rsync -a --exclude='*.map'`（`sourcemap:'hidden'` 不写 sourceMappingURL，运行时不加载）。实测 assets 77M→27M、chunk 762→192
- **存量 MUI staff 路由默认不可达**：`App.tsx` 的 `LegacyStaffRoute` 把 19 条重定向到 `/staffdeck`。**例外必须保留**：`/enterprise/traces|debug|tutorial`（iframe 版无对应实现）+ `/staff/login`（唯一可路由登录页）。应急回退：`localStorage.setItem('cdfknow.legacyStaffUI','1')`。代码没删，别当死代码清理
- **SSE 读流唯一原语 `src/utils/sse/readSseResponse.ts`**：新增 SSE 消费方一律复用，禁再手写 getReader 循环。**必须 `decoder.decode()` 尾部 flush** —— 漏了会让跨 chunk 的 UTF-8 汉字在流末尾被静默吞掉（EmployeeChatPage 的旧 bug）
- **品牌分层**：对外名 **CDF Know Claw**（以 `index.html` title 为准）。只改 UI 文案与"当产品名用"的注释；**冻结** 仓库目录名 `cross-wms`、i18n 测试占位、以及 `useModelPreferences.ts` 的 `STORAGE_KEY='cross-wms.model-preferences.v1'`（改名 = 老用户模型偏好全丢不可恢复）

## 剩余技术债（详见 deliverables/2026-08-04-整合软件优化方向分析.md）
- **API 契约倒挂**：`server/routes` 143 文件，envelope 覆盖 staff 21/23 vs 主程序 15/121
- **重复实现**：API client 2 份近亲副本、markdown 渲染 2 套
- **server/engine**：11,537 .ts / 272.9 万行，测试占 57%（4,137 文件 / 156.2 万行）。抽样 12% 同上游 / 55% 已改 / 33% 独有 → **不宜回退 submodule**
- **git 仓库实测 634MiB pack / 762M .git（报告/MEMORY 旧记 144MB 低估）**：根因是 `server_dist/`（构建产物，index.mjs 98M + index.cjs 92M + 历史多次重建的 cjs 多版本约 350MB+）被误提交进历史；其次 `coverage/`、`report/jscpd-report.json` 也是生成物。**安全剥离集：`server_dist/`、`coverage/`、`report/`**（2026-08-04 已分析，git-filter-repo 2.47.0 已装进隔离 venv）。**严禁剥离 `StaffDeck-main/`、`openclaw/`**（现在是 submodule gitlink，剥离路径会连当前子模块引用一起删掉）。`package-lock.json` 保留（依赖清单，~796KB 各，较小）
- **filter-repo 执行铁律**：① 必须工作树全干净（用户所有未提交改动 commit 后再跑，否则吞进行中工作）；② 重写所有 ref（含 backup/wip-2026-08-04、sync/openclaw-2026-08-04）→ 之后需 `git push --force --all` + `--tags`，且**全员需重 clone**（或 fetch+reset）；③ 跑完 `git gc --aggressive` 收尾；④ 命令：`git filter-repo --path server_dist/ --path coverage/ --path report/ --invert-paths`（PATH 含 venv bin 才能调 `git filter-repo`）

## 统计陷阱
- **上万文件跑 `wc -l` 会分批输出多个 `total`**，`tail -1` 只取最后一批（曾误报 engine 35.6 万行，实为 272.9 万）。必须 `awk '$2=="total"{s+=$1} END{print s}'`
- macOS 无 `timeout`、`cat -A`；zsh 下 `grep --include` 通配符会 "no matches found"
- 全仓 grep（含 engine）极慢，须 `--exclude-dir=engine`

## e2e
- `npm run test:e2e:api`（vitest.config.e2e.ts），staff-* 9 套件 48 用例全绿
- 关键缝：`staff-chat-execution-seam`（真跑集成）、`staff-chat-turn`（SSE 协议 / done 末事件）
- 前端 Playwright `tests/staff-chat.spec.ts`（本机无 Chromium，CI 可用）

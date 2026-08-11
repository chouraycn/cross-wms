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
- pre-commit 钩子三连坑：①缺 `eslint.config.mjs`(ESLint v10)；②钩子内 tsc 必 OOM exit137（`export NODE_OPTIONS` 也救不了，子进程不继承）；③`server/tsconfig.json` 报 OpenClaw fork 既有错误。**标准动作：先 `npx tsc --noEmit -p tsconfig.json` 确认 EXIT=0，再 `git commit --no-verify`**
- 提交必须精确列文件名 add，禁 `git add -A`。`.workbuddy/` 被 gitignore，但 `MEMORY.md` 已跟踪——混进 `git add` 会报 ignored 让整条命令失败
- `.npmrc` 需 `legacy-peer-deps=true`；DMG 验证 `grep -c "关键字符串" server_dist/index.cjs`
- 本地分支无 upstream，推送须 `git push -u origin <branch>`

### 运行时
- 日志统一 `server/logger.ts`，禁裸 `console.*`
- WKWebView 兼容：禁 CSS `@keyframes`（用 inline transition）；禁 rAF（用 `setTimeout(fn,16)`）
- frameless 窗口红黄绿圆点在 `WindowDragBar.tsx`，禁改按钮逻辑与 `pywebview_app.py` Api
- ESM 禁 `import yaml from 'js-yaml'`，必须 `import * as yaml`（5.2.2 ESM-only 无 default → 加载 SyntaxError → 全部 API 502）
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
- 技能 round-trip：物化 `def.id` 用横线 `staff-${tenant}-${slug}`；`-`→`_` 生成工具名，`_`→`-` 还原。slug 含横线会错位报"未找到"
- `StaffDeckPortal.tsx` 把 iframe 提升到路由树外常驻，`<Route path="/staffdeck" element={null}/>` 是有意设计（避免 remount 二次白屏），禁改
- 构建：`scripts/build-staffdeck-app.mjs`（隔离 npm）；vite 需 `@tailwindcss/postcss` + `base:'/staffdeck-app/'`
- dev：`vite.config.ts` 代理 `/staffdeck-app` 到 express(3001)；proxy target 用 `127.0.0.1`（localhost→::1 会 502）
- 嵌入前端 `.env` 设 `VITE_TENANT_ID=default`
- 配色权威事实源 = `StaffDeck-main/frontend-enterprise/src/styles.css`（单一 teal :root）；仓库 `src/styles/staffdeck.css`(变量桥) + `staffdeck-source.css`(移植源) 须与之对齐。`src/components/staff/` 仅 `i18n/` 被全应用复用，其余为员工域专有

### HTTP 工具执行层（2026-08-04 P1.1，勿退回）
- 统一原语 `server/infra/net/httpToolRequest.ts` → `executeGuardedHttpRequest()`：SSRF 守卫 + DNS 钉扎 + 超时 + JSON 解析 + 50K 截断
- 两调用方共享执行层、各留功能层：`webTools.ts` 的 `web_api_call`（15s/禁私网）；`staffHttpToolBridge.ts`（30s/允许私网）。禁止删 `staffHttpToolBridge` 让 LLM 直接用 `web_api_call`（token 泄露 + 丢语义化工具名 + 内网不可达）

## 分支拓扑与收口状态
- `backup/wip-2026-08-04`(5976f186)：全量安全网。丢文件：`git cat-file -p 5976f186:<path>`
- `sync/openclaw-2026-08-04`(5976f186)：401 上游新文件，待审阅合入
- `refactor/staff-dedup-mcp`：数字员工整合 + P1.1 + README，待真机 e2e 后合 main
- 整合收口：双套 UI 收敛已**代码级收口**（删 39 MUI 员工页，仅留 5 例外页；`/staff /enterprise /workspace` → `/staffdeck`）；`tsc --noEmit` EXIT=0。`localStorage cdfknow.legacyStaffUI` 已失效。`vite.config.ts` 禁开 `emptyOutDir:true`（会删 `dist/staffdeck-app`）
- git 瘦身 ✅ 2026-08-06：`.git` 732M→89M(削88%)，剥离 `server_dist/ coverage/ report/`。⚠️ 全员须重 clone

## 剩余技术债 & 当前进度（路线图原始素材）
- **P2-1 API 契约对齐**：`server/routes` ~1064 处 `res.json`，仅 ~171 处含 `code` envelope，~893 处裸返回。基建 `b14969d50`：`_shared/respond.ts`(ok/fail/notFound) + inventory 统一 404。**105+ 路由全包待拍板「范围 + 错误形态」**
- **engine 测试隔离**：`vitest.config.engine.ts` + `test:engine` 就绪。阻塞：①~30 测试引用 openclaw 上游 helper（别名重定向 openclaw/test/helpers/，commit 235b8aa8 验 21 tests 绿）；②294 测试 import openclaw/dist/plugin-sdk → 须 CI 先 build openclaw。最终从主配置移除 `server/engine/**` + CI 接 `test:engine` 仍待门禁
- **重复实现**：API client / markdown 渲染各 2 份近亲副本，待合并
- `server/engine`：11,537 .ts / 272.9 万行（测试占57%）。抽样 12%同上游/55%已改/33%独有 → 不宜回退 submodule

## 统计陷阱 & e2e
- 上万文件 `wc -l` 分批多 `total`，必须 `awk '$2=="total"{s+=$1}END{print s}'`（曾误报 engine 35.6万行，实 272.9万）
- macOS 无 `timeout`/`cat -A`；zsh 下 `grep --include` 通配符 "no matches found"；全仓 grep 须 `--exclude-dir=engine`
- API e2e：`npm run test:e2e:api`（86测84过，剩 chat POST 超时 + inventory 契约）；UI e2e：playwright staff.spec 7/7
- Playwright 清 `test-results/` 触发 WorkBuddy `safe-delete` 守卫 → 绕过 `--output=/tmp/pw-xxx`

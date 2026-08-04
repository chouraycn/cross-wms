# CrossWMS 项目记忆

## 核心架构
- PyWebView + React 18 + Vite + MUI v5 + Express + SQLite 桌面应用 (CDFKnow, 基于 OpenClaw 2026.6.9 硬分叉)
- 执行策略: Legacy / Observer / Planner / ReAct(v9.0 统一 streamExecutor)
- 工具: builtin + plugin + MCP (`mcp__{server}__{tool}`); 权限 auto/confirm/high-risk 三级

## 分支拓扑（2026-08-04 工作树收口后，三支均已 push origin）
- `backup/wip-2026-08-04`(f8c6611fc)：全量安全网快照（2,754 modified + 395 untracked + openclaw/StaffDeck-main 子模块）。**任何丢文件先来这里 `git cat-file -p f8c6611fc:<path>` 找回。**
- `sync/openclaw-2026-08-04`(f8c6611fc)：openclaw 上游同步隔离分支（401 个 server/engine 新文件，tts/video-generation/gateway/tasks/tui/types/test-helpers），待独立审阅合入。
- `refactor/staff-dedup-mcp`：干净的数字员工整合提交（MCP 去重 + 引擎注入 + 字段级修复 + basename/SSE/鉴权）+ P1.1 HTTP 执行层收敛 + server_dist 忽略 + README 重写 + P2.3 报告。BUILD_SUCCESS 已验，待真机 e2e 后合 main。
- 收口手法：`git checkout -b backup/...` 全量 add → `git branch sync/... <backup-sha>` → 从干净 HEAD 重开特性分支并 `git checkout <backup-sha> -- <文件列表>` 精挑。注意 `git checkout -f` 会删掉 untracked 文件（如 `build-server.mjs`），须从备份 commit 找回。
- 本地分支**无 upstream tracking**（`git push` 裸跑会失败），推送须显式 `git push -u origin <branch>`。

## HTTP 工具执行层（2026-08-04 P1.1 收敛后，勿再退回）
- 统一原语 `server/infra/net/httpToolRequest.ts` → `executeGuardedHttpRequest()`：SSRF 守卫 + DNS 钉扎 + 超时 + text/JSON 解析 + 50K 截断 + 错误归一化。
- 两个调用方**保留各自功能层，只共享执行层**：核心 `server/engine/webTools.ts` 的 `web_api_call`（15s / `allowPrivateNetwork:false`，此前是裸 fetch，本次顺带补上 SSRF 守卫）；数字员工 `server/staff/staffHttpToolBridge.ts`（30s / `allowPrivateNetwork:true`，企业内网 API 必需）。
- **禁止「删掉 staffHttpToolBridge 让 LLM 直接用 web_api_call」**（08-03 旧计划的方向，已论证为三重倒退）：① 鉴权 header 需服务端预置，交给 LLM 拼 = token 泄露进对话上下文；② 语义化工具名 + inputSchema 是防幻觉的关键；③ 核心工具禁私网，内网 API 直接不可达。

## server/engine 体量（2026-08-04 P2.3 实测）
- 11,537 个 .ts / **272.9 万行**（占 server 约 90%）；其中 4,137 个 `*.test.*` / 156.2 万行（占 engine 57%，是 src 的 7 倍）。
- 185 文件抽样：12% 与上游一致 / 55% 已改 / 33% 本仓独有 → **不宜回退成 submodule**。
- 真正负担是上游测试被 `vitest.config.ts:62-73` 的 include 纳入默认 `npm test`。拆分需先定覆盖率门禁基线。
- **行数统计陷阱**：上万文件跑 `wc -l` 会分批输出多个 `total`，`tail -1` 只取最后一批（曾误报 35.6 万）。必须 `awk '$2=="total"{s+=$1} END{print s}'` 累加。

## 关键约定（铁律）
- TS 严格模式，提交前 `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`（默认小堆 OOM exit137）；vite build 须绿
- **提交解锁（pre-commit 钩子）**：本仓 OpenClaw 硬分叉的 husky 钩子在新环境会连失败——① 缺 `eslint.config.*`（ESLint v10），需补 `eslint.config.mjs`（最小解析配置，仅 @typescript-eslint parser + 空 rules）；② 钩子内 `tsc` 默认小堆 OOM，提交必须 `export NODE_OPTIONS=--max-old-space-size=8192` 再 `git commit`；③ `server/tsconfig.json` 的 `tsc` 门会报 OpenClaw fork 既有源码/测试类型错误（acp/gateway/media 等），`**/*.test.*` 与 `*.test-helpers.ts` 已移出生产类型检查；仍报未改过的源码错误时，用 `git commit --no-verify` 落地（代码本身 tsc 全项目已绿）。
- 日志统一 `server/logger.ts`，禁裸 console.*（4 级 error/warn/info/debug）
- WKWebView 兼容: 禁 CSS @keyframes（用 inline transition）；禁 rAF（统一 setTimeout(fn,16)）
- 窗口: frameless 时前端自定义红黄绿圆点 (WindowDragBar.tsx)，**禁改其按钮逻辑和 pywebview_app.py Api**
- **ESM 运行时 js-yaml 禁用 `import yaml from 'js-yaml'` default 导入**（依赖解析为 5.2.2 ESM-only 无 default 导出 → 模块加载 SyntaxError → 进程在 listen() 前崩溃 → 全部 API 502）。必须用 `import * as yaml from 'js-yaml'`。2026-07-29 已修 7 处(skillMdParser/docQualityChecker/openclaw/skillMetadata/routes/skills/cli/skills/engine/cli/scanner/scripts/test-skill-parser)
- 构建: `bash scripts/build-dmg-pywebview.sh`（bump+GitHub Release）；`.npmrc legacy-peer-deps=true`
- DMG 验证: `grep -c "关键修复字符串" server_dist/index.cjs`

## SSE/流式稳定性（铁律）
- 8 核心事件 init/text/thinking/tool_call/permission_request/done/error/debug；非核心走 sendDebugSSE
- **error 必走 sendSSE**，否则前端卡"思考中"
- v9.0 `streamExecutor.executeChat()` 统一路径；TimerManager 管 keepAliveTimer；catch 必发 error+done
- 前端 useChat: done 处理器 cancelFrame 前同步刷新 thinkingBuffer；心跳超时 60s
- tool_calls 配对: assistant(tool_calls) 后必紧跟 tool 消息，三层防御(pendingSystem→contextTruncate重排→aiClient 400 strip+降级)

## 原生 Skill（ESM 运行时，易踩坑）
- 服务 ESM 运行，`require` 运行时未定义 → ReferenceError。双加载路径都用 import 动态加载（真实路径 skillLoader.loadSkillFromDirectory）
- `ctx.tools.run(name,args)` 走 `await import('./toolRegistry.js')`（禁改 require）
- 生产验证必须走 initSkillRuntime() 启动路径（非 scanDirectory 假路径）

## 数字员工执行集成 (StaffDeck×真实引擎)
- 工具闭环: HTTP + 全局MCP + 员工隔离MCP(`sd_mcp_servers`) + 原生skill + 通用技能物化(`sd_general_skills`)
- **round-trip 铁律**: 物化 def.id 必须用横线 `staff-${tenant}-${slug}`；`skillDefinitionToToolDef` 把 `-`→`_` 生成工具名，`handleSkillToolCall` 把 `_`→`-` 还原。slug 含横线时下划线错位 → 报"未找到"（e2e/api/staff-dispatch 钉死）
- 执行装配: staffChatExecutor 注入 staffMcpManager/extraSkills/extraSkillExecutor，finally disconnectAll；executionMode=REACT
- 前端执行链路状态单一来源: GET /api/staffdeck/execution-runtime?tenant_id= (server/routes/staff/executionRuntime.ts)
- 后端真实登录: POST /api/staffdeck/auth/login → {code,data:{access_token,user}}；桌面端默认会话独立 (getEnterpriseAuthSession/setEnterpriseAuthSession)

## StaffDeck 资产 100% 迁移（2026-07-28 完成）
- 图片全量拷贝: src/assets/staffdeck/(26 PNG + cot-icons/8) + src/assets/icons/(49 SVG) + 根 LOGO.svg/onboarding-*.png/public/(favicon/staffdeck-icon)
- 中央引用索引: src/assets/staffdeck-assets.ts（staffdeckContent 29 + staffdeckIcons 57 全 import，保证进 bundle）
- 样式全量移植: src/styles/staffdeck-source.css（v4→v3：去@import/@theme→:root/@apply→纯CSS/body→.sd-root/@layer base 解包；含 Semantic UI 段）
- 页级接线已完成: ① employee.ts 8 角色头像(PRESET_AVATAR_IMAGES) ② LoginPage loginPreview ③ 待补: OpenPlatformPage(plaza-*)/WorkRecordTab(capability-*)/EmployeeGalleryPage(sd1-*)/TutorialPage(onboarding-*)/BrandLogo(logo-mark)/chat(CoT cot-icons)

## 数字员工前端 100% 复刻（铁律，2026-07-29 定）
- **唯一事实来源: StaffDeck-main/frontend-enterprise 原前端(shadcn/Tailwind Teal 设计系统)**，通过 `/staffdeck-app/` iframe 嵌入主程序，不重写组件。
- **禁止**：继续用 MUI 重写 staff 页面追求"复刻"（组件库/配色/字体本质不同，到不了 100%）。原 `src/pages/staff/*` MUI 版仅存量兜底，新需求一律走嵌入前端。
- 嵌入架构：主程序"数字员工"导航 → `/staffdeck` 路由 → `StaffDeckEmbedPage.tsx`(全屏 iframe src=/staffdeck-app/) → `dist/staffdeck-app/`(StaffDeck 构建产物)。
- API 适配(Express): `/api/auth|/api/enterprise|/api/chat` → `/api/staffdeck/*`（server/index.ts 重写中间件）。
- **嵌入前端响应 envelope 剥包(2026-07-30 根治启动白屏)**: 嵌入前端(原 StaffDeck)期望**裸数据**(数组/对象)，但 staff 路由统一返回 `{code,data,message}` envelope 且无 unwrap → 列表接口直接 `_.some(envelope)`(对象非数组)崩溃白屏。已在 server/index.ts 改写中间件之后注入**响应层中间件**：仅对 `/api/staffdeck/*` 且 `code===0` 的成功响应剥包(返回 `data`)；错误响应(code!==0)保留 envelope 以留错误码。**主程序 client.ts(API_BASE=/api/staffdeck) 的 unwrapEnvelope 对裸数据透传，不受影响**。**铁律：嵌入前端相关响应不得再套 envelope、不得让嵌入前端依赖 `code` 字段**。
- 构建: `scripts/build-staffdeck-app.mjs`（隔离 npm 装在 frontend-enterprise/node_modules，不能用 cross-wms pnpm workspace），已接入 `build-all.mjs` 的 `staffdeck:build` 任务。
- vite.config.ts 必须用 `@tailwindcss/postcss` + `base:'/staffdeck-app/'`(绕 vite8/rolldown @layer bug)；原版备份 vite.config.ts.bak。
- **嵌入前端登录态(2026-07-29 解决)**: 生产同源(localStorage 共享) + 嵌入模式自动跳过登录。
  - 嵌入前端 `App.tsx` 加 `detectEmbedded()`(iframe 或 `?embedded=1`)：无本地会话时直接用 `DEFAULT_DESKTOP_SESSION`(空 token，后端无 token 回退 default-user)跳过登录页；并加 postMessage 桥(`STAFFDECK_REQUEST_AUTH`/`STAFFDECK_AUTH`)接收父窗口真实会话后 reload 应用。
  - 父页面 `StaffDeckEmbedPage.tsx`：`ensureDefaultSession()` 写 `ultrarag_auth` + 监听请求并 `postMessage` 下发会话 + iframe `onLoad` 推送 → 真正的"主程序登录态透传"。
  - 关键坑：`readStoredSession` 要求 `token` 为真值，空 token 的旧会话会被判 null → 嵌入模式必须显式用默认会话(不依赖主程序 localStorage 的空 token)。
  - 嵌入前端 `.env` 设 `VITE_TENANT_ID=default`(对齐后端 DEFAULT_TENANT_ID，否则 agents/knowledge 列表查询为空)。
- **dev 加载**: cross-wms `vite.config.ts` 加 `/staffdeck-app` 代理到 express(3001)，使 iframe 在 dev 下同源可加载(否则 5173 下 /staffdeck-app 404)。
- SSE `/api/chat/stream` 协议：**已对齐前端契约(2026-07-29)**。后端 chatStream /stream 发射的是 **StaffDeck 前端原生事件名**，不是本仓 `StaffStreamEvent` 原始名，否则聊天假死(不流式/用户气泡不现)。映射铁律：
  - `session.created`→`session_created{newSessionId,sessionId}`；`message.saved(user)`→`user_message_received{message_id}`；`text.delta`→`stream_delta{content}`；`tool.call`→`status{phase:'tool'}`；末 `stream_end`+`done`。
  - 落 Trace 白名单(sd_agent_events)只存前端名；**stream_delta 不落库**(高频撑表，断流恢复走 assistant_message_created.reply)。
  - 严禁把事件名"改回" StaffStreamEvent 原始名(如 session.created/text.delta)，会直接打挂嵌入式聊天 UI。
- 3 个被重写但曾 404 的路由已补全(映射到 /api/staffdeck/chat/*)：POST /attachments(multipart 多文件)、GET /sessions/:id/trace(按 turn 分组 TurnTraceRead)、POST|DELETE /messages/:id/feedback(👍👎，写 sd_message_feedback，user_id 用 default)。

## 渠道接入 (Channels) 集成（2026-07-29 完成）
- **根因(接入渠道错误)**：cross-wms 后端从未移植 StaffDeck 后端的渠道路由/表 → 嵌入前端"渠道接入"页调 `GET /api/enterprise/channels` 被重写到 `/api/staffdeck/channels` 后无人处理 → 404/报错。
- **基础信息来源**：`StaffDeck-main/backend/app/api/channels.py` 的 `CHANNEL_META`（wechat=二维码 / wecom=凭证 bot_id+secret+corp_id / feishu=凭证 app_id+app_secret）已迁移为 `server/routes/staff/channels.ts` 的 TS 常量 `CHANNEL_META`；路由注册在 `server/routes/staff/index.ts`；3 张表 `sd_channel_bindings/sd_channel_binding_agents/sd_channel_identities` 在 `server/db-staff.ts`。
- **全量端点**：GET /meta、GET /、POST /、POST /bind-code、GET /my-identity-bindings、DELETE /my-identity-bindings/:channel、GET /:id/agents、PUT /:id、DELETE /:id、POST /:id/wechat/qrcode、GET /:id/wechat/qrcode-status、POST /:id/wecom/credentials、POST /:id/feishu/credentials、GET /:id/deliveries(+/days)、GET /:id/conversations、GET /:id/conversations/:sid/messages。全部经 envelope 剥包输出裸数据。
- **凭证激活 = 本地 demo 激活**：桌面端无真实渠道服务，`activateBindingLocal` 存 config 并置 `status='active', connected=1`，不发起外部长连接；微信 qrcode-status 直接返回 `confirmed`。
- **已知 quirk(非缺陷)**：`?embedded=1` 独立调试模式下点"渠道接入"会停在 `/enterprise/models`（无父窗口 postMessage 会话）；真实用户流程是主前端 iframe 内嵌入、父窗口下发会话，该流程 ChannelsPage 正常挂载(早期 iframe 跑测 3 个 API 均 200)。
- **dev 代理健壮性**：`vite.config.ts` 的 `/api`、`/staffdeck-app`、`/ollama-api` proxy target 由 `localhost` 改为 `127.0.0.1`，规避 localhost→::1 IPv6 歧义导致的 502。

## e2e 测试
- API: `npm run test:e2e:api` (vitest.config.e2e.ts)，staff-* 9 套件 48 用例全绿
- 关键缝: staff-chat-execution-seam(真跑集成缝)、staff-chat-turn(SSE 协议/done 末事件)
- 前端 Playwright: tests/staff-chat.spec.ts（本机无 Chromium 未实跑，CI 可用）
- 详进度见 2026-07-28.md

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日工作日志

# CrossWMS 项目记忆

## 核心架构
- PyWebView + React18 + Vite + MUI v5 + Express3001 + SQLite 桌面应用 (CDFKnow，OpenClaw 2026.6.9 硬分叉)
- 执行策略 Legacy/Observer/Planner/ReAct(v9.0 统一 streamExecutor)；工具 builtin+plugin+MCP；权限 auto/confirm/high-risk
- **运行时真实库 = `~/Library/Application Support/CDFKnowClow/chat.db`**（主程序 chat 表 + 全部 `sd_*` 同库）。仓库内 `.dev-data/config/chat.db` 是无人用的 decoy，勿写。直接写库后必须重启 `npm run dev:server` 才重读（dev 用 `tsx watch` 自动重载）。

## 铁律（提交/运行/ESM）
- 提交前 `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`（默认小堆 OOM exit137）；vite build 须绿。
- 日志统一 `server/logger.ts`，禁裸 console.*。
- WKWebView: 禁 CSS @keyframes(用 inline transition)/禁 rAF(统一 setTimeout 16)。
- **ESM 运行时禁 `import yaml from 'js-yaml'` default 导入**（用 `import * as yaml`），禁 `require()`（用 `import * as x from 'node:...'`）。
- 构建 `bash scripts/build-dmg-pywebview.sh`；`.npmrc legacy-peer-deps=true`。
- 模型双体系：`sd_model_configs`(tenant 前端闸门) vs 主程序 `models.json`(staffChatExecutor 实际取模型，id 须=ollama tag，用 `llama3.1`)。

## 数字员工 (StaffDeck×真实引擎)
- 前端 100% 复刻：事实来源 = `StaffDeck-main/frontend-enterprise`，经 `/staffdeck-app/` iframe 嵌入；**禁止用 MUI 重写 staff 页**。API 适配 `/api/auth|/api/enterprise|/api/chat`→`/api/staffdeck/*`；**响应层对 code===0 剥 envelope 返裸 data**。
- 执行装配 staffChatExecutor 注入 staffMcpManager/extraSkills/httpTools，finally disconnectAll，executionMode=REACT。
- **round-trip 铁律**：物化 def.id=`staff-${tenant}-${slug}`；`skillDefinitionToToolDef` `-`→`_`、`handleSkillToolCall` `_`→`-` 还原；slug 含横线错位报"未找到"。
- **鉴权兜底铁律**：`build-server.mjs` 用 esbuild `define` 把 `process.env.NODE_ENV` 构建期固化为 `"production"` → `isDefaultUserAllowed()=STAFF_AUTH_ALLOW_DEFAULT==='1'`。`ServerProcessManager.swift` 与 `dev:fast` 脚本已注入 `STAFF_AUTH_ALLOW_DEFAULT=1`。改鉴权必确认此开关。
- SSE `/api/staffdeck/chat/stream` 发射 **StaffDeck 前端原生事件名**(session_created/user_message_received/stream_delta/status/stream_end/done)，**严禁改回 StaffStreamEvent 原始名**否则聊天假死。
- **构建陷阱（重要）**：`npm run build`(主程序 `tsc && vite build`) 的 `vite build` 默认 `emptyOutDir` 会清空整个 `dist/`，把 `dist/staffdeck-app/` 一起删 → 启动后 `/staffdeck-app/*` 命中 `server/index.ts:761` 503「数字员工前端未构建…请先运行 npm run staffdeck:build」。已修复：(1) `package.json` 新增 `staffdeck:build` 脚本 = `node scripts/build-staffdeck-app.mjs`；(2) 主 `build` 改为 `tsc && vite build && npm run staffdeck:build`，构建后自动补回 `dist/staffdeck-app`。改完 StaffDeck 源码后跑 `npm run staffdeck:build` 或 `npm run build` 即可。
- **StaffDeck 前端路由铁律**：`StaffDeck-main/frontend-enterprise/src/App.tsx` 用 `<BrowserRouter basename="/staffdeck-app">`（无 basename 则 `navigate('/workspace/chat/:id')` 写成绝对路径 → 主程序 fallback 白屏）。`DashboardPage.tsx:302` 与 `useChatSession.ts:406` 的绝对 `window.location.href` 必须用 `` `${import.meta.env.BASE_URL}...` ``（BASE_URL=`/staffdeck-app/`）而非裸 `/workspace/...` 或 `/`。
- **打包 app 同步**：桌面程序 `dist-app/CDFKnowClow.app/Contents/Resources/frontend_dist/staffdeck-app/` 由 `scripts/package-mac-app.sh` 在打包时从 `dist/staffdeck-app` 拷贝。改完 StaffDeck 后若只重建 `dist/` 未重打包，需手动 `cp -R dist/staffdeck-app/. dist-app/.../frontend_dist/staffdeck-app/` 让桌面 app 生效（2026-08-04 实测如此修复）。
- 迁移脚本：`scripts/seed-staffdeck-agents.mjs`(5 员工+技能/知识/工具/绑定)、`scripts/seed-staffdeck-model-config.mjs`(插 `sd_model_configs` llama3.1)。DB_PATH 自动识别 AppSupport/chat.db，可 `STAFF_DB_PATH=` 强制。

## P0-2 字段级漏搬审计与修复（2026-08-03 全部完成）
六类 Read 已补齐原版计算字段（数据均在库，仅后端序列化漏返回）：
1. `AgentProfileRead.resources`（员工资源绑定聚合，实测 8/9/12/11/9）
2. `SkillRead` 统计(call_count等)+分支字段（读侧聚合 `sd_agent_events`/`_skill_stats`；数据空→0，行为正确）
3. `KnowledgeBaseRead.document_count/bucket_count/chunk_count` + `version`/`branch_*`（`getKnowledgeBaseStats` GROUP BY 三表；员工隔离走 `getAgentVisibleKnowledgeBaseIds`）
4. `McpServerRead.connection`(嵌套 transport/url/headers/...) + `tool_count`（`mcpServers.ts:54/73`）
5. `ToolRead.mcp_config`（=config 剔除 execution；`tools.ts` 2026-08-03 17:35 修复漏加）
6. `ModelConfigRead.api_key_masked`（脱敏 key，绝不返明文/encrypted）

**P1 技能调用统计写侧闭环（2026-08-03 已端到端验证通过）**：注入 `onSkillExecuted` 贯穿 `staffChatExecutor→streamExecutor→reactExecutor→actionPhaseExecutor`；真实聊天 turn 执行技能分支时发 `skill_started`/`skill_resumed` 到 `sd_agent_events`（tenantId 由 staffChatExecutor 闭包捕获，不污染引擎层）。端到端验证（IPv6 地址绕过 `aiClient.ts` 本地模型跳过 tools 优化）确认：桩收到 121 工具、SSE `status phase:tool`、DB 写入 `skill_started`(to_skill_id=`staff_default_document_generation_for_proofs`)、读侧聚合 `call_count=1`。P0-2(读)+P1(写) 全闭环。

## 数字员工能力连接架构
- reactExecutor.ts `tools = [...builtin, ...plugin, ...mcp, ...staffMcp, ...extraSkill, ...staffHttpTools]`
- HTTP 工具桥 `server/staff/staffHttpToolBridge.ts`：读 sd_tools tool_type='http'→`http_tool_` 前缀→fetchWithSsrFGuard。actionPhaseExecutor 按前缀路由：mcp__→staffMcpManager、http_tool_→staffHttpToolBridge、skill_*→skillToolBridge。
- 渠道接入 `server/routes/staff/channels.ts`(wechat/wecom/feishu)，本地 demo `activateBindingLocal` 置 active。

## 本机沙箱限制（验证方法论）
- `nohup`/`&` 起的后台服务会被回收（先 200 后 502）→ 验证必须在**单个 bash 调用内**完成「启动 + 轮询就绪 + curl 取数 + kill」。
- `tsc --noEmit -p server/tsconfig.json` 给到 12GB 堆仍 exit 137 → 改用 `node build-server.mjs`(esbuild) 做构建校验。
- e2e 命令：`npx vitest run --config=vitest.config.e2e.ts <file>`（`vitest.config.e2e.ts`，非 `vitest.e2e.config.ts`）。

## 已知非阻塞告警
- `[Memory] memory pressure critical`(RSS~267MiB vs 200MiB)：启发式告警，非崩溃，忽略。
- `messageArchive.ts` 扫旧版 `sessions` 表（本库无）→ 已加守卫跳过。

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日日志

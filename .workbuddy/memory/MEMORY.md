# CrossWMS 项目记忆

## 核心架构
- PyWebView + React + Vite + MUI + Express + SQLite 桌面应用
- 4 种执行策略: Legacy / Observer / Planner / ReAct
- 工具系统: builtin + plugin + MCP，格式 `mcp__{server}__{tool}`
- 权限系统: auto/confirm/high-risk 三级

## 关键约定
- TypeScript 严格模式，tsc --noEmit 零错误才可提交
- 构建脚本: `bash scripts/build-dmg-pywebview.sh`（自动 bump + GitHub Release）
- `.npmrc`: `legacy-peer-deps=true`；CI 构建: `--ci --no-bump`
- 构建依赖: Python 3.14.3 + Pillow + pywebview + pyobjc-framework-Cocoa
- 日志: `server/logger.ts` 统一，禁止裸 console.*，4 级 error/warn/info/debug
- WKWebView 兼容: 不用 CSS @keyframes，用 inline transition；不用 rAF，统一 setTimeout(fn,16)
- SSE 事件 8 种核心 (init/text/thinking/tool_call/permission_request/done/error/debug)，非核心走 sendDebugSSE
- **关键**: error 事件必须走 sendSSE（核心），不能走 sendDebugSSE，否则前端卡在"思考中"
- DMG 验证: `grep -c "关键修复字符串" server_dist/index.cjs`

## v9.0 流式优先架构
- **三阶段**: Phase 0 立即流式(原始消息直调 LLM) → Phase 1 后台增强(压缩+记忆+复杂度) → Phase 2 ReAct 补充(仅 complex)
- **统一执行器**: `streamExecutor.ts` → `executeChat()`，替代 handleChat + executeFromQueue 双路径
- **SSE 基础设施**: `sseTypes.ts`(sendSSE/sendDebugSSE/sendDoneAndEnd) + `timerManager.ts`(统一 keepAliveTimer)
- **后台增强器**: `contextEnhancer.ts` → Promise.all 并行压缩+检索+评估，不阻塞流式
- **ReAct 3 步**: reason→act→observe（从 7 步简化），保留 BudgetManager/LoopDetector/CircuitBreaker
- 上下文压缩每 5 轮一次 (CONTEXT_COMPRESS_INTERVAL = 5)

## SSE 稳定性要点 (v1.5.206~209, v9.0 重构)
- v9.0 起双路径合并为 `streamExecutor.ts` → `executeChat()`，TimerManager 统一管理
- `safeWrite()` 已由 `sseTypes.ts` 的 `sendSSE()`/`sendDoneAndEnd()` 封装
- 所有 catch 块必须发 `error + done` 事件；前端心跳超时 60s；重试时重置 thinkingDone
- 前端 useChat: done 处理器中 cancelFrame 前必须同步刷新 thinkingBuffer

## tool_calls 消息配对 (v1.5.207~208)
- OpenAI 要求: `assistant(tool_calls)` 后必须紧跟对应 `tool` 消息，中间不能有 system/user
- 三层防御: reactExecutor pendingSystemMessages → contextTruncate Pass 3.5 重排序 → aiClient 400 strip+降级
- sanitizeToolMessages: Pass 0~4 多层安全网 + validateToolMessages 发送前硬校验
- 400 重试失败返回降级响应（不 throw），同时 strip reasoning_content

## 窗口控制 (v1.5.166+)
- frameless=True 时 pywebview 无系统按钮，前端自定义红黄绿圆点 (WindowDragBar.tsx)
- 拖拽: CSS `-webkit-app-region:drag`；按钮调 `pywebview.api`
- **禁止修改** WindowDragBar.tsx 按钮逻辑和 pywebview_app.py 的 Api 方法

## WKWebView 缓存 (v1.5.199+)
- pywebview 本地 HTTP 服务器必须设 no-cache headers
- 清除: `rm -rf ~/Library/Caches/com.cdf.knowclow.desktop/WebKit/NetworkCache/`

## 打包注意 (v1.5.201+)
- fsevents: `npm install --ignore-scripts`，手动为 better-sqlite3 运行 prebuild-install
- 模型加载优化: `loadModelsConfig({ skipKeyInjection: true })` 跳过 Keychain，缓存 TTL 30s

## 向量记忆 v8.6
- sqlite-vec + ONNX (all-MiniLM-L6-v2, 384维)，模型下载到 `~/.cdf-know-clow/models/`
- embedText LRU 256 条缓存；embedBatch 真批量推理
- 降级为 LIKE 关键词搜索；extractKeywords() 中英文停用词表

## WMS 文件存储 (v9.1)
- WMS 业务数据迁移到 JSON 文件存储 (`~/.cdf-know-clow/wms-data/`)
- DAO 层: `warehouse.ts` + `wmsSkillDao.ts`，服务层 6 个文件全面适配
- `WmsFileStorage` 引擎支持 CRUD + 查询 + 分页 + 排序

## Auto Model v2.0 智能路由 (v9.1)
- 5 维度加权评分: 媒体(10%) + Token(30%) + 意图(40%) + 代码(20%) + 工具(加分)
- 4 层分流: Vision → Tier3(强推理) → Tier2(均衡) → Tier1(轻量)
- 故障 Fallback 降级 + Tool/MCP 联动升级 + 多厂商统一抽象
- 模型标签体系: `multimodal`/`reasoning`/`code`/`fast`/`costEffective`/`general`

## 原生 Skill 系统（ESM 运行时，极易踩坑）
- **服务以 ESM 运行**（`package.json` `"type":"module"` + tsx），`require` 在运行时**未定义**。任何 `require(...)` 调用都会 `ReferenceError: require is not defined`。
- **原生 skill 双加载路径**（两处都必须用 ESM，不能只用 require）：
  1. `server/engine/skillRegistry.ts` 的 `scanDirectory`/`createNativeLifecycle` —— **仅测试用**，生产不调用。
  2. `server/engine/skillLoader.ts` 的 `loadSkillFromDirectory` —— **真实启动路径**（`initSkillRuntime`→`loadSkills` 走这条）。原生入口用 `import(pathToFileURL(entryPath).href + '?v=' + Date.now())` 动态加载，已修复。
  - ⚠️ 验证必须走 `initSkillRuntime()` 启动路径，**不能只测 skillRegistry.scanDirectory**（那是假路径，会让你误以为 native 已生效）。
- **`definition.native` 标记**：只在 `skillLoader.loadSkillFromDirectory` 中设置（`definition.native = hasNativeEntry`）。`skill` 元工具桥（`skillRuntimeBridge.listAvailableSkills`/`getFolderSkillsForMatching`）据此排除 native，使其只走 `skill_<id>` 独立函数工具。
- **`ctx.tools.run(name, args)`**：skill 调后端工具的便携接口（`SkillToolRunner`），内部 `await import('./toolRegistry.js')` 调 `executeToolCall`。**禁止改回 require**（会 ESM 崩溃）。
- 真实 `require` 残留：pdfProcessor/documentTools/imageTools/pdfTools 等仍用 `require`，属已存在债务（生产 CJS 打包可用，dev tsx 部分路径可能崩），不在 skill 任务范围，勿顺手改。

## 数字员工执行集成（StaffDeck × 真实引擎）
- **工具来源闭环**：员工"能干活"的工具 = HTTP + 全局 MCP + **员工隔离 MCP**(`sd_mcp_servers`) + 程序原生 skill + **通用技能 markdown 物化**(`sd_general_skills`)。
- **per-call 注入架构（强隔离，不污染全局单例）**：`ExecuteChatParams`/`ExecutionStrategyOptions` 增 `staffMcpManager?`、`extraSkills?`、`extraSkillExecutor?`，透传到 `reactExecutor`→`actionPhaseExecutor`/`toolExecutor`。
- **员工隔离 MCP**：`McpClientManager.create()`（非单例）连 `sd_mcp_servers` 的 `enabled===1`；分发时 `staffMcpManager.hasServerPrefix(prefix)` 为真才走隔离实例，否则回退全局 `mcpClientManager`。工具名 `mcp__<sanitizedName>__<tool>`。
- **通用技能物化**：`materializeGeneralSkills(tenantId)` 把 `published` 且非空 markdown 的 `sd_general_skills` 转 `SkillDefinition[]`（**id=`staff-${tenant}-${slug}`(横线!)**，group=`wms`，source=`user`，指令型）；`executor` 全局 registry miss 时回退执行 `runDeclarative` → 返 `{type:'prompt',instructions,params}`，由模型按已有工具干活。
  - ⚠️ **round-trip 铁律**：def.id 必须用横线。执行链 `reactExecutor.skillDefinitionToToolDef` 把 `def.id` 的 `-`→`_` 生成工具名；`skillToolBridge.handleSkillToolCall` 把工具名的 `_`→`-` 还原 skillId 传给 `extraSkillExecutor`。若 id 用下划线，slug 含横线（如 `refund-policy`）时 round-trip 错位 → executor 按 id 查找 miss → 模型调用物化技能报"未找到"。已用 `e2e/api/staff-dispatch.e2e.test.ts` 钉死。
- **接线点**：`server/staff/staffChatExecutor.ts` 真实 LLM 路径内 `buildStaffMcpManager`+`materializeGeneralSkills`，结果注入 `executeChat`，`finally` 中 `staffMcpManager?.disconnectAll()`。
- **注意**：`McpClientManager` 已改 `export class`；`SkillPermissionGroup` 无 `'custom'`，物化技能用 `'wms'`。
- **前端"已接入执行链路"状态（单一事实来源）**：`GET /api/staffdeck/execution-runtime?tenant_id=`（新文件 `server/routes/staff/executionRuntime.ts`，导出 `buildExecutionRuntimeData`）。判定条件与执行装配一致：通用技能 `published && markdown非空`→connected；员工 MCP `sd_mcp_servers.enabled===1`→connected（不做真实握手）。前端 `ExecutionBadge` 组件（`src/components/staff/ExecutionBadge.tsx`）在 `GeneralSkillsPage`/`ToolsPage` 的"执行链路"列 + 统计卡 + 横幅复用此端点。
- **"未接入"可点击钻取（2026-07-27 续）**：`GeneralSkillsPage`/`ToolsPage` 的"执行链路"列，当未接入时渲染可点击「未接入·去处理」按钮。`GeneralSkillsPage` 跳转 `/staff/general-skills/<slug>`（编辑）；`ToolsPage` 跳转 `/staff/tools/<id>/test`。
  - ⚠️ **补路由**：此前 `/enterprise/general-skills/new` 错误渲染成列表、`GeneralSkillNewPage`/`GeneralSkillEditPage` 是死代码（未被路由引用）。现已在 `src/App.tsx` 接上：`/enterprise/general-skills/new`→`StaffGeneralSkillNewPage`，新增 `/enterprise/general-skills/:slug`→`StaffGeneralSkillEditPage`，并加 `/staff/general-skills/:slug` 重定向。`StaffGeneralSkillsPage` 仍只渲染列表。
  - **分发路由端到端验证（继续完善）**：新增 `e2e/api/staff-dispatch.e2e.test.ts`(5 用例)。① 物化技能：mock 全局 `skillRegistry.getSkill`→undefined，`handleSkillToolCall` 以 `skill_${def.id.replace(/-/g,'_')}` 工具名调用，验证回退到 `extraSkillExecutor`(materialize executor)→`runDeclarative` 返 prompt 指令，错误 id 返"未找到"。② 员工 MCP：`actionPhaseExecutor.resolveMcpManager`(抽出导出纯函数)——员工 manager 拥有前缀→隔离实例；否则回退全局单例；未注入→全局；非 MCP 名→全局。合计 `staff-execution`(9)+`staff-dispatch`(5)=14/14 全绿。

## Staff 前端全面 MUI 化迁移（2026-07-28 启动）
- **范围（用户澄清）**：① 样式全面 MUI 化——92 个 staff .tsx 的 Tailwind className → MUI `Box`/`Typography` + `sx`；② 内容接入主程序 i18n——276 条硬编码 zh/en 文案 → `src/i18n/locales` + `useI18n`/`t()`；③ 图片=确认无本地资源，**不做**。
- **执行策略（本轮校准）**：基础优先·分批验证（每批 tsc 验证、构建不红）；品牌色=采用主程序靛蓝 `#1a237e`（彻底并入主程序，不保留 teal/近黑）。
- **关键架构发现**：staff 样式是**三方分叉**——① `staffdeck.css`+`tailwind.config.js` 的 teal/warm 系统(`--primary:#0f766e`)；② `distillPageStyles.ts`/`chatPageStyles.ts` 的近黑/灰硬编码 hex(`#18181a`/`#858b9c`)；③ 主程序 MUI 靛蓝。又：复杂 shadcn 组件（dropdown-menu/select 等）**已是基于 MUI**（`MuiMenu`/`MuiMenuItem`），仅内部叠加 Tailwind `ITEM_BASE`；`DropdownMenuItem` 透传 `...props` 到 `MuiMenuItem` → 消费者传 `sx` 实际生效。
- **单一事实来源 `src/components/staff/lib/staffTokens.ts`**：导出 `staffTokens: Record<string, SxProps<Theme>>`，所有颜色/间距映射到主程序 MUI 主题（`primary.main`/`text.secondary`/`divider`/`background.paper`），覆盖 menuItem/menuContent/selectTrigger/outlineActionButton/searchCombo/dialog*/sectionCard 等模式。消费者 `sx={staffTokens.xxx}` 无需 `as`（类型已对齐）。后续所有 staff 样式迁移都从这里取 token。
- **已验证转换模式（MUI v5.15.15）**：
  - 组件 `<div className>` → `<Box sx>`；文本 → `<Typography sx>`；保留 `className` 透传（cn）以免父级布局断。
  - **spread 联合类型（SxProps）进 `Box.sx` 触发 "No overload matches"** → 数组形式 `as SxProps` 收口（dialog.tsx 同因）。
  - `SxProps`/`Theme` 从 `@mui/material/styles` 导出；**`SystemStyleObject` 该版本不导出**，勿用。
  - `Button` 封装（`ui/button.tsx`）已补 `sx?: SxProps` 透传，可对其传 `sx`。
  - `Box component="article"` 可替代 `<article className>` 以用 `sx`。
- **进度**：
  - **第一批**（基础优先）：`staffTokens.ts`（新增）+ 3 个仪表盘移动端卡片（`ScheduledTasksTab`/`ConversationLogsTab`/`MemoriesTab` 的 `<article>` → `<Box component="article" sx={staffTokens.mobileCard}>`，移除 `enterprise-ui` 的 `MOBILE_CARD_CLASS` 依赖）。全量 `tsc --noEmit` 0 错。
  - **第二批**（菜单系统集中化，15:4x 完成）：**把菜单样式集中进 `ui/dropdown-menu.tsx` wrapper 内部**（而非逐页面传 sx）。`DropdownMenuItem` 按 `variant` 应用 `staffTokens.menuItem`/`menuItemDanger`（删内部 `ITEM_BASE` Tailwind）；`DropdownMenuContent`/`SubContent` 新增 `sx` 透传并应用到 **MuiMenu 的 Paper**（`slotProps.paper.sx`，数组合并外部 sx）。`staffTokens.menuItem/menuItemDanger` 已升级为完整 base（含 `position:relative`/`userSelect:none`/inset/disabled，等价原 `ITEM_BASE`）。已迁移 3 个组件层消费者（`ModelConfigDropdown`/`EmployeeCard`/`scheduled-tasks/TaskActionsMenu`）去掉 `MENU_ITEM_*`/`MENU_CONTENT_CLASS` 依赖；全量 `tsc --noEmit` 0 错。
  - **关键模式（菜单）**：wrapper 内部已接管菜单默认样式 → 所有用 `DropdownMenuXxx` 的页面（含未迁移的 ToolsPage/KnowledgePage/…）**默认**获得靛蓝主题菜单，逐步把各页面 `className={MENU_ITEM_CLASS}` 删掉即可（删后视觉不变）。`enterprise-ui.ts` 的 `MENU_*` 常量**暂留**（未迁移页面仍用），全部清完后再删。
  - **第三批**（Select 集中化，~16:1x 完成）：**复用菜单的 wrapper 集中模式**——把 `SELECT_TRIGGER_CLASS` 集中进 `ui/select.tsx` 的 `SelectTrigger`（`MuiSelect` 新增 `sx={staffTokens.selectTrigger}`，移除原 `cn('rounded-lg text-sm')` Tailwind 默认类，保留 `className` 透传承接各页宽度 `w-[160px]`/`w-full` 等）。7 个消费者（`EmployeeProfileEditor`/`ResourceImportDialog`/`ToolsPage`/`KnowledgePage`/`DistillPage`/`GeneralSkillsPage`/`SkillsPage`，共 18 处）删 `SELECT_TRIGGER_CLASS` 导入 + 用法；全量 `tsc --noEmit` 0 错，`SELECT_TRIGGER_CLASS` 现已无引用（定义暂留 `enterprise-ui.ts`）。**模式总结（shadcn 系→wrapper 集中；原始 HTML 按钮/输入框→建可复用组件）**。
  - **第四批（进行中）**：原始 HTML 按钮/输入框 → 建可复用 `OutlineActionButton`(ui/outline-action-button.tsx) + `SearchCombo`(ui/search-combo.tsx) 组件（均已注册 ui/index），`staffTokens.outlineActionButton/Sm/searchCombo*` 已备。各页内联 `#18181a` 主按钮 → `UIButton sx={staffTokens.primaryButton}`（token 加 `minWidth:0` 抵消 MUI 默认 64px）。ToolsPage 已手迁（5 描边+1 搜索+5 主按钮，tsc 0 错）；KnowledgePage/GeneralSkillsPage/SkillsPage/OpenPlatformPage 由子代理批量迁移（描边+搜索+主按钮）。
  - **第五批（进行中）**：`chat/chatPageStyles.ts`(~150 常量，含 `[&_p]` 后代选择器) → 新建 `chat/chatTokens.ts`(sx)，9 个消费者(`chatHelpers`/`ChatDialogs`/`Composer`/`MessageBubble`/`MessageList`/`ChatEmptyState`/`ExecutionRecord`/`ChatHeader`/`ScheduledDraftCard`) 的 `className={CHAT_X}` → `<Box sx={chatTokens.x}>`；`chatRowClass`/`chatBubbleClass` → 返 sx 数组的 `chatRowSx`/`chatBubbleSx`；markdown 容器用嵌套 `'& p'` 选择器。由子代理执行。
  - **第六批（进行中）**：`distillPageStyles.ts`(~100 常量+条件拼接 helper) → `distillTokens.ts`(sx)，`DistillPage.tsx` 的 `className={DISTILL_X}` 与内联 Tailwind 全部 → `<Box sx>`/数组。由子代理执行。
  - **收尾**：三批完成后全量 `tsc --noEmit`(8GB) 验证；再清理 `enterprise-ui.ts` 已无引用的常量(`MENU_*`/`SELECT_TRIGGER`/`OUTLINE_ACTION_BUTTON`/`SEARCH_COMBO_*`/`DIALOG_*`/`MOBILE_CARD`) 与 `staffdeck.css` teal 主题残留（全局 `tailwind.config.js` 不动）。i18n 内容迁移(276 条)另立专项，本次未做。

## 数字员工 e2e 测试索引（2026-07-28 补齐）
- **运行**：`npm run test:e2e:api`（= `vitest run --config=vitest.config.e2e.ts`）。覆盖 `e2e/api/staff-*` 共 9 套件 48 用例，全绿。
- **集成缝测试（关键）**：`e2e/api/staff-chat-execution-seam.e2e.test.ts` — 真跑 `staffChatExecutor.runStaffChatTurn→executeChat`，断言 `staffMcpManager/extraSkills/extraSkillExecutor/executionMode=REACT` 注入 + system 消息含 persona+SOP。改此处装配缝务必跑此套件。
- **SSE 协议 + 演示模式**：`e2e/api/staff-chat-turn.e2e.test.ts` — `/turn` 演示模式兜底 + `/stream` 事件顺序断言（done 必为末事件）。
- **前端 UI 级 e2e**：`tests/staff-chat.spec.ts`（Playwright，目标 /staff/chat）。本机无 Chromium 且无法下载，**未实跑**；CI/有浏览器时 `npm run test:e2e` 可用。
- **未覆盖 P2**：`/cancel` 取消流测试、主/员工会话表存储隔离直接断言。

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日工作日志

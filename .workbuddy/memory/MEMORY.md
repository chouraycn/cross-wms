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

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日工作日志

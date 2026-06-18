# CrossWMS 项目记忆

## 核心架构
- Electron + PyWebView 桌面应用，前端 React + Vite + MUI，后端 Node.js + Express + SQLite
- 4 种执行策略: Legacy / Observer / Planner / ReAct，通过 ExecutionStrategyFactory 创建
- 工具系统: builtin + plugin + MCP 三层，MCP 格式 `mcp__{server}__{tool}`
- 消息队列: Collect/Steer/Followup 三种模式，Session 级串行 + 全局并发度控制
- 权限系统: auto/confirm/high-risk 三级，Session 缓存 + 全局白名单 + 通配符类别匹配

## 关键约定
- TypeScript 严格模式，tsc --noEmit 通过才可提交
- 构建脚本: `bash scripts/build-dmg-pywebview.sh`（含自动 bump version + GitHub Release）
- 主题系统: `getGrayScale(isDark)` 统一灰阶，语义色用 CSS 常量
- WKWebView 兼容: 不用 CSS @keyframes 动画，用 inline transition 代替
- SSE 事件: 15+ 种，前端 useChat.ts 集中处理，新增事件需同步 Message 类型

## 权限系统 v2.5.0
- MCP 工具自动风险分级: 后缀规则 (get/list→auto, create/update→confirm, delete→high-risk)
- 批量权限请求: 同轮多工具并发审批，ToolPermissionDialog 批量面板
- 类别级始终允许: `mcp__server__*` 通配符存储，前后端通配符匹配
- 免确认模式: ChatToolbar 切换按钮，SSE handler 自动通过

## 人格层 v8.5
- SOUL.md + USER.md 定义 Agent 身份/价值观/禁区/用户画像，存放 `~/.cdf-know-clow/`
- soulLoader.ts: 加载/解析/缓存，`buildSoulSystemMessage()` 注入对话最前面
- personality 三模式: cautious(谨慎) / efficient(高效) / balanced(均衡)
- 策略联动: personality → plannerThreshold / observerFastPath / maxTurnsMultiplier
- 首次启动: `initDefaultSoulFiles()` 从项目模板复制到用户目录，fallback 内联默认

## 向量记忆 v8.6
- sqlite-vec 扩展: `sqliteVec.load(db)` 加载，vec0 虚拟表 KNN 搜索
- ONNX 本地推理: onnxruntime-node + all-MiniLM-L6-v2 (384维)，模型自动下载到 `~/.cdf-know-clow/models/`
- vecMemoryStore.ts: 向量写入/搜索/混合搜索/回填，降级为 LIKE 关键词搜索
- 会话归档时自动写入摘要 embedding (sessionLifecycle.ts)
- API: `/api/memory/search`、`/api/memory/stats`、`/api/memory/backfill`

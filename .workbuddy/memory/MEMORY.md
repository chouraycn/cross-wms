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
- 默认行为: 每次打包自动 bump 版本号（不使用 `--no-bump`），确保版本号递增
- 构建依赖: Python 3.14.3 环境需安装 Pillow + pywebview + pyobjc-framework-Cocoa（PyInstaller PNG→ICNS + webview 模块打包），`pip install Pillow pywebview pyobjc-framework-Cocoa`
- CI 构建: `bash scripts/build-dmg-pywebview.sh --ci --no-bump`（跳过前端构建和 Release，由 workflow 处理）
- `.npmrc`: `legacy-peer-deps=true`，所有 npm 命令统一生效
- 主题系统: `getGrayScale(isDark)` 统一灰阶，语义色用 CSS 常量
- WKWebView 兼容: 不用 CSS @keyframes 动画，用 inline transition 代替
- SSE 事件: 15+ 种，前端 useChat.ts 集中处理，新增事件需同步 Message 类型
- 日志系统: `server/logger.ts` 统一 logger，禁止裸 console.*（ESLint no-console allow:[]，仅 logger.ts 豁免）
  - 4 级: error/warn/info/debug，`LOG_LEVEL` 环境变量过滤，`LOG_DEBUG=1` 启用 debug
  - 热路径（engine/、chat.ts、aiClient.ts、keyRotator.ts）用 logger.debug（默认静默）
  - 非热路径用 logger.info（生命周期事件）
- CI/CD: `pr-quality-gate.yml` 为可复用 workflow（workflow_call），`build-and-release.yml` 引用而非重复
  - lint 覆盖 `src/ server/`，no-console 规则仅 logger.ts 豁免
  - 安全扫描: `npm audit --audit-level=high --omit=dev`
  - macOS 构建: PyInstaller 缓存 `actions/cache@v4`，key 基于 pywebview_app.py + requirements

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
- `extractKeywords()` 导出函数: 中英文停用词表 + 词组提取，替代 substring(0,N) 粗暴截取
- `searchByKeyword()` 按 matchCount 排序，相似度按匹配比例计算（0.3~0.8）
- 会话归档时自动写入摘要 embedding (sessionLifecycle.ts)
- API: `/api/memory/search`、`/api/memory/stats`、`/api/memory/backfill`

## ONNX 性能优化 (v1.5.192+)
- P0 LRU 推理缓存: `embedText()` 内置 256 条 Map 缓存，key=文本前200字符，相同文本零推理
- P1 真批量推理: `embedBatch()` 构建 [batch, 256] tensor 一次推理，非 for 循环逐条
- P1 Tensor 内存池: `pooledInputIdsTensor` 预分配复用，减少 GC 压力
- P1 tokenizer.json 预编译: `loadTokenizerJson()` 合并 vocab 到 vocabMap
- P1 调用点批量改造: `toolRegistry.ts` desktop_click_smart 用 embedBatch（31次→1次），`vecMemoryStore.ts` backfillEmbeddings 分批16条
- P4 Session 配置: `executionMode: 'parallel'`, `intraOpNumThreads: 4`, `interOpNumThreads: 2`

## 桌面自动化 v1.5.130
- `desktop_see`: 截图 + 返回屏幕分辨率 (screenWidth/screenHeight)
- `desktop_click`: 三种定位方式 ref > nx/ny(归一化0~1) > x/y(绝对坐标)
- `desktop_click_smart`: 语义点击 — ONNX embedding 匹配 accessibility tree 元素，分辨率无关
- `desktop_snapshot`: JXA 遍历 macOS Accessibility API 元素树，返回 ref + bounds
- 匹配降级链: ONNX embedding(阈值0.3) → 关键词精确/分词匹配(阈值0.2) → 返回候选列表

## 技能冲突检测 v1.5.131
- 后端 `server/routes/skills.ts` `checkConflict()`: async, 5 维评分
  - 名称 bigram Jaccard (0.35) + 触发词 token Jaccard (0.25) + 标签 Jaccard (0.15) + 描述 bigram Jaccard (0.10) + embedding 语义 (0.15)
  - `bigramSet()`: 字符 bigram 替代单字符 Jaccard（中文更准确）
  - `tokenizeTrigger()`: 按 `/,，;；、\s|｜` 多分隔符分词
  - embedding 仅在 Jaccard > 0.15 时计算（性能优化），best-effort + 100 条缓存
- 前端 `src/utils/skillConflict.ts`: bigram + token 对齐后端权重
- API: `POST /api/skill-conflict-check` 接收 `{name, trigger, tags, desc}`，阈值 0.35

## 浏览器 JS 渲染 v1.5.131
- `web_fetch` 新增参数: `selector`(等待CSS元素) / `waitUntil`(domcontentloaded|networkidle|load) / `executeJs`(渲染后执行JS)
- `browser_execute_js`: 新工具 — 在当前页面执行任意 JS，返回结果 + 可选 HTML
- IPC: `browser-host.mjs` 新增 `handleExecuteJs()` + `handleRenderContent` 支持 `executeJs`
- `browserHostClient.ts`: `renderContent()` 支持 executeJs，新增 `executeJs()` 导出
- 降级链: Playwright 渲染 → 原生 fetch + htmlToMarkdown

## 上下文截断 v1.5.131
- `estimateTokens`: CJK 1.5, JSON标点 0.8, ASCII 0.35, 全局 1.3x 安全系数
- `estimateMessagesTokens`: tool_calls JSON ×1.5, tool 结果 ×1.3 额外加权
- 硬安全网: 消息数 >80 强制截断（防止估算偏差导致 API 400）
- maxTokens 上限 8192: 所有截断调用点 + API 调用 + modelsStore 配置
- DeepSeek maxTokens: 384K → 8K（384K 导致截断浪费 384K 输入空间）
- 迁移: `loadModelsConfig()` 自动将已保存 models.json 中 maxTokens > 8192 降级

## 窗口控制按钮 v1.5.166

- **v1.5.166 起：红黄绿按钮改为前端自定义渲染**，不再尝试偏移系统按钮
- 原因：`frameless=True` 时 pywebview 不创建系统红黄绿按钮，`standardWindowButton_()` 返回 `nil`
- 实现：`src/components/Layout/WindowDragBar.tsx` 渲染三个圆点（红/黄/绿），hover 显示图标
- 按钮行为（调 `pywebview.api`）：
  - 红 × → `window_close()`（关闭窗口，先停 Node 后端）
  - 黄 − → `window_minimize()`（最小化）
  - 绿 ＋ → `window_maximize()`（切换全屏，pywebview 无 zoom API）
- 拖拽：CSS `-webkit-app-region:drag`（系统原生拖拽，零 JS）
- **禁止修改**：`WindowDragBar.tsx` 的按钮渲染逻辑、`pywebview_app.py` 的 `Api` 窗口控制方法
- 移除代码：`apply_traffic_light_offset()` 及相关 Cocoa 偏移逻辑（v1.5.166 清理）

## WKWebView 缓存问题 v1.5.199
- **问题**：pywebview 本地 HTTP 服务器 (http://127.0.0.1:9988) 未设置 Cache-Control headers
- **影响**：WKWebView 缓存旧版 index.html + JS，升级后仍显示旧版本号/旧 UI
- **缓存位置**：`~/Library/Caches/<bundle_id>/WebKit/NetworkCache/`（可达 133M+）
- **修复**：`pywebview_app.py` `QuietHandler.end_headers()` 添加 no-cache headers
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `Pragma: no-cache` + `Expires: 0`
- **清除缓存**：`rm -rf ~/Library/Caches/com.cdf.knowclow.desktop/WebKit/NetworkCache/`
- **教训**：pywebview 本地 HTTP 服务器必须禁用缓存，否则版本升级后 WKWebView 不刷新

## fsevents 打包修复 v1.5.201
- fsevents 2.3.3 自带预编译 `fsevents.node`，**不含** `binding.gyp`
- npm 默认触发 `node-gyp rebuild` → binding.gyp not found → 编译失败
- **修复**：构建脚本 `npm install --ignore-scripts`，手动为 better-sqlite3 运行 `prebuild-install`
- `npm install fsevents --ignore-scripts` 可正常安装预编译二进制

## 模型加载卡顿根因修复 v1.5.203 (commit 4fc2b575)
- **根因**: `loadModelsConfig()` → `injectApiKeys()` → `execSync('security find-generic-password')` 同步调用 Keychain，每个 50-200ms，N 模型阻塞 1-2s
- `GET /api/models` 拿到 key 后立即脱敏丢弃 — 纯浪费
- **修复**: `loadModelsConfig(options?: { skipKeyInjection?: boolean })` 新增参数
  - `skipKeyInjection: true` 跳过 Keychain 注入（GET /api/models 使用）
  - AI 推理路径（chainExecutor/chatService/memoryExtractor）仍用完整版本
  - `CACHE_TTL_MS` 从 5s 增至 30s
  - 启动时预热缓存（非阻塞）
- **同 commit 其他修复**: ThinkingBlock thinkingDone 标志、Electron rAF 降级 setTimeout、keep_alive JSON 格式、Agent 可视化组件

## Electron/桌面端渲染调度修复 (commit 4fc2b575)
- **问题**: Electron 打包后 SSE 数据到达但页面不刷新，点击后才出现
- **根因**: `isDesktopApp()` 只检测 pywebview 不检测 Electron；macOS `backgroundThrottling` 节流 rAF
- **修复**: `src/utils/env.ts` `isDesktopApp()` 增加 Electron 检测，降级为 `setTimeout(fn, 16)`
- ThinkingBlock: 新增 `thinkingDone` 标志，收到首个 text 事件标记 thinking 结束（之前 isStreaming 全程 true）

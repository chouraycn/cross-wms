# CrossWMS Changelog

## v1.7.87 (2026-07-13)

### Bug Fixes
- **技能手动刷新失败静默**：`skillStore.refreshFromRemote` 失败由静默改为 dispatch `cdf-know-clow-api-error`（与 addSkill/updateSkill 等写操作一致），并置 `skillLoadError`
- **技能刷新错误无提示**：`App.tsx` 的 `SkillLoadErrorListener` 扩展到接 `refreshFromRemote`，弹「技能刷新失败」toast

### Technical
- 新增 `e2e/api/agent-chat-file-event.test.ts`：挂载真实 `agentChat` 路由 + mock `runChatSession`，端到端验证技能/工具产出文件经 `file` SSE 事件透传至对话卡片（2/2 通过）
- `skillStore` 单测新增 `refreshFromRemote` 失败 dispatch 断言（36/36 通过）

---

## v1.5.184 (2026-06-20)

### Bug Fixes
- **红黄绿按钮间距**：改为 6px（macOS 标准）
- **点击黄色按钮闪退**：pywebview_app.py window_minimize() 加 try-catch
- **Logo 与按钮重叠**：WindowDragBar 容器 pointerEvents: 'none'（不拦截下方点击），SidebarLogo mt: 12px → 18px
- **DeepSeek 400 错误**：chat.ts tool_calls 配对逻辑修复（遇到非 tool 消息立即停止搜索，避免生成错误顺序）
- **流式响应后台卡死**：useChat.ts flushRender 从 requestAnimationFrame 改为 setTimeout（WKWebView 后台暂停 rAF）

### Technical
- WindowDragBar: 容器 pointerEvents: 'none'，按钮 pointerEvents: 'auto'
- chat.ts: tool_calls 配对逻辑增强（只在连续 tool 消息中搜索）
- pywebview_app.py: window_minimize() 加异常保护

---

## v1.5.179 (2026-06-20)

### Bug Fixes
- **红黄绿按钮位置修复**：改为固定在窗口左上角（左距 8px，上距 10px，macOS 标准），不依赖侧边栏宽度
- **红黄绿按钮间距**：用 marginRight 代替 gap（WKWebView 不兼容 gap）
- **启动动画恢复**：从 git 历史 b682aaf4 恢复 splash.html 完整 SVG CSS @keyframes 动画
- **侧边栏默认展开**：打开软件时侧边栏始终展开（忽略 localStorage 历史值）
- **DeepSeek 400 错误三道防线**：executeToolCall try-catch + actionPhase 完整性校验 + chat.ts 配对逻辑修复
- **createRequire 兼容性**：patch 编译后 server_dist/index.cjs，参数改为 __filename
- **MCP 连接超时**：加 30 秒超时，避免永久卡死
- **thinking 参数格式**：按模型分类（DeepSeek/Kimi 用 extra_body，Qwen3 只用 reasoning_effort）

### Technical
- WindowDragBar 组件重构：移除 sidebarCollapsed prop，按钮位置不依赖侧边栏状态
- pywebview_app.py window_close() 异步销毁窗口（避免前端通信崩溃）

---

## v1.5.69 (2026-06-15)

### Features
- **工具管理移入设置弹窗**：工具管理从独立路由页面迁移到 Settings 面板中的 Tab，采用与模型管理一致的左右分栏弹窗交互模式
- **深色主题工具管理**：工具管理 Tab 支持亮色/暗色主题自动切换
- **模型 Key 获取改为新页面**：点击「获取 Key」→ 跳转到 `/api-key-help/:provider` 导引页，自动打开第三方 URL，拿回 Key 后一键返回设置页并自动恢复弹窗

### UI Improvements
- **工具使用样式重构**：对话中的工具调用改为灰色无背景框的极简样式（透明背景 + 灰色文字 + 左边框），替代之前的紫色背景样式
- **修复双扳手图标**：ToolCallBlock 中移除重复的 🔧 emoji，仅保留 MUI BuildIcon

### Bug Fixes
- **历史对话丢失修复**：增加 SQLite WAL checkpoint 三层防御机制（启动恢复 + 安全关闭 + 异常退出保护），解决 DMG 更新后聊天历史丢失问题
- **工具管理页面隐藏 AI 对话框**：Settings 中打开工具管理时不再显示底部 AI 对话框

### Window Coordination (R3)
- **有头模式窗口协调**：浏览器启动时 pywebview 自动最小化；浏览器关闭时自动恢复；离开 BrowserPage 自动关闭浏览器
- Chromium 改用 `--app` 应用模式启动（无地址栏）
- pywebview 窗口关闭前先通知 Node 后端优雅停止 BrowserHost

### Technical
- 新增 `src/pages/ApiKeyHelpPage.tsx` — API Key 获取导引页
- 新增 `src/utils/providerApiKeyUrls.ts` — 24 个 provider 的 Key URL 映射
- 新增 `src/components/Settings/tabs/ToolManagement.tsx` — 工具管理 Settings Tab
- `server/db.ts` 增加启动时 WAL checkpoint 和完整性检查
- `server/index.ts` 退出时安全关闭数据库
- 清理 `showChatBar` 逻辑，移除已失效的 `/plugins`、`/tools` 路径判断

---

## v1.5.68 (2026-06-15)
- SSE 流式读取从 XHR readyState===3 改为 fetch() + ReadableStream，根治 WKWebView 深度思考卡死

## v1.5.67 (2026-06-14)
- Build: DMG 打包正常

## v1.5.66
- 域名白名单动态管理（DB 建表 + REST CRUD + AI 可添加）
- Plugin 本地安装（.zip 上传 + fflate 解压 + manifest 校验 + node:vm 沙箱）

## v1.5.65
- ModelManager 共享组件（Adapter 模式，3 变体）
- F1-F6 功能（API Key 可见性/温度参数/删除确认/测试连接/恢复默认/导入导出）
- 供应商/客户管理模块 v1.4.0

## v1.3.0 - v1.5.x
- AI 深度思考展示重构（ThinkingBlock 三态设计）
- 自动化引擎 v2.0（6 引擎模块 + DAO + Webhook）
- Session 级工具授权缓存
- SSE 中断自动重试续接
- 技能系统（15 内置技能 + 链执行器 + 安全审查 + ZIP 导出）
- 模型管理恢复为弹窗模式
- 自定义窗口拖拽

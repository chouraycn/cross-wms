# CrossWMS Changelog

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

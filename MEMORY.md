# MEMORY.md — 项目关键决策与约定

> 最后一次修订：2026-06-16

---

## 架构决策 (ADR)

### ADR-001：Context 拆分策略
- **决策**：ChatContext 拆分为 ChatSessionContext + ChatSidebarContext + ChatMetaContext
- **理由**：避免流式消息更新触发侧边栏重渲染
- **关键实现**：
  - `handleSessionUpdate` 仅更新 `activeSession`（10ms 级流式），不触发 sidebar
  - `sessionsEqual()` 用于 diff，包含 `id`/`title`/`isPinned`/`messageCount`
  - `sessionsRef` 避免闭包陈旧问题
- **日期**：2026-06-16

### ADR-002：新建会话不预创建后端记录
- **决策**：点击"AI 对话"仅生成本地临时会话，不调 `createSessionViaAPI`
- **理由**：空会话不应出现在历史列表，首条消息发送时由 `handleSessionUpdate` 自动加入侧边栏
- **日期**：2026-06-16

### ADR-003：虚拟滚动移除决定
- **决策**：react-virtuoso 从 NavList 移除，暂不回加
- **理由**：调试期间发现 virtuo 虚拟化导致滚动行为异常，历史列表数据量小（<100），直接用 DOM 渲染
- **状态**：待数据量增长时重新评估
- **日期**：2026-06-16

### ADR-004：权限请求 Map 化
- **决策**：`pendingPermission` 从单对象改为 `Map<string, PermissionRequest>`
- **理由**：支持多并发工具调用（多工具同时请求权限），UI 向后兼容取首条
- **日期**：2026-06-16

### ADR-005：build-dmg 使用 --no-bump
- **决策**：迭代修复期间 DMG 构建统一使用 `--no-bump`
- **理由**：同日多次修复，不累积无效版本号
- **日期**：2026-06-16

---

## 代码约定

### 样式约定
- 统一使用 `getGrayScale(isDark)` 获取灰度配色，禁止硬编码颜色
- Meta 信息使用等宽字体：`"SF Mono", "Menlo", "Consolas", monospace`
- 圆角统一 8px，间距使用 MUI spacing 体系

### 命名约定
- 组件文件：PascalCase（`ThinkingBlock.tsx`）
- Hook 文件：camelCase with `use` 前缀（`useChat.ts`）
- 服务层：`xxxService.ts`
- DAO 层：`xxxDao.ts`
- 路由：`xxx.ts`

### IME 兼容约定
- 输入框 `keydown(Enter)` 发送前必须检查 `!isComposing` + `!compositionJustEnded`
- WKWebView 特有：`compositionend` 仅 `wasComposing === true` 时设置标记
- 兜底逻辑：检测到残留标记时清除 + 触发 send

### 测试约定
- 先 `tsc --noEmit` 后 `vitest run`
- 测试文件：`__tests__/xxx.test.ts`
- Mock SQLite 必须提供完整接口（含 `readonly` 字段）

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/contexts/ChatContext.tsx` | 核心聊天状态（三层 Context） |
| `src/components/Layout/NavList.tsx` | 侧边栏历史对话列表 |
| `src/components/CrossWmsChat/ChatContainer.tsx` | 聊天容器（消息区+输入框） |
| `src/components/CrossWmsChat/TopBarChatInput.tsx` | 顶部输入框（IME 处理） |
| `src/components/CrossWmsChat/ThinkingBlock.tsx` | AI 深度思考展示 |
| `server/db.ts` | SQLite 数据库 Schema |
| `server/dao/warehouse.ts` | 仓储/库存 DAO |
| `scripts/build-dmg-pywebview.sh` | DMG 构建脚本 |

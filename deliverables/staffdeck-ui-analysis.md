# StaffDeck-main 前端 UI / 交互分析报告 + 复刻缺口清单

> 分析对象：`/cross-wms/StaffDeck-main`（OpenBMB/StaffDeck `main` 分支，最新提交 "Refine Feishu channel setup UI"）
> 目标软件：`/cross-wms`（CDFKnow / cross-wms）数字员工模块 `src/pages/staff/*` + `src/components/staff/*` + `src/pages/ChannelsPage.tsx`
> 结论先行：**当前数字员工模块已是 StaffDeck 的 MUI 化派生版（约 90% 页面已镜像），差距集中在「最新新增特性」而非整体结构。** 真正缺失/落后的只有 3 类：① 渠道专属配置流（飞书/微信/企业微信）；② 工作区对话画廊 ChatGallery；③ 登录页。其余 30+ 页面/组件在两边同名共存，当前已用 MUI + 靛蓝 `#1a237e` 完成迁移。

---

## 1. StaffDeck-main 前端架构基线

| 维度 | StaffDeck-main | 当前软件（数字员工） |
|------|----------------|----------------------|
| 框架 | React 18 + Vite + TypeScript | 同（PyWebView 桌面壳 + Express） |
| 样式系统 | **Tailwind v4**（`@import "tailwindcss"`）+ shadcn/ui | **MUI v5**（`@mui/material`）+ 自封装 `ui/*` |
| 设计语言 | 暖白底 `#f7f5ef` + 青绿主色 `#0f766e` + 古铜 `#a85d32`/橄榄 `#6f7b42` 点缀 | 靛蓝主色 `#1a237e`，2026-07-28 起迁移 |
| 字体 | Geist Variable + Inter + Noto Sans SC | 系统字体栈 |
| 主题 token | CSS 变量（`--background`/`--accent`…） | MUI `Theme`（primary.main 等） |
| i18n | `src/i18n`（zh/en 文案） | 同源 `src/components/staff/i18n`，276 条硬编码待迁移 |
| 路由 | React Router，`/enterprise/*` + `/workspace/*` | 同，`src/App.tsx` |
| 组件库 | shadcn（`components/ui/*`：button/input/dialog/dropdown-menu/select/tabs/table…） | 已 1:1 复刻为 MUI 版 `src/components/staff/ui/*`（部分已集中化：dropdown/select/outline-action-button） |

**关键判断**：设计系统已分叉（Tailwind→MUI），所以"复刻 UI"的实质是**把 StaffDeck 最新交互/特性面，用当前 MUI 设计语言重新表达**，而非搬运 className。

---

## 2. 页面/组件库存对照

### 2.1 两边同名共存（约 35 个，当前已 MUI 化）
`AccountsPage` `AgentsPage` `DebugPage` `DistillPage` `EmployeeGalleryPage` `GeneralSkillsPage` `KnowledgePage` `ModelsPage` `OpenPlatformPage` `PersonaPage` `SkillsPage` `ToolsPage` `TracesPage` `TutorialPage` + `chat/*`（ChatPage/chatHelpers/components×9）+ `dashboard/*`（5 个 Tab）+ `scheduled-tasks/*`（5 个）+ `components/*`（22 个 UI 原子 + AppSidebar/AppHeader/Employee* 等）。

### 2.2 StaffDeck-main 有、当前**缺失**（核心缺口）
| 文件 | 功能 | 当前对应 | 价值 |
|------|------|----------|------|
| `pages/channels/FeishuSetup.tsx` | 飞书机器人专属配置流（权限清单/最小权限提示/凭证表单） | `ChannelsPage` 仅有通用 JSON 凭证框 | ★★★ 最新头条特性 |
| `pages/channels/WechatSetup.tsx` | 微信专属配置流 | 同上 | ★★ |
| `pages/channels/WecomSetup.tsx` | 企业微信专属配置流 | 同上 | ★★ |
| `pages/chat/ChatGalleryPage.tsx` | 工作区对话画廊（员工卡网格 + 未读标记） | 当前用 `EmployeeChatPage` | ★★ |
| `pages/LoginPage.tsx` | 登出态着陆/登录页（Figma 还原，凭证表单滑入） | 当前走独立 auth 流，无此页 | ★（auth 体系不同） |
| `chat/components/ScheduledDraftCard.test.tsx` | 测试 | 无 | — |

### 2.3 当前有、StaffDeck 无（当前已扩展/分叉）
- `src/pages/ChannelsPage.tsx`（顶层，非 staff/ 下）—— **渠道运行时更丰富**：打字状态 `listTypers`、配对 `listPairings`、管道快照 `fetchPipelineSnapshot`、广播 `broadcastMessage`、账号管理 `getChannelAccounts/addChannelAccount`。StaffDeck 仅 `POST /channels/bindings` 简单绑定。
- `EmployeeChatPage.tsx`：当前自研的对话页（StaffDeck 用 `ChatPage` + `ChatGalleryPage` 组合）。

---

## 3. 关键交互模式（StaffDeck-main）对照

1. **渠道配置**：StaffDeck 用「类型选择 → 专属 Setup 组件（按 provider 渲染不同表单/权限提示）」；当前用「类型选择 → 单一 JSON `credentials` 文本框」。**缺口 = 专属 Setup UI**，但当前 `ChannelConfig.credentials: Record<string,string>` 已能承载飞书 `app_id`/`app_secret`/`event_subscription_url` 等字段，复刻零后端改动。
2. **工作区对话**：StaffDeck `ChatGalleryPage` 以 `EmployeeGalleryPage`（员工卡网格）为画廊，点卡 → `openDraftForAgent` 开草稿；当前 `EmployeeChatPage` 走另一条路径。
3. **登录/着陆**：StaffDeck `LoginPage` 是签出态全幅 hero + 凭证表单滑入（Figma 节点还原）；当前 auth 体系不同，直接套用需评估。
4. **侧边栏/头部**：`AppSidebar`（38+ 导航项）、`AppHeader`（语言切换/模型状态）两边同名，当前已 MUI 化。

---

## 4. 复刻优先级建议

| 优先级 | 目标 | 工作量 | 风险 | 说明 |
|--------|------|--------|------|------|
| P0 | **飞书/微信/企业微信专属渠道配置流** | 中 | 低 | 适配当前 `channelsApi`，仅改 `ChannelsPage` 编辑弹窗 + 新增 3 个 MUI Setup 组件；直接补齐最新头条特性 |
| P1 | **ChatGalleryPage（对话画廊）** | 中 | 中 | 纯 UI，但需接当前 `useChatSession`/会话 API；与现有 `EmployeeChatPage` 并存或替换需决策 |
| P2 | **LoginPage** | 低 | 高 | 当前 auth 体系不同，套用需先确认是否要 unified login 页 |
| — | 30+ 同名页面差异对齐 | 大 | 中 | 当前已 MUI 化，主要是交互细节/新字段；建议按"特性驱动"逐个对齐，而非全量覆盖 |

---

## 5. 结论

当前数字员工模块**结构已完整镜像 StaffDeck**，真正的"复刻"价值在于把 **StaffDeck 最新新增特性（渠道专属配置流为最优先）以当前 MUI 设计语言补齐**。建议按 P0→P1→P2 推进，避免全量覆盖已迁移的 MUI 代码。

> 下一步需确认：复刻范围（仅 P0 渠道配置流 / P0+P1 / 含 P2 登录页），以及 ChatGallery 与现有 EmployeeChatPage 的并存策略。

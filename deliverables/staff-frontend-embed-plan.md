# 数字员工栏目 100% 复刻方案（直接嵌入原前端）

> 目标：让软件"数字员工"栏目 100% 复刻 `/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/StaffDeck-main` 的前端样子。
> 决策（已确认）：**方案 A — 直接嵌入原前端**（而非在 MUI 下重写样式）。
> 验证日期：2026-07-29｜验证结论：**技术路径完全可行，已构建成功。**

---

## 一、偏差根因（为什么现在"老样子")

当前 cross-wms 的 staff 模块是**用 MUI 组件 + 冷蓝灰硬编码色值重写的**，与参考项目是**两套完全不同的组件库**：

| 维度 | StaffDeck-main（参考） | cross-wms 当前实现 |
|------|----------------------|-------------------|
| 组件库 | shadcn/ui + Radix | MUI v5 |
| 样式方案 | Tailwind v4 + CSS 变量 | MUI `sx` + 硬编码色值 |
| 主色 | Teal `#0f766e` | 冷蓝灰 `#464c5e` / 近黑 `#18181a` |
| 背景 | 暖米 `#f7f5ef` + 渐变 | 默认白 |
| 字体 | Inter（Geist 变量） | MUI 默认 |
| 圆角 | 10px | MUI 默认 |
| 设计令牌来源 | `src/styles.css` `:root` | `staffTokens.ts` 映射到 MUI 主题 |

单纯调色值到不了"100%复刻"——**组件库、间距、阴影、交互质感(MUI vs shadcn) 都不同**。所以选 A：把原前端作为独立构建产物嵌进来。

---

## 二、已完成的验证（关键证据)

### 2.1 原前端独立构建成功 ✅
- 在 `StaffDeck-main/frontend-enterprise` 用隔离 npm 安装依赖（vite 8.1.5 / tailwind 4.3.3 / react 18 / react-router 7 / shadcn radix-nova）。
- 构建命令：`node node_modules/vite/bin/vite.js build`
- 结果：`✓ 2111 modules transformed`，产物：
  - `dist/index.html`（0.67 kB）
  - `dist/assets/index-*.css`（**289.21 kB — 含完整 Teal 设计系统 + 所有组件样式**）
  - `dist/assets/index-*.js`（1.74 MB）
  - 全部资产：9 个 staffdeck-avatar PNG、4 个 plaza/capability SVG、login-preview / onboarding PNG 等
- 构建配置变更（仅构建层，不改 `src` 视觉代码）：
  - 把 `@tailwindcss/vite` 插件换成 `@tailwindcss/postcss`（绕开 vite 8 / rolldown 对 `@layer base` 的误判 bug）
  - `base: '/staffdeck-app/'`（嵌入后的资源路径前缀）
  - 原 `vite.config.ts` 已备份为 `vite.config.ts.bak`

### 2.2 express 静态托管 + 路由隔离验证成功 ✅
把产物放到 `cross-wms/dist/staffdeck-app/` 后，用 express 模拟托管：
```
200  /staffdeck-app/                      (text/html)
200  /staffdeck-app/assets/index-*.js     (text/javascript)
200  /staffdeck-app/assets/index-*.css    (text/css)
200  /staffdeck-app/assets/login-preview-*.png   (image/png)
200  /staffdeck-app/some/deep/route       (text/html — SPA fallback 正常)
```
iframe 嵌入天然隔离 MUI 主主题，**不会被靛蓝主色污染**。

---

## 三、嵌入架构

```
cross-wms 主前端 (MUI SPA, dist/)
  └─ 导航"数字员工"
       └─ <iframe src="/staffdeck-app/" />  (全屏加载)
            └─ 原 StaffDeck 构建产物 (dist/staffdeck-app/)
                 ├─ styles.css   ← Teal 设计系统(100% 复刻来源)
                 ├─ index.js     ← shadcn 组件 + 全部页面
                 └─ assets/      ← avatar/plaza/login 图片

cross-wms Express (server/index.ts)
  ├─ app.use('/staffdeck-app', express.static(dist/staffdeck-app, {index:false}))
  ├─ /staffdeck-app/*  SPA fallback → index.html
  └─ API 适配层(见第四节): /api/auth|enterprise|chat → /api/staffdeck/*
```

---

## 四、API 适配层映射（✅ 已执行并端到端验证）

原前端（`frontend-enterprise/src`，共 17+ 条 `/api/chat/*` + `/api/enterprise/*` + `/api/auth/*`）调用路径 vs 后端实际挂载。**关键发现**：原前端的 `/api/chat/*` 是个完整命名空间（agents/sessions/messages/handoffs 全在里面），而后端把它们全部收在 `chatStream.ts` 挂载的 `/api/staffdeck/chat/*` 下；仅 `scheduled-tasks`、`ui-config`、`agents(列表)` 在 chat 之外。

**实现位置**：`server/index.ts` 的 `STAFFDECK_API_REWRITES` 中间件（**必须注册在 chatRouter 与 registerStaffRoutes 之前**，否则改写后的请求命中不到目标路由）。

| 原前端调用 | 后端实际路由 | 适配规则（有序，精确优先） |
|-----------|-------------|---------|
| `/api/auth/login`、`/api/auth/me`、`/api/auth/users` | `/api/staffdeck/auth/*` | `/^\/api\/auth\b/` → `/api/staffdeck/auth` |
| `/api/enterprise/agents`、`/knowledge*`、`/skills/*`、`/general-skills/*`、`/mcp-servers`、`/model-configs`、`/persona`、`/tools/probe`、`/knowledge/okf/import` | `/api/staffdeck/*`（同名兄弟路由） | `/^\/api\/enterprise\b/` → `/api/staffdeck` |
| `/api/chat/scheduled-tasks` | `/api/staffdeck/scheduled-tasks` | 精确优先覆盖 |
| `/api/chat/ui-config` | `/api/staffdeck/ui-config` | 精确优先覆盖 |
| `/api/chat/agents?tenant_id=`（列表端点） | `/api/staffdeck/agents` | `/^\/api\/chat\/agents(?=\?|$)/` → `/api/staffdeck/agents`（仅列表；`/agents/:id/use` 走下方规则） |
| `/api/chat/stream`、`/turn`、`/sessions*`、`/handoffs*`、`/messages*`、`/agents/:id/use`、`/attachments` | `/api/staffdeck/chat/*` | `/^\/api\/chat\//` → `/api/staffdeck/chat/`（**仅带子路径**，绝不碰裸 `/api/chat`） |

> ⚠️ **冲突修复**：裸 `/api/chat`（主程序遗留 chat 端点，由 `chatRouter` 挂载于 `/api`）**不能被改写**——原朴素规则 `/^\/api\/chat\b/` 会误伤主程序聊天。现改为只匹配 `/api/chat/`（带斜杠子路径），经 20 例端到端测试，裸 `/api/chat` 仍由主程序处理。

**Auth 透传**：原前端用 `Authorization: Bearer <token>`（localStorage session），后端 staff auth 同为这套，无需改。

### 4.1 已确认的真实后端缺口（重写正确，但后端未实现该子路由 → 会 404）
这些是**后端补全任务**，不在本节嵌入范围内；重写已把请求正确送到应有位置：
1. `/api/chat/attachments` → 后端 `chatStream.ts` 无 `/attachments` 路由（附件上传功能暂不可用）
2. `/api/chat/sessions/:id/trace` → `chatStream.ts` 只有 `/sessions/:id/events`，无 `/trace`（会话轨迹页暂不可用）
3. `/api/chat/messages/:id/feedback` → 后端反馈在 `/api/staffdeck/feedback`（另一套结构），chat 下无 `/messages/:id/feedback`（消息点赞/踩暂不可用）

> 注意点：`/api/chat/stream` 的 SSE 事件协议需对齐（后端 `chatStream.ts` 已实现，原前端 `streamChatTurn` 解析 `event:`/`data:` 块，两边应一致，集成时再联调确认）。

---

## 五、代码改动清单（✅ 已执行并验证）

| 文件 | 改动 | 状态 |
|------|------|------|
| `server/index.ts` | `/staffdeck-app` 静态托管 + SPA fallback（617-637 行） | ✅ |
| `server/index.ts` | `STAFFDECK_API_REWRITES` 中间件（**修正：移到 chatRouter/registerStaffRoutes 之前，并补全 `/api/chat/*` 命名空间映射**） | ✅ 已修 bug |
| `src/App.tsx` | lazy 导入 `StaffDeckEmbedPage` + 注册 `/staffdeck` 路由 | ✅ |
| `src/components/Layout/NavList.tsx` | "数字员工"导航 → `/staffdeck` | ✅ |
| `src/pages/staff/StaffDeckEmbedPage.tsx` | 新建，全屏 iframe 加载 `/staffdeck-app/` | ✅ |
| `scripts/build-staffdeck-app.mjs` | 新建，独立构建原前端并 copy 到 `dist/staffdeck-app` | ✅ |
| `scripts/build-all.mjs` | 接入 `staffdeck:build` 任务（`ui:build` 之后自动产出） | ✅ |
| `StaffDeck-main/frontend-enterprise/vite.config.ts` | 构建适配：`@tailwindcss/postcss` + `base:/staffdeck-app/`（原版 `.bak` 备份） | ✅ |

**验证结果**：`tsc --noEmit` 通过；20 例 API 重写端到端测试全部路由正确（含裸 `/api/chat` 不被误伤）。

---

## 六、风险与对策

1. **字体**：构建警告 geist woff2 未在 dist/files 解析。需确认 CSS 内 `@fontsource-variable/geist` 是否内联；若缺字体，iframe 会回退系统字体（视觉略差，但不影响布局）。→ 联调时核对。
2. **SSE 协议对齐**：`/api/chat/stream` 事件字段需双方一致。→ 集成联调时抓包确认。
3. **登录态同步**：iframe 内 localStorage 与主程序隔离。若需单点登录，需通过 `postMessage` 或 URL token 传递 session。→ 若主程序已登录，需做 token 注入。
4. **构建环境**：原前端依赖必须独立安装在 `frontend-enterprise/node_modules`（不能用 cross-wms 的 pnpm workspace，会版本冲突）。已验证。
5. **后端 3 缺口**：attachments / sessions trace / message feedback 后端未实现，iframe 对应功能暂 404。→ 后续后端补全。

---

## 七、已落地的产物

- 构建产物：`cross-wms/dist/staffdeck-app/`（index.html + assets/ 全部就位）
- 构建脚本：`scripts/build-staffdeck-app.mjs`（已接入 `build-all.mjs`）
- 验证脚本结论：express 托管全部 200；SPA fallback 正常；API 重写 20 例端到端全部正确

第五节代码改动已全部执行完成（含 API 适配层的顺序 bug 修复与命名空间补全）。

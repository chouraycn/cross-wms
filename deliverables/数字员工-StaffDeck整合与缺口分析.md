# 数字员工（StaffDeck）能力与 cross-wms 整合分析 + 缺口清单

> 生成于 2026-07-27 · 基于 R1–R4 植入工作与本轮深度整合
> 范围：`src/pages/staff`、`src/components/staff`、`server/routes/staff`、`server/staff`、`server/dao/staff`

---

## 一、植入的 StaffDeck 能力清单（R1–R4 做了什么）

| 轮次 | 植入能力 | 落点 | 性质 |
|---|---|---|---|
| R1 | 技能/工具状态列升级为 `StatusBadge` + "已接入执行链路" 徽章 | `GeneralSkillsPage` / `ToolsPage` | 纯 UI |
| R2 | 通用技能页富化：Markdown 实时预览、调试运行面板、ClawHub 导入对话框、真实 `run`/`run/stream` 执行 | `GeneralSkillsPage` + `generalSkills.ts` | UI + 后端接真 |
| R3 | `import-skillhub` / `import-package` 后端接真 + 知识库语义检索面板 | `generalSkills.ts` + `KnowledgePage` | UI + 后端接真 |
| R4 | 聊天思考链可折叠、工具卡参数/结果展开、`/stream` 落 Trace、执行痕迹抽屉 | `EmployeeChatPage` + `chatStream.ts` | UI + 后端接真 |

---

## 二、与现有软件能力的重复点 + 已完成的合并

### 2.1 本轮已完成的合并（真实改动）

| 重复点 | 原状 | 合并方案 | 结果 |
|---|---|---|---|
| **`/tools/:tool_id/test` 是 stub** | ToolsPage 显示"已接入执行链路"但测试端点返回 `TEST_NOT_IMPLEMENTED`，徽章名不副实 | 复用软件既有能力：`fetchWithSsrFGuard`（SSRF 防护 HTTP）+ `buildStaffMcpManager`（MCP 真实客户端），按 `tool_type` 分流执行 | **端点已真实执行**；徽章现在真实可信。新增 `e2e/api/staff-tool-test.e2e.test.ts` 3 用例验证 |
| **`ClawHubDialog` 手写弹窗** | `GeneralSkillsPage` 内 `<div className="fixed inset-0">` 覆盖层，与软件已有的 Radix `ui/dialog` 重复 | 改为复用 `src/components/staff/ui/dialog.tsx`（`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`/`DialogClose`） | **删除平行实现**，统一弹窗体系 |

### 2.2 审计发现的其它重复（建议方向，见第三节）

- **三套徽章实现**：`ui/badge.tsx`（通用 `Badge`）、`ExecutionBadge.tsx`（连接态）、`scheduled-tasks/StatusBadge.tsx`（tone 态）。前两者功能重叠，无共享基类。
- **`MarkdownPreview` 内联 ReactMarkdown**：`GeneralSkillsPage` 内直接 `import ReactMarkdown`，`components/staff` 无既有 Markdown 渲染器可复用，建议抽为共享组件。
- **知识库/蒸馏/聊天后端非重复**：`materializeGeneralSkills`、`staffKnowledgeDao.searchKnowledge`、`runDistill`、`staffChatExecutor` 均为软件既有真实实现，R2–R4 只是"接线"，未重造。

---

## 三、整合方向（建议，按优先级）

### P0 — 执行链路统一（本轮已启动）
- 所有"执行/测试/导入"类能力**一律调用软件既有真实实现**，不再保留平行 stub。
- 已落地：`/tools/:id/test`（HTTP+MCP）、`/general-skills/import-skillhub|import-package`、`/general-skills/:slug/run`。
- 待办：`/tools/probe` 可**合并进** `/tools/:id/test`（探测本质是一种测试）；`/skills/:id/rewrite` 应复用 `runDistill` 管线而非独立 stub。

### P1 — 组件层收敛
- 全部弹窗统一走 `ui/dialog`（已示范 `ClawHubDialog`）。
- 状态徽章收敛到 `ui/badge.tsx` 基类：`ExecutionBadge` / `StatusBadge` 改为 `Badge` 的语义化封装，消除三套并存。
- `MarkdownPreview` 抽为 `components/staff/MarkdownRenderer.tsx` 共享组件，供 GeneralSkillsPage / 其它文档预览复用。

### P2 — 接口层合并
- 重复的"探测/测试"端点合并为单一 `/tools/:id/test`。
- OKF（知识库开放格式）系列端点需在定义 OKF schema 规范后再实现；当前 stub 合理，但应补"schema 未定义"的明确错误而非静默占位。
- `auth /login`、`/me` 为演示 stub，若上生产需接入真实鉴权（与 `staffAuthDao` 对齐）。

### P3 — 页面层补齐
- 补齐独立 **ChatPage 大厅**（见第四节），复用 `EmployeeChatPage` 组件 + `sessions` 列表。
- OKF 相关页面待后端 schema 明确后补。

---

## 四、缺失页面清单

| 缺失页面 | 现状 | 建议 |
|---|---|---|
| **独立 ChatPage 大厅** | 聊天仅经 `agents/:agentId/chat`（绑死单 agent），缺通用会话入口/会话列表 | 新增 `/staff/chat` 大厅：左侧会话列表（`GET /chat/sessions`）+ 右侧复用 `EmployeeChatPage` 会话视图 |
| **OKF 知识库页面** | 后端 `/okf/import`、`/:kbId/okf/export`、`/:kbId/okf/lint` 均为 stub，无前端页 | 待 OKF schema 规范明确后，补导入/导出/校验页 |
| （已存在，无需补）ChatGalleryPage → `EmployeeGalleryPage`；AgentListPage → `Agents`；Dashboard → `dashboard/DashboardPage` | 审计确认已存在 | — |

> 结论：相对 SD，cross-wms 数字员工**页面覆盖已较完整**，唯一实质性缺失是"通用聊天大厅"。R1–R4 的 UI 富化已对齐 SD 主要交互。

---

## 五、后端端点缺口清单（stub / 未实现）

| 文件:行 | 端点 | 状态 | 整合建议 |
|---|---|---|---|
| `auth.ts:40` | `POST /login` | stub token | 接 `staffAuthDao` 真实鉴权 |
| `auth.ts:71` | `GET /me` | stub 用户 | 同上 |
| `knowledgeBases.ts:167` | `GET /:kbId/okf/export` | stub | 待 OKF schema 定义 |
| `knowledgeBases.ts:176` | `POST /:kbId/okf/lint` | stub | 待 OKF schema 定义 |
| `knowledge.ts:100` | `POST /okf/import` | stub | 待 OKF schema 定义 |
| `knowledge.ts:228` | `POST /jobs/:jobId/cancel` | TODO 无 worker | 接入后台任务取消 |
| `skills.ts:78` | `POST /files/extract` | stub | 复用文档解析能力 |
| `skills.ts:446` | `POST /:skillId/rewrite` | stub | **复用 `runDistill` 管线** |
| `skills.ts:455` | `POST /:skillId/rewrite/jobs` | stub | 同上 |
| `skills.ts:464` | `POST /:skillId/rewrite/stream` | stub(SSE) | 同上 |
| `tools.ts:75` | `POST /probe` | stub | **合并进 `/:id/test`** |
| `modelConfigs.ts:282` | `POST /:config_id/test` | stub | 接真实模型连通性校验 |
| `scheduledTasks.ts:272` | `POST /:task_id/run-now` | stub | 接 `scheduledTaskService` |
| `mock.ts` | 整文件 | SD 移植 stub 数据 | 评估是否下线 |

> 已在本轮接真的端点：**`/tools/:tool_id/test`**（HTTP+MCP 真实执行）、`/general-skills/import-skillhub`、`/import-package`、`/:slug/run`、`/run/stream`、`/chat/stream` Trace 落库。

---

## 六、验证结果（本轮）

- 前端 `tsc --noEmit`：**0 错误**
- 后端 `tsc --noEmit -p server/tsconfig.json`（8G heap，scope）：`tools.ts` / `ssrf` / `fetch-guard` **0 错误**
- e2e 回归（4 文件 **20/20 passed**）：
  - `staff-execution` (11) — 通用技能真实运行
  - `staff-general-skills-import` (5) — import 接真
  - `staff-chat-trace` (1) — `/stream` 落 Trace
  - `staff-tool-test` (3) — **新增**：`/tools/:id/test` 真实 HTTP 执行 + 5xx 标记 + 404

---

## 七、下一步建议

1. **（高价值·低风险的收尾）** 按 P1 收敛 `ExecutionBadge`/`StatusBadge` 到 `ui/badge`，抽 `MarkdownRenderer` 共享组件。
2. **（中价值）** 合并 `/tools/probe` → `/tools/:id/test`；`/skills/:id/rewrite` 复用 `runDistill`。
3. **（产品决策）** 是否建设"独立 ChatPage 大厅"——建议做，复用现有 `EmployeeChatPage` + `sessions` 列表，工作量可控。
4. **（待 schema）** OKF 系列端点 + 页面，需先定义 OKF 规范再实现。

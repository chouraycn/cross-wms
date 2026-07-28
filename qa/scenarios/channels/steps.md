# 通道安装与消息发送 — 步骤详解

> 场景 ID: `channels-install-and-message`
> 主题: `channels/`
> 覆盖: 通道安装 / 启用 / 禁用 / 消息发送 / 卸载
> 业务场景: WMS 在飞书 / 企微 / SMS 等通道上投递库存告警、调拨通知等业务事件

## 目标

验证 CrossWMS 通道（channel）的完整生命周期，确保：

- 通道安装、启用、禁用、卸载 API 行为符合预期；
- 启用状态下，WMS 业务事件能成功投递并落地到出站日志；
- 禁用后 `send()` 不再产生网络请求，但调用方收到明确的 `skipped=disabled` 反馈；
- 多个通道并存时互不干扰。

## 前置条件

| 条件 | 说明 |
| ---- | ---- |
| CrossWMS 后端 | `pnpm dev` 或 `pnpm server` 已启动 |
| 通道扩展 | `extensions/feishu` / `extensions/qqbot` 已挂载 |
| 持久化 | 通道表已初始化（`pnpm db:migrate`） |
| 测试通道配置 | `__FEISHU_APP_ID__` / `__QQBOT_APP_ID__` 等占位符必须在 `qa-channel` mock 中被识别 |
| Node | >= 22.19 |

## 详细步骤

### Step 1 — 重置持久化状态（`resets durable channel state`）

1. 调用 `reset`，清理上一次运行的通道、消息日志。
2. 断言当前通道数 = 0。

**预期结果**

- 通道表清空。
- 后续步骤之间不存在残留通道。

### Step 2 — 安装飞书通道（`installs the Feishu channel`）

1. 调用 `POST /api/channels`：
   - `id`: `feishu-${uuid8}`
   - `channelType`: `feishu`
   - `displayName`: `QA Feishu 通道`
   - `config`: `{ appId, appSecret }`（QA 占位）
2. 断言返回 201，且 `installStatus='installed'`、`enabled=false`。
3. 立即 `GET /api/channels/:id` 再次校验。

**预期结果**

- 通道已安装但默认 `enabled=false`（防止误发送）。

### Step 3 — 重复安装拒绝（`rejects installing a duplicate channel id`）

1. 用相同 `id` 再次安装，期望返回 `409 Conflict`。

**预期结果**

- 同一 `id` 只能安装一次。
- 错误信息提示该 id 已存在。

### Step 4 — 启用飞书通道（`enables the Feishu channel`）

1. 调用 `POST /api/channels/:id/enable`。
2. 断言 `enabled=true`。

**预期结果**

- 飞书通道在 `channel_list` 中被标记为 `enabled`。
- 后台 polling / webhook 路由开启。

### Step 5 — 发送库存告警事件（`sends a WMS stock-alert event through Feishu`）

1. 通过 `events.publish` 发布 WMS 业务事件（`stock_alert`），携带仓库 / SKU / 数量。
2. 调用 `POST /api/channels/:id/send`：
   - 文本：`[WMS] 库存告警 SKU-COFFEE-001: 12 < 20 (WH-SH-001). marker=FEISHU-CHANNEL-DELIVERED`
3. 断言返回 `delivered=true` 且 `marker=FEISHU-CHANNEL-DELIVERED`。
4. 调用 `GET /api/channels/:id/messages` 拉取出站日志，确认存在该 marker 消息。

**预期结果**

- 飞书通道在 mock 中收到一条带 marker 的消息。
- 出站日志保留消息原文、`delivered=true` 标志、时间戳。

### Step 6 — 并行安装与发送企微通道（`installs and sends via QQBot channel in parallel`）

1. 安装并启用企微通道 `qqbot-${uuid8}`。
2. 发送调拨通知 `WH-SH-001 -> WH-BJ-001`。
3. 断言企微 `delivered=true`。
4. `GET /api/channels` 列表，断言当前 enabled 通道数 = 2。

**预期结果**

- 飞书 / 企微通道同时启用，互不干扰。
- 列表正确反映 enabled 状态。

### Step 7 — 禁用飞书通道（`disables Feishu and confirms sends are skipped`）

1. 调用 `POST /api/channels/:id/disable`。
2. 立即再次调用 `send()`，发送 `should-be-dropped`。
3. 断言返回 `skipped='disabled'` 且 `delivered=false`。

**预期结果**

- 禁用后 send 不触发任何网络请求。
- 调用方明确收到 `skipped` 原因（便于上层重试 / 告警逻辑判断）。

### Step 8 — 卸载两个通道（`uninstalls both channels`）

1. 调用 `DELETE /api/channels/:id` 卸载飞书。
2. 卸载企微。
3. `GET /api/channels/:id` 期望 `404`。

**预期结果**

- 卸载后通道从列表、消息日志中完全消失。
- 再次访问得到 `404`，而不是返回软删除的记录。

## 预期产出（`expected_outcomes`）

- [x] Step 2/3 验证安装幂等性。
- [x] Step 5 验证业务事件可通过飞书通道投递。
- [x] Step 6 验证多通道并行。
- [x] Step 7 验证禁用后 send 被丢弃。
- [x] Step 8 验证卸载后查询 404。

## 失败模式与排查

| 症状 | 可能原因 | 排查 |
| ---- | -------- | ---- |
| 安装返回 500 | `channels` 表缺列 | 跑迁移：`pnpm db:migrate` |
| 重复 id 返回 200 | 唯一索引缺失 | 查 `server/dao/plugins.ts` 的 `installChannel` 索引声明 |
| send 一直 `delivered=false` | `qa-channel` mock 未拦截 | 检查 `extensions/feishu/api.ts` 在测试模式下是否回退到 mock |
| 禁用后 send 仍 `delivered=true` | 缓存未失效 | 重启后端，确认 `channels.disable` 清除 enable 缓存 |
| 卸载后 GET 仍返回 200 | 软删除开关误开 | 确认 `channels.uninstall` 走 `hardDelete` |

## 相关文件

- `server/routes/channels.ts` — 通道路由
- `server/dao/plugins.ts` — 通道持久化
- `server/engine/events.ts` — 事件总线
- `extensions/feishu/api.ts` — 飞书通道实现
- `extensions/qqbot/api.ts` — 企微通道实现
- `docs/channels/install.md` / `docs/channels/message-send.md` / `docs/wms/notification.md`

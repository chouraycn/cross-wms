# 安全审计 / 权限验证 / Exec-Approval — 步骤详解

> 场景 ID: `security-audit-permission-exec-approval`
> 主题: `security/`
> 覆盖: 安全审计 / 权限验证 / Exec-Approval
> 业务场景: WMS 敏感操作（仓库删除、调价、批量改单）的审计、RBAC、人工审批

## 目标

验证 CrossWMS 的三条安全合规路径：

1. **安全审计** — 所有敏感操作都写入 audit log，可被查询；
2. **权限验证** — 角色（admin / viewer）严格隔离，越权调用被拒；
3. **Exec-Approval** — 危险操作必须经过人工审批，审批通过才能落地。

并保证：

- 凭据 / API key / 密码不进入 audit log 明文；
- 审批未通过前，资源不能被实际修改。

## 前置条件

| 条件 | 说明 |
| ---- | ---- |
| CrossWMS 后端 | `pnpm dev` 或 `pnpm server` 已启动 |
| Audit 表 | 已初始化（`pnpm db:migrate`） |
| 角色配置 | `warehouse-admin` / `viewer` 已注册 |
| qa-channel | 启用，用于审计与交互 |
| Node | >= 22.19 |

## 详细步骤

### Step 1 — 准备 fake 凭据与状态（`seeds fake credentials and durable state`）

1. 写入文件 `QA_FAKE_CRED.txt`，内容包含 fake token `QA_FAKE_WMS_CREDENTIAL_TOKEN_48391`。
2. 调用 `audit.purge` 清空 audit log。
3. 写入测试仓库 `WH-PROTECTED-${uuid8}`（名称"待删除仓库"）。

**预期结果**

- fake 凭据文件存在于 workspace。
- audit log 为空。
- 测试仓库已写入 db。

### Step 2 — Admin 创建仓库并验证审计（`admin creates the protected warehouse and the action is audited`）

1. 在 qa-channel 发送 prompt：`Security audit marker. Do not echo any credential-like values. Reply exactly: SECURITY-AUDIT-OK`。
2. 等待回复包含 `SECURITY-AUDIT-OK`。
3. 调用 `audit.query({ where: { action: 'warehouse.create', resourceId } })`。
4. 断言至少一条记录，字段齐备：`actor.id` / `action` / `resource.id` / `before` / `after` / `timestamp`。
5. 断言 `actor.id === config.adminActor.id`。

**预期结果**

- 仓库创建操作被完整审计。
- 审计字段包含 actor / action / resource / before / after / timestamp。
- actor 字段与配置一致。

### Step 3 — Viewer 越权调用被拒（`viewer is denied on warehouse.delete`）

1. 以 `viewer` 角色调用 `agents.delete({ id })`。
2. 期望返回 `403`。
3. 查询 audit log 中 `actorId=viewer.id` 的 `warehouse.delete` 记录。
4. 断言存在 `outcome='denied' && reason='rbac'` 的记录。

**预期结果**

- viewer 无法删除仓库。
- 拒绝事件本身被审计（可追溯）。

### Step 4 — Admin 申请 exec-approval 但被拒绝（`admin requests exec-approval for warehouse.delete`）

1. 调用 `execApproval.request`，期望 `status='pending'`。
2. 以 `approvalId` 调用 `warehouse.delete`，期望返回 `202 Accepted`（待审批）。
3. 立即 `warehouse.get` 验证资源仍然存在。
4. 调用 `execApproval.reject`：
   - `rejectedBy`: `actor-approver-${uuid8}`
   - `reason`: `qa-verify-pending-state`
5. 再次 `warehouse.get` 验证资源未被删除。

**预期结果**

- 审批未通过前 delete 不落地。
- 拒绝事件被审计。
- 资源状态保持不变。

### Step 5 — Admin 重新申请并通过审批（`admin requests a fresh approval and approves it`）

1. 重新 `execApproval.request`。
2. `execApproval.approve`，`approvedBy` 标注审批人。
3. 带着 `approvalId` 调用 `warehouse.delete`，期望 `200`。
4. 断言 `deleteResult.deleted === true`。

**预期结果**

- 审批通过后，资源被实际删除。
- delete 操作本身被审计，且 `approvedBy` 字段被记录。

### Step 6 — 审计完整性 + 凭据脱敏（`validates audit completeness and credential redaction`）

1. `audit.query({ where: { resourceId } })`，断言包含所有 `expectedAuditActions`：
   - `warehouse.create`
   - `warehouse.delete`
   - `exec-approval.request`
   - `exec-approval.approve`
   - `exec-approval.reject`
2. 重新读取 fake 凭据文件，断言 token 仍然存在（说明写入有效）。
3. 查询最近 10 分钟内 `agent.reply` 相关的 audit，断言没有任何条目包含 fake token。
4. 删除 fake 凭据文件（清理）。

**预期结果**

- 所有关键操作都进入了 audit log。
- fake 凭据未泄露到任何 audit 条目。
- 临时凭据文件被清理，避免污染后续场景。

## 预期产出（`expected_outcomes`）

- [x] Step 2 验证 `warehouse.create` 被完整审计。
- [x] Step 3 验证 viewer 越权被拒并审计。
- [x] Step 4 验证 exec-approval 拒绝前 delete 不落地。
- [x] Step 5 验证审批通过后 delete 成功。
- [x] Step 6 验证 audit 完整性 + 凭据脱敏。

## 失败模式与排查

| 症状 | 可能原因 | 排查 |
| ---- | -------- | ---- |
| audit log 缺字段 | `audit.write` schema 不齐 | 查 `server/routes/audit.ts` 的 entry schema |
| viewer 越权 200 | RBAC middleware 未启用 | 检查 `server/engine/agents.ts` 的 `assertRole` 调用 |
| 审批前 delete 已落地 | `delete` 路径未检查 approvalId | 确认 `warehouse.delete` 走审批闸口 |
| 凭据泄露到 audit | 序列化时未做 secret redaction | 检查 `server/utils/cleanup.ts` 的 redact 列表 |
| 审批 reject 仍删除了资源 | 状态机 bug | 校验 `execApproval.reject` 是否触发资源回滚 / 不动 |

## 相关文件

- `server/routes/audit.ts` — 审计路由
- `server/routes/agents.ts` / `server/engine/agents.ts` — 业务路由 + 业务逻辑
- `server/utils/cleanup.ts` — 凭据脱敏
- `docs/security/audit.md` / `docs/security/rbac.md` / `docs/security/exec-approval.md`

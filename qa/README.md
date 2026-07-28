# CrossWMS QA Scenarios

CrossWMS (CDF Know Clow) 仓库管理系统的 QA 场景集。提供 WMS 业务、AI 助手、记忆、模型、通道、安全等关键路径的可执行回归与冒烟用例。

> **TL;DR** — 仓库级 QA 资产。每条场景都给出 `scenario.yaml`（可执行入口）与 `steps.md`（人工可读的步骤说明）。在 CrossWMS 仓库中通过 `qa/index.yaml` 统一注册。

## 目录结构

```
qa/
├── index.yaml                        # 场景注册表（所有场景元数据）
├── README.md                         # 本文件
└── scenarios/
    ├── agents/                       # 智能体生命周期
    │   ├── scenario.yaml
    │   └── steps.md
    ├── channels/                     # 通道：飞书 / 企微 / SMS 等
    │   ├── scenario.yaml
    │   └── steps.md
    ├── memory/                       # 记忆引擎
    │   ├── scenario.yaml
    │   └── steps.md
    ├── models/                       # 模型管理
    │   ├── scenario.yaml
    │   └── steps.md
    ├── security/                     # 安全 / 审计 / Exec-Approval
    │   ├── scenario.yaml
    │   └── steps.md
    ├── config/                       # 配置（占位）
    ├── plugins/                      # 插件（占位）
    ├── runtime/                      # 运行时（占位）
    ├── ui/                           # 桌面 UI（占位）
    ├── workspace/                    # 工作空间（占位）
    ├── jsonl-replay/                 # 会话重放（占位）
    ├── media/                        # 媒体处理（占位）
    ├── personal/                     # 个人助手（占位）
    ├── scheduling/                   # 定时任务（占位）
    └── character/                    # 角色人设（占位）
```

## 已注册场景（5 个核心场景）

| 场景 ID                       | 主题          | 覆盖内容                            | 优先级 |
| ----------------------------- | ------------- | ----------------------------------- | ------ |
| `agents-lifecycle`            | `agents/`     | 智能体创建 / 删除 / 启动 / 停止 / 列表 | High   |
| `channels-install-and-message`| `channels/`   | 通道安装 / 启用 / 禁用 / 消息发送    | High   |
| `memory-store-retrieve-delete`| `memory/`     | 记忆存储 / 检索 / 删除 / 会话隔离    | High   |
| `models-switch-failover-capabilities` | `models/` | 模型切换 / failover / 能力检测       | High   |
| `security-audit-permission-exec-approval` | `security/` | 安全审计 / 权限验证 / exec-approval | High   |

## 文件格式

每个主题目录下都有两个文件：

- **`scenario.yaml`** — 可执行的 YAML 场景定义，遵循 OpenClaw QA 框架的 schema：
  - `title`
  - `scenario`（含 `id` / `surface` / `coverage` / `objective` / `successCriteria` / `docsRefs` / `codeRefs` / `execution`）
  - `flow.steps`（按顺序执行的 step 列表，每个 step 包含 `name` 与 `actions`）
- **`steps.md`** — Markdown 文档，给出该场景的：
  - 前置条件
  - 详细操作步骤（与 `scenario.yaml` 中 step 一一对应）
  - 预期结果
  - 失败模式与排查指引

## 运行方式

### 1. 列出已注册场景

```bash
pnpm crosswms qa coverage
```

### 2. 运行整套 QA 套件（默认 standard parity tier）

```bash
pnpm crosswms qa suite
```

### 3. 只跑某个场景

```bash
pnpm crosswms qa suite --scenario agents-lifecycle
```

### 4. 单场景手动探针（人工驱动，验证人设 / 文案风格）

```bash
pnpm crosswms qa manual --scenario channels-install-and-message
```

### 5. 通过 e2e harness 跑（仅 e2e 场景）

```bash
pnpm test:e2e qa/scenarios/<theme>/scenario.yaml
```

## 关键工作流

- `qa suite` — 可执行的回归 / 冒烟子集（CI / 提 PR 前必跑）
- `qa manual` — 限定范围的人设 / 文风探针（套件绿灯后跑）
- `qa coverage` — 打印场景覆盖清单（来自 `qa/index.yaml` 与各 `scenario.yaml`）

## 编写新场景的贡献指南

1. **选主题**：在 `qa/scenarios/<theme>/` 下新建文件，确保主题目录已存在。
2. **写 `scenario.yaml`**：
   - `id` 用 `kebab-case`，全局唯一
   - `surface` 用名词短语（如 `memory-core` / `security`）
   - `coverage.primary` 至少一个 `namespace.behavior` 形式的 ID；secondary 仅在确实保护多个行为时填
   - `successCriteria` 用可断言的 bullet，每条都能在 `flow.steps` 中被验证
   - `execution.kind` 选 `flow` / `script` / `vitest` / `playwright`
   - `flow.steps` 至少 1 个 step，每个 step 给 `name` 与 `actions`
3. **写 `steps.md`**：
   - 标题与 `scenario.yaml` 的 `title` 保持一致
   - 用编号列表给出每一步的人工可读操作
   - 末尾给出 `expected_outcomes`（与 `successCriteria` 对应）
4. **更新 `qa/index.yaml`**：
   - 在 `scenarios` 列表下追加新场景的元数据
   - 给出 `coverage` / `runtimeParityTier` / `priority`
5. **本地验证**：
   - `pnpm crosswms qa coverage` 确认新场景被注册
   - `pnpm crosswms qa suite --scenario <new-id>` 跑通
6. **提交 PR**：
   - 标题用 `qa(<theme>): <场景简述>`
   - Body 写明业务动机、覆盖范围、风险与回滚方案
   - 引用相关 `codeRefs` / `docsRefs`

## 风格约定

- **YAML 缩进**：2 空格，禁止 tab。
- **ID 命名**：`kebab-case`，`coverage` ID 用 `namespace.behavior` 点号分隔。
- **不要在场景里写硬编码的私有凭据 / 真实手机号 / 真实仓库数据**。占位用 `${env:...}` 或 `__PLACEHOLDER__`。
- **不要修改** `qa/index.yaml` 之外的全局 schema 字段。如果需要扩展，先在 PR 里讨论。
- **跨场景共享 helper** 放进对应主题的 `_helpers.yaml`（如未来出现）。
- **跨场景复用 setup**：在 `execution.config` 中参数化，不要在 step 中硬编码。

## 与 OpenClaw QA 的关系

CrossWMS 的 QA 框架以 `openclaw/qa/` 为参考蓝本，但做了 WMS 业务适配：

| OpenClaw QA              | CrossWMS QA                | 备注                                          |
| ------------------------ | -------------------------- | --------------------------------------------- |
| `qa/scenarios/index.yaml`| `qa/index.yaml`            | CrossWMS 提升为仓库根，便于单仓检索           |
| `qa/README.md`           | `qa/README.md`             | 文档结构对齐                                  |
| `<theme>/*.yaml`         | `<theme>/scenario.yaml`    | 单主题单场景，避免污染，便于 review            |
| 隐含 `flow.steps`        | 显式 `flow.steps` + `steps.md` | 提供可执行 + 可读两份资产               |
| Agent / 通道 / 记忆 / 模型 | 全部保留 + 增加 WMS 业务场景 | 仓库 CRUD、SKU、库龄预警等              |

## 维护原则

- `qa/` 目录必须随仓库入库，不要在 `.gitignore` 中排除。
- 新增场景先 PR 评审，再接入 CI / 自动化。
- 老场景如果失去价值，**删除**而不是禁用；不要保留 dead path。
- 测试用 vitest / playwright；e2e 放在 `e2e/`，单元放在 `src/__tests__/`，QA 场景在 `qa/`。
- WMS 业务场景（仓库、库存、在途、报表）随业务变更同步更新场景。

## 相关参考

- `openclaw/qa/README.md` — OpenClaw QA 框架原始文档
- `openclaw/qa/scenarios/index.yaml` — OpenClaw 包元数据
- `openclaw/qa/scenarios/<theme>/*.yaml` — OpenClaw 场景样例
- `e2e/README.md` — CrossWMS 端到端测试
- `docs/` — CrossWMS 设计文档

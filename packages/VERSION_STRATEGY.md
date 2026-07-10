# CDFKnow SDK 版本策略

> 本文档定义了 CDFKnow 各 SDK 包的语义化版本规则、跨包依赖版本范围、
> 发布流程、变更日志要求及稳定性等级晋升流程。
> 所有包均遵循 [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html)。

---

## 语义化版本规则

### 版本号格式

```
MAJOR.MINOR.PATCH
```

| 位置 | 含义 | 何时变更 |
|------|------|----------|
| **MAJOR** | 主版本 | STABLE API 发生破坏性变更 |
| **MINOR** | 次版本 | 新增 STABLE 功能；EXPERIMENTAL API 变更（含破坏性） |
| **PATCH** | 补丁版本 | Bug 修复、内部实现改进（无公共 API 表面变更） |

### 变更分类与版本映射

| 变更类型 | 影响范围 | 版本升级 |
|----------|----------|----------|
| STABLE API 移除或签名变更 | 破坏性 | MAJOR |
| STABLE API 新增导出 | additive | MINOR |
| STABLE API 新增可选参数 | additive | MINOR |
| EXPERIMENTAL API 新增 | additive | MINOR |
| EXPERIMENTAL API 签名变更 | 破坏性（但允许） | MINOR |
| EXPERIMENTAL API 移除（经弃用流程） | 破坏性（但允许） | MINOR |
| INTERNAL API 变更 | 无约束 | PATCH 或 MINOR |
| Bug 修复（不影响公共 API） | 修复 | PATCH |
| 性能优化（不影响公共 API） | 优化 | PATCH |

### 预发布版本

预发布版本使用 SemVer 标准格式：

```
1.1.0-alpha.1
1.1.0-beta.2
1.1.0-rc.1
```

预发布版本不得用于生产依赖，仅在测试和验证中使用。

---

## 跨包依赖版本范围

### 依赖声明规则

| 规则 | 说明 |
|------|------|
| 跨包依赖使用 `^` 前缀 | 允许同 MAJOR 版本内的 MINOR/PATCH 升级 |
| 仅依赖 STABLE API | 跨包依赖应仅使用目标包的 STABLE 导出 |
| EXPERIMENTAL API 依赖须注明 | 如需使用 EXPERIMENTAL API，在 package.json 注释中注明变更风险 |
| 不得依赖 INTERNAL API | 跨包依赖不得引用目标包的 INTERNAL 导出 |

### 当前跨包依赖

| 包 | 依赖 | 版本范围 | 使用范围 |
|----|------|----------|----------|
| `@cdf-know/agent-core` | `@cdf-know/llm-core` | `^1.0.0` | STABLE（UnifiedModelCatalog, ProviderRegistry, CostEstimator 等） |
| `@cdf-know/skill-core` | `@cdf-know/plugin-sdk` | `^1.0.0` | STABLE（ContractRegistry, ToolRegistry, HookRunner 等） |

### 版本一致性规则

1. **发布对齐** — 当一个包升级 MAJOR 版本时，其下游依赖包须同步评估是否需要升级
2. **最小影响原则** — 下游包应优先尝试适配新版本，仅在无法适配时才升级自身 MAJOR 版本
3. **workspace 协议** — 开发期间跨包依赖可使用 workspace 协议（`workspace:*`），发布时替换为具体版本范围

---

## 发布流程

### 发布前检查清单

1. **API 奐约检查** — 运行 `zsh scripts/check-api-contracts.sh`，确保 STABLE API 奐约完整
2. **包一致性检查** — 运行 `zsh scripts/check-packages.sh`，确保包名、版本、入口、跨包版本一致
3. **变更日志** — 确认 `CHANGELOG.md` 包含本次发布的所有变更条目
4. **类型编译** — 确保 TypeScript strict 模式编译通过，无类型错误
5. **测试通过** — 确保所有单元测试和集成测试通过

### 发布步骤

1. **确定版本号** — 根据变更分类确定 MAJOR/MINOR/PATCH
2. **更新版本** — 修改 `package.json` 中的 `version` 字段
3. **更新依赖** — 如跨包依赖版本变更，同步更新下游包的依赖声明
4. **生成变更日志** — 更新 `CHANGELOG.md`
5. **提交** — 创建发布提交，包含版本号和变更日志
6. **打标签** — 为每个包创建 Git 标签（格式：`@cdf-know/<pkg-name>@<version>`）
7. **发布** — 执行包发布命令

### 多包发布顺序

当多个包需要同时发布时，遵循依赖顺序：

1. **无依赖包先行** — `llm-core`, `memory-host-sdk`, `plugin-sdk`
2. **依赖包后行** — `agent-core`（依赖 llm-core）, `skill-core`（依赖 plugin-sdk）

---

## 变更日志要求

### CHANGELOG.md 格式

每个包维护独立的 `CHANGELOG.md`，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 格式：

```markdown
# Changelog

## [1.1.0] - 2026-07-10

### Added
- 新增 `AgentMemory` 接口（STABLE）

### Changed
- `Agent.run()` 新增可选参数 `maxSteps`（STABLE, additive）

### Deprecated
- `Agent.getHistory()` 标注弃用，将在 v2.0.0 移除，替代方案：`Agent.getTracer().getSpans()`

### Fixed
- 修复 `Tracer.endSpan()` 在并发场景下的竞态条件

### Security
- 更新 `uuid` 依赖至 v9.0.0，修复 CVE-2026-XXXX
```

### 变更条目分类

| 分类 | 说明 | 必须记录 |
|------|------|----------|
| **Added** | 新增功能 | 是 |
| **Changed** | 功能变更（含 additive 变更） | 是 |
| **Deprecated** | 标注弃用的 API | 是（STABLE 必须，EXPERIMENTAL 建议） |
| **Removed** | 移除的功能 | 是 |
| **Fixed** | Bug 修复 | 是（影响公共行为的必须） |
| **Security** | 安全修复 | 是 |

### 稳定性标注

变更日志条目须标注涉及的 API 稳定性等级：

```markdown
### Added
- 新增 `AgentMemory` 接口 [STABLE]
- 新增 `ReasoningEngine.getSummary()` 方法 [EXPERIMENTAL]

### Deprecated
- `Agent.getHistory()` 标注弃用 [STABLE]，将在 v2.0.0 移除
```

---

## 稳定性等级晋升流程

### EXPERIMENTAL → STABLE

| 条件 | 要求 |
|------|------|
| **验证期** | 至少经历 2 个 minor 版本或 3 个月的公开使用 |
| **稳定性** | 无重大变更投诉，签名未频繁修改 |
| **测试覆盖** | 有完整的单元测试和集成测试覆盖 |
| **文档** | 有完整的使用文档和示例 |
| **下游验证** | 至少有一个下游包或外部消费者使用验证 |

### 晋升步骤

1. **提议** — 在变更日志或 GitHub Issue 中提出晋升提议
2. **验证** — 确认满足上述所有条件
3. **契约登记** — 在 `packages/contracts/<pkg>.d.ts` 中添加契约声明
4. **文档更新** — 在 `packages/API_CONTRACTS.md` 中将稳定性等级从 EXPERIMENTAL 改为 STABLE
5. **版本升级** — 作为 MINOR 版本的一部分发布（STABLE 新增为 additive 变更）
6. **通知** — 在变更日志中明确标注晋升信息

### 晋升示例

```markdown
### Changed
- `SkillLoader` 从 EXPERIMENTAL 晋升为 STABLE [STABLE]
- `SecurityScanner` 从 EXPERIMENTAL 晋升为 STABLE [STABLE]
```

### STABLE API 降级

- **不允许** — STABLE API 一旦发布，不得降级为 EXPERIMENTAL 或 INTERNAL
- 如需移除，须遵循弃用策略（参见 [API_CONTRACTS.md](./API_CONTRACTS.md)）

---

## 破坏性变更处理流程

### STABLE API 破坏性变更（MAJOR 版本升级）

1. **评估影响** — 确定哪些下游包和外部消费者受影响
2. **提供迁移指南** — 在变更日志中附带详细的迁移说明
3. **弃用先行** — 旧 API 须先标注弃用，保留至少 2 个 MAJOR 版本
4. **并行期** — 旧 API 和新 API 在弃用保留期内同时可用
5. **移除** — 在弃用保留期结束后的下一个 MAJOR 版本移除旧 API

### EXPERIMENTAL API 破坏性变更（MINOR 版本升级）

1. **标注弃用** — 在当前版本标注 `@deprecated`
2. **保留一个 MINOR 版本** — 弃用 API 在当前版本仍可用
3. **移除或替换** — 在下一个 MINOR 版本中移除或替换

---

## 版本冲突解决

### 跨包版本不一致

当 `@cdf-know/llm-core` 升级到 v2.0.0（MAJOR 变更），而 `@cdf-know/agent-core` 依赖 `^1.0.0` 时：

1. **评估适配** — 检查 agent-core 是否能通过 additive 变更适配 llm-core v2
2. **如可适配** — agent-core 升级依赖声明为 `^2.0.0`，自身发布 MINOR 版本
3. **如不可适配** — agent-core 需自身发布 MAJOR 版本，同时升级依赖声明

### 最低兼容版本

- 每个包的 `package.json` 中须声明最低兼容的跨包依赖版本
- 使用 `^` 前缀确保 MINOR/PATCH 版本的兼容性

---

## 版本策略与现有脚本的对应关系

| 脚本 | 检查内容 | 版本策略对应 |
|------|----------|-------------|
| `scripts/check-packages.sh` | 包名、版本字段、入口、跨包版本一致性 | 跨包依赖版本范围规则 |
| `scripts/check-api-contracts.sh` | STABLE API 奐约完整性 | 破坏性变更检测（移除检测） |

两个脚本互补：
- `check-packages.sh` 确保包元数据一致性
- `check-api-contracts.sh` 确保 STABLE API 奐约完整性（检测移除和签名变更）

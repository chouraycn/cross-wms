# plugin-sdk 契约差异 + skillParser 兼容性缺口分析

> 范围：`openclaw/`（vendored 上游，v2026.6.9） vs `packages/plugin-sdk/` + `src/utils/skillParser.ts`（现在软）
> 日期：2026-07-13
> 目标：① 两边 plugin-sdk 契约差异 ② skillParser 对 openclaw 技能元数据格式的兼容性缺口

---

## 0. 关系定性（前置，决定对比粒度）

两边 **plugin-sdk 不是 fork 关系**：

| 项 | 现在软 `packages/plugin-sdk` | openclaw `packages/plugin-sdk` | openclaw 真实 SDK 面 |
|---|---|---|---|
| 形态 | 精简自研 SDK，11 源文件 / ~1700 LOC | provider-auth **子集**（re-export barrel） | `src/plugin-sdk`（400 文件 monolith） |
| 真实类型位置 | 自身 `src/*.ts` | 指向 `../plugins/types.js` | `src/plugins/types.ts` |
| 概念来源 | 借鉴 openclaw 架构（插件/hook/tool/manifest/registry） | 同上 | 原始定义 |

结论：**「契约 diff」在概念/契约层对照，而非文件级**。openclaw 的 SDK 是 re-export 庞大 monolith，无法逐文件比对；可比的是「插件系统核心契约」。

---

## 1. plugin-sdk 契约差异（Task ①）

### 1.1 HookRunner —— 对齐点（命名同、方法异）

| 维度 | 现在软 `HookRunner` | openclaw `HookRunner` |
|---|---|---|
| 形态 | `class HookRunner extends EventEmitter` | `createHookRunner(options)` 工厂函数 |
| 公共方法 | `run(event,payload)` 串行 / `runAsync` 并行 / `register` / `unregister` / `getHooks` | `runSessionStart` / `runSessionEnd` / `runSubagentSpawning` / `runSubagentSpawned` / `runSubagentEnded` / `hasHooks` |
| 注册 | `register({event,handler})` / `onHook(event,handler)` | `registerHook(events,handler)` |
| 钩子命名 | `PluginHookType`：13 个生命周期事件（`before_chat`/`after_tool_call`/`message_received`…） | `HookName`：大枚举（会话/子代理/回复/工具/审批） |
| 失败策略 | `HookFailurePolicy = 'fail-open' \| 'fail-closed'` ✅**字面同名** | `HookFailurePolicy` ✅**字面同名** |
| Logger | `HookRunnerLogger` ✅**字面同名** | `HookRunnerLogger` ✅**字面同名** |
| 全局单例 | `hookRunner` 单例 + `onHook`/`offHook` | `getGlobalHookRunner()` |

**结论**：
- 命名层 `HookFailurePolicy` / `HookRunnerLogger` 两边**字面相同**——这正是 prior-turn「hooks-contract 对齐点」的痕迹（fork 概念时照搬了这两个类型名）。
- 但**方法语义根本分歧**：
  - 现在软 = **通用事件总线**（event string + payload，pub/sub 风格）
  - openclaw = **类型化命名生命周期方法**（会话/子代理级）
- 哲学一致（全局 hook runner + fail-open/closed），但**不可互通**：现在软插件写 `hookRunner.run('before_chat', …)`，openclaw 写 `runner.runSessionStart(…)`。

### 1.2 PluginApi / PluginDefinition —— 现在软是 openclaw 的 WMS 子集

| 能力面 | 现在软 `PluginApi` | openclaw `OpenClawPluginApi` |
|---|---|---|
| register 方法数 | ~16（`registerTool`/`registerHook`/`registerContract`/`registerProvider`/`registerEmbeddingProvider`/`registerMemoryHost`/`registerChannel`/`registerCommand`/`registerService`/`registerAudioProvider`/`registerImageGeneration`/`registerVideoGeneration`/`registerWebSearch`/`registerSecurityProvider`/`registerApiIntegration`/`registerCompactionProvider`/`registerLifecycle`） | 数十个，组织为 facade（`session`/`agent`/`runContext`/`lifecycle`）+ 扁平兼容 |
| 现在软**缺**的能力 | — | `registerHttpRoute` / `registerGatewayMethod`（Gateway RPC）/ `registerCli` / `registerNodeCliFeature`（Node Host 命令）/ `registerProvider`（模型/媒体/语音/转录/媒体理解/实时语音）/ `registerModelCatalogProvider` / `registerSecurityAuditCollector` / `registerConfigMigration` / `registerAutoEnableProbe` / `registerGatewayDiscoveryService` / `registerTextTransforms` |

结论：现在软 `PluginApi` 是 openclaw 的 **WMS 相关子集**，缺 HTTP 路由 / Gateway RPC / CLI / Node Host / 媒体理解 / 实时语音转录 / 模型目录 / 安全审计 / 迁移探针。对「跨境 WMS 桌面 AI」定位**合理**，不应补齐（否则继承 openclaw 广度包袱）。

### 1.3 共同拥有的核心契约（对齐良好）

- `PluginManifest` / `PluginDefinition` / `PluginType` / `PluginStatus` / `PluginCapability` 概念齐全
- `PluginToolCapability`（name/description/parameters/handler/riskLevel）—— 对应 openclaw `AnyAgentTool`
- `contracts`（`ContractRegistry` / `defineContract` / `implementsContract`）—— 对应 openclaw `PluginContract`
- `manifest` 校验（`validateManifest` / `normalizeManifest` / `compareManifests` / `discoverPlugins`）—— 对应 openclaw `bundle-manifest` 校验
- `slots`（`PluginSlotKey` / `applyExclusiveSlotSelection` / `normalizeKinds`）—— **现在软独有抽象**（openclaw 用 facade 替代，无直接对应）

---

## 2. skillParser 对 openclaw 元数据格式的兼容性（Task ②）

### 2.1 结论先行

`src/utils/skillParser.ts` 是 openclaw 技能元数据格式的 **1:1 忠实移植**，类型层**零缺口**。

### 2.2 类型逐字段对照（完全相同）

**`OpenClawSkillMetadata`**（`openclaw/src/skills/types.ts:20` vs `skillParser.ts:21`）：

| 字段 | openclaw | 现在软 | 一致 |
|---|---|---|---|
| `always?` | boolean | boolean | ✅ |
| `skillKey?` | string | string | ✅ |
| `primaryEnv?` | string | string | ✅ |
| `emoji?` | string | string | ✅ |
| `homepage?` | string | string | ✅ |
| `os?` | string[] | string[] | ✅ |
| `requires?` | `{bins?,anyBins?,env?,config?}` | `{bins?,anyBins?,env?,config?}` | ✅ |
| `install?` | `SkillInstallSpec[]` | `SkillInstallSpec[]` | ✅ |

**`SkillInstallSpec`**（13 字段全同：id/kind/label/bins/os/formula/package/module/url/archive/extract/stripComponents/targetDir）。

**`SkillInvocationPolicy`**（`userInvocable`/`disableModelInvocation`）、**`SkillExposure`**（`includeInRuntimeRegistry`/`includeInAvailableSkillsPrompt`/`userInvocable`）—— 字段名完全相同。

**关键证据**：`cask → formula` 别名逻辑两边**逐字相同**
- openclaw `src/skills/loading/frontmatter.ts:160-162`
- 现在软 `src/utils/skillParser.ts:399-400`

```ts
const cask = normalizeSafeBrewFormula(raw.cask);
if (!spec.formula && cask) spec.formula = cask;
```

### 2.3 解析严格度差异（唯一真实风险）

| 点 | openclaw | 现在软 | 风险 |
|---|---|---|---|
| npm spec 校验 | `normalizeSafeNpmSpec` 调 `validateRegistryNpmSpec(spec)`，**拒绝非法 spec** | 仅检查非空 + 非 `-` 开头，**放行一切** | ⚠️ 现在软更宽松，会接受 openclaw 拒绝的畸形 npm spec |
| UV package regex | `/^[a-z0-9][a-z0-9._\-[\]=<>!~+,]*$/i` | `/^[a-z0-9][a-z0-9._-]*(\[[a-z0-9,._-]+\])?(([><=!~]=?\|===?)[a-z0-9.*_-]+)?$/i`（分组式） | ⚠️ 极端 PEP508 spec 两边校验结果可能不同 |
| 解析组织 | 集中 `src/shared/frontmatter.ts`（`resolveOpenClawManifestBlock`/`Requires`/`Install`/`Os`），经充分测试 | 内联 `resolveOpenClawMetadata` | 功能等价（合法输入）；openclaw 更健壮 |

### 2.4 兼容性缺口评级

| 维度 | 评级 | 说明 |
|---|---|---|
| 类型 / Schema | ✅ 100% 兼容 | 逐字段 1:1 |
| 合法技能文件解析 | ✅ 兼容 | 行为等价 |
| 畸形输入鲁棒性 | ⚠️ 现在软更宽松 | npm spec 无 registry 校验，仅低风险（影响恶意/笔误 skill 的静默接受） |

---

## 3. 建议

1. **plugin-sdk 保持现状**：不补齐 openclaw 广度（HTTP/Gateway/CLI/Node/媒体）。现在软是 openclaw PluginApi 的 WMS 子集，定位正确。HookRunner 方法语义分歧是**有意的设计选择**（事件总线 vs 生命周期方法），无需强行对齐。
2. **skillParser 锁版本即可**：类型层已 1:1，无需改。若想消除「宽松 npm spec」风险，可把 openclaw 的 `validateRegistryNpmSpec` 校验借入 `normalizeSafeNpmSpec`（一行改动，降低恶意 skill 静默接受概率）。
3. **vendored 快照漂移预警**：openclaw 每日发版。本次核对基于 v2026.6.9 快照；若后续同步上游，以 `src/skills/types.ts` 的 `OpenClawSkillMetadata` 为权威基准重新核对。

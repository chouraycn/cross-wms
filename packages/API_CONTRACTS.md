# CDFKnow SDK API 契约规范

> 本文档定义了 CDFKnow 各 SDK 包的公共 API 表面、稳定性等级、破坏性变更策略、弃用策略及版本策略。
> 所有包均遵循 ESM 规范，导入路径使用 `.js` 扩展名，TypeScript strict 模式编译。

---

## 稳定性等级定义

| 等级 | 标记 | 含义 | 变更规则 |
|------|------|------|----------|
| **STABLE** | `@stable` | 已稳定，面向外部消费者 | 小版本/补丁版本中不得移除或修改签名；仅允许 additive 变更（新增可选参数、新增导出） |
| **EXPERIMENTAL** | `@experimental` | 实验性，可能变更 | 可在小版本中修改签名或移除，但必须提前一个版本标注弃用 |
| **INTERNAL** | `@internal` | 内部使用，不面向外部消费者 | 无变更约束，可随时修改或移除 |

---

## 破坏性变更策略

以下变更对 **STABLE** API 视为破坏性变更：

1. **移除导出** — 删除任何已导出的类型、函数、类、常量或单例
2. **修改签名** — 改变函数/方法的参数数量、参数类型、返回类型
3. **新增必选参数** — 在已有函数/方法中新增非可选参数
4. **改变类继承关系** — 改变类的父类或移除已实现的接口
5. **修改类型约束** — 将宽松类型收窄（如 `any` → `string`），改变联合类型的成员

以下变更 **不属于** 破坏性变更（additive 变更）：

1. **新增导出** — 新增类型、函数、类、常量或单例
2. **新增可选参数** — 为已有函数/方法新增带默认值的可选参数
3. **扩展类型** — 为接口新增可选属性，扩展联合类型（新增成员）
4. **放宽类型约束** — 将窄类型放宽（如 `string` → `string | number`）

**EXPERIMENTAL** API 的破坏性变更：

- 允许在小版本中进行，但须遵循弃用策略（提前一个版本标注 `@deprecated`）
- 无需遵循 SemVer major 版本升级要求

**INTERNAL** API：

- 无变更约束，随时可修改或移除

---

## 弃用策略

### STABLE API 弃用流程

1. **标注弃用** — 在当前版本中将 API 标注 `@deprecated`，附带替代方案说明和移除时间线
2. **保留期** — 至少保留 **两个 major 版本** 或 **6 个月**（以较长者为准），期间 API 功能保持可用
3. **移除** — 在保留期结束后的下一个 major 版本中移除弃用 API

弃用标注格式：

```typescript
/** @deprecated 使用 newApi 代替，将在 v3.0.0 移除 */
export function oldApi(): void;
```

### EXPERIMENTAL API 弃用流程

1. **标注弃用** — 标注 `@deprecated`，附带移除版本号
2. **保留期** — 至少保留 **一个 minor 版本**
3. **移除** — 在下一个 minor 版本中可移除

### INTERNAL API

- 无需弃用流程，可随时移除

---

## 版本策略概览

所有包遵循 [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) 语义化版本规范：

- **MAJOR**：STABLE API 的破坏性变更
- **MINOR**：新增 STABLE 功能或 EXPERIMENTAL API 变更
- **PATCH**：Bug 修复、内部实现改进（无 API 表面变更）

详细版本策略请参阅 [VERSION_STRATEGY.md](./VERSION_STRATEGY.md)。

---

## 各包 API 契约

### @cdf-know/agent-core (v1.0.0)

> 依赖：`@cdf-know/llm-core@1.0.0`

#### STABLE API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `Agent` | 类 | STABLE | 核心智能体类，继承 `EventEmitter<AgentEvents>` |
| `AgentEvents` | 接口 | STABLE | Agent 事件类型定义 |
| `AgentStatus` | 类型 | STABLE | 智能体状态枚举 |
| `MessageRole` | 类型 | STABLE | 消息角色类型 |
| `MessageContent` | 类型 | STABLE | 消息内容类型 |
| `AgentMessage` | 类型 | STABLE | 智能体消息结构 |
| `ToolCall` | 类型 | STABLE | 工具调用结构 |
| `ToolDefinition` | 类型 | STABLE | 工具定义结构 |
| `ReasoningStep` | 类型 | STABLE | 推理步骤结构 |
| `AgentOptions` | 类型 | STABLE | 智能体配置选项 |
| `AgentRunParams` | 类型 | STABLE | 运行参数 |
| `AgentRunResult` | 类型 | STABLE | 运行结果 |
| `TokenUsage` | 类型 | STABLE | Token 使用统计 |
| `AgentEventType` | 类型 | STABLE | 事件类型标识 |
| `AgentEvent` | 类型 | STABLE | 事件数据结构 |
| `TraceSpan` | 类型 | STABLE | 追踪跨度结构 |
| `CompactionOptions` | 类型 | STABLE | 历史压缩选项 |
| `AgentRuntimeDeps` | 类型 | STABLE | 运行时依赖接口 |
| `Tracer` | 类 | STABLE | 追踪器，提供 span 管理 |
| `globalTracer` | 常量 | STABLE | 全局追踪器单例 |
| `trace` | 函数 | STABLE | 追踪装饰器函数 |

#### EXPERIMENTAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `AgentLoop` | 类 | EXPERIMENTAL | 智能体执行循环 |
| `AgentLoopOptions` | 类型 | EXPERIMENTAL | 循环选项 |
| `AgentLoopResult` | 类型 | EXPERIMENTAL | 循环结果 |
| `ReasoningEngine` | 类 | EXPERIMENTAL | 推理引擎，含 plan/observe/reflect/think |
| `ReasoningMode` | 类型 | EXPERIMENTAL | 推理模式 |
| `ReasoningOptions` | 类型 | EXPERIMENTAL | 推理选项 |
| `RuntimeDeps` | 接口 | EXPERIMENTAL | 运行时依赖定义 |
| `RuntimeModelType` | 类型 | EXPERIMENTAL | 运行时模型类型 |
| `validateRuntimeDeps` | 函数 | EXPERIMENTAL | 验证运行时依赖 |
| `createStubRuntime` | 函数 | EXPERIMENTAL | 创建桩运行时 |

#### INTERNAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `LlmMessageRole` | 类型 | INTERNAL | LLM 消息角色（内部桥接） |
| `LlmMessage` | 类型 | INTERNAL | LLM 消息结构 |
| `LlmConfig` | 类型 | INTERNAL | LLM 配置 |
| `LlmToolDefinition` | 类型 | INTERNAL | LLM 工具定义 |
| `LlmUsage` | 类型 | INTERNAL | LLM 使用统计 |
| `LlmResponse` | 类型 | INTERNAL | LLM 响应结构 |
| `StreamEventType` | 类型 | INTERNAL | 流事件类型 |
| `LlmStreamEvent` | 类型 | INTERNAL | 流事件结构 |
| `CompleteSimpleFn` | 类型 | INTERNAL | 简单完成函数 |
| `StreamSimpleFn` | 类型 | INTERNAL | 简单流函数 |
| `AgentHarness` | 类 | INTERNAL | 智能体执行支架 |
| `PolicyEngine` | 类 | INTERNAL | 策略引擎 |
| `HarnessRegistry` | 类 | INTERNAL | 支架注册表 |
| `HookContextFactory` | 类 | INTERNAL | Hook 上下文工厂 |
| `AgentExecutionPipeline` | 类 | INTERNAL | 执行管道 |
| `HarnessOptions` | 类型 | INTERNAL | 支架选项 |
| `HarnessEvent` | 类型 | INTERNAL | 支架事件 |
| `HarnessRunOptions` | 类型 | INTERNAL | 支架运行选项 |
| `AgentPolicy` | 类型 | INTERNAL | 智能体策略 |
| `ToolPermission` | 类型 | INTERNAL | 工具权限 |
| `ToolPolicyRule` | 类型 | INTERNAL | 工具策略规则 |
| `HarnessCapability` | 类型 | INTERNAL | 支架能力 |
| `RegisteredTool` | 类型 | INTERNAL | 注册工具 |
| `HookContext` | 类型 | INTERNAL | Hook 上下文 |
| `HookExecutionContext` | 类型 | INTERNAL | Hook 执行上下文 |
| `HookHandler` | 类型 | INTERNAL | Hook 处理器 |
| `PipelineStage` | 类型 | INTERNAL | 管道阶段 |
| `PipelineContext` | 类型 | INTERNAL | 管道上下文 |
| `EmbeddedRuntime` | 类 | INTERNAL | 嵌入式运行时 |
| `EmbeddedAgent` | 类 | INTERNAL | 嵌入式智能体 |
| `BrowserModelAdapter` | 类 | INTERNAL | 浏览器模型适配器 |
| `BrowserRuntimeConfig` | 类型 | INTERNAL | 浏览器运行时配置 |
| `EmbeddedRuntimeEnvironment` | 类型 | INTERNAL | 嵌入式运行时环境 |
| `EmbeddedRuntimeConfig` | 类型 | INTERNAL | 嵌入式运行时配置 |
| `EmbeddedTool` | 类型 | INTERNAL | 嵌入式工具 |
| `EmbeddedModel` | 类型 | INTERNAL | 嵌入式模型 |
| `EmbeddedAgentOptions` | 类型 | INTERNAL | 嵌入式智能体选项 |
| `EmbeddedAgentEvents` | 类型 | INTERNAL | 嵌入式智能体事件 |

---

### @cdf-know/llm-core (v1.0.0)

> 依赖：仅 `eventemitter3`

#### STABLE API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `UnifiedModelCatalog` | 类 | STABLE | 统一模型目录，继承 `EventEmitter<ModelCatalogEvents>` |
| `ModelCatalogEvents` | 类型 | STABLE | 目录事件类型 |
| `unifiedModelCatalog` | 常量 | STABLE | 目录单例 |
| `ModelKind` | 类型 | STABLE | 模型类型枚举 |
| `ModelCapability` | 类型 | STABLE | 模型能力 |
| `ModelPricing` | 类型 | STABLE | 模型定价结构 |
| `ModelContextWindow` | 类型 | STABLE | 模型上下文窗口 |
| `ModelRateLimits` | 类型 | STABLE | 模型速率限制 |
| `UnifiedModelCatalogEntry` | 类型 | STABLE | 目录条目结构 |
| `ModelCatalogSource` | 类型 | STABLE | 目录来源 |
| `ModelFilterOptions` | 类型 | STABLE | 模型过滤选项 |
| `ModelSortBy` | 类型 | STABLE | 模型排序方式 |
| `ProviderRegistry` | 类 | STABLE | 提供者注册表，继承 `EventEmitter<ProviderRegistryEvents>` |
| `ProviderRegistryEvents` | 类型 | STABLE | 提供者注册表事件 |
| `providerRegistry` | 常量 | STABLE | 提供者注册表单例 |
| `ProviderType` | 类型 | STABLE | 提供者类型 |
| `ProviderAuthContext` | 类型 | STABLE | 提供者认证上下文 |
| `ProviderAuthResult` | 类型 | STABLE | 提供者认证结果 |
| `ProviderModel` | 类型 | STABLE | 提供者模型 |
| `LlmProvider` | 接口 | STABLE | LLM 提供者接口 |
| `CostEstimator` | 类 | STABLE | 成本估算器 |
| `costEstimator` | 常量 | STABLE | 成本估算器单例 |
| `CostEstimation` | 类型 | STABLE | 成本估算结果 |

#### EXPERIMENTAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `UsageTracker` | 类 | EXPERIMENTAL | 使用量追踪器 |
| `StreamTransformer` | 类 | EXPERIMENTAL | 流转换器 |
| `SseStreamWriter` | 类 | EXPERIMENTAL | SSE 流写入器 |
| `StreamCombiner` | 类 | EXPERIMENTAL | 流合并器 |
| `StreamSplitter` | 类 | EXPERIMENTAL | 流拆分器 |
| `collectStream` | 函数 | EXPERIMENTAL | 收集流数据 |
| `streamToText` | 函数 | EXPERIMENTAL | 流转文本 |
| `streamToArray` | 函数 | EXPERIMENTAL | 流转数组 |
| `streamToBuffer` | 函数 | EXPERIMENTAL | 流转缓冲区 |
| `LlmUsage` | 类型 | EXPERIMENTAL | LLM 使用统计 |
| `StreamEventType` | 类型 | EXPERIMENTAL | 流事件类型 |
| `LlmStreamEvent` | 类型 | EXPERIMENTAL | 流事件结构 |
| `StreamTransformerOptions` | 类型 | EXPERIMENTAL | 流转换选项 |
| `SseStreamOptions` | 类型 | EXPERIMENTAL | SSE 流选项 |
| `StreamCombinerOptions` | 类型 | EXPERIMENTAL | 流合并选项 |
| `StreamSplitterOptions` | 类型 | EXPERIMENTAL | 流拆分选项 |

---

### @cdf-know/memory-host-sdk (v1.0.0)

> 依赖：仅 `eventemitter3`

#### STABLE API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `MemoryQueryEngine` | 类 | STABLE | 内存查询引擎，继承 `EventEmitter<MemoryQueryEngineEvents>` |
| `MemoryQueryEngineEvents` | 类型 | STABLE | 查询引擎事件 |
| `memoryQueryEngine` | 常量 | STABLE | 查询引擎单例 |
| `MemoryBackendType` | 类型 | STABLE | 内存后端类型 |
| `MemoryScope` | 类型 | STABLE | 内存作用域 |
| `MemoryEntry` | 接口 | STABLE | 内存条目 |
| `MemorySearchResult` | 接口 | STABLE | 内存搜索结果 |
| `MemoryStats` | 接口 | STABLE | 内存统计 |
| `MemoryQuery` | 接口 | STABLE | 内存查询结构 |
| `MemoryInsertOptions` | 接口 | STABLE | 内存插入选项 |
| `MemoryBackend` | 接口 | STABLE | 内存后端接口 |
| `MemoryEventType` | 类型 | STABLE | 内存事件类型 |
| `MemoryEvent` | 类型 | STABLE | 内存事件结构 |
| `MemoryEventBus` | 类 | STABLE | 内存事件总线 |
| `MemoryEventBusEvents` | 类型 | STABLE | 事件总线事件 |
| `memoryEventBus` | 常量 | STABLE | 事件总线单例 |
| `EngineStorage` | 类 | STABLE | 引擎存储管理 |
| `EngineStorageEvents` | 类型 | STABLE | 引擎存储事件 |
| `engineStorage` | 常量 | STABLE | 引擎存储单例 |
| `StorageUsage` | 类型 | STABLE | 存储用量结构 |
| `MigrationPlan` | 类型 | STABLE | 迁移计划结构 |

#### EXPERIMENTAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `MemoryDreaming` | 类 | EXPERIMENTAL | 内存梦境引擎 |
| `DreamingPhase` | 类型 | EXPERIMENTAL | 梦境阶段 |
| `DreamingOptions` | 类型 | EXPERIMENTAL | 梦境选项 |
| `DreamingStats` | 类型 | EXPERIMENTAL | 梦境统计 |
| `MemoryCluster` | 类型 | EXPERIMENTAL | 内存聚类 |
| `DreamingEvents` | 类型 | EXPERIMENTAL | 梦境事件 |
| `memoryDreaming` | 常量 | EXPERIMENTAL | 梦境引擎单例 |
| `MemorySecretManager` | 类 | EXPERIMENTAL | 内存密钥管理 |
| `memorySecretManager` | 常量 | EXPERIMENTAL | 密钥管理单例 |
| `MemorySecretConfig` | 类型 | EXPERIMENTAL | 密钥配置 |
| `EncryptedValue` | 类型 | EXPERIMENTAL | 加密值 |
| `MultimodalProcessor` | 类 | EXPERIMENTAL | 多模态处理器 |
| `TextProcessor` | 类 | EXPERIMENTAL | 文本处理器 |
| `ImageProcessor` | 类 | EXPERIMENTAL | 图像处理器 |
| `AudioProcessor` | 类 | EXPERIMENTAL | 音频处理器 |
| `VideoProcessor` | 类 | EXPERIMENTAL | 视频处理器 |
| `PdfProcessor` | 类 | EXPERIMENTAL | PDF 处理器 |
| `CodeProcessor` | 类 | EXPERIMENTAL | 代码处理器 |
| `ModalityProcessor` | 接口 | EXPERIMENTAL | 模态处理器接口 |
| `ModalityType` | 类型 | EXPERIMENTAL | 模态类型 |
| `MultimodalContent` | 类型 | EXPERIMENTAL | 多模态内容 |
| `MultimodalMemoryEntry` | 类型 | EXPERIMENTAL | 多模态内存条目 |
| `multimodalProcessor` | 常量 | EXPERIMENTAL | 多模态处理器单例 |
| `createMultimodalEntry` | 函数 | EXPERIMENTAL | 创建多模态条目 |
| `AdvancedSearchEngine` | 类 | EXPERIMENTAL | 高级搜索引擎 |
| `advancedSearchEngine` | 常量 | EXPERIMENTAL | 高级搜索引擎单例 |
| `SearchRanking` | 类型 | EXPERIMENTAL | 搜索排序 |
| `AdvancedSearchOptions` | 类型 | EXPERIMENTAL | 高级搜索选项 |
| `MemoryClustering` | 类 | EXPERIMENTAL | 内存聚类 |
| `memoryClustering` | 常量 | EXPERIMENTAL | 聚类单例 |
| `Cluster` | 类型 | EXPERIMENTAL | 聚类结构 |
| `ClusteringOptions` | 类型 | EXPERIMENTAL | 聚类选项 |
| `ClusteringResult` | 类型 | EXPERIMENTAL | 聚类结果 |
| `MemoryBackendCapabilities` | 接口 | EXPERIMENTAL | 后端能力描述 |
| `MemoryBackendConfig` | 接口 | EXPERIMENTAL | 后端配置 |

---

### @cdf-know/plugin-sdk (v1.0.0)

> 依赖：仅 `eventemitter3`

#### STABLE API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `ContractRegistry` | 类 | STABLE | 契约注册表，继承 `EventEmitter<ContractRegistryEvents>` |
| `ContractRegistryEvents` | 类型 | STABLE | 契约注册表事件 |
| `contractRegistry` | 常量 | STABLE | 契约注册表单例 |
| `defineContract` | 函数 | STABLE | 定义契约 |
| `implementsContract` | 函数 | STABLE | 实现契约校验 |
| `PluginContract` | 接口 | STABLE | 契约定义接口 |
| `ContractMethod` | 类型 | STABLE | 契约方法结构 |
| `ToolRegistry` | 类 | STABLE | 工具注册表，继承 `EventEmitter<ToolRegistryEvents>` |
| `ToolRegistryEvents` | 类型 | STABLE | 工具注册表事件 |
| `toolRegistry` | 常量 | STABLE | 工具注册表单例 |
| `defineTool` | 函数 | STABLE | 定义工具 |
| `registerTool` | 函数 | STABLE | 注册工具 |
| `unregisterTool` | 函数 | STABLE | 注销工具 |
| `ToolDefinition` | 类型 | STABLE | 工具定义结构 |
| `ToolHandler` | 类型 | STABLE | 工具处理器 |
| `ToolContext` | 类型 | STABLE | 工具上下文 |
| `HookRunner` | 类 | STABLE | Hook 运行器，继承 `EventEmitter<HookRunnerEvents>` |
| `HookRunnerEvents` | 类型 | STABLE | Hook 运行器事件 |
| `hookRunner` | 常量 | STABLE | Hook 运行器单例 |
| `onHook` | 函数 | STABLE | 注册 Hook |
| `offHook` | 函数 | STABLE | 注销 Hook |
| `HookHandler` | 类型 | STABLE | Hook 处理器 |
| `HookContext` | 类型 | STABLE | Hook 上下文 |
| `HookResult` | 类型 | STABLE | Hook 结果 |
| `HookFailurePolicy` | 类型 | STABLE | Hook 失败策略 |
| `Slots` | 类 | STABLE | 插槽管理器 |
| `slots` | 常量 | STABLE | 插槽单例 |
| `SlotSelectionResult` | 类型 | STABLE | 插槽选择结果 |
| `PluginType` | 类型 | STABLE | 插件类型 |
| `PluginStatus` | 类型 | STABLE | 插件状态 |
| `PluginDefinition` | 接口 | STABLE | 插件定义 |
| `PluginManifest` | 接口 | STABLE | 插件清单 |
| `PluginInstance` | 接口 | STABLE | 插件实例 |
| `RegistrationMode` | 类型 | STABLE | 注册模式 |
| `PluginApi` | 接口 | STABLE | 插件 API |
| `PluginLogger` | 接口 | STABLE | 插件日志接口 |
| `LogLevel` | 类型 | STABLE | 日志级别 |
| `createPluginLogger` | 函数 | STABLE | 创建插件日志器 |
| `createNoopLogger` | 函数 | STABLE | 创建空日志器 |
| `emptyPluginConfigSchema` | 常量 | STABLE | 空配置 schema |

#### EXPERIMENTAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `UnifiedPluginRegistry` | 类 | EXPERIMENTAL | 统一插件注册表 |
| `UnifiedPluginRegistryEvents` | 类型 | EXPERIMENTAL | 统一注册表事件 |
| `UnifiedPluginRegistryOptions` | 类型 | EXPERIMENTAL | 注册表选项 |
| `ToolRegistryAdapter` | 类型 | EXPERIMENTAL | 工具注册表适配器 |
| `getUnifiedPluginRegistry` | 函数 | EXPERIMENTAL | 获取统一注册表单例 |
| `PluginHookRunner` | 类 | EXPERIMENTAL | 插件 Hook 运行器 |
| `HookMergeStrategy` | 类型 | EXPERIMENTAL | Hook 合并策略 |
| `HookRegistration` | 类型 | EXPERIMENTAL | Hook 注册结构 |
| `HookRunOptions` | 类型 | EXPERIMENTAL | Hook 运行选项 |
| `HookRunnerLogger` | 类型 | EXPERIMENTAL | Hook 运行器日志 |
| `ManifestValidator` | 类 | EXPERIMENTAL | 清单验证器 |
| `validateManifest` | 函数 | EXPERIMENTAL | 验证清单 |
| `normalizeManifest` | 函数 | EXPERIMENTAL | 规范化清单 |
| `loadManifestFromPath` | 函数 | EXPERIMENTAL | 从路径加载清单 |
| `compareManifests` | 函数 | EXPERIMENTAL | 比较清单 |
| `discoverPlugins` | 函数 | EXPERIMENTAL | 发现插件 |
| `PluginManifestModelSupport` | 类型 | EXPERIMENTAL | 清单模型支持 |
| `PluginManifestModelCatalog` | 类型 | EXPERIMENTAL | 清单模型目录 |
| `PluginManifestActivation` | 类型 | EXPERIMENTAL | 清单激活配置 |
| `PluginManifestSetup` | 类型 | EXPERIMENTAL | 清单安装配置 |
| `PluginManifestContracts` | 类型 | EXPERIMENTAL | 清单契约 |
| `PluginManifestValidationResult` | 类型 | EXPERIMENTAL | 验证结果 |
| `LogCollector` | 类 | EXPERIMENTAL | 日志收集器 |
| `definePluginEntry` | 函数 | EXPERIMENTAL | 定义插件入口 |
| `DefinePluginEntryOptions` | 类型 | EXPERIMENTAL | 插件入口选项 |
| `DefinedPluginEntry` | 类型 | EXPERIMENTAL | 已定义入口 |
| `PluginSlotKey` | 类型 | EXPERIMENTAL | 插件插槽键 |
| `normalizeKinds` | 函数 | EXPERIMENTAL | 规范化类型 |
| `hasKind` | 函数 | EXPERIMENTAL | 检查类型 |
| `kindsEqual` | 函数 | EXPERIMENTAL | 比较类型 |
| `slotKeysForPluginKind` | 函数 | EXPERIMENTAL | 获取插槽键 |
| `defaultSlotIdForKey` | 函数 | EXPERIMENTAL | 获取默认插槽 ID |
| `applyExclusiveSlotSelection` | 函数 | EXPERIMENTAL | 应用排他性插槽选择 |

#### INTERNAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `PluginHookType` | 类型 | INTERNAL | Hook 类型 |
| `PluginCapabilityKind` | 类型 | INTERNAL | 能力类型 |
| `PluginToolCapability` | 接口 | INTERNAL | 工具能力 |
| `PluginProviderCapability` | 接口 | INTERNAL | 提供者能力 |
| `PluginHookCapability` | 接口 | INTERNAL | Hook 能力 |
| `PluginMemoryHostCapability` | 接口 | INTERNAL | 内存宿主能力 |
| `PluginChannelCapability` | 接口 | INTERNAL | 通道能力 |
| `PluginModelCatalogCapability` | 接口 | INTERNAL | 模型目录能力 |
| `PluginConfigSchemaCapability` | 接口 | INTERNAL | 配置 schema 能力 |
| `PluginLifecycleCapability` | 接口 | INTERNAL | 生命周期能力 |
| `PluginContractCapability` | 接口 | INTERNAL | 契约能力 |
| `PluginAdapterCapability` | 接口 | INTERNAL | 适配器能力 |
| `PluginHealthCheckCapability` | 接口 | INTERNAL | 健康检查能力 |
| `PluginDiagnosticCapability` | 接口 | INTERNAL | 诊断能力 |
| `PluginTelemetryCapability` | 接口 | INTERNAL | 遥测能力 |
| `PluginCapability` | 类型 | INTERNAL | 能力联合类型 |
| `PluginRuntime` | 接口 | INTERNAL | 插件运行时 |
| `PluginRegistryStats` | 接口 | INTERNAL | 注册表统计 |
| `PluginActivationContext` | 接口 | INTERNAL | 激活上下文 |
| `AdapterCompatConfig` | 类型 | INTERNAL | 适配器兼容配置 |

---

### @cdf-know/skill-core (v1.0.0)

> 依赖：`@cdf-know/plugin-sdk@1.0.0`

#### STABLE API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `SkillRegistry` | 类 | STABLE | 技能注册表，继承 `EventEmitter<SkillRegistryEvents>` |
| `SkillRegistryEvents` | 类型 | STABLE | 技能注册表事件 |
| `skillRegistry` | 常量 | STABLE | 技能注册表单例 |
| `SkillType` | 类型 | STABLE | 技能类型 |
| `SkillTriggerType` | 类型 | STABLE | 技能触发类型 |
| `SkillStatus` | 类型 | STABLE | 技能状态 |
| `SkillScope` | 类型 | STABLE | 技能作用域 |
| `SkillTrigger` | 接口 | STABLE | 技能触发器 |
| `DetectedIntent` | 接口 | STABLE | 检测到的意图 |
| `SkillDefinition` | 接口 | STABLE | 技能定义 |
| `SkillContext` | 接口 | STABLE | 技能上下文 |
| `SkillResult` | 接口 | STABLE | 技能执行结果 |
| `SkillHandler` | 类型 | STABLE | 技能处理器 |
| `SkillLifecycle` | 接口 | STABLE | 技能生命周期 |
| `RegisteredSkill` | 接口 | STABLE | 已注册技能 |
| `SkillExecutionRecord` | 接口 | STABLE | 执行记录 |
| `SkillPermission` | 接口 | STABLE | 技能权限 |
| `SkillConfigSchema` | 接口 | STABLE | 配置 schema |

#### EXPERIMENTAL API

| 导出 | 类型 | 稳定性 | 说明 |
|------|------|--------|------|
| `SkillLoader` | 类 | EXPERIMENTAL | 技能加载器 |
| `SkillLoaderEvents` | 类型 | EXPERIMENTAL | 加载器事件 |
| `SkillLoadOptions` | 类型 | EXPERIMENTAL | 加载选项 |
| `skillLoader` | 常量 | EXPERIMENTAL | 加载器单例 |
| `SecurityScanner` | 类 | EXPERIMENTAL | 安全扫描器 |
| `securityScanner` | 常量 | EXPERIMENTAL | 扫描器单例 |
| `SecurityThreat` | 类型 | EXPERIMENTAL | 安全威胁 |
| `SecurityScanResult` | 类型 | EXPERIMENTAL | 扫描结果 |
| `SecurityScanOptions` | 类型 | EXPERIMENTAL | 扫描选项 |
| `SecurityPattern` | 类型 | EXPERIMENTAL | 安全模式 |
| `VersionManager` | 类 | EXPERIMENTAL | 版本管理器 |
| `versionManager` | 常量 | EXPERIMENTAL | 版本管理器单例 |
| `VersionInfo` | 类型 | EXPERIMENTAL | 版本信息 |
| `VersionUpdate` | 类型 | EXPERIMENTAL | 版本更新 |
| `VersionChange` | 类型 | EXPERIMENTAL | 版本变更 |
| `VersionCompatibilityLevel` | 类型 | EXPERIMENTAL | 版本兼容级别 |
| `AdvancedTriggerEngine` | 类 | EXPERIMENTAL | 高级触发引擎 |
| `advancedTriggerEngine` | 常量 | EXPERIMENTAL | 触发引擎单例 |
| `AdvancedTriggerType` | 类型 | EXPERIMENTAL | 高级触发类型 |
| `SemanticTrigger` | 接口 | EXPERIMENTAL | 语义触发器 |
| `FuzzyTrigger` | 接口 | EXPERIMENTAL | 模糊触发器 |
| `ContextualTrigger` | 接口 | EXPERIMENTAL | 上下文触发器 |
| `CompositeTrigger` | 接口 | EXPERIMENTAL | 组合触发器 |
| `AiClassifierTrigger` | 接口 | EXPERIMENTAL | AI 分类触发器 |
| `KeywordTrigger` | 接口 | EXPERIMENTAL | 关键词触发器 |
| `RegexTrigger` | 接口 | EXPERIMENTAL | 正则触发器 |
| `CommandTrigger` | 接口 | EXPERIMENTAL | 命令触发器 |
| `AdvancedTrigger` | 类型 | EXPERIMENTAL | 高级触发器联合类型 |
| `AdvancedMatch` | 类型 | EXPERIMENTAL | 高级匹配结果 |
| `AdvancedTriggerOptions` | 类型 | EXPERIMENTAL | 高级触发选项 |
| `MatchTriggersOptions` | 接口 | EXPERIMENTAL | 匹配触发器选项 |
| `ScheduleTriggerInfo` | 类型 | EXPERIMENTAL | 定时触发器信息 |

---

## 契约变更流程

### 提议新 STABLE API

1. 以 **EXPERIMENTAL** 等级引入 API
2. 经过至少 **2 个 minor 版本** 或 **3 个月** 的验证期
3. 无重大变更投诉后，提升为 **STABLE**
4. 提升时须在 `packages/contracts/*.d.ts` 中添加契约声明

### 降级 STABLE API

- STABLE API 不得降级为 EXPERIMENTAL 或 INTERNAL
- 如需移除，遵循弃用策略

### 新增 EXPERIMENTAL API

- 可在任意 minor 版本中新增
- 须标注 `@experimental` 注释
- 不须在契约声明文件中登记

### 移除 INTERNAL API

- 随时可移除，无流程要求

---

## 跨包依赖约束

| 包 | 依赖 | 版本约束 | 说明 |
|----|------|----------|------|
| `@cdf-know/agent-core` | `@cdf-know/llm-core` | `^1.0.0` | 仅使用 STABLE API |
| `@cdf-know/skill-core` | `@cdf-know/plugin-sdk` | `^1.0.0` | 使用 STABLE 及部分 EXPERIMENTAL API |

**规则**：

- 跨包依赖应仅使用目标包的 **STABLE** API
- 如需使用 EXPERIMENTAL API，须在依赖包的 package.json 中注明并接受变更风险
- 不得依赖 INTERNAL API
- 跨包版本范围须使用 `^` 前缀（兼容同 major 版本的 minor/patch 变更）

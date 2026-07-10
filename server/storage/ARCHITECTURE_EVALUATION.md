# 存储架构收敛评估报告

## 1. 现状分析

### 1.1 架构概览

当前系统采用**双存储架构**，数据被分散到两种存储后端：

| 存储后端 | 接口 | 实现类 | 数据特征 |
|---------|------|--------|---------|
| SQLite | `IStorageEngine` / `better-sqlite3` 直接调用 | `SQLiteEngine` / 原生 `Database` | 关系型数据，需事务/索引/约束 |
| JSON 文件 | `DocumentStorage` | `WmsFileStorage` / `MemoryDocumentStorage` | 集合式文档数据，低频读写 |
| 直接文件 I/O | `FileStorage`（静态方法） | 无接口抽象 | JSONL 会话日志、Markdown 记忆、JSON5 配置 |

### 1.2 数据分布

#### SQLite 中存储的数据（`~/.cdf-know-clow/chat.db`）

通过 `db-core.ts` → `initChatTables` / `initWmsTables` / `initAutomationTables` / `initMarketplaceTables` / `initProjectTables` / `initPluginTables` / `initGoalTables` / `initWebhookTables` / `initArchiveTables` 初始化：

- **会话表**：sessions（元数据，消息已迁移到 JSONL）、messages 索引等
- **WMS 表**：warehouses、zones、locations、inventory_items、inventory_movements、inventory_transactions、transit_orders、transit_status_history、inbound_records、outbound_records、transfer_orders、replenishment_suggestions、partners
- **自动化表**：automation 相关表
- **市场表**：marketplace 相关表
- **项目表**：project 相关表
- **插件表**：plugin 相关表
- **目标表**：goal 相关表
- **Webhook 表**：webhook 相关表
- **归档表**：archive 相关表

#### JSON 文件中存储的数据（`~/.cdf-know-clow/wms-data/*.json`）

通过 `createDocumentStorage('file')` → `WmsFileStorage` 单例，由 DAO 层使用：

- **warehouse.ts DAO**：`warehouses`、`inventory_items`、`transit_orders`、`transit_status_history`、`inbound_records`、`outbound_records`、`transfer_orders`
- **wmsSkillDao.ts DAO**：`wms_quality_checks`、`wms_inventory_counts`、`wms_outbound_reviews`、`wms_alerts`、`wms_reports`、`wms_replenishment_rules`、`wms_demand_forecasts`、`replenishment_suggestions`、`inventory_transactions`

#### 直接文件 I/O（`~/.cdf-know-clow/` 下各子目录）

通过 `FileStorage` 静态方法，不经过 `DocumentStorage`：

- **会话 JSONL**：`sessions/*.jsonl` — 消息逐行追加
- **归档会话**：`sessions-archived/*.jsonl`
- **记忆文件**：`memory/*.md` — Markdown 格式
- **配置文件**：`config/*.json5` — JSON5 格式

### 1.3 分裂的根源

1. **历史遗留**：系统最初使用 SQLite 存储所有数据。v1.0.76 引入 `WmsFileStorage` 作为 WMS 业务数据的替代存储，但 `initWmsTables(db)` 仍被保留在 `db-core.ts` 中调用，导致 WMS 表的 DDL 仍在 SQLite 中执行（表结构存在但未通过 DAO 使用）。

2. **接口不互通**：`IStorageEngine` 面向 SQL 语义（`prepare`/`exec`/`get`/`all`/`run`/`transaction`），而 `DocumentStorage` 面向集合语义（`list`/`get`/`create`/`update`/`delete`/`find`/`findOne`）。两者无共同父接口，上层 DAO 必须选择其一，无法透明切换。

3. `IStorageEngine` 实际未被使用：`db-core.ts` 直接使用 `better-sqlite3` 的 `Database` 对象，`getStorageEngine()` 已废弃返回 `null`。`SQLiteEngine` 虽实现了 `IStorageEngine`，但在生产代码中仅作为骨架存在。

## 2. 问题分析

### 2.1 双存储漂移（Dual Storage Drift）

**最严重的问题**：WMS 业务数据同时存在于 SQLite 和 JSON 文件中。

- `db-wms.ts:initWmsTables()` 在 SQLite 中创建了 `warehouses`、`inventory_items`、`transit_orders` 等表
- `dao/warehouse.ts` 却通过 `createDocumentStorage('file')` 将同样数据写入 JSON 文件
- 结果：SQLite 中的 WMS 表是空壳（DDL 存在但无数据），实际业务数据在 JSON 文件中

这导致开发者在查询数据时可能查到错误的来源（SQLite 空表 vs JSON 文件）。

### 2.2 一致性风险

1. **跨存储事务不可行**：当业务操作需要同时修改 SQLite 数据和 JSON 文件数据时（如入库操作更新 `inbound_records` + `inventory_items` + `inventory_transactions`），三个集合均在 JSON 文件中尚可勉强原子化，但若涉及 SQLite 中的 partners 表则无法保证原子性。

2. **`warehouse.ts` 中直接绕过 `DocumentStorage` 操作文件系统**：
   - `updateTransitOrder`（行 227-253）：直接 `require('fs')` 读写 `transit_status_history.json`
   - `deleteTransitOrder`（行 259-269）：同样直接操作文件
   - `wmsSkillDao.ts` 的 `adjustInventoryCount`（行 244-249）：直接 `require('fs')` 操作 `inventory_items.json`
   
   这些代码绕过了 `DocumentStorage` 抽象层，直接操作底层文件，破坏了封装性，且无法被测试覆盖。

### 2.3 同步复杂性

- 两套存储各有独立的 ID 生成策略：SQLite 使用 `AUTOINCREMENT`，`DocumentStorage` 使用 `nextId()`（JSON 文件中的 `lastId` 字段）
- 两套数据模型类型定义：SQLite 行类型（如 `WarehouseRow`）与 JSON 文档类型混用
- 查询能力不对等：SQLite 支持复杂 JOIN、索引、约束；JSON 文件仅支持全量扫描 + 谓词过滤
- 迁移困难：`initWmsTables` 中的 SQLite schema 迁移逻辑与 JSON 文件的数据格式演化无关联

### 2.4 接口抽象未被实际使用

`IStorageEngine` 接口及其适配器（`RedisAdapter`、`PostgresAdapter`、`LanceDBAdapter`、`QdrantAdapter`）均为骨架实现，所有方法抛出 `not implemented`。`SQLiteEngine` 虽完整实现，但生产代码中 `db-core.ts` 直接使用 `better-sqlite3` 而非 `SQLiteEngine`。

## 3. 收敛方案

### 方案 A：合并到 SQLite-only

**思路**：将所有 JSON 文件数据迁移到 SQLite，废弃 `DocumentStorage` 和 `WmsFileStorage`。

**优点**：
- 统一事务支持（ACID）
- 查询能力强（JOIN、索引、约束）
- 数据完整性保证（外键、CHECK 约束）
- 迁移路径较直接（`initWmsTables` 已建表）

**缺点**：
- 桌面应用中 SQLite 并发写入受限（虽 WAL 模式可缓解）
- JSON 文件的灵活性优势丢失（动态字段、嵌套结构）
- `FileStorage` 管理的 JSONL 会话日志、Markdown 记忆不适合放入 SQLite
- 迁移工作量最大，需重写所有 DAO

**适用场景**：需要强一致性和复杂查询的生产环境。

### 方案 B：合并到 JSON-only

**思路**：将所有 SQLite 数据迁移到 JSON 文件，废弃 `IStorageEngine` 和 `SQLiteEngine`。

**优点**：
- 数据可读性好（可直接查看 JSON 文件）
- 无数据库依赖，部署简单
- 适合桌面应用场景

**缺点**：
- 无事务支持，数据一致性无法保证
- 查询性能差（全量扫描）
- 无索引、约束、外键
- 并发写入风险（文件锁粒度粗）
- 会话、审计日志等结构化数据不适合 JSON 文件存储

**适用场景**：数据量小、查询简单、无并发要求的轻量场景。

### 方案 C：保留双存储 + 统一访问层（推荐）

**思路**：承认双存储的合理性（关系型数据用 SQLite，文档/日志型数据用文件），但在上层引入统一访问接口 `UnifiedStorage`，让业务代码不直接依赖具体后端。

**优点**：
- 折中方案，迁移成本最低
- 保留各后端优势（SQLite 的事务能力 + JSON 文件的灵活性）
- 渐进式迁移：新接口先行，现有 DAO 逐步迁移
- 可按集合粒度配置后端（某些集合用 SQLite，某些用 JSON）
- 为未来完全收敛提供过渡层

**缺点**：
- 双存储架构仍然存在，需长期维护
- 统一层增加一层间接调用

**适用场景**：需要渐进式迁移、保留灵活性、控制风险的过渡阶段。

## 4. 推荐方案

**推荐方案 C**，理由如下：

1. **现实约束**：`warehouse.ts` 和 `wmsSkillDao.ts` 中大量 DAO 函数直接使用 `DocumentStorage`，立即迁移到 SQLite 需重写全部 DAO，风险高且收益不明确。

2. **数据特性差异**：`FileStorage` 管理的 JSONL 会话日志、Markdown 记忆、JSON5 配置确实不适合放入 SQLite。强行统一到一种后端不符合数据特性。

3. **已有基础**：`DocumentStorage` 接口已统一了 `WmsFileStorage` 和 `MemoryDocumentStorage`，在此基础上引入更高层 `UnifiedStorage` 接口是自然延伸。

4. **渐进式路径**：统一层可以先聚合现有 `DocumentStorage`，后续逐步将 SQLite 操作也纳入统一层，最终实现"上层代码不感知后端"的目标。

## 5. 迁移路径

### 阶段 1：引入统一接口（当前）

- 创建 `UnifiedStorage` 接口，聚合 `DocumentStorage` 和 `IStorageEngine`
- 提供 `createUnifiedStorage(config)` 工厂函数
- 在 `index.ts` 中导出
- 编写测试验证

### 阶段 2：清理 WMS 表冗余 DDL

- 从 `db-core.ts:initDb()` 中移除 `initWmsTables(db)` 调用（WMS 数据已通过 JSON 文件存储，SQLite 表为空壳）
- 保留 `db-wms.ts` 中的类型定义（`WarehouseRow` 等），供 DAO 使用
- 注意：`partners` 表可能仍有代码通过 SQLite 访问，需确认后单独处理

### 阶段 3：修复 DAO 中的直接文件操作

- `warehouse.ts:updateTransitOrder` / `deleteTransitOrder`：用 `DocumentStorage` API 替换直接 `fs` 操作
- `wmsSkillDao.ts:adjustInventoryCount`：同上
- 目标：所有 DAO 操作经过 `DocumentStorage`，不再直接 `require('fs')`

### 阶段 4：DAO 层迁移到 UnifiedStorage

- 新 DAO 使用 `UnifiedStorage` 接口
- 现有 DAO 逐步从 `createDocumentStorage()` 迁移到 `createUnifiedStorage()`
- 在迁移过程中保持行为一致

### 阶段 5：按需配置后端

- 通过 `UnifiedStorageConfig` 指定每个集合使用哪个后端
- 高频写入的集合可迁移到 SQLite 后端
- 低频读写的集合保留 JSON 文件后端
- 最终实现"上层代码不感知后端"的目标

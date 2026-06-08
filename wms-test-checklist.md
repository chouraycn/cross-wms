# WMS 技能系统 — 手动测试检查清单

> 创建时间：2026-06-07 | QA：严过关
>
> 本文档覆盖两个 P0 功能的手动测试场景：
> - 功能 1：WMS 行业技能包（5 个内置技能）
> - 功能 2：SKILL.md 开放标准兼容

---

## 一、WMS 行业技能包

### 1.1 入库质检（/api/wms/quality）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| Q-01 | 创建质检记录（正常） | POST /api/wms/quality, body: `{warehouseId, sku, productName, batchNo, expectedQuantity, actualQuantity, qualityStatus: "pending"}` | 201，返回完整质检记录，qualityStatus=pending | ☐ |
| Q-02 | 创建质检记录（缺失 warehouseId） | POST /api/wms/quality, body: `{sku: "SKU-001"}` | 400，message 包含"缺少必填字段" | ☐ |
| Q-03 | 创建质检记录（缺失 sku） | POST /api/wms/quality, body: `{warehouseId: "WH-001"}` | 400，message 包含"缺少必填字段" | ☐ |
| Q-04 | 创建质检记录（默认状态） | POST /api/wms/quality, body 不含 qualityStatus | 201，qualityStatus 默认为 "pending" | ☐ |
| Q-05 | 创建质检记录（状态=qualified） | POST 设置 qualityStatus="qualified" | 201，qualityStatus=qualified | ☐ |
| Q-06 | 创建质检记录（状态=unqualified） | POST 设置 qualityStatus="unqualified" | 201，qualityStatus=unqualified | ☐ |
| Q-07 | 查询所有质检记录 | GET /api/wms/quality | 200，返回数组 | ☐ |
| Q-08 | 按仓库筛选质检 | GET /api/wms/quality?warehouseId=WH-001 | 200，只返回该仓库记录 | ☐ |
| Q-09 | 按质检状态筛选 | GET /api/wms/quality?qualityStatus=pending | 200，只返回 pending 记录 | ☐ |
| Q-10 | 按 SKU 模糊搜索 | GET /api/wms/quality?sku=SKU | 200，返回匹配记录 | ☐ |
| Q-11 | 查询单条质检记录（存在） | GET /api/wms/quality/:id | 200，返回该记录 | ☐ |
| Q-12 | 查询单条质检记录（不存在） | GET /api/wms/quality/99999 | 404，"质检记录不存在" | ☐ |
| Q-13 | 查询单条质检记录（无效ID） | GET /api/wms/quality/abc | 400，"无效的 ID" | ☐ |
| Q-14 | 更新质检记录（正常） | PUT /api/wms/quality/:id, body: `{qualityStatus: "qualified", notes: "合格"}` | 200，返回更新后记录 | ☐ |
| Q-15 | 更新质检记录（不存在） | PUT /api/wms/quality/99999 | 404 | ☐ |
| Q-16 | 更新质检记录（无效ID） | PUT /api/wms/quality/xyz | 400 | ☐ |
| Q-17 | 质检状态切换（pending→unqualified） | PUT 设置 qualityStatus="unqualified" | 200，状态已变更 | ☐ |
| Q-18 | 删除质检记录（存在） | DELETE /api/wms/quality/:id | 200 | ☐ |
| Q-19 | 删除质检记录（不存在） | DELETE /api/wms/quality/99999 | 404 | ☐ |

### 1.2 库存盘点（/api/wms/inventory-count）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| I-01 | 创建盘点记录（正常） | POST /api/wms/inventory-count, body: `{warehouseId, locationCode, sku, systemQuantity: 100, actualQuantity: 95}` | 201，variance=-5（盘亏） | ☐ |
| I-02 | 创建盘点记录（盘盈） | POST, systemQuantity=50, actualQuantity=60 | 201，variance=10（盘盈） | ☐ |
| I-03 | 创建盘点记录（缺失 warehouseId） | POST, 不含 warehouseId | 400，"缺少必填字段" | ☐ |
| I-04 | 创建盘点记录（缺失 locationCode） | POST, 不含 locationCode | 400 | ☐ |
| I-05 | 创建盘点记录（缺失 sku） | POST, 不含 sku | 400 | ☐ |
| I-06 | 查询所有盘点记录 | GET /api/wms/inventory-count | 200，返回数组 | ☐ |
| I-07 | 按状态筛选 | GET /api/wms/inventory-count?status=confirmed | 200 | ☐ |
| I-08 | 按仓库筛选 | GET /api/wms/inventory-count?warehouseId=WH-001 | 200 | ☐ |
| I-09 | 查询单条盘点记录 | GET /api/wms/inventory-count/:id | 200 | ☐ |
| I-10 | 查询不存在的盘点 | GET /api/wms/inventory-count/99999 | 404 | ☐ |
| I-11 | 更新盘点记录 | PUT /api/wms/inventory-count/:id, body: `{status: "confirmed"}` | 200，状态变更 | ☐ |
| I-12 | 更新不存在的盘点 | PUT /api/wms/inventory-count/99999 | 404 | ☐ |
| I-13 | 调整库存（确认盘点） | POST /api/wms/inventory-count/adjust, body: `{id, adjustedBy}` | 200，status=adjusted | ☐ |
| I-14 | 调整库存（缺失 id） | POST /api/wms/inventory-count/adjust, 不含 id | 400 | ☐ |
| I-15 | 调整库存（无效 id） | POST /api/wms/inventory-count/adjust, id="abc" | 400 | ☐ |
| I-16 | 调整库存（不存在） | POST /api/wms/inventory-count/adjust, id=99999 | 404 | ☐ |
| I-17 | 盘点状态流转（pending→confirmed→adjusted） | 先 PUT 改为 confirmed，再 POST /adjust | 状态按序变化 | ☐ |

### 1.3 出库复核（/api/wms/outbound-review）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| O-01 | 创建复核记录（正常） | POST /api/wms/outbound-review, body: `{outboundOrderId, warehouseId, sku, expectedQuantity: 50, scannedQuantity: 0}` | 201，reviewStatus=pending | ☐ |
| O-02 | 创建复核记录（缺失 outboundOrderId） | POST, 不含 outboundOrderId | 400 | ☐ |
| O-03 | 创建复核记录（缺失 warehouseId） | POST, 不含 warehouseId | 400 | ☐ |
| O-04 | 创建复核记录（缺失 sku） | POST, 不含 sku | 400 | ☐ |
| O-05 | 创建复核记录（已通过） | POST, reviewStatus="passed", scannedQuantity=expectedQuantity | 201 | ☐ |
| O-06 | 查询所有复核记录 | GET /api/wms/outbound-review | 200 | ☐ |
| O-07 | 按复核状态筛选 | GET /api/wms/outbound-review?reviewStatus=passed | 200 | ☐ |
| O-08 | 按出库单号筛选 | GET /api/wms/outbound-review?outboundOrderId=OUT-001 | 200 | ☐ |
| O-09 | 查询单条复核记录 | GET /api/wms/outbound-review/:id | 200 | ☐ |
| O-10 | 查询不存在的复核 | GET /api/wms/outbound-review/99999 | 404 | ☐ |
| O-11 | 扫描模拟（更新 scannedQuantity） | PUT /api/wms/outbound-review/:id, body: `{scannedQuantity: 50, reviewStatus: "passed"}` | 200，scannedQuantity=50 | ☐ |
| O-12 | 更新不存在的复核 | PUT /api/wms/outbound-review/99999 | 404 | ☐ |

### 1.4 异常预警（/api/wms/alerts）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| A-01 | 创建预警（正常） | POST /api/wms/alerts, body: `{warehouseId, alertType: "low_stock", message, severity: "high"}` | 201，status=active | ☐ |
| A-02 | 创建预警（缺失 warehouseId） | POST, 不含 warehouseId | 400 | ☐ |
| A-03 | 创建预警（缺失 alertType） | POST, 不含 alertType | 400 | ☐ |
| A-04 | 创建预警（缺失 message） | POST, 不含 message | 400 | ☐ |
| A-05 | 创建临期预警 | POST, alertType="expiry" | 201 | ☐ |
| A-06 | 创建呆滞预警 | POST, alertType="stagnant" | 201 | ☐ |
| A-07 | 默认严重程度 | POST, 不含 severity | 201，severity="medium" | ☐ |
| A-08 | 查询所有预警 | GET /api/wms/alerts | 200 | ☐ |
| A-09 | 按类型筛选 | GET /api/wms/alerts?alertType=expiry | 200 | ☐ |
| A-10 | 按状态筛选 | GET /api/wms/alerts?status=active | 200 | ☐ |
| A-11 | 按严重程度筛选 | GET /api/wms/alerts?severity=critical | 200 | ☐ |
| A-12 | 按仓库筛选 | GET /api/wms/alerts?warehouseId=WH-001 | 200 | ☐ |
| A-13 | 解决预警（resolved） | PUT /api/wms/alerts/:id/resolve, body: `{resolution: "resolved"}` | 200，status=resolved | ☐ |
| A-14 | 忽略预警（ignored） | PUT /api/wms/alerts/:id/resolve, body: `{resolution: "ignored"}` | 200，status=ignored | ☐ |
| A-15 | 无效的 resolution | PUT /api/wms/alerts/:id/resolve, body: `{resolution: "invalid"}` | 400，"resolved 或 ignored" | ☐ |
| A-16 | 解决不存在的预警 | PUT /api/wms/alerts/99999/resolve | 404 | ☐ |
| A-17 | 手动触发预警检查 | POST /api/wms/alerts/check, body: `{warehouseId, lowStockThreshold: 5}` | 200，返回 newAlertCount | ☐ |
| A-18 | 全局预警检查 | POST /api/wms/alerts/check, body: `{}` | 200 | ☐ |

### 1.5 报表生成（/api/wms/reports）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| R-01 | 生成库存报表 | POST /api/wms/reports/generate, body: `{reportType: "inventory", warehouseId: "WH-001"}` | 201，status=completed，fileFormat=csv | ☐ |
| R-02 | 生成入库报表 | POST /api/wms/reports/generate, body: `{reportType: "inbound"}` | 201，status=pending | ☐ |
| R-03 | 生成出库报表 | POST /api/wms/reports/generate, body: `{reportType: "outbound"}` | 201，status=pending | ☐ |
| R-04 | 生成自定义报表 | POST /api/wms/reports/generate, body: `{reportType: "custom", startDate, endDate}` | 201 | ☐ |
| R-05 | 缺失 reportType | POST /api/wms/reports/generate, 不含 reportType | 400，"reportType" | ☐ |
| R-06 | 查询所有报表 | GET /api/wms/reports | 200 | ☐ |
| R-07 | 按类型筛选 | GET /api/wms/reports?reportType=inventory | 200 | ☐ |
| R-08 | 按仓库筛选 | GET /api/wms/reports?warehouseId=WH-001 | 200 | ☐ |
| R-09 | 按状态筛选 | GET /api/wms/reports?status=completed | 200 | ☐ |
| R-10 | 查询单条报表 | GET /api/wms/reports/:id | 200 | ☐ |
| R-11 | 查询不存在的报表 | GET /api/wms/reports/99999 | 404 | ☐ |
| R-12 | 下载报表文件 | GET /api/wms/reports/:id/download | 200，Content-Type=text/csv，文件内容正确 | ☐ |
| R-13 | 下载不存在的报表 | GET /api/wms/reports/99999/download | 404 | ☐ |
| R-14 | CSV 文件包含 BOM（UTF-8） | 检查下载的 CSV 文件 | 文件以 UTF-8 编码，中文正常显示 | ☐ |

---

## 二、SKILL.md 开放标准兼容

### 2.1 skillMdParser（SKILL.md 解析器）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| S-01 | 解析标准 YAML frontmatter | 输入包含 `---\nname: test\n---` 的 SKILL.md | 正确提取 name、description 等字段 | ☐ |
| S-02 | 提取代码块/指令块 | 输入包含 \`\`\` 代码块的 SKILL.md | 正确解析代码块语言和内容 | ☐ |
| S-03 | 提取 Markdown 标题层级 | 解析 `# Title` `## Section` | 正确构建标题树 | ☐ |
| S-04 | 解析非标准 frontmatter（缺失字段） | 输入无 tags 字段的 SKILL.md | 空数组默认值，不报错 | ☐ |
| S-05 | 解析空文件 | 输入空字符串 | 返回空字段的默认值，不报错 | ☐ |

### 2.2 StandardSkillInstaller（标准技能安装器）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| I-01 | 安装标准技能（正常流程） | 选择 .md 文件，确认安装 | 技能安装成功，出现在列表中 | ☐ |
| I-02 | 安装时显示依赖检查结果 | 选择有未安装依赖的技能 | 显示缺失依赖警告 | ☐ |
| I-03 | 安装时显示权限确认 | 选择声明了权限的技能 | 弹出权限对话框，需用户确认 | ☐ |
| I-04 | 取消安装 | 在权限对话框点取消 | 技能不安装，状态不变 | ☐ |

### 2.3 SkillDependencyChecker（依赖检查组件）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| D-01 | 显示已安装依赖（绿色勾） | 加载有依赖的技能 | 已安装的依赖显示 ✓ | ☐ |
| D-02 | 显示缺失依赖（红色叉） | 加载有依赖的技能 | 未安装的依赖显示 ✗ | ☐ |
| D-03 | 无依赖技能 | 加载无 dependencies 声明的技能 | 显示"无依赖"或跳过 | ☐ |
| D-04 | 版本号不匹配警告 | 依赖版本与已安装版本不一致 | 显示黄色警告 | ☐ |

### 2.4 SkillPermissionDialog（权限确认对话框）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| P-01 | 显示文件访问权限声明 | 技能声明需要读取文件 | 对话框列出文件访问权限 | ☐ |
| P-02 | 显示网络请求权限声明 | 技能声明需要网络访问 | 对话框列出网络权限 | ☐ |
| P-03 | 显示命令执行权限声明 | 技能声明需要执行命令 | 对话框用红色高亮标记 | ☐ |
| P-04 | 确认安装 | 点击"确认安装" | 执行安装流程 | ☐ |
| P-05 | 拒绝安装 | 点击"取消" | 关闭对话框，不安装 | ☐ |

### 2.5 CategoryMapper（类别映射组件）

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| C-01 | 自动映射已知类别 | SKILL.md 包含 `category: wms` | 正确映射到 WMS 类别 ID | ☐ |
| C-02 | 从 tags 推断类别 | SKILL.md tags 包含 "data" | 自动推断为"数据处理"类别 | ☐ |
| C-03 | 未知类别回退 | SKILL.md 声明未知类别 | 使用"其他"类别，不报错 | ☐ |
| C-04 | 中文类别名映射 | SKILL.md 使用中文类别名 | 正确映射到对应 ID | ☐ |

---

## 三、跨功能集成测试

| # | 测试场景 | 测试步骤 | 预期结果 | 结果 |
|---|---------|---------|---------|------|
| X-01 | 完整质检→盘点→复核→预警→报表流程 | 依次执行五个技能的所有操作 | 数据在各模块间一致 | ☐ |
| X-02 | 并发请求 | 同时发送多个 POST 请求 | 无死锁，数据一致性保持 | ☐ |
| X-03 | 服务重启后数据持久化 | 重启服务器后查询之前创建的数据 | 数据完整保留 | ☐ |
| X-04 | API 响应格式一致性 | 检查所有接口的 JSON 结构 | 统一 `{code, data, message}` 格式 | ☐ |

---

## 备注

- 所有自动化测试已通过（351/351），本清单用于补充手动验证
- 高优先级标记 ⚡ 的测试用例需优先完成
- 发现 Bug 请在 `QA_Test_Report.md` 中记录

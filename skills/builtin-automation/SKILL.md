---
name: 自动化调度
description: 周期执行、一次性任务、有效期管理与执行历史
version: "1.0"
metadata:
  crosswms:
    category: auto
    icon: Bolt
    tags:
      - 自动化
      - 调度
    trigger: 创建自动化 / 调度任务
    executionMode: hybrid
    source: builtin
    featured: true
    status: active
---

# 自动化调度

你是 CDF Know Clow 自动化调度助手。你需要帮助用户：1）创建和配置自动化任务（周期/一次性/动作链）；2）设置任务有效期与执行频率；3）排查任务执行失败原因并建议修复方案；4）优化任务调度避免资源冲突。支持的任务类型：数据同步(data-sync)、库存快照(inventory-snapshot)、报表生成(report-gen)、容积率预警(volume-alert)、自定义(custom)。动作链支持串行组合多个 Action。

## 工作流程

### 1. 创建周期任务

```bash
# 创建每日库存快照任务
POST /api/automation/tasks
{
  "name": "每日库存快照",
  "type": "inventory-snapshot",
  "schedule": {
    "type": "cron",
    "expression": "0 2 * * *",
    "timezone": "Asia/Shanghai"
  },
  "params": {
    "warehouse_ids": ["WH-SH-001", "WH-SZ-001"],
    "include_aging": true
  },
  "validity": {
    "start_date": "2026-07-20",
    "end_date": "2026-12-31"
  },
  "notify_on": ["failure", "success"]
}

# 创建每周报表任务
POST /api/automation/tasks
{
  "name": "周出入库报表",
  "type": "report-gen",
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * 1"
  },
  "params": {
    "report_type": "inbound_outbound",
    "period": "last_7d",
    "recipients": ["manager@example.com"]
  }
}
```

### 2. 创建动作链

```bash
# 多步骤动作链：快照 → 分析 → 预警
POST /api/automation/workflows
{
  "name": "库存健康检查",
  "steps": [
    {
      "step": 1,
      "action": "inventory-snapshot",
      "params": { "warehouse_ids": ["all"] }
    },
    {
      "step": 2,
      "action": "aging-analysis",
      "depends_on": [1],
      "params": { "threshold_days": 90 }
    },
    {
      "step": 3,
      "action": "send-alert",
      "depends_on": [2],
      "params": {
        "channels": ["email", "webhook"],
        "template": "aging_alert"
      }
    }
  ],
  "schedule": { "type": "cron", "expression": "0 3 * * *" }
}
```

### 3. 任务管理与监控

```bash
# 查看任务列表
GET /api/automation/tasks?status=active&page=1&limit=20

# 查看执行历史
GET /api/automation/tasks/{taskId}/history?limit=10
# 返回：执行时间、状态、耗时、输出摘要

# 暂停/恢复任务
PUT /api/automation/tasks/{taskId}/status
{ "status": "paused" }  // paused | active | disabled

# 手动触发
POST /api/automation/tasks/{taskId}/trigger
{ "params": { "override": true } }
```

## 支持的调度表达式

| 场景 | Cron 表达式 | 说明 |
|------|------------|------|
| 每小时 | `0 * * * *` | 整点执行 |
| 每天凌晨2点 | `0 2 * * *` | 避开业务高峰 |
| 每周一早9点 | `0 9 * * 1` | 周报表 |
| 每月1号 | `0 3 1 * *` | 月度快照 |
| 每15分钟 | `*/15 * * * *` | 高频同步 |

## 最佳实践

### 任务设计原则

1. **错峰执行**
   - 数据同步：安排在业务低峰期（02:00-06:00）
   - 报表生成：安排在上班前（08:00-09:00）
   - 避免多个重任务同时执行

2. **错误处理**
   - 设置失败重试（最多3次，间隔5分钟）
   - 连续失败3次后自动暂停并通知
   - 重要任务设置短信/电话告警

3. **有效期管理**
   - 临时任务设置明确的结束日期
   - 季度性任务（如大促）设置有效期
   - 长期任务每年复核一次必要性

### 动作链设计

```
[触发器] → [数据准备] → [业务处理] → [通知]

示例：库存预警链
  cron(每小时) → inventory-snapshot → aging-check → send-alert
```

## 常见问题

**Q: 任务执行失败了怎么排查？**

A: 1) 查看执行日志 `/api/automation/tasks/{id}/logs`；2) 检查参数是否正确；3) 确认依赖服务（数据库/API）是否可用；4) 手动触发测试。

**Q: 多个任务可以并行执行吗？**

A: 可以，但建议限制同一仓库的并发任务数（默认最多2个），避免资源争抢。

## Guardrails

- 任务执行超时：默认30分钟，超时时强制终止
- 资源限制：单任务内存 ≤ 512MB，CPU ≤ 1核
- 失败通知：连续失败3次后升级告警级别
- 审计要求：所有任务执行记录保留90天

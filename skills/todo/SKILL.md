---
name: todo
description: 待办事项管理，支持创建、完成、列出和搜索任务
version: 0.1.0
metadata:
  crosswms:
    category: general
    trigger: keyword:待办 / keyword:todo / keyword:任务 / keyword:清单
    executionMode: agent
    source: workspace
    status: active
---

# Todo 待办事项

管理个人待办事项列表，支持创建、完成、列出和搜索任务。

## 何时使用

当用户需要：
- 添加新任务
- 标记任务完成
- 查看任务列表
- 搜索特定任务
- 删除任务

## 工作流程

1. 理解用户需求（添加/完成/查看/搜索/删除）
2. 获取任务内容或关键词
3. 执行相应操作
4. 返回操作结果

## 任务存储

任务存储在 `~/.crosswms/todo.json` 文件中。

## 数据格式

```json
[
  {
    "id": 1,
    "title": "完成项目报告",
    "completed": false,
    "createdAt": "2024-01-15T10:00:00Z",
    "priority": "high"
  }
]
```

## 操作命令

```bash
# 查看任务列表
cat ~/.crosswms/todo.json | jq '.[] | select(.completed == false)'

# 添加任务
jq '. += [{"id": 2, "title": "新任务", "completed": false}]' ~/.crosswms/todo.json > tmp.json && mv tmp.json ~/.crosswms/todo.json

# 标记完成
jq '(.[] | select(.id == 1)).completed = true' ~/.crosswms/todo.json > tmp.json && mv tmp.json ~/.crosswms/todo.json
```

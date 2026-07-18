---
name: trello
description: "通过 Trello REST API 管理看板（boards）、列表（lists）和卡片（cards）。"
homepage: https://developer.atlassian.com/cloud/trello/rest/
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "requires": { "bins": ["curl", "jq"], "env": ["TRELLO_API_KEY", "TRELLO_TOKEN"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "jq",
              "bins": ["jq"],
              "label": "Install jq (brew)",
            },
          ],
      },
  }
---

# Trello 技能

通过 Trello REST API 直接管理看板、列表和卡片。

## 配置

1. 获取 API key：https://trello.com/app-key
2. 生成 token（在该页面点击 "Token" 链接）
3. 设置环境变量：

```bash
export TRELLO_API_KEY="your-api-key"
export TRELLO_TOKEN="your-token"
```

## 用法

所有命令通过 curl 调用 Trello REST API。

### 列出看板

```bash
curl -s "https://api.trello.com/1/members/me/boards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" | jq '.[] | {name, id}'
```

### 列出看板中的列表

```bash
curl -s "https://api.trello.com/1/boards/{boardId}/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" | jq '.[] | {name, id}'
```

### 列出列表中的卡片

```bash
curl -s "https://api.trello.com/1/lists/{listId}/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" | jq '.[] | {name, id, desc}'
```

### 创建卡片

```bash
curl -s -X POST "https://api.trello.com/1/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "idList={listId}" \
  -d "name=Card Title" \
  -d "desc=Card description"
```

### 移动卡片到其他列表

```bash
curl -s -X PUT "https://api.trello.com/1/cards/{cardId}?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "idList={newListId}"
```

### 给卡片添加评论

```bash
curl -s -X POST "https://api.trello.com/1/cards/{cardId}/actions/comments?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "text=Your comment here"
```

### 归档卡片

```bash
curl -s -X PUT "https://api.trello.com/1/cards/{cardId}?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "closed=true"
```

## 说明

- Board/List/Card ID 可在 Trello URL 中找到，或通过上述列表命令获取。
- API key 与 token 拥有 Trello 账号的完整访问权限，务必妥善保管，切勿泄露。
- 频率限制：每个 API key 每 10 秒 300 次请求；每个 token 每 10 秒 100 次请求；`/1/members` 接口限制为每 900 秒 100 次请求。

## 示例

```bash
# 获取所有看板
curl -s "https://api.trello.com/1/members/me/boards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&fields=name,id" | jq

# 按名称查找特定看板
curl -s "https://api.trello.com/1/members/me/boards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" | jq '.[] | select(.name | contains("Work"))'

# 获取看板上的所有卡片
curl -s "https://api.trello.com/1/boards/{boardId}/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" | jq '.[] | {name, list: .idList}'
```

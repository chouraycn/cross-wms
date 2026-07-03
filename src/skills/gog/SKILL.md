---
name: GOG 游戏平台
id: gog
description: 通过 GOG Web API 查询游戏目录、搜索、商品详情与个人游戏库
group: integration
requires: {}
userInvocable: true
gate: auto
sandboxScope: read
---

使用 GOG Web API 查询游戏库与目录。商品详情、目录搜索为公共接口，无需认证；查询个人已拥有游戏库需 OAuth 授权。

## 目录搜索

```bash
curl -sS "https://www.gog.com/games/ajax/filtered?mediaType=game&search=witcher" \
  | jq '.products[] | {title, slug, price: .price.finalAmount}'
```

或使用 catalog API：

```bash
curl -sS "https://catalog.gog.com/v1/catalog?query=cyberpunk&order=desc:title&limit=10" \
  | jq '.products[] | {title, slug, id}'
```

## 游戏详情

通过商品 ID 查询详情（公共，无需认证）：

```bash
curl -sS "https://api.gog.com/products/1207666663?expand=description,screenshots,videos,downloads" \
  | jq '{title, downloads: .downloads[].name}'
```

商品 ID 可从搜索结果，或商店页 URL `https://www.gog.com/game/<slug>` 获取。

## 嵌入 API

```bash
curl -sS "https://embed.gog.com/games/ajax/filtered?mediaType=game&q=<query>"
```

## 个人游戏库

查询已拥有游戏需 OAuth 凭据（与 GOG GALAXY 客户端相同的账户）：

```bash
curl -sS "https://embed.gog.com/user/data/games" \
  -H "Authorization: Bearer $GOG_TOKEN"
```

## 说明

- 公共接口：商品详情、目录搜索无需认证。
- 个人库/愿望单/订单需 OAuth `Authorization: Bearer <token>`。
- 脚本场景优先用 `jq` 解析 JSON，分页使用 `page` 参数。
- 价格字段随地区货币变化，注意 `Country` 请求头。
- 仅查询，不触发购买或下载。

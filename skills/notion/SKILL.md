---
name: notion
description: Notion CLI/API，用于管理页面、Markdown 内容、数据源、文件、评论、搜索、Workers 及原始 API 调用。
version: 1.0.0
homepage: https://developers.notion.com/cli/get-started/overview
metadata:
  openclaw:
    emoji: 📝
    requires:
      anyBins:
        - ntn
        - curl
    install:
      - id: node
        kind: node
        package: ntn
        bins:
          - ntn
        label: Install official Notion CLI (npm)
  crosswms:
    category: general
    executionMode: agent
    source: workspace
    status: active
---

# Notion

优先使用官方 `ntn` CLI。仅在 `ntn` 不可用或原始请求更清晰时才使用 curl。

## 配置

```bash
npm install -g ntn
ntn --version
ntn login
```

脚本/无头认证：

```bash
export NOTION_API_TOKEN=secret_or_ntn_token
export NOTION_API_VERSION=2026-03-11
```

`ntn api` 会自动设置 `Authorization` 和 `Notion-Version`。默认使用 CLI 登录信息，设置 `NOTION_API_TOKEN` 时则使用该 token。

## 查看

```bash
ntn doctor
ntn api ls
ntn api ls --json
ntn api v1/comments --help
ntn api v1/comments --spec -X POST
ntn api v1/comments --docs -X POST
```

## 页面

Markdown 优先的辅助命令：

```bash
ntn pages get <page-id>
ntn pages get <page-id> --json
ntn pages create --parent page:<page-id> --content '# Title\n\nBody'
ntn pages create --parent data-source:<data-source-id> < page.md
ntn pages update <page-id> --content '# Updated'
ntn pages update <page-id> < page.md
ntn pages trash <page-id> --yes
```

注意事项：

- `pages get` 以 Markdown 输出，页面属性作为 frontmatter 呈现。
- 内容输入：`--content`、stdin，或 TTY 下的编辑器。
- 父级引用：`page:<id>`、`database:<id>`、`data-source:<id>`。
- 完整属性/模板/Pages API 请使用 `ntn api v1/pages`。

## 数据源

```bash
ntn datasources resolve <database-id>
ntn datasources resolve <database-id> --json
ntn datasources query <data-source-id>
ntn datasources query <data-source-id> --limit 50 --json
ntn datasources query <data-source-id> --sort 'Date desc'
ntn datasources query <data-source-id> --filter '{"property":"Done","checkbox":{"equals":true}}'
```

有 database ID 时用 `resolve`；查询需要 data source ID。

## 原始 API

```bash
ntn api v1/users/me
ntn api v1/search query=roadmap page_size:=10
ntn api v1/pages 'parent[data_source_id]='"$DS_ID" 'properties[Name][title][0][text][content]=New item'
ntn api "v1/pages/$PAGE_ID" -X PATCH in_trash:=true
ntn api "v1/blocks/$PAGE_ID/children" -X PATCH \
  'children[0][type]=paragraph' \
  'children[0][paragraph][rich_text][0][text][content]=Hello'
```

输入语法：

- `path=value`：字符串 body 字段。
- `path:=json`：类型化 JSON body 字段。
- `name==value`：查询参数。
- `Header:Value`：请求头。
- 较大 body 用 `--data '<json>'` 或 stdin JSON。
- 每个请求只能有一个 body 来源。

## 文件

```bash
ntn files create < image.png
ntn files create --filename photo.png --content-type image/png < /tmp/photo
ntn files create --external-url https://example.com/photo.png
ntn files get <upload-id>
ntn files list
```

## Workers

```bash
ntn workers new
ntn workers deploy
ntn workers list --json
ntn workers runs list --json
ntn workers runs logs <run-id>
```

Workers 可能需要 Business/Enterprise 套餐及工作区开启。

## Curl 回退

```bash
curl -sS "https://api.notion.com/v1/users/me" \
  -H "Authorization: Bearer $NOTION_API_TOKEN" \
  -H "Notion-Version: 2026-03-11" \
  -H "Content-Type: application/json"
```

## 版本说明

- 当前最新 API 版本：`2026-03-11`。
- 使用 `in_trash`，而非 `archived`。
- 追加 block 定位使用 `position`，而非扁平 `after`。
- `transcription` block 已更名为 `meeting_notes`。
- Databases 可包含多个 data sources；页面父级一般使用 `data_source_id`。

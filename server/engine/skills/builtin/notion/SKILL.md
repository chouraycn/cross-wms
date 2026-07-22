---
name: notion
description: "Work with Notion databases and pages via the `notion` CLI (or REST API fallback)."
homepage: https://developers.notion.com
description: "Search Notion, create/edit pages, and read databases."
metadata: { "openclaw": { "emoji": "📋", "requires": { "bins": ["notion"] } } }
---

# Notion

Use the `notion` CLI or curl-based API calls to interact with Notion.

## Requirements

- Notion integration token: `NOTION_TOKEN` environment variable.
- Or `notion` CLI configured: `notion config token YOUR_TOKEN`.

## Search

```bash
notion search "meeting notes"
```

## Databases

```bash
notion db list
notion db query DATABASE_ID
```

## Pages

```bash
notion page create --parent DATABASE_ID --property "Name=My page"
notion page get PAGE_ID
notion page update PAGE_ID --property "Status=Done"
```

## Blocks

```bash
notion block get PAGE_ID
notion block append PAGE_ID --content "New paragraph"
```

---
name: obsidian
description: "Work with Obsidian vaults using the official obsidian CLI: read/search/create/edit notes, tasks, links, properties, plugins."
homepage: https://obsidian.md/cli
metadata: { "openclaw": { "emoji": "💎", "requires": { "bins": ["obsidian"] } } }
---

# Obsidian

Use the official `obsidian` CLI for Obsidian vault work. Vault files are plain Markdown, so direct file edits are still fine when safer/faster.

## Requirements

- Obsidian 1.12.7+ installed.
- Settings -> General -> Command line interface enabled.
- `obsidian` registered on PATH.
- Obsidian app running; the CLI connects to the running app.

## Common commands

Open/read:

```bash
obsidian open file=Recipe
obsidian read file=Recipe
```

Search:

```bash
obsidian search query="TODO" matches
obsidian search query="status::active" format=json
```

Create/modify:

```bash
obsidian create name="New Note"
obsidian append file=Note content="New line"
obsidian prepend file=Note content="After frontmatter"
```

Daily/tasks:

```bash
obsidian daily
obsidian tasks all todo
```

Properties/links:

```bash
obsidian property:read file=Note name=status
obsidian property:set file=Note name=status value=done
obsidian backlinks file=Note
```

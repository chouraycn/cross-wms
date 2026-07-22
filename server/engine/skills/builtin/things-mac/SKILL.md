---
name: things-mac
description: "Add, update, list, search, or inspect Things 3 todos, inbox, today, projects, areas, and tags on macOS."
homepage: https://github.com/ossianhempel/things3-cli
metadata:
  {
    "openclaw":
      {
        "emoji": "✅",
        "os": ["darwin"],
        "requires": { "bins": ["things"] },
        "install":
          [
            {
              "id": "go",
              "kind": "go",
              "module": "github.com/ossianhempel/things3-cli/cmd/things@latest",
              "bins": ["things"],
              "label": "Install things3-cli (go)",
            },
          ],
      },
  }
---

# Things 3 CLI

Use `things` to read your local Things database and to add/update todos via the Things URL scheme.

## Read-only

```bash
things inbox --limit 50
things today
things upcoming
things search "query"
things projects
things areas
things tags
```

## Write

```bash
things add "Buy milk"
things add "Book flights" --list "Travel" --when today
things update --id <UUID> --auth-token <TOKEN> --completed
```

## Notes

- macOS-only. Grant Full Disk Access to the calling app.
- Use `--dry-run` to preview URLs without executing.
- Set `THINGS_AUTH_TOKEN` to avoid passing `--auth-token` for updates.

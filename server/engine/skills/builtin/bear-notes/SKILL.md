---
name: bear-notes
description: "Create, search, and manage Bear notes via grizzly CLI."
homepage: https://bear.app
metadata:
  {
    "openclaw":
      {
        "emoji": "🐻",
        "os": ["darwin"],
        "requires": { "bins": ["grizzly"] },
        "install":
          [
            {
              "id": "go",
              "kind": "go",
              "module": "github.com/tylerwince/grizzly/cmd/grizzly@latest",
              "bins": ["grizzly"],
              "label": "Install grizzly (go)",
            },
          ],
      },
  }
---

# Bear Notes

Use `grizzly` to create, read, and manage notes in Bear on macOS.

## Common Commands

```bash
echo "Note content" | grizzly create --title "My Note" --tag work
grizzly open-note --id "NOTE_ID" --enable-callback --json
echo "More content" | grizzly add-text --id "NOTE_ID" --mode append
grizzly tags --enable-callback --json
grizzly open-tag --name "work" --enable-callback --json
```

## Notes

- Bear app must be installed and running on macOS.
- Some operations require a Bear API token (`~/.config/grizzly/token`).
- Use `--enable-callback` when you need to read data back from Bear.

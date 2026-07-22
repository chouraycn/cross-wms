---
name: xurl
description: "xurl CLI for authenticated X posts, replies, reads/search, DMs, media upload, followers, auth status, or raw v2 API calls."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐦",
        "requires": { "bins": ["xurl"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "xdevplatform/tap/xurl",
              "bins": ["xurl"],
              "label": "Install xurl (brew)",
            },
          ],
      },
  }
---

# xurl

Use `xurl` for X API work. Shortcut commands return JSON; raw mode works for any v2 endpoint.

## Common shortcuts

```bash
xurl post "Hello world!"
xurl reply POST_ID "Nice."
xurl read POST_ID
xurl search "query" -n 20
xurl whoami
xurl timeline -n 20
xurl like POST_ID
xurl dm @handle "message"
```

## Media

```bash
xurl media upload image.jpg
xurl post "caption" --media-id MEDIA_ID
```

## Raw API

```bash
xurl /2/users/me
xurl -X POST /2/tweets -d '{"text":"Hello world!"}'
```

## Safety

- Never read, print, or inspect `~/.xurl`.
- Do not use `--verbose` in agent sessions.
- Check auth with `xurl auth status`.

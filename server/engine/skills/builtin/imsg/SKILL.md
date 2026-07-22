---
name: imsg
description: "iMessage/SMS CLI for listing chats, history, and sending messages via Messages.app."
homepage: https://imsg.to
metadata:
  {
    "openclaw":
      {
        "emoji": "📨",
        "os": ["darwin"],
        "requires": { "bins": ["imsg"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "steipete/tap/imsg",
              "bins": ["imsg"],
              "label": "Install imsg (brew)",
            },
          ],
      },
  }
---

# imsg

Use `imsg` to read and send iMessage/SMS via macOS Messages.app.

## Common Commands

```bash
imsg chats --limit 10 --json
imsg history --chat-id 1 --limit 20 --json
imsg send --to "+14155551212" --text "Hello!"
imsg send --to "+14155551212" --text "Hi" --service imessage
```

## Safety

- Always confirm recipient and message content before sending.
- Never send to unknown numbers without explicit user approval.
- macOS-only; requires Messages.app signed in and Full Disk Access.

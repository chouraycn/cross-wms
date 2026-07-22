---
name: 1password
description: "Set up and use 1Password CLI for sign-in, desktop integration, and reading or injecting secrets."
homepage: https://developer.1password.com/docs/cli/get-started/
metadata:
  {
    "openclaw":
      {
        "emoji": "🔐",
        "requires": { "bins": ["op"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "1password-cli",
              "bins": ["op"],
              "label": "Install 1Password CLI (brew)",
            },
          ],
      },
  }
---

# 1Password CLI

Follow the official CLI get-started steps.

## Workflow

1. Check OS + shell.
2. Verify CLI present: `op --version`.
3. Detect the auth mode:
   - **Service account:** `OP_SERVICE_ACCOUNT_TOKEN` is set.
   - **Desktop app integration:** 1Password desktop app running.
   - **Standalone signin:** `op signin` prompts for password.
4. Run `op` according to the auth mode.
5. Verify access: `op whoami` should succeed before any secret read.

## Running `op`

Service account:

```bash
export OP_SERVICE_ACCOUNT_TOKEN="ops_..."
op vault list
op read op://app-prod/db/password
```

Desktop app integration:

```bash
op vault list
op whoami
```

## Guardrails

- Never paste secrets into logs, chat, or code.
- Prefer `op run` / `op inject` over writing secrets to disk.

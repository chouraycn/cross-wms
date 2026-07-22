---
name: node-connect
description: "Diagnose OpenClaw Android, iOS, or macOS node pairing, QR/setup code, route, auth, and connection failures."
---

# Node Connect

Goal: find the one real route from node -> gateway, verify OpenClaw is advertising that route, then fix pairing/auth.

## Topology first

Decide which case you are in before proposing fixes:

- same machine / emulator / USB tunnel
- same LAN / local Wi-Fi
- same Tailscale tailnet
- public URL / reverse proxy

## Canonical checks

```bash
openclaw config get gateway.mode
openclaw config get gateway.bind
openclaw qr --json
openclaw devices list
openclaw nodes status
```

## Root-cause map

- `Gateway is only bound to loopback`: fix the route (LAN/Tailscale/public).
- `pairing required`: approve the pending device.
- `bootstrap token invalid or expired`: generate a fresh setup code.
- `unauthorized`: check token/password and Tailscale settings.

## Fix style

Reply with one concrete diagnosis and one route. If there is not enough signal, ask for setup details.

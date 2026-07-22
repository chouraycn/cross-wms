---
name: trello
description: "Interact with Trello boards, lists, cards, and members via CLI or REST API."
metadata: { "openclaw": { "emoji": "📌", "requires": { "bins": ["trello"] } } }
---

# Trello

Use the `trello` CLI or `curl` to manage boards and cards.

## Setup

Requires `TRELLO_API_KEY` and `TRELLO_TOKEN`.

## Boards

```bash
trello board list
trello board get BOARD_ID
```

## Lists

```bash
trello list list --board BOARD_ID
trello list create --board BOARD_ID --name "In Progress"
```

## Cards

```bash
trello card list --list LIST_ID
trello card create --list LIST_ID --name "Fix bug"
trello card move CARD_ID --list LIST_ID
trello card archive CARD_ID
```

## Members

```bash
trello member list --board BOARD_ID
```

---
name: gh-issues
description: "Fetch GitHub issues, select candidates, spawn background fix agents, open PRs, and optionally process PR review comments."
user-invocable: true
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["git", "gh"] },
        "primaryEnv": "GH_TOKEN",
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (brew)",
            },
          ],
      },
  }
---

# gh-issues

Use for issue-to-PR automation. Prefer `gh` CLI; fall back to `gh api` only when a high-level command lacks the needed field.

## Arguments

- positional `owner/repo`: optional; else infer from `git remote get-url origin`.
- `--label <label>`: filter.
- `--limit <n>`: default 10.
- `--milestone <title>`: filter.
- `--assignee <login|@me>`: filter.
- `--state open|closed|all`: default open.
- `--fork <owner/repo>`: push branches to fork, PR to source.
- `--watch`: poll issues + reviews.
- `--dry-run`: list only.

## Quick start

```bash
gh issue list --repo OWNER/REPO --state open --limit 10 --json number,title,labels,url,body
gh issue view 42 --repo OWNER/REPO
```

## Workflow

1. Resolve repo from git remote or argument.
2. Fetch issues with filters.
3. Skip issues with existing PR/branch.
4. Confirm selection with user.
5. Spawn background workers (up to 8).
6. Collect results and report PR URLs.

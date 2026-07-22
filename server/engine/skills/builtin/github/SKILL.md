---
name: github
homepage: https://cli.github.com
description: "Work with GitHub repos, issues, PRs, runs, and gists. Requires `gh` CLI."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐙",
        "requires": { "bins": ["gh"] },
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

# GitHub

Use the `gh` CLI to query and modify GitHub resources.

## Auth

- Must be authenticated: `gh auth status`
- If not: `gh auth login`

## Repo

```bash
gh repo view owner/repo
gh repo clone owner/repo
gh repo list
```

## Issues and PRs

```bash
gh issue list --repo owner/repo --state open
gh issue view 123 --repo owner/repo
gh pr list --repo owner/repo --state open
gh pr view 456 --repo owner/repo
```

## Actions

```bash
gh run list --repo owner/repo
gh run view 789 --repo owner/repo
```

## Gists

```bash
gh gist list
gh gist view GIST_ID
```

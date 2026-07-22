---
name: github
description: GitHub CLI 操作，支持 issues、PRs、CI 检查、评论、发布等
version: 0.1.0
metadata:
  crosswms:
    category: general
    trigger: keyword:github / keyword:pr / keyword:issue / keyword:git
    executionMode: agent
    source: workspace
    status: active
---

# GitHub

使用 `gh` CLI 进行 GitHub 操作，包括 PR、Issue、CI 检查、评论等。

## 何时使用

当用户需要：
- 查看或创建 GitHub PR
- 查看或创建 Issues
- 检查 CI/CD 运行状态
- 评论或审查代码
- 查询 GitHub API

## 认证

```bash
gh auth status
gh auth login
```

## PR 操作

```bash
gh pr list --repo owner/repo --json number,title,state,author,url
gh pr view 55 --repo owner/repo --json title,body,author,files
gh pr checks 55 --repo owner/repo
gh pr diff 55 --repo owner/repo
gh pr create --repo owner/repo --title "feat: title" --body-file /tmp/pr.md
gh pr merge 55 --repo owner/repo --squash
```

## Issue 操作

```bash
gh issue list --repo owner/repo --state open --json number,title,labels,url
gh issue view 42 --repo owner/repo --json title,body,comments
gh issue create --repo owner/repo --title "Bug: ..." --body-file /tmp/issue.md
gh issue comment 42 --repo owner/repo --body "Comment text"
gh issue close 42 --repo owner/repo
```

## CI 运行

```bash
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo --log-failed
gh run rerun <run-id> --repo owner/repo --failed
```

## API 查询

```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state'
gh api repos/owner/repo --jq '{stars: .stargazers_count}'
```

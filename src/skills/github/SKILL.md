---
name: GitHub 集成
id: github
description: GitHub CLI 集成，用于管理 issues、PR、CI/check 日志、评论、reviews、releases、repos 及 gh api 查询
group: dev
requires: { bins: ["gh"] }
userInvocable: true
gate: auto
sandboxScope: write
---

通过 `gh` 操作 GitHub。本地提交/分支/push/pull 使用 `git`。深度代码审查交给代码阅读工具。

## 认证

```bash
gh auth status
gh auth login
```

网关 HOME 可能与操作者 HOME 不同。若 `gh` 认证存在于其他位置，请在网关服务环境中设置 `GH_CONFIG_DIR` 后重启。

## PR

```bash
gh pr list --repo owner/repo --json number,title,state,author,url
gh pr view 55 --repo owner/repo --json title,body,author,files,commits,reviews,reviewDecision
gh pr checks 55 --repo owner/repo
gh pr diff 55 --repo owner/repo
gh pr create --repo owner/repo --title "feat: title" --body-file /tmp/pr.md
gh pr merge 55 --repo owner/repo --squash
```

URL 可直接传入：`gh pr view https://github.com/owner/repo/pull/55`。

## Issues

```bash
gh issue list --repo owner/repo --state open --json number,title,labels,url
gh issue view 42 --repo owner/repo --json title,body,comments,labels,state
gh issue create --repo owner/repo --title "Bug: ..." --body-file /tmp/issue.md
gh issue comment 42 --repo owner/repo --body-file /tmp/comment.md
gh issue close 42 --repo owner/repo --comment "Fixed in ..."
```

## CI/Runs

```bash
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo --json status,conclusion,headSha,url
gh run view <run-id> --repo owner/repo --log-failed
gh run rerun <run-id> --repo owner/repo --failed
```

## API

```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
gh api repos/owner/repo/labels --jq '.[].name'
gh api --cache 1h repos/owner/repo --jq '{stars: .stargazers_count, forks: .forks_count}'
```

使用 `--json` + `--jq` 获取结构化输出。当评论/正文包含反引号、shell 片段、环境变量名或用户文本时，使用 `--body-file` 传入。

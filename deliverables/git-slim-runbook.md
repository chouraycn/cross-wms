# Git 仓库瘦身执行手册（待工作树干净后执行）

> 关联：《2026-08-04 整合软件优化方向分析》P2 未执行项「git filter-repo 瘦身 144MB」。
> 状态：方案已就绪、工具已装、历史镜像备份已建。**实际重写被「工作树未干净」挡住，等用户 commit 后执行。**

## 1. 实测体积（旧记 144MB 严重低估）

```text
size-pack: 634 MiB
.git 总占用: 762M
```

大对象扫描 top40 主因：

| 对象 | 大小 | 说明 |
|------|------|------|
| `server_dist/index.mjs` | 98M | 构建产物（服务端 bundle） |
| `server_dist/index.cjs` | 92M | 构建产物 |
| `server_dist/index.cjs` 历史多版本 | 33/27/23/22×4/4.9/1.3×8 MB | 每次重建都重新提交 |
| `coverage/*` | 数十 MB | 覆盖率 JSON |
| `report/jscpd-report.json` | 数 MB | 重复检测报告 |
| `package-lock.json` 多历史版 | ~796KB 各 | 依赖清单（**保留**） |
| `StaffDeck-main/...seed.json` | 4MB | 子模块曾当目录提交（现为 gitlink，**禁剥**） |

`server_dist/` 一项约 **350MB+**，是绝对主力——纯构建产物，本不该进 git（DMG 构建时才生成）。

## 2. 已就绪

- `git-filter-repo 2.47.0` 已装进隔离 venv：
  `/Users/chouray/.workbuddy/binaries/python/envs/default/bin/git-filter-repo`
- 历史镜像备份（737M，含 `main`/`refactor`/`sync`/`backup` 全部分支）：
  `/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms-slim-backup-20260804-235215.git`

## 3. 执行前置条件（硬门槛）

```bash
git status --porcelain   # 必须为空（含子模块指针）
```

当前有 **23 处未提交**（用户 8 文件 + 2 子模块 StaffDeck-main/openclaw + 本会话文档）。
**filter-repo 重写历史时若工作树脏，会危及进行中改动**——必须先 commit。

## 4. 剥离集（安全）

- `server_dist/` —— 构建产物，~350MB+
- `coverage/` —— 覆盖率 JSON
- `report/` —— jscpd 重复检测报告（注意：当前 `.gitignore` **未**忽略它，执行后须补）

## 5. 严禁剥离

- `StaffDeck-main/`、`openclaw/`：当前是 submodule gitlink，剥路径 = 删子模块引用
- `package-lock.json`：依赖清单，保留

## 6. 执行命令

```bash
cd /Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms
export PATH="/Users/chouray/.workbuddy/binaries/python/envs/default/bin:$PATH"

# 1) 重写历史：剥离三大生成物目录（--force 因存在 origin remote）
git filter-repo --force \
  --path server_dist/ --path coverage/ --path report/ \
  --invert-paths

# 2) 收紧对象库
git reflog expire --expire=now --all
git gc --aggressive --prune=now

# 3) 强推全部分支与标签（历史已变，必须强推）
git push --force --all
git push --force --tags
```

## 7. 执行后立即补（防复发）

`.gitignore` 已忽略 `server_dist/`、`coverage/`，但**未**忽略 `report/`：

```bash
printf '\n# 生成物，禁止提交（已在 git 瘦身时从历史剥离）\nreport/\n' >> .gitignore
```

并验证 DMG 构建脚本仍能从源码产出 `server_dist`（构建产物是运行时生成，不依赖 git 历史）。

## 8. 预期收益

pack 从 **634MiB → ~280MiB 量级**（去除 server_dist ~350MB+）；`.git` 大概率 **< 400M**。

## 9. 回滚（若重写出错）

```bash
# 方式 A：整仓从镜像备份恢复
cd /Users/chouray/WorkBuddy/2026-05-25-10-01-22
rm -rf cross-wms
git clone cross-wms-slim-backup-20260804-235215.git cross-wms

# 方式 B：原地覆盖 refs（保留当前工作树）
git -C cross-wms fetch cross-wms-slim-backup-20260804-235215.git '+refs/*:refs/*'
```

## 10. 对团队的影响（必须知会）

- `backup/wip-2026-08-04`、`sync/openclaw-2026-08-04` 也含 `server_dist` 历史，会被一并重写，需强推。
- **全员必须重新 clone**（旧 clone 的 commit hash 全部失效，`pull` 会冲突）。

## 11. 关联的 P2-1（API 契约反向对齐）

同一前置条件（工作树干净）。用户 commit server/* 改动后，执行 143 个 `server/routes` 的 envelope 收口
（主程序补齐 staff 侧已有的 `{code,data,message}` 包裹）。详见分析报告的 P2-1 章节。

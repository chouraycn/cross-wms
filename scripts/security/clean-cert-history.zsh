#!/usr/bin/env zsh
# ============================================================
# clean-cert-history.zsh — 清理 git 历史中的证书与私钥
# ============================================================
# 背景：certs/ 目录下 6 个敏感文件（CDFKnowClow.key/.p12/.crt,
# myCA.key/.pem/.srl）已被跟踪在 git 历史中。本脚本使用
# `git-filter-repo`（比 filter-branch 快、安全）把它们从
# 所有 commit 中移除。
#
# ⚠️  破坏性操作必读：
#   1. 执行前先备份完整仓库 clone（带 --mirror）
#   2. 清理后所有 commit hash 变更，必须强制推送
#   3. 所有协作者必须重新 clone（不可 pull/merge）
#   4. 本脚本不自动执行重写；设 DRY_RUN=1 时只打印要删除的文件
#      列表，设 DRY_RUN=0 且 CONFIRM_CLEAN=YES 时真正执行
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "[clean-cert-history] 仓库根目录: $REPO_ROOT"

# —— 1. 检查 git-filter-repo 是否可用 ——
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "❌ 缺少 git-filter-repo，请先安装："
  echo "   macOS:  brew install git-filter-repo"
  echo "   其它:   pip install git-filter-repo"
  echo "   文档:   https://github.com/newren/git-filter-repo"
  exit 1
fi

# —— 2. 列出要删除的路径 ——
EXPOSED_FILES=(
  "certs/CDFKnowClow.crt"
  "certs/CDFKnowClow.csr"
  "certs/CDFKnowClow.key"
  "certs/CDFKnowClow.p12"
  "certs/myCA.key"
  "certs/myCA.pem"
  "certs/myCA.srl"
  "certs/cert-extensions.cnf"
)

# 历史中出现过的扩展名兜底（防止路径重命名后漏网）
EXPOSED_PATTERNS=(
  "*.key"
  "*.p12"
  "*.pfx"
  "*.csr"
  "*.srl"
  "certs/**"
)

echo "📋 待删除的确定文件:"
for f in "${EXPOSED_FILES[@]}"; do
  hit=$(git log --all --oneline -- "$f" 2>/dev/null | wc -l | tr -d ' ')
  echo "   $f  (提交中命中: $hit)"
done
echo ""
echo "🔎 扩展模式（将在所有提交中匹配并删除）:"
for p in "${EXPOSED_PATTERNS[@]}"; do
  echo "   $p"
done

DRY_RUN="${DRY_RUN:-1}"
CONFIRM_CLEAN="${CONFIRM_CLEAN:-NO}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "✅ 以上为 DRY_RUN。确认无误后执行："
  echo ""
  echo "   cd $REPO_ROOT"
  echo "   # 1. 先做完整备份（强制）"
  echo "   git clone --mirror git@<remote>/cross-wms.git backup-cross-wms-mirror.git"
  echo "   # 2. 本地清理"
  echo "   DRY_RUN=0 CONFIRM_CLEAN=YES zsh scripts/security/clean-cert-history.zsh"
  echo "   # 3. 强制推送（会重写所有 commit hash）"
  echo "   git push --force --all origin"
  echo "   git push --force --tags origin"
  echo "   # 4. 通知所有协作者重新 clone！"
  exit 0
fi

if [[ "$CONFIRM_CLEAN" != "YES" ]]; then
  echo "❌ 拒绝执行：需设 CONFIRM_CLEAN=YES 明确确认。为避免误操作，脚本终止。"
  exit 2
fi

# —— 3. 真正执行重写 ——
# 备份当前工作树的 certs 到 /tmp（重写会从工作树也删掉，之后手动放回 certs/
# 但由于 .gitignore 已忽略，不会再次被跟踪）
TMP_CERTS="$(mktemp -d)/certs-backup"
if [[ -d "$REPO_ROOT/certs" ]]; then
  echo "💾 备份当前 certs/ 工作树到: $TMP_CERTS"
  cp -R "$REPO_ROOT/certs" "$TMP_CERTS"
fi

echo "🚀 开始 git-filter-repo 清理..."
git-filter-repo \
  --invert-paths \
  --path-glob "*.key" \
  --path-glob "*.p12" \
  --path-glob "*.pfx" \
  --path-glob "*.csr" \
  --path-glob "*.srl" \
  --path-glob "certs/**" \
  --force \
  || (echo "❌ git-filter-repo 失败；已备份 certs: $TMP_CERTS"; exit 3)

# 恢复工作树 certs（.gitignore 已忽略，所以不会跟踪）
if [[ -d "$TMP_CERTS" ]]; then
  echo "♻️ 恢复工作树 certs/（内容存在但 git 已忽略）"
  mkdir -p "$REPO_ROOT/certs"
  cp -R "$TMP_CERTS/." "$REPO_ROOT/certs/"
fi

echo ""
echo "✅ git 历史清理完成。后续步骤："
echo "   1. 验证敏感文件是否已在所有历史中消失:"
echo "      git log --all --oneline -- certs/  (应为空)"
echo "      git log --all -S 'BEGIN RSA PRIVATE KEY' (应为空)"
echo "   2. 强制推送（破坏所有 pull request/协作者本地仓库）:"
echo "      git push --force --all origin"
echo "      git push --force --tags origin"
echo "   3. 立即运行 scripts/security/revoke-and-rotate-certs.zsh 吊销并重建证书"
echo "   4. 通知所有协作者：删除本地仓库，重新 git clone"

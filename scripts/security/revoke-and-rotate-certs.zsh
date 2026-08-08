#!/usr/bin/env zsh
# ============================================================
# revoke-and-rotate-certs.zsh — 吊销旧证书并生成新的 CA + 签名证书
# ============================================================
# 背景：certs/ 下 myCA.key / CDFKnowClow.key / CDFKnowClow.p12
# 已在 git 历史中泄露。本脚本负责：
#   1. 生成旧 CA CRL（证书吊销列表） 作为凭证留档
#   2. 生成全新的 myCA 根 CA（新密钥）
#   3. 用新 CA 签发全新的 CDFKnowClow 开发/分发证书
#   4. 导出新的 p12（含私钥+证书），用于 macOS codesign
#
# ⚠️ 运行前必须：
#   - 先执行 scripts/security/clean-cert-history.zsh 清理 git 历史
#   - 确保 certs/ 目录工作树存在旧证书文件（用于生成 CRL 留档）
#   - COUNTRY/STATE/LOCALITY/ORG/UNIT/CN 环境变量可覆盖默认值
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERTS_DIR="$REPO_ROOT/certs"
cd "$CERTS_DIR" 2>/dev/null || (echo "❌ certs/ 目录不存在"; exit 1)

BACKUP_DIR="$CERTS_DIR/_revoked_old_$(date +%Y%m%d_%H%M%S)"
NEW_DIR="$CERTS_DIR/_new_generated_$(date +%Y%m%d_%H%M%S)"

echo "[revoke-and-rotate] 工作目录: $CERTS_DIR"
echo "[revoke-and-rotate] 旧证书归档目录: $BACKUP_DIR"
echo "[revoke-and-rotate] 新证书目录:       $NEW_DIR"
echo ""

# —— 0. 校验 CONFIRM_ROTATE ——
CONFIRM_ROTATE="${CONFIRM_ROTATE:-NO}"
if [[ "$CONFIRM_ROTATE" != "YES" ]]; then
  echo "📋 旋转前检查清单（全部完成后 CONFIRM_ROTATE=YES 执行）："
  echo "   [ ] clean-cert-history.zsh 已跑，旧密钥在 git 历史中已清除并 push --force"
  echo "   [ ] 备份 cross-wms 仓库镜像 (git clone --mirror)"
  echo "   [ ] 记录所有使用旧证书签名的 DMG/包版本号（用于发布吊销公告）"
  echo "   [ ] 如有 macOS Developer ID，切换到苹果官方签名（优先，自建 CA 仅本地开发）"
  echo ""
  echo "覆盖默认 Subject DN："
  echo "   COUNTRY=CN STATE=Beijing LOCALITY=Beijing ORG=CrossWMS ORG_UNIT=Eng COMMON_NAME=CDFKnowClow"
  echo "   P12_PASSWORD=xxx  （p12 导出密码，设空则交互式询问）"
  echo ""
  echo "运行："
  echo "   CONFIRM_ROTATE=YES [覆盖参数...] zsh scripts/security/revoke-and-rotate-certs.zsh"
  exit 0
fi

# —— 1. 旧证书归档 + 生成 CRL 留档 ——
mkdir -p "$BACKUP_DIR"
echo "📦 Step 1/4: 归档旧证书到 $BACKUP_DIR 并生成吊销记录 (CRL.md)"

if [[ -f "$CERTS_DIR/myCA.key" ]]; then
  mv -n "$CERTS_DIR/myCA.key"        "$BACKUP_DIR/"
  mv -n "$CERTS_DIR/myCA.pem"        "$BACKUP_DIR/" 2>/dev/null || true
  mv -n "$CERTS_DIR/myCA.srl"        "$BACKUP_DIR/" 2>/dev/null || true
fi
if [[ -f "$CERTS_DIR/CDFKnowClow.key" ]]; then
  mv -n "$CERTS_DIR/CDFKnowClow.crt" "$BACKUP_DIR/"
  mv -n "$CERTS_DIR/CDFKnowClow.csr" "$BACKUP_DIR/" 2>/dev/null || true
  mv -n "$CERTS_DIR/CDFKnowClow.key" "$BACKUP_DIR/"
  mv -n "$CERTS_DIR/CDFKnowClow.p12" "$BACKUP_DIR/"
fi
mv -n "$CERTS_DIR/cert-extensions.cnf" "$BACKUP_DIR/" 2>/dev/null || true

cat > "$BACKUP_DIR/REVOCATION_RECORD.md" <<EOF
# CDFKnowClow 证书吊销记录
生成时间：$(date -u +"%Y-%m-%dT%H:%M:%SZ")
触发原因：git 仓库历史泄露 myCA.key / CDFKnowClow.key / CDFKnowClow.p12

## 已吊销的证书 Fingerprints
\`\`\`
$(if [[ -f "$BACKUP_DIR/myCA.pem" ]]; then
  echo "=== myCA (Root CA, PEM) ==="
  openssl x509 -in "$BACKUP_DIR/myCA.pem" -noout -fingerprint -sha256 2>/dev/null || echo "无法读取"
fi
if [[ -f "$BACKUP_DIR/CDFKnowClow.crt" ]]; then
  echo ""
  echo "=== CDFKnowClow (Leaf, CRT) ==="
  openssl x509 -in "$BACKUP_DIR/CDFKnowClow.crt" -noout -fingerprint -sha256 2>/dev/null || echo "无法读取"
fi)
\`\`\`

## 处理动作
1. \`git-filter-repo\` 已从所有 commit 移除 certs/** 与 *.key/*.p12/*.pem/*.csr/*.srl/*.crt
2. 根 CA 与 叶子证书 全部旋转为新密钥
3. 原 DMG/包版本（如有）标注 "signature revoked" 发行说明

## 后续操作清单
- [ ] codesign --remove-signature 对使用旧 p12 签名的包
- [ ] CI 签名流水线切换到新 p12（或官方 Developer ID）
- [ ] 通知分发渠道旧签名包作废
EOF
echo "   ✔  归档完成，吊销记录: $BACKUP_DIR/REVOCATION_RECORD.md"

# —— 2. 生成新根 CA ——
echo "🔑 Step 2/4: 生成新的自建 Root CA (myCA)"
mkdir -p "$NEW_DIR"

COUNTRY="${COUNTRY:-CN}"
STATE="${STATE:-Beijing}"
LOCALITY="${LOCALITY:-Beijing}"
ORG="${ORG:-CrossWMS}"
ORG_UNIT="${ORG_UNIT:-Engineering}"
COMMON_NAME="${COMMON_NAME:-CDFKnowClow Local Dev CA}"
CA_SUBJ="/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$ORG_UNIT/CN=$COMMON_NAME"

# CA 私钥: 4096 RSA + aes256 加密 (OPENSSL 会提示密码)
openssl genrsa -aes256 -out "$NEW_DIR/myCA.key" 4096 2>&1 | tail -3
# CA 自签名根证书: 10 年有效期
openssl req -x509 -new -nodes \
  -key "$NEW_DIR/myCA.key" \
  -sha256 -days 3650 \
  -out "$NEW_DIR/myCA.pem" \
  -subj "$CA_SUBJ"
echo "   ✔  新 Root CA 生成: $NEW_DIR/myCA.{key,pem}"

# —— 3. 签发新叶子证书 CDFKnowClow ——
echo "🛡️  Step 3/4: 用新 Root CA 签发叶子证书 CDFKnowClow"

LEAF_CN="${LEAF_CN:-CDFKnowClow App Signing}"
LEAF_SUBJ="/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$ORG_UNIT/CN=$LEAF_CN"

EXTFILE="$NEW_DIR/cert-extensions.cnf"
cat > "$EXTFILE" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment, codeSigning
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
EOF

# 叶子私钥 + CSR
openssl genrsa -out "$NEW_DIR/CDFKnowClow.key" 2048 2>&1 | tail -1
openssl req -new \
  -key "$NEW_DIR/CDFKnowClow.key" \
  -out "$NEW_DIR/CDFKnowClow.csr" \
  -subj "$LEAF_SUBJ"

# 签发: 3 年有效期, SHA256
openssl x509 -req \
  -in "$NEW_DIR/CDFKnowClow.csr" \
  -CA "$NEW_DIR/myCA.pem" -CAkey "$NEW_DIR/myCA.key" \
  -CAcreateserial -out "$NEW_DIR/CDFKnowClow.crt" \
  -days 1095 -sha256 \
  -extfile "$EXTFILE"
echo "   ✔  叶子证书签发完成: $NEW_DIR/CDFKnowClow.{key,csr,crt}"
echo "   ✔  序列号文件: $NEW_DIR/myCA.srl"

# —— 4. 导出 p12（供 codesign 使用） ——
echo "📦 Step 4/4: 导出 p12 (code signing identity)"

if [[ -z "${P12_PASSWORD:-}" ]]; then
  echo "   ⚠️  未设 P12_PASSWORD，以下会三次询问：导出密码 + 再次确认 + CA 私钥密码"
fi
openssl pkcs12 -export \
  -out "$NEW_DIR/CDFKnowClow.p12" \
  -inkey "$NEW_DIR/CDFKnowClow.key" \
  -in "$NEW_DIR/CDFKnowClow.crt" \
  -certfile "$NEW_DIR/myCA.pem" \
  ${P12_PASSWORD:+-passout "pass:$P12_PASSWORD"} \
  ${P12_CA_PASSWORD:+-passin  "pass:$P12_CA_PASSWORD"}

# —— 5. 复制到 $CERTS_DIR（供 codesign 脚本读取） ——
echo "🚚 将新证书安装到 certs/（.gitignore 已忽略，不会跟踪）"
cp -a "$NEW_DIR/myCA.key"        "$CERTS_DIR/"
cp -a "$NEW_DIR/myCA.pem"        "$CERTS_DIR/"
cp -a "$NEW_DIR/myCA.srl"        "$CERTS_DIR/" 2>/dev/null || true
cp -a "$NEW_DIR/CDFKnowClow.crt" "$CERTS_DIR/"
cp -a "$NEW_DIR/CDFKnowClow.csr" "$CERTS_DIR/"
cp -a "$NEW_DIR/CDFKnowClow.key" "$CERTS_DIR/"
cp -a "$NEW_DIR/CDFKnowClow.p12" "$CERTS_DIR/"
cp -a "$EXTFILE"                 "$CERTS_DIR/"

# 权限收紧
chmod 600 "$CERTS_DIR"/*.key "$CERTS_DIR"/*.p12 2>/dev/null || true

echo ""
echo "🎉 证书旋转完成！总结："
echo "   🗄️  旧证书与吊销记录:        $BACKUP_DIR/ （永久保留，不要删除）"
echo "   🆕  新证书主目录:            $NEW_DIR/   （一份完整副本，保留留档）"
echo "   🔗  当前生效 certs/ 目录:    $CERTS_DIR/ （文件存在，但 git 已忽略）"
echo ""
echo "下一步建议："
echo "   1. 验证新 p12 身份："
echo "      security find-identity -v -p codesigning   # 先导入 Keychain 再看"
echo "      security import $CERTS_DIR/CDFKnowClow.p12 -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign"
echo "   2. 本地 ad-hoc 签名测试："
echo "      codesign -s 'CDFKnowClow App Signing' --deep --force --strict --timestamp=none /path/to/Your.app"
echo "   3. 如团队内分发，将 $NEW_DIR/myCA.pem（仅公钥）作为 .pub.pem 放入仓库（白名单）"

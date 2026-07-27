#!/bin/bash

TARGET_DIR="/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server/engine/commands"

find "$TARGET_DIR" -name "*.ts" -type f | while read -r file; do
    perl -i -pe 's|from '\''\.\./\.\./\.\./config/|from '\''../../../../openclaw/src/config/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./plugins/|from '\''../../../../openclaw/src/plugins/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./routing/|from '\''../../../../openclaw/src/routing/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./secrets/|from '\''../../../../openclaw/src/secrets/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./utils\.|from '\''../../../../openclaw/src/utils.|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./utils/|from '\''../../../../openclaw/src/utils/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./gateway/|from '\''../../../../openclaw/src/gateway/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./cli/|from '\''../../../../openclaw/src/cli/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./commands/|from '\''../../commands/|g' "$file"
    perl -i -pe 's|from '\''\.\./\.\./\.\./([^'\''"]+)'\'\'|from '\''../../../../openclaw/src/$1'\''|g' "$file"
done

echo "=== Import path fixes complete ==="

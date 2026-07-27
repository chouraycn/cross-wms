#!/bin/bash

TARGET_DIR="/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server/engine/commands"

find "$TARGET_DIR" -name "*.ts" -type f | while read -r file; do
    sed -i '' 's|from '\''\.\.\./\.\./\.\./config/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/config/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./plugins/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/plugins/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./routing/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/routing/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./secrets/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/secrets/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./utils\.\([^'\'']*\)'\''|from '\''../../../../openclaw/src/utils.\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./utils/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/utils/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./gateway/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/gateway/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./cli/\([^'\'']*\)'\''|from '\''../../../../openclaw/src/cli/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./commands/\([^'\'']*\)'\''|from '\''../../commands/\1'\''|g' "$file"
    sed -i '' 's|from '\''\.\.\./\.\./\.\./\([^'\'']*\)'\''|from '\''../../../../openclaw/src/\1'\''|g' "$file"
done

echo "=== Import path fixes complete ==="

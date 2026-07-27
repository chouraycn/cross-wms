#!/bin/bash

SOURCE_DIR="/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/openclaw/src/commands"
TARGET_DIR="/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/server/engine/commands"

mkdir -p "$TARGET_DIR"

function migrate_file {
    local src_file="$1"
    local rel_path="${src_file#$SOURCE_DIR/}"
    local dest_file="$TARGET_DIR/$rel_path"
    
    mkdir -p "$(dirname "$dest_file")"
    
    cp "$src_file" "$dest_file"
    
    sed -i '' 's/^\/\/ @ts-nocheck$//' "$dest_file"
    
    sed -i '' 's|from '\''@src/\([^'\'']*\)'\''|from '\''../../\1.js'\''|g' "$dest_file"
    
    sed -i '' 's|from '\''\.\([^'\'']*\)'\''|from '\''.\1.js'\''|g' "$dest_file"
    sed -i '' 's|from '\''\.\./\([^'\'']*\)'\''|from '\''../\1.js'\''|g' "$dest_file"
    sed -i '' 's|from '\''\.\.\./\([^'\'']*\)'\''|from '\''../../\1.js'\''|g' "$dest_file"
    sed -i '' 's|from '\''\.\.\.\./\([^'\'']*\)'\''|from '\''../../../\1.js'\''|g' "$dest_file"
    
    echo "Migrated: $rel_path"
}

function migrate_dir {
    local dir_pattern="$1"
    echo "=== Migrating $dir_pattern ==="
    
    find "$SOURCE_DIR/$dir_pattern" -name "*.ts" -type f | while read -r file; do
        migrate_file "$file"
    done
}

migrate_dir "doctor/shared"
migrate_dir "models"
migrate_dir "status-all"
migrate_dir "channels"
migrate_dir "migrate"
migrate_dir "gateway-status"
migrate_dir "onboard-non-interactive"

echo "=== Migration complete ==="
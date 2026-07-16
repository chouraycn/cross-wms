#!/usr/bin/env bash
# 创建缺失的 OpenClaw 子包

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKGS_DIR="$ROOT_DIR/packages"

# 需要创建的包列表
PKGS=(
  "acp-core:ACPCore - Access Control Policy Core"
  "gateway-client:GatewayClient - Gateway 客户端"
  "gateway-protocol:GatewayProtocol - Gateway 协议定义"
  "llm-runtime:LlmRuntime - LLM 运行时"
  "markdown-core:MarkdownCore - Markdown 处理核心"
  "media-core:MediaCore - 媒体处理核心"
  "media-generation-core:MediaGenerationCore - 媒体生成核心"
  "media-understanding-common:MediaUnderstandingCommon - 媒体理解公共模块"
  "model-catalog-core:ModelCatalogCore - 模型目录核心"
  "net-policy:NetPolicy - 网络策略"
  "normalization-core:NormalizationCore - 标准化核心"
  "plugin-package-contract:PluginPackageContract - 插件包契约"
  "sdk:SDK - OpenClaw SDK"
  "speech-core:SpeechCore - 语音核心"
  "terminal-core:TerminalCore - 终端核心"
  "tool-call-repair:ToolCallRepair - 工具调用修复"
  "web-content-core:WebContentCore - Web 内容核心"
)

for pkg_info in "${PKGS[@]}"; do
  IFS=':' read -r pkg_name pkg_desc <<< "$pkg_info"
  pkg_dir="$PKGS_DIR/$pkg_name"
  
  if [ -d "$pkg_dir" ]; then
    echo "⚠️  $pkg_name 已存在，跳过"
    continue
  fi
  
  echo "✅ 创建 $pkg_name..."
  
  # 创建目录结构
  mkdir -p "$pkg_dir/src"
  mkdir -p "$pkg_dir/src/__tests__"
  
  # 创建 package.json
  cat > "$pkg_dir/package.json" << EOF
{
  "name": "@cdf-know/$pkg_name",
  "version": "1.0.0",
  "description": "CDFKnow $pkg_desc",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF
  
  # 创建 tsconfig.json
  cat > "$pkg_dir/tsconfig.json" << EOF
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/__tests__/**", "src/**/*.test.ts", "src/**/*.spec.ts"]
}
EOF
  
  # 创建 vitest.config.ts
  cat > "$pkg_dir/vitest.config.ts" << EOF
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts'],
    },
  },
});
EOF
  
  # 创建 src/index.ts（从 openclaw 复制）
  if [ -f "$ROOT_DIR/openclaw/packages/$pkg_name/src/index.ts" ]; then
    cp "$ROOT_DIR/openclaw/packages/$pkg_name/src/index.ts" "$pkg_dir/src/index.ts"
  else
    cat > "$pkg_dir/src/index.ts" << EOF
export * from './types';
EOF
  fi
  
  # 复制其他源文件（除了测试文件）
  if [ -d "$ROOT_DIR/openclaw/packages/$pkg_name/src" ]; then
    find "$ROOT_DIR/openclaw/packages/$pkg_name/src" -type f -name "*.ts" \
      -not -name "*.test.ts" -not -name "*.spec.ts" \
      -not -path "*/__tests__/*" | while read -r file; do
      rel_path="${file#$ROOT_DIR/openclaw/packages/$pkg_name/src/}"
      mkdir -p "$pkg_dir/src/$(dirname "$rel_path")"
      cp "$file" "$pkg_dir/src/$rel_path"
    done
  fi
  
  # 复制测试文件
  if [ -d "$ROOT_DIR/openclaw/packages/$pkg_name/src/__tests__" ]; then
    mkdir -p "$pkg_dir/src/__tests__"
    cp -r "$ROOT_DIR/openclaw/packages/$pkg_name/src/__tests__/"* "$pkg_dir/src/__tests__/" 2>/dev/null || true
  fi
  
  echo "   ✓ 完成"
done

echo ""
echo "============================================="
echo "  OpenClaw 子包创建完成"
echo "  运行检查脚本验证：zsh scripts/check-packages.sh"
echo "============================================="

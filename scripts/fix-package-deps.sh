#!/usr/bin/env bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKGS_DIR="$ROOT_DIR/packages"

# 更新 gateway-protocol
cat > "$PKGS_DIR/gateway-protocol/package.json" << EOF
{
  "name": "@cdf-know/gateway-protocol",
  "version": "1.0.0",
  "description": "CDFKnow GatewayProtocol - Gateway 协议定义",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "typebox": "1.1.39"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 gateway-client
cat > "$PKGS_DIR/gateway-client/package.json" << EOF
{
  "name": "@cdf-know/gateway-client",
  "version": "1.0.0",
  "description": "CDFKnow GatewayClient - Gateway 客户端",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "@cdf-know/gateway-protocol": "1.0.0",
    "ipaddr.js": "2.4.0",
    "ws": "8.21.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "@types/ws": "^8.5.12",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 llm-runtime
cat > "$PKGS_DIR/llm-runtime/package.json" << EOF
{
  "name": "@cdf-know/llm-runtime",
  "version": "1.0.0",
  "description": "CDFKnow LlmRuntime - LLM 运行时",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "@cdf-know/llm-core": "1.0.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 markdown-core
cat > "$PKGS_DIR/markdown-core/package.json" << EOF
{
  "name": "@cdf-know/markdown-core",
  "version": "1.0.0",
  "description": "CDFKnow MarkdownCore - Markdown 处理核心",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "markdown-it": "^14.0.0"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 media-core
cat > "$PKGS_DIR/media-core/package.json" << EOF
{
  "name": "@cdf-know/media-core",
  "version": "1.0.0",
  "description": "CDFKnow MediaCore - 媒体处理核心",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "file-type": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 net-policy
cat > "$PKGS_DIR/net-policy/package.json" << EOF
{
  "name": "@cdf-know/net-policy",
  "version": "1.0.0",
  "description": "CDFKnow NetPolicy - 网络策略",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "ipaddr.js": "2.4.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 sdk
cat > "$PKGS_DIR/sdk/package.json" << EOF
{
  "name": "@cdf-know/sdk",
  "version": "1.0.0",
  "description": "CDFKnow SDK - OpenClaw SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "@cdf-know/gateway-client": "1.0.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 更新 terminal-core
cat > "$PKGS_DIR/terminal-core/package.json" << EOF
{
  "name": "@cdf-know/terminal-core",
  "version": "1.0.0",
  "description": "CDFKnow TerminalCore - 终端核心",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "clean": "rm -rf dist",
    "test": "vitest run"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.4",
    "typescript": "^5.9.3",
    "vite": "^7",
    "vitest": "^3.2.6"
  }
}
EOF

# 创建 speech-core 的 types.ts
if [ ! -f "$PKGS_DIR/speech-core/src/types.ts" ]; then
  mkdir -p "$PKGS_DIR/speech-core/src"
  cat > "$PKGS_DIR/speech-core/src/types.ts" << 'EOF'
export interface SpeechConfig {}
export interface SpeechResult {}
EOF
  cat > "$PKGS_DIR/speech-core/src/index.ts" << 'EOF'
export * from './types';
EOF
fi

echo "✅ 依赖修复完成"
echo "运行检查脚本: zsh scripts/check-packages.sh"

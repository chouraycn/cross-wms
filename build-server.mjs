import { build } from "esbuild";
import path from "node:path";
import fs from "node:fs";

const ROOT = process.cwd();

function resolveWithPrefixes(importPath) {
  const rules = [
    { prefix: "@cdf-know/plugin-sdk/extension-shared", exact: true, target: "./server/engine/plugin-sdk/extension-shared.ts" },
    { prefix: "@openclaw/acp-core/", exact: false, target: "./packages/acp-core/src/" },
    { prefix: "@openclaw/acp-core", exact: true, target: "./packages/acp-core/src/index.ts" },
    { prefix: "@openclaw/media-core/", exact: false, target: "./packages/media-core/src/" },
    { prefix: "@openclaw/media-core", exact: true, target: "./packages/media-core/src/index.ts" },
    { prefix: "@openclaw/llm-runtime/", exact: false, target: "./packages/llm-runtime/src/" },
    { prefix: "@openclaw/llm-runtime", exact: true, target: "./packages/llm-runtime/src/index.ts" },
    { prefix: "@openclaw/media-understanding-common/", exact: false, target: "./packages/media-understanding-common/src/" },
    { prefix: "@openclaw/media-understanding-common", exact: true, target: "./packages/media-understanding-common/src/index.ts" },
    { prefix: "@openclaw/markdown-core/", exact: false, target: "./packages/markdown-core/src/" },
    { prefix: "@openclaw/markdown-core", exact: true, target: "./packages/markdown-core/src/index.ts" },
    { prefix: "@openclaw/terminal-core/", exact: false, target: "./packages/terminal-core/src/" },
    { prefix: "@openclaw/terminal-core", exact: true, target: "./packages/terminal-core/src/index.ts" },
    { prefix: "@openclaw/net-policy/", exact: false, target: "./packages/net-policy/src/" },
    { prefix: "@openclaw/net-policy", exact: true, target: "./packages/net-policy/src/index.ts" },
    { prefix: "@openclaw/web-content-core/", exact: false, target: "./packages/web-content-core/src/" },
    { prefix: "@openclaw/web-content-core", exact: true, target: "./packages/web-content-core/src/index.ts" },
    { prefix: "@openclaw/speech-core/", exact: false, target: "./packages/speech-core/" },
    { prefix: "@openclaw/speech-core", exact: true, target: "./packages/speech-core/runtime-api.ts" },
    { prefix: "@openclaw/agent-core/", exact: false, target: "./packages/agent-core/src/" },
    { prefix: "@openclaw/agent-core", exact: true, target: "./packages/agent-core/src/index.ts" },
    { prefix: "@openclaw/tool-call-repair/", exact: false, target: "./packages/tool-call-repair/src/" },
    { prefix: "@openclaw/tool-call-repair", exact: true, target: "./packages/tool-call-repair/src/index.ts" },
    { prefix: "@cdf-know/llm-core/", exact: false, target: "./packages/llm-core/src/" },
    { prefix: "@cdf-know/llm-core", exact: true, target: "./packages/llm-core/src/index.ts" },
    { prefix: "@cdf-know/model-catalog-core/", exact: false, target: "./packages/model-catalog-core/src/" },
    { prefix: "@cdf-know/model-catalog-core", exact: true, target: "./packages/model-catalog-core/src/index.ts" },
    { prefix: "@cdf-know/sdk/", exact: false, target: "./packages/sdk/src/" },
    { prefix: "@cdf-know/sdk", exact: true, target: "./packages/sdk/src/index.ts" },
    { prefix: "@cdf-know/gateway-client/", exact: false, target: "./packages/gateway-client/src/" },
    { prefix: "@cdf-know/gateway-client", exact: true, target: "./packages/gateway-client/src/index.ts" },
    { prefix: "@cdf-know/normalization-core/", exact: false, target: "./packages/normalization-core/src/" },
    { prefix: "@cdf-know/normalization-core", exact: true, target: "./packages/normalization-core/src/index.ts" },
    { prefix: "@cdf-know/memory-host-sdk/", exact: false, target: "./packages/memory-host-sdk/src/" },
    { prefix: "@cdf-know/memory-host-sdk", exact: true, target: "./packages/memory-host-sdk/src/index.ts" },
    { prefix: "@cdf-know/media-generation-core/", exact: false, target: "./packages/media-generation-core/src/" },
    { prefix: "@cdf-know/media-generation-core", exact: true, target: "./packages/media-generation-core/src/index.ts" },
    { prefix: "@cdf-know/gateway-protocol/", exact: false, target: "./packages/gateway-protocol/src/" },
    { prefix: "@cdf-know/gateway-protocol", exact: true, target: "./packages/gateway-protocol/src/index.ts" },
    { prefix: "openclaw/plugin-sdk/", exact: false, target: "./server/engine/plugin-sdk/" },
    { prefix: "openclaw/plugin-sdk", exact: true, target: "./server/engine/plugin-sdk/index.ts" },
    { prefix: "@src/", exact: false, target: "./src/" },
  ];

  for (const rule of rules) {
    if (rule.exact) {
      if (importPath === rule.prefix) return rule.target;
    } else {
      if (importPath.startsWith(rule.prefix)) {
        return rule.target + importPath.slice(rule.prefix.length);
      }
    }
  }
  return null;
}

function resolvePathToFile(abs) {
  let finalPath = abs;
  const ext = path.extname(abs);
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
    const candidates = [
      abs.slice(0, -ext.length) + ".ts",
      abs.slice(0, -ext.length) + ".tsx",
      abs,
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return abs;
  }
  if (!ext) {
    const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
    for (const e of exts) {
      if (fs.existsSync(abs + e)) {
        return abs + e;
      }
    }
    if (fs.existsSync(path.join(abs, "index.ts"))) {
      return path.join(abs, "index.ts");
    }
  }
  return finalPath;
}

const aliasPlugin = {
  name: "alias-plugin",
  setup(build) {
    build.onResolve({ filter: /^(@|openclaw\/plugin-sdk)/ }, (args) => {
      const resolved = resolveWithPrefixes(args.path);
      if (resolved) {
        const abs = path.resolve(ROOT, resolved);
        const finalPath = resolvePathToFile(abs);
        return { path: finalPath };
      }
      return undefined;
    });
  },
};

try {
  await build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: "server_dist/index.cjs",
    format: "cjs",
    loader: { ".node": "copy" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "__import_meta_url",
    },
    banner: {
      js: "var __import_meta_url = require('url').pathToFileURL(__filename).href;",
    },
    plugins: [aliasPlugin],
    external: ["@larksuiteoapi/node-sdk", "jsdom", "better-sqlite3", "onnxruntime-node", "sqlite-vec", "fsevents"],
    logLimit: 150,
    logLevel: "error",
  });
  console.log("BUILD_SUCCESS");

  // 拷贝 ESM resolve hook 到输出目录（运行时 module.register() 需要独立 .mjs 文件）
  const hookSrc = path.join(ROOT, "server", "extension-resolve-hook.mjs");
  const hookDest = path.join(ROOT, "server_dist", "extension-resolve-hook.mjs");
  if (fs.existsSync(hookSrc)) {
    fs.copyFileSync(hookSrc, hookDest);
    console.log("COPIED_HOOK");
  }
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}

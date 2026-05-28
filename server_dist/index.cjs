"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "cross-wms",
      private: true,
      version: "1.0.7",
      type: "module",
      scripts: {
        "dev:server": "tsx watch server/index.ts",
        server: "tsx server/index.ts",
        dev: 'concurrently "npm run dev:server" "vite"',
        build: "tsc && vite build",
        preview: "vite preview",
        "electron:build": "npm run build && electron-builder",
        bump: "node bump-version.cjs",
        "bump:patch": "node bump-version.cjs patch",
        "bump:minor": "node bump-version.cjs minor",
        "bump:major": "node bump-version.cjs major",
        "build:all": "npm run build && bash build-dmg-pywebview.sh",
        "build:bump-patch": "bash build-dmg-pywebview.sh --bump-patch",
        "build:bump-minor": "bash build-dmg-pywebview.sh --bump-minor",
        "build:bump-major": "bash build-dmg-pywebview.sh --bump-major"
      },
      dependencies: {
        "@emotion/react": "^11.11.4",
        "@emotion/styled": "^11.11.5",
        "@mui/icons-material": "^5.15.15",
        "@mui/material": "^5.15.15",
        "@tencent-ai/agent-sdk": "^0.3.43",
        "better-sqlite3": "^12.6.2",
        cors: "^2.8.5",
        dayjs: "^1.11.10",
        express: "^5.2.0",
        react: "^18.2.0",
        "react-dom": "^18.2.0",
        "react-markdown": "^10.1.0",
        "react-router-dom": "^6.22.3",
        recharts: "^2.12.3",
        "remark-gfm": "^4.0.1",
        uuid: "^9.0.0"
      },
      devDependencies: {
        "@types/better-sqlite3": "^7.6.13",
        "@types/cors": "^2.8.17",
        "@types/express": "^4.17.21",
        "@types/react": "^18.2.66",
        "@types/react-dom": "^18.2.22",
        "@types/uuid": "^9.0.7",
        "@vitejs/plugin-react": "^4.2.1",
        autoprefixer: "^10.4.19",
        concurrently: "^8.2.2",
        electron: "^42.2.0",
        "electron-builder": "^24.13.3",
        esbuild: "^0.28.0",
        postcss: "^8.4.38",
        tailwindcss: "^3.4.3",
        tsx: "^4.6.2",
        typescript: "^5.2.2",
        vite: "^7.1.11"
      },
      build: {
        appId: "com.crosswms.desktop",
        productName: "CrossWMS",
        directories: {
          output: "release"
        },
        files: [
          "dist/**/*",
          "electron/**/*"
        ],
        mac: {
          target: [
            {
              target: "dmg",
              arch: [
                "arm64"
              ]
            }
          ],
          category: "public.app-category.business",
          artifactName: "CrossWMS-${version}-mac.${ext}",
          electronLanguages: [
            "zh-CN"
          ],
          hardenedRuntime: true,
          entitlements: "entitlements.mac.plist",
          entitlementsInherit: "entitlements.mac.plist"
        },
        dmg: {
          contents: [
            {
              x: 130,
              y: 220
            },
            {
              x: 410,
              y: 220,
              type: "link",
              path: "/Applications"
            }
          ]
        }
      },
      main: "electron/main.mjs"
    };
  }
});

// server/index.ts
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_agent_sdk = require("@tencent-ai/agent-sdk");
var import_uuid = require("uuid");

// server/db.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var import_path = __toESM(require("path"), 1);
var import_os = __toESM(require("os"), 1);
var import_fs = __toESM(require("fs"), 1);
var crosswmsDir = import_path.default.join(import_os.default.homedir(), ".crosswms");
var dbPath = import_path.default.join(crosswmsDir, "chat.db");
if (!import_fs.default.existsSync(crosswmsDir)) {
  import_fs.default.mkdirSync(crosswmsDir, { recursive: true });
  console.log(`[DB] \u521B\u5EFA\u6570\u636E\u76EE\u5F55: ${crosswmsDir}`);
}
var db = new import_better_sqlite3.default(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  -- \u4F1A\u8BDD\u8868
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- \u6D88\u606F\u8868
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- \u4E3A\u4F1A\u8BDD ID \u521B\u5EFA\u7D22\u5F15\uFF0C\u52A0\u901F\u6309\u4F1A\u8BDD\u67E5\u8BE2\u6D88\u606F
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
`);
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
  const hasColumn = tableInfo.some((col) => col.name === "sdk_session_id");
  if (!hasColumn) {
    db.exec("ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT");
    console.log("[DB] \u5DF2\u6DFB\u52A0 sdk_session_id \u5217\u5230 sessions \u8868");
  }
} catch (e) {
}
function getAllSessions() {
  const stmt = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC");
  return stmt.all();
}
function getSession(id) {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  return stmt.get(id);
}
function createSession(session) {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
  return session;
}
function updateSession(id, updates) {
  const fields = [];
  const values = [];
  if (updates.title !== void 0) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.model !== void 0) {
    fields.push("model = ?");
    values.push(updates.model);
  }
  if (updates.sdk_session_id !== void 0) {
    fields.push("sdk_session_id = ?");
    values.push(updates.sdk_session_id);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  values.push((/* @__PURE__ */ new Date()).toISOString());
  values.push(id);
  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}
function deleteSession(id) {
  const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
function getMessagesBySession(sessionId) {
  const stmt = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC");
  return stmt.all(sessionId);
}
function createMessage(message) {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.session_id,
    message.role,
    message.content,
    message.model,
    message.created_at,
    message.tool_calls
  );
  const updateStmt = db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?");
  updateStmt.run((/* @__PURE__ */ new Date()).toISOString(), message.session_id);
  return message;
}

// server/index.ts
var pendingActions = /* @__PURE__ */ new Map();
var pendingPermissions = /* @__PURE__ */ new Map();
var PERMISSION_TIMEOUT = 5 * 60 * 1e3;
var cachedModels = [];
var defaultModel = "claude-sonnet-4";
var app = (0, import_express.default)();
var PORT = 3001;
app.use(import_express.default.json());
app.use((0, import_cors.default)({
  origin: ["http://localhost:5173", "http://localhost:3001"],
  credentials: true
}));
var getFrontendDistPath = () => {
  if (process.env.FRONTEND_DIST_PATH) {
    return process.env.FRONTEND_DIST_PATH;
  }
  const candidates = [
    import_path2.default.join(__dirname, "../frontend_dist"),
    // 开发环境
    import_path2.default.join(__dirname, "../dist"),
    // 开发环境（Vite 默认）
    import_path2.default.join(__dirname, "../../frontend_dist"),
    // 打包后 Resources/server_dist/ → Resources/frontend_dist
    import_path2.default.join(__dirname, "../../dist")
    // 备用
  ];
  for (const p of candidates) {
    if (import_fs2.default.existsSync(p)) return p;
  }
  return import_path2.default.join(process.cwd(), "frontend_dist");
};
var frontendDistPath = getFrontendDistPath();
console.log(`[Static] \u524D\u7AEF\u9759\u6001\u6587\u4EF6\u76EE\u5F55: ${frontendDistPath}`);
console.log(`[Static] \u76EE\u5F55\u5B58\u5728: ${import_fs2.default.existsSync(frontendDistPath)}`);
if (import_fs2.default.existsSync(frontendDistPath)) {
  const files = import_fs2.default.readdirSync(frontendDistPath);
  console.log(`[Static] \u76EE\u5F55\u5185\u5BB9: ${files.join(", ")}`);
}
app.use(import_express.default.static(frontendDistPath, {
  index: "index.html",
  maxAge: "1d"
}));
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) {
    return next();
  }
  const indexPath = import_path2.default.join(frontendDistPath, "index.html");
  console.log(`[SPA Fallback] ${req.method} ${req.path} \u2192 ${indexPath}`);
  console.log(`[SPA Fallback] index.html \u5B58\u5728: ${import_fs2.default.existsSync(indexPath)}`);
  if (import_fs2.default.existsSync(indexPath)) {
    _res.sendFile(indexPath);
  } else {
    console.error(`[SPA Fallback] index.html \u672A\u627E\u5230: ${indexPath}`);
    _res.status(404).json({ error: "cannot GET " + req.path, path: req.path, frontendDistPath });
  }
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/version", (_req, res) => {
  const packageJson = require_package();
  res.json({
    version: packageJson.version,
    name: packageJson.name,
    buildDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
});
app.get("/api/check-login", async (_req, res) => {
  const response = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {}
  };
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;
  if (apiKey || authToken) {
    response.envConfigured = true;
    if (apiKey) {
      response.envVars.apiKey = apiKey.slice(0, 8) + "****" + apiKey.slice(-4);
      response.apiKey = response.envVars.apiKey;
    }
    if (authToken) {
      response.envVars.authToken = authToken.slice(0, 8) + "****" + authToken.slice(-4);
    }
    if (internetEnv) {
      response.envVars.internetEnv = internetEnv;
    }
    if (baseUrl) {
      response.envVars.baseUrl = baseUrl;
    }
  }
  try {
    let needsLogin = false;
    const result = await (0, import_agent_sdk.unstable_v2_authenticate)({
      environment: "external",
      onAuthUrl: async (authState) => {
        needsLogin = true;
        console.log("[Check Login] \u9700\u8981\u767B\u5F55\uFF0C\u8BA4\u8BC1 URL:", authState.authUrl);
        response.error = "\u672A\u767B\u5F55\uFF0C\u8BF7\u5148\u767B\u5F55 CodeBuddy CLI";
      }
    });
    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? "env" : "cli";
      console.log("[Check Login] \u5DF2\u767B\u5F55\u7528\u6237:", result.userinfo.userName);
    } else if (!needsLogin) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? "env" : "cli";
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Check Login] SDK \u9519\u8BEF:", errMsg);
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = "env";
    } else {
      response.error = errMsg;
      response.method = "none";
    }
  }
  res.json(response);
});
app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  if (!apiKey && !authToken) {
    return res.status(400).json({ error: "\u8BF7\u81F3\u5C11\u914D\u7F6E API Key \u6216 Auth Token" });
  }
  const configuredVars = [];
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    configuredVars.push("CODEBUDDY_API_KEY");
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    configuredVars.push("CODEBUDDY_AUTH_TOKEN");
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    configuredVars.push("CODEBUDDY_INTERNET_ENVIRONMENT");
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    configuredVars.push("CODEBUDDY_BASE_URL");
  }
  cachedModels = [];
  res.json({
    success: true,
    message: `\u5DF2\u8BBE\u7F6E: ${configuredVars.join(", ")}`,
    note: "\u73AF\u5883\u53D8\u91CF\u4EC5\u5728\u5F53\u524D\u670D\u52A1\u5668\u8FDB\u7A0B\u6709\u6548\uFF0C\u91CD\u542F\u540E\u9700\u8981\u91CD\u65B0\u8BBE\u7F6E"
  });
});
app.get("/api/models", async (_req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log("[Models] \u521B\u5EFA\u4E34\u65F6\u4F1A\u8BDD\u4EE5\u83B7\u53D6\u53EF\u7528\u6A21\u578B\u5217\u8868...");
      const session = await (0, import_agent_sdk.unstable_v2_createSession)({
        cwd: process.cwd()
      });
      console.log("[Models] \u4F1A\u8BDD\u5DF2\u521B\u5EFA\uFF0C\u8C03\u7528 getAvailableModels()...");
      const models = await session.getAvailableModels();
      console.log("[Models] \u83B7\u53D6\u5230", models.length, "\u4E2A\u6A21\u578B");
      if (models && Array.isArray(models)) {
        cachedModels = models;
      }
    }
    res.json({
      models: cachedModels.length > 0 ? cachedModels : [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }
      ],
      defaultModel
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Models] \u83B7\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25:", errMsg);
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" }
      ],
      defaultModel,
      error: errMsg
    });
  }
});
app.get("/api/sessions", (_req, res) => {
  try {
    const sessions = getAllSessions();
    const sessionsWithMessages = sessions.map((session) => {
      const messages = getMessagesBySession(session.id);
      return {
        ...session,
        messageCount: messages.length
      };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u83B7\u53D6\u4F1A\u8BDD\u5931\u8D25";
    console.error("[Sessions] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" });
    }
    const messages = getMessagesBySession(sessionId);
    const parsedMessages = messages.map((msg) => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    res.json({ session, messages: parsedMessages });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u83B7\u53D6\u4F1A\u8BDD\u5931\u8D25";
    console.error("[Session] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "\u65B0\u5BF9\u8BDD" } = req.body;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = createSession({
      id: (0, import_uuid.v4)(),
      title,
      model,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });
    res.json({ session });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25";
    console.error("[Create Session] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;
    const success = updateSession(sessionId, { title, model });
    if (!success) {
      return res.status(404).json({ error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" });
    }
    res.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u66F4\u65B0\u4F1A\u8BDD\u5931\u8D25";
    console.error("[Update Session] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = deleteSession(sessionId);
    if (!success) {
      return res.status(404).json({ error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" });
    }
    res.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u5220\u9664\u4F1A\u8BDD\u5931\u8D25";
    console.error("[Delete Session] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  console.log(`[Permission] \u6536\u5230\u6743\u9650\u54CD\u5E94: requestId=${requestId}, behavior=${behavior}`);
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] \u8BF7\u6C42\u4E0D\u5B58\u5728: ${requestId}`);
    return res.status(404).json({ error: "\u6743\u9650\u8BF7\u6C42\u4E0D\u5B58\u5728\u6216\u5DF2\u8D85\u65F6" });
  }
  pendingPermissions.delete(requestId);
  if (behavior === "allow") {
    pending.resolve({
      behavior: "allow",
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: "deny",
      message: message || "\u7528\u6237\u62D2\u7EDD\u4E86\u6B64\u64CD\u4F5C"
    });
  }
  res.json({ success: true });
});
var currentSystemContext = {};
app.get("/api/context", (_req, res) => {
  res.json({ context: currentSystemContext });
});
app.post("/api/context", (req, res) => {
  const { context } = req.body;
  if (context) {
    currentSystemContext = context;
  }
  res.json({ success: true });
});
app.get("/api/warehouses", (_req, res) => {
  try {
    const warehouses = currentSystemContext?.warehouses || [];
    res.json({ warehouses });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u8BFB\u53D6\u4ED3\u5E93\u6570\u636E\u5931\u8D25";
    console.error("[Warehouses] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/warehouses/:id", (req, res) => {
  try {
    const { id } = req.params;
    const warehouses = currentSystemContext?.warehouses || [];
    const warehouse = warehouses.find((w) => w.id === id || w.name === id);
    if (!warehouse) {
      return res.status(404).json({ error: "\u4ED3\u5E93\u4E0D\u5B58\u5728" });
    }
    res.json({ warehouse });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u8BFB\u53D6\u4ED3\u5E93\u6570\u636E\u5931\u8D25";
    console.error("[Warehouse] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/inventory", (req, res) => {
  try {
    const mockInventory = [
      { id: "SKU-001", name: "\u65E0\u7EBF\u84DD\u7259\u8033\u673A", category: "\u7535\u5B50\u4EA7\u54C1", warehouse: "\u6DF1\u5733\u4ED3", warehouseId: "sz", quantity: 1200, value: 24e4, status: "\u6B63\u5E38" },
      { id: "SKU-002", name: "\u667A\u80FD\u624B\u8868", category: "\u7535\u5B50\u4EA7\u54C1", warehouse: "\u6DF1\u5733\u4ED3", warehouseId: "sz", quantity: 850, value: 425e3, status: "\u6B63\u5E38" },
      { id: "SKU-003", name: "\u8FD0\u52A8\u8DD1\u978B", category: "\u670D\u88C5\u978B\u5E3D", warehouse: "\u6D1B\u6749\u77F6\u4ED3", warehouseId: "lax", quantity: 600, value: 18e4, status: "\u9884\u8B66" },
      { id: "SKU-004", name: "\u4FDD\u6E29\u676F", category: "\u65E5\u7528\u54C1", warehouse: "\u6CD5\u5170\u514B\u798F\u4ED3", warehouseId: "fra", quantity: 2e3, value: 16e4, status: "\u6B63\u5E38" },
      { id: "SKU-005", name: "\u673A\u68B0\u952E\u76D8", category: "\u7535\u5B50\u4EA7\u54C1", warehouse: "\u5927\u962A\u4ED3", warehouseId: "osa", quantity: 450, value: 315e3, status: "\u9884\u8B66" },
      { id: "SKU-006", name: "USB-C \u6570\u636E\u7EBF", category: "\u7535\u5B50\u4EA7\u54C1", warehouse: "\u6DF1\u5733\u4ED3", warehouseId: "sz", quantity: 5e3, value: 25e4, status: "\u6B63\u5E38" },
      { id: "SKU-007", name: "\u745C\u4F3D\u57AB", category: "\u4F53\u80B2\u7528\u54C1", warehouse: "\u4F26\u6566\u4ED3", warehouseId: "lhr", quantity: 300, value: 45e3, status: "\u6B63\u5E38" }
    ];
    const { warehouseId } = req.query;
    let filtered = mockInventory;
    if (warehouseId && typeof warehouseId === "string") {
      filtered = mockInventory.filter((item) => item.warehouseId === warehouseId);
    }
    res.json({ inventory: filtered });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u8BFB\u53D6\u5E93\u5B58\u6570\u636E\u5931\u8D25";
    console.error("[Inventory] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/shipments", (req, res) => {
  try {
    const mockShipments = [
      { id: "SHP-001", trackingNo: "SF1234567890", origin: "\u6DF1\u5733", destination: "\u6D1B\u6749\u77F6", warehouseId: "lax", status: "\u5728\u9014", items: 500, value: 15e4, departure: "2026-05-10", estimatedArrival: "2026-05-28" },
      { id: "SHP-002", trackingNo: "SF0987654321", origin: "\u6DF1\u5733", destination: "\u6CD5\u5170\u514B\u798F", warehouseId: "fra", items: 300, value: 9e4, status: "\u5728\u9014", departure: "2026-05-15", estimatedArrival: "2026-06-05" },
      { id: "SHP-003", trackingNo: "UPS5566778899", origin: "\u5927\u962A", destination: "\u6DF1\u5733", warehouseId: "sz", items: 800, value: 24e4, status: "\u5DF2\u5230\u8FBE", departure: "2026-05-08", estimatedArrival: "2026-05-25" },
      { id: "SHP-004", trackingNo: "DHL1122334455", origin: "\u6DF1\u5733", destination: "\u4F26\u6566", warehouseId: "lhr", items: 450, value: 135e3, status: "\u5728\u9014", departure: "2026-05-20", estimatedArrival: "2026-06-10" }
    ];
    const { status, warehouseId } = req.query;
    let filtered = mockShipments;
    if (status && typeof status === "string") {
      filtered = filtered.filter((s) => s.status === status);
    }
    if (warehouseId && typeof warehouseId === "string") {
      filtered = filtered.filter((s) => s.warehouseId === warehouseId);
    }
    res.json({ shipments: filtered });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u8BFB\u53D6\u8FD0\u5355\u6570\u636E\u5931\u8D25";
    console.error("[Shipments] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/dashboard/kpi", (_req, res) => {
  try {
    const warehouses = currentSystemContext?.warehouses || [];
    let totalItems = 0;
    let warehouseCount = warehouses.length;
    totalItems = warehouses.reduce((sum, w) => sum + (w.usedItems || 0), 0);
    res.json({
      totalInventory: totalItems,
      totalValue: totalItems * 200,
      // 简化估算
      warehouseCount,
      inTransit: 2050,
      activeShipments: 4,
      lowStockAlerts: 2
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u8BFB\u53D6 KPI \u6570\u636E\u5931\u8D25";
    console.error("[Dashboard KPI] \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.post("/api/actions", (req, res) => {
  try {
    const { type, params, sessionId } = req.body;
    if (!type || !["create_warehouse", "delete_warehouse", "update_warehouse", "create_shipment", "update_inventory"].includes(type)) {
      return res.status(400).json({ error: `\u65E0\u6548\u7684\u64CD\u4F5C\u7C7B\u578B: ${type}` });
    }
    const action = {
      id: (0, import_uuid.v4)(),
      type,
      params: params || {},
      status: "pending",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: sessionId || "unknown"
    };
    pendingActions.set(action.id, action);
    console.log(`[Actions] \u521B\u5EFA\u64CD\u4F5C: id=${action.id}, type=${action.type}`);
    res.json({ action });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u521B\u5EFA\u64CD\u4F5C\u5931\u8D25";
    console.error("[Actions] POST \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.get("/api/actions", (req, res) => {
  try {
    const { status } = req.query;
    let actions = Array.from(pendingActions.values());
    if (status && typeof status === "string") {
      actions = actions.filter((a) => a.status === status);
    }
    actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ actions });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u83B7\u53D6\u64CD\u4F5C\u5217\u8868\u5931\u8D25";
    console.error("[Actions] GET \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.patch("/api/actions/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { status, result, error } = req.body;
    const action = pendingActions.get(id);
    if (!action) {
      return res.status(404).json({ error: "\u64CD\u4F5C\u4E0D\u5B58\u5728" });
    }
    action.status = status || action.status;
    if (result !== void 0) action.result = result;
    if (error !== void 0) action.error = error;
    action.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    pendingActions.set(id, action);
    console.log(`[Actions] \u66F4\u65B0\u64CD\u4F5C: id=${id}, status=${action.status}`);
    res.json({ action });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "\u66F4\u65B0\u64CD\u4F5C\u5931\u8D25";
    console.error("[Actions] PATCH \u9519\u8BEF:", errMsg);
    res.status(500).json({ error: errMsg });
  }
});
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  console.log("\n[Chat] ========== \u65B0\u8BF7\u6C42 ==========");
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? "..." : ""}`);
  console.log(`[Chat] CWD: ${cwd || "\u9ED8\u8BA4"}`);
  console.log(`[Chat] PermissionMode: ${permissionMode || "\u9ED8\u8BA4"}`);
  if (!message) {
    console.log("[Chat] \u9519\u8BEF: \u6D88\u606F\u4E3A\u7A7A");
    return res.status(400).json({ error: "\u6D88\u606F\u4E0D\u80FD\u4E3A\u7A7A" });
  }
  let session = sessionId ? getSession(sessionId) : null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!session) {
    console.log("[Chat] \u521B\u5EFA\u65B0\u4F1A\u8BDD");
    session = createSession({
      id: sessionId || (0, import_uuid.v4)(),
      title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
      model: model || defaultModel,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] \u4F7F\u7528\u73B0\u6709\u4F1A\u8BDD, SDK Session: ${session.sdk_session_id || "\u65E0"}`);
  }
  const selectedModel = model || session.model;
  const sdkSessionId = session.sdk_session_id;
  const userMessageId = (0, import_uuid.v4)();
  const assistantMessageId = (0, import_uuid.v4)();
  try {
    createMessage({
      id: userMessageId,
      session_id: session.id,
      role: "user",
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] \u7528\u6237\u6D88\u606F\u5DF2\u4FDD\u5B58: ${userMessageId}`);
  } catch (dbError) {
    const errMsg = dbError instanceof Error ? dbError.message : "\u4FDD\u5B58\u6D88\u606F\u5931\u8D25";
    console.error("[Chat] \u4FDD\u5B58\u7528\u6237\u6D88\u606F\u5931\u8D25:", errMsg);
    return res.status(500).json({ error: "\u4FDD\u5B58\u6D88\u606F\u5931\u8D25", detail: errMsg });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const baseSystemPrompt = `\u4F60\u662F CrossWMS\uFF08\u8DE8\u5883\u4ED3\u5E93\u7BA1\u7406\u7CFB\u7EDF\uFF09\u7684 AI \u52A9\u624B\u3002

\u7CFB\u7EDF\u80CC\u666F\uFF1A
- CrossWMS \u662F\u4E00\u4E2A\u8DE8\u5883\u4ED3\u5E93\u7BA1\u7406\u7CFB\u7EDF\uFF0C\u7BA1\u7406\u591A\u4E2A\u6D77\u5916\u4ED3\u5E93
- \u529F\u80FD\u6A21\u5757\uFF1A\u4EEA\u8868\u76D8\u3001\u4ED3\u5E93\u7BA1\u7406\u3001\u5728\u9014\u7BA1\u7406\u3001\u5E93\u5B58\u7BA1\u7406\u3001\u7EDF\u8BA1\u62A5\u8868\u3001\u7CFB\u7EDF\u8BBE\u7F6E
- \u6570\u636E\u5305\u62EC\uFF1A\u4ED3\u5E93\u4FE1\u606F\u3001\u8FD0\u5355\u8DDF\u8E2A\u3001\u5E93\u5B58SKU\u3001\u5E93\u9F84\u9884\u8B66

\u4F60\u7684\u80FD\u529B\uFF1A
- \u56DE\u7B54\u5173\u4E8E\u4ED3\u5E93\u7BA1\u7406\u3001\u5E93\u5B58\u4F18\u5316\u3001\u8DE8\u5883\u7269\u6D41\u7684\u95EE\u9898
- \u5E2E\u52A9\u5206\u6790\u6570\u636E\u3001\u751F\u6210\u62A5\u8868\u6458\u8981
- \u63D0\u4F9B\u7CFB\u7EDF\u4F7F\u7528\u6307\u5BFC
- \u901A\u8FC7\u5DE5\u5177\u8C03\u7528\u5E2E\u52A9\u7528\u6237\u5728\u7CFB\u7EDF\u5185\u6267\u884C\u64CD\u4F5C\uFF08\u521B\u5EFA/\u5220\u9664/\u66F4\u65B0\u4ED3\u5E93\u7B49\uFF09

## \u53EF\u7528 API \u7AEF\u70B9\uFF08\u7528\u4E8E\u5DE5\u5177\u8C03\u7528\uFF09

### 1. \u6570\u636E\u67E5\u8BE2 API\uFF08GET \u8BF7\u6C42\uFF0C\u8FD4\u56DE JSON\uFF09
- GET /api/warehouses \u2192 \u83B7\u53D6\u4ED3\u5E93\u5217\u8868
  \u8FD4\u56DE\uFF1A{ warehouses: [{ id, name, location, usedItems, totalItems, usedVolume, totalVolume }] }
- GET /api/warehouses/:id \u2192 \u83B7\u53D6\u5355\u4E2A\u4ED3\u5E93\u8BE6\u60C5
- GET /api/inventory?warehouseId=xxx \u2192 \u83B7\u53D6\u5E93\u5B58\u5217\u8868
- GET /api/shipments?status=pending&warehouseId=xxx \u2192 \u83B7\u53D6\u5728\u9014\u8FD0\u5355
- GET /api/dashboard/kpi \u2192 \u83B7\u53D6\u4EEA\u8868\u76D8 KPI \u6570\u636E
  \u8FD4\u56DE\uFF1A{ totalInventory, totalValue, warehouseCount, inTransit, activeShipments, lowStockAlerts }

### 2. \u64CD\u4F5C\u961F\u5217 API\uFF08\u7528\u4E8E\u6267\u884C\u5199\u64CD\u4F5C\uFF09
- POST /api/actions \u2192 \u63D0\u4EA4\u64CD\u4F5C\u6307\u4EE4
  \u8BF7\u6C42\u4F53\uFF1A{ type: "create_warehouse"|"delete_warehouse"|"update_warehouse", params: {...} }
  \u8FD4\u56DE\uFF1A{ action: { id, type, status } }
  \u64CD\u4F5C\u7C7B\u578B\u4E0E\u53C2\u6570\uFF1A
  - create_warehouse: { name, location, totalItems, usedItems, totalVolume, usedVolume }
  - delete_warehouse: { id: "\u4ED3\u5E93ID" }
  - update_warehouse: { id: "\u4ED3\u5E93ID", updates: { name?, location?, totalItems?, usedItems?, totalVolume?, usedVolume? } }
- GET /api/actions?status=pending \u2192 \u83B7\u53D6\u5F85\u5904\u7406\u64CD\u4F5C\u5217\u8868
- PATCH /api/actions/:id \u2192 \u66F4\u65B0\u64CD\u4F5C\u72B6\u6001 { status: "completed"|"failed", result?: "...", error?: "..." }

## \u64CD\u4F5C\u6267\u884C\u6D41\u7A0B
1. \u5F53\u7528\u6237\u8981\u6C42\u521B\u5EFA/\u5220\u9664/\u66F4\u65B0\u4ED3\u5E93\u65F6\uFF0C\u8C03\u7528 POST /api/actions \u63D0\u4EA4\u64CD\u4F5C
2. \u524D\u7AEF\u4F1A\u8F6E\u8BE2 GET /api/actions?status=pending \u83B7\u53D6\u5F85\u5904\u7406\u64CD\u4F5C\u5E76\u6267\u884C
3. \u524D\u7AEF\u6267\u884C\u5B8C\u540E\u8C03\u7528 PATCH /api/actions/:id \u66F4\u65B0\u72B6\u6001

## \u56DE\u7B54\u8981\u6C42
- \u4F7F\u7528\u4E2D\u6587\u56DE\u7B54
- \u6D89\u53CA\u6570\u636E\u65F6\u5F15\u7528\u5177\u4F53\u6570\u503C
- \u7B80\u6D01\u4E13\u4E1A\uFF0C\u907F\u514D\u5197\u4F59
- \u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u660E\u786E\u8BF4\u660E\u800C\u4E0D\u662F\u731C\u6D4B
- \u63D0\u4EA4\u64CD\u4F5C\u540E\u544A\u8BC9\u7528\u6237"\u5DF2\u63D0\u4EA4\u64CD\u4F5C\uFF0C\u524D\u7AEF\u6B63\u5728\u6267\u884C..."`;
  let finalSystemPrompt = baseSystemPrompt;
  if (currentSystemContext && Object.keys(currentSystemContext).length > 0) {
    const contextStr = Object.entries(currentSystemContext).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`).join("\n");
    finalSystemPrompt += `

\u5F53\u524D\u7CFB\u7EDF\u6570\u636E\uFF1A
${contextStr}`;
  }
  const systemPromptToUse = systemPrompt || finalSystemPrompt;
  const workingDir = cwd || process.cwd();
  try {
    console.log("[Chat] \u8C03\u7528 SDK query...");
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || "\u65E0"}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || "\u9ED8\u8BA4"}`);
    const canUseTool = async (toolName, input, options) => {
      console.log(`[Permission] \u5DE5\u5177\u8BF7\u6C42: ${toolName}`);
      console.log(`[Permission] \u8F93\u5165:`, JSON.stringify(input, null, 2));
      if (permissionMode === "bypassPermissions") {
        console.log(`[Permission] \u8DF3\u8FC7\u6743\u9650\u68C0\u67E5: ${toolName}`);
        return { behavior: "allow", updatedInput: input };
      }
      const requestId = (0, import_uuid.v4)();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session.id,
        timestamp: Date.now()
      };
      res.write(`data: ${JSON.stringify({
        type: "permission_request",
        ...permissionRequest
      })}

`);
      return new Promise((resolve, reject) => {
        const pending = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session.id,
          timestamp: Date.now()
        };
        pendingPermissions.set(requestId, pending);
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            console.log(`[Permission] \u8BF7\u6C42\u8D85\u65F6: ${requestId}`);
            resolve({
              behavior: "deny",
              message: "\u6743\u9650\u8BF7\u6C42\u8D85\u65F6"
            });
          }
        }, PERMISSION_TIMEOUT);
      });
    };
    const stream = (0, import_agent_sdk.query)({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: systemPromptToUse,
        permissionMode: permissionMode || "default",
        canUseTool,
        ...sdkSessionId ? { resume: sdkSessionId } : {}
      }
    });
    let fullResponse = "";
    let toolCalls = [];
    let newSdkSessionId = null;
    res.write(`data: ${JSON.stringify({
      type: "init",
      sessionId: session.id,
      userMessageId,
      assistantMessageId,
      model: selectedModel
    })}

`);
    let currentToolId = null;
    for await (const msg of stream) {
      console.log("[Stream] \u6D88\u606F\u7C7B\u578B:", msg.type, msg);
      if (msg.type === "system" && msg.subtype === "init") {
        newSdkSessionId = msg.session_id;
        console.log(`[Stream] \u83B7\u53D6\u5230 SDK session_id: ${newSdkSessionId}`);
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          updateSession(session.id, { sdk_session_id: newSdkSessionId });
          console.log("[Stream] SDK session_id \u5DF2\u4FDD\u5B58\u5230\u6570\u636E\u5E93");
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;
        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}

`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              const text = block.text;
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ type: "text", content: text })}

`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || (0, import_uuid.v4)();
              const toolInput = block.input || {};
              console.log(`[Stream] \u5DE5\u5177\u8C03\u7528: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] \u5DE5\u5177\u8F93\u5165:`, JSON.stringify(toolInput, null, 2));
              const toolCall = {
                id: currentToolId,
                name: block.name,
                input: toolInput,
                status: "running"
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({
                type: "tool",
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}

`);
            }
          }
        }
      } else if (msg.type === "tool_result") {
        const msgAny = msg;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        console.log(`[Stream] \u5DE5\u5177\u7ED3\u679C: tool_use_id=${toolId}, is_error=${isError}`);
        const tool = toolCalls.find((t) => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === "string" ? content : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({
            type: "tool_result",
            toolId: tool.id,
            content: tool.result,
            isError
          })}

`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        toolCalls.forEach((tool) => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "\u5DF2\u5B8C\u6210" })}

`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: "done", duration: msg.duration, cost: msg.cost })}

`);
      }
    }
    createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: "assistant",
      content: fullResponse,
      model: selectedModel,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });
    const messages = getMessagesBySession(session.id);
    if (messages.length <= 2) {
      updateSession(session.id, {
        title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
        model: selectedModel
      });
    }
    console.log("[Chat] \u8BF7\u6C42\u5B8C\u6210 \u2713");
    res.end();
  } catch (error) {
    console.error("\n[Chat] ========== \u9519\u8BEF ==========");
    if (error instanceof Error) {
      console.error("[Chat] Error Name:", error.name);
      console.error("[Chat] Error Message:", error.message);
      console.error("[Chat] Error Stack:", error.stack);
    } else {
      console.error("[Chat] Error:", error);
    }
    const errorMessage = error instanceof Error ? error.message : "\u5904\u7406\u8BF7\u6C42\u65F6\u53D1\u751F\u9519\u8BEF";
    res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}

`);
    res.end();
  }
});
app.listen(PORT, () => {
  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551                                            \u2551
\u2551     \u25C9 CrossWMS API \u670D\u52A1\u5668\u5DF2\u542F\u52A8            \u2551
\u2551                                            \u2551
\u2551     \u5730\u5740: http://localhost:${PORT}            \u2551
\u2551     \u6570\u636E\u5E93: ~/.crosswms/chat.db            \u2551
\u2551                                            \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
  `);
});

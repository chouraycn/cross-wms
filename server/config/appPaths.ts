import path from 'path';
import os from 'os';
import fs from 'fs';
import { AppIdentity } from './appIdentity.js';

const APP_DIR_NAME = AppIdentity.appDirName;
const APP_NAME = AppIdentity.appName;

function getMacOSAppSupportDir(): string {
  // macOS 标准应用支持目录: ~/Library/Application Support/<AppName>
  return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
}

function getLegacyDataDir(): string {
  // 旧版数据目录（兼容迁移）
  return path.join(os.homedir(), APP_DIR_NAME);
}

function resolveRootDir(): string {
  // 1. 环境变量优先（Swift 宿主注入 CDF_DATA_DIR）
  if (process.env.CDF_DATA_DIR) {
    const envRoot = path.dirname(process.env.CDF_DATA_DIR);

    // v1.7.88: 修复安装后历史对话丢失 — Swift 使用 "CDFKnowClow"（无空格），
    // TS 默认使用 "CDF Know Clow"（含空格），导致新旧目录不一致。
    // 在 env 分支也执行 legacy 目录迁移，把旧数据搬到新目录。
    if (process.platform === 'darwin' && !process.env.CDF_SKIP_MIGRATION) {
      const legacyDirs = [
        // 含空格的旧目录
        path.join(os.homedir(), 'Library', 'Application Support', 'CDF Know Clow'),
        // 早期无空格旧目录
        path.join(os.homedir(), '.cdf-know-clow'),
      ];

      for (const legacyDir of legacyDirs) {
        if (legacyDir === envRoot) continue; // 同一路径，跳过
        // 检测关键数据：sessions 目录、chat.db 数据库、加密密钥，任一存在即需迁移
        const hasData = fs.existsSync(path.join(legacyDir, 'sessions'))
          || fs.existsSync(path.join(legacyDir, 'chat.db'))
          || fs.existsSync(path.join(legacyDir, '.encryption_key'));
        if (hasData) {
          try {
            // 逐项合并（而非整体 rename，避免目标目录已存在部分文件时失败）
            mergeDirectory(legacyDir, envRoot);
            console.log(`[appPaths] 历史数据已迁移: ${legacyDir} -> ${envRoot}`);
          } catch (e) {
            console.error(`[appPaths] 迁移失败 (${legacyDir} -> ${envRoot}):`, e);
          }
        }
      }
    }

    return envRoot;
  }

  // 2. macOS 使用标准 Application Support 目录（规范名 CDFKnowClow，与发布版一致）
  if (process.platform === 'darwin') {
    const appSupportDir = getMacOSAppSupportDir();
    // 确保规范目录存在
    if (!fs.existsSync(appSupportDir)) {
      fs.mkdirSync(appSupportDir, { recursive: true });
    }
    // 合并所有旧目录数据到规范目录（复制而非删除，已存在文件跳过）
    // 修复：早期 dev 模式 / 旧版落点使用含空格的 "CDF Know Clow" 目录，
    // 导致重装 / 切换运行方式后历史对话看似丢失。统一合并到规范目录。
    if (!process.env.CDF_SKIP_MIGRATION) {
      const legacyDirs = [
        path.join(os.homedir(), 'Library', 'Application Support', 'CDF Know Clow'),
        getLegacyDataDir(),
      ];
      for (const legacyDir of legacyDirs) {
        if (legacyDir === appSupportDir) continue;
        // 检测关键数据：sessions 目录、chat.db 数据库、加密密钥，任一存在即需迁移
        const hasData = fs.existsSync(path.join(legacyDir, 'sessions'))
          || fs.existsSync(path.join(legacyDir, 'chat.db'))
          || fs.existsSync(path.join(legacyDir, '.encryption_key'));
        if (hasData) {
          try {
            mergeDirectory(legacyDir, appSupportDir);
            console.log(`[appPaths] 历史数据已合并: ${legacyDir} -> ${appSupportDir}`);
          } catch (e) {
            console.error(`[appPaths] 合并失败 (${legacyDir} -> ${appSupportDir}):`, e);
          }
        }
      }
    }
    return appSupportDir;
  }

  // 3. 其他平台使用用户主目录
  return path.join(os.homedir(), APP_DIR_NAME);
}

/** 递归合并目录：把 src 内容合并到 dest，已存在的文件跳过 */
function mergeDirectory(src: string, dest: string): void {
  // Defensive: some test mocks provide a partial fs implementation.
  if (typeof fs.readdirSync !== 'function') {
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeDirectory(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

const rootDir: string = resolveRootDir();

export const AppPaths = {
  rootDir,
  dataDir: path.join(rootDir, 'data'),
  userDataDir: path.join(rootDir, 'user-data'),
  sessionsDir: path.join(rootDir, 'sessions'),
  archivedSessionsDir: path.join(rootDir, 'sessions-archived'),
  memoryDir: path.join(rootDir, 'memory'),
  modelsDir: path.join(rootDir, 'ai-models'),
  mcpDir: path.join(rootDir, 'mcp'),
  wmsDataDir: path.join(rootDir, 'wms-data'),
  reportsDir: path.join(rootDir, 'reports'),
  configDir: path.join(rootDir, 'config'),
  identityDir: path.join(rootDir, 'identity'),
  skillsDir: path.join(rootDir, 'skills'),
  pluginsDir: path.join(rootDir, 'plugins'),
  hooksDir: path.join(rootDir, 'hooks'),
  configSchemaFile: path.join(rootDir, 'config', 'config.schema.json'),
  userConfigFile: path.join(rootDir, 'config', 'config.json'),
  pluginUploadsDir: path.join(rootDir, 'plugins', '.uploads'),
  uploadsDir: path.join(rootDir, 'uploads'),
  logsDir: path.join(rootDir, 'logs'),
  embeddingDir: path.join(rootDir, 'embedding'),
  browserProfilesDir: path.join(rootDir, 'browser-profiles'),
  onnxModelsDir: path.join(rootDir, 'models'),
  generatedFilesDir: path.join(rootDir, 'generated-files'),
  soulFile: path.join(rootDir, 'SOUL.md'),
  userFile: path.join(rootDir, 'USER.md'),
  oldModelsFile: path.join(rootDir, 'models.json'),
  modelsFile: path.join(rootDir, 'ai-models', 'models.json'),
  chatDbFile: path.join(rootDir, 'chat.db'),
  mainDbFile: path.join(rootDir, 'data', 'main.db'),
  mcpDbFile: path.join(rootDir, 'mcp', 'mcp_servers.db'),
  settingsFile: path.join(rootDir, 'settings.json'),
  encryptionKeyFile: path.join(rootDir, '.encryption_key'),
  encryptionKeyBackupFile: path.join(rootDir, '.encryption_key_backup'),
};

export function ensureDir(dirPath: string): void {
  const fs = require('fs');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

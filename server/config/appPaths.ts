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
  // 1. 环境变量优先
  if (process.env.CDF_DATA_DIR) {
    return path.dirname(process.env.CDF_DATA_DIR);
  }

  // 2. macOS 使用标准 Application Support 目录
  if (process.platform === 'darwin') {
    const appSupportDir = getMacOSAppSupportDir();
    const legacyDir = getLegacyDataDir();

    // 如果标准目录已存在，直接使用
    if (fs.existsSync(appSupportDir)) {
      return appSupportDir;
    }

    // 如果旧目录存在且标准目录不存在，执行迁移
    if (fs.existsSync(legacyDir) && !fs.existsSync(appSupportDir)) {
      try {
        fs.mkdirSync(path.dirname(appSupportDir), { recursive: true });
        fs.renameSync(legacyDir, appSupportDir);
        console.log(`[appPaths] 数据已迁移: ${legacyDir} -> ${appSupportDir}`);
        return appSupportDir;
      } catch (e) {
        console.error(`[appPaths] 迁移失败，回退到旧目录:`, e);
        return legacyDir;
      }
    }

    // 全新安装，使用标准目录
    return appSupportDir;
  }

  // 3. 其他平台使用用户主目录
  return path.join(os.homedir(), APP_DIR_NAME);
}

const rootDir: string = resolveRootDir();

export const AppPaths = {
  rootDir,
  dataDir: path.join(rootDir, 'data'),
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

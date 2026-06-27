import path from 'path';
import os from 'os';
import { AppIdentity } from './appIdentity.js';

const APP_DIR_NAME = AppIdentity.appDirName;

const rootDir = path.join(os.homedir(), APP_DIR_NAME);

export const AppPaths = {
  rootDir,
  dataDir: path.join(rootDir, 'data'),
  sessionsDir: path.join(rootDir, 'sessions'),
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

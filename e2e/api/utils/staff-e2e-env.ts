/**
 * StaffDeck E2E 隔离环境
 *
 * 通过 process.env.CDF_DATA_DIR 将 StaffDeck 的 SQLite 重定向到临时目录，
 * 避免 e2e 测试污染真实数据文件（~/.cdf-know-clow/chat.db）。
 *
 * 必须在导入任何 server 模块（server/db-core.ts 在加载时即计算 DB_PATH）
 * 之前导入本模块，使 db-core 首次加载时读到临时目录。
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const STAFF_E2E_DATA_DIR = path.join(os.tmpdir(), `staff-deck-e2e-${process.pid}-${Date.now()}`);

fs.mkdirSync(STAFF_E2E_DATA_DIR, { recursive: true });

process.env.CDF_DATA_DIR = STAFF_E2E_DATA_DIR;
process.env.NODE_ENV = 'test';

export const STAFF_E2E_TMP_DIR = STAFF_E2E_DATA_DIR;

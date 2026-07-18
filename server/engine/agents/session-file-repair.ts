import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { getSessionFilePath, sessionDirExists } from './session-dirs.js';

export interface RepairResult {
  sessionId: string;
  file: string;
  repaired: boolean;
  method: string;
  error?: string;
}

export function isJsonValid(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

export function isJsonlValid(content: string): { valid: number; invalid: number } {
  const lines = content.split('\n').filter(l => l.trim());
  let valid = 0;
  let invalid = 0;

  for (const line of lines) {
    try {
      JSON.parse(line);
      valid++;
    } catch {
      invalid++;
    }
  }

  return { valid, invalid };
}

export function repairJsonFile(sessionId: string, fileName: string): RepairResult {
  const filePath = getSessionFilePath(sessionId, fileName);
  
  if (!fs.existsSync(filePath)) {
    return {
      sessionId,
      file: fileName,
      repaired: false,
      method: 'not_found',
      error: 'File does not exist',
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    if (isJsonValid(content)) {
      return {
        sessionId,
        file: fileName,
        repaired: false,
        method: 'already_valid',
      };
    }

    const trimmed = content.trim();
    if (isJsonValid(trimmed)) {
      fs.writeFileSync(filePath, trimmed, 'utf-8');
      return {
        sessionId,
        file: fileName,
        repaired: true,
        method: 'trim_whitespace',
      };
    }

    const lastBrace = trimmed.lastIndexOf('}');
    const lastBracket = trimmed.lastIndexOf(']');
    const cutIndex = Math.max(lastBrace, lastBracket);
    
    if (cutIndex > 0) {
      const truncated = trimmed.slice(0, cutIndex + 1);
      if (isJsonValid(truncated)) {
        fs.writeFileSync(filePath, truncated, 'utf-8');
        return {
          sessionId,
          file: fileName,
          repaired: true,
          method: 'truncate_incomplete',
        };
      }
    }

    return {
      sessionId,
      file: fileName,
      repaired: false,
      method: 'unrepairable',
      error: 'Could not repair JSON file',
    };
  } catch (err) {
    return {
      sessionId,
      file: fileName,
      repaired: false,
      method: 'error',
      error: String(err),
    };
  }
}

export function repairJsonlFile(sessionId: string, fileName: string): RepairResult {
  const filePath = getSessionFilePath(sessionId, fileName);
  
  if (!fs.existsSync(filePath)) {
    return {
      sessionId,
      file: fileName,
      repaired: false,
      method: 'not_found',
      error: 'File does not exist',
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const validLines: string[] = [];
    let repairedCount = 0;

    for (const line of lines) {
      if (!line.trim()) {
        validLines.push(line);
        continue;
      }

      try {
        JSON.parse(line);
        validLines.push(line);
      } catch {
        repairedCount++;
      }
    }

    if (repairedCount === 0) {
      return {
        sessionId,
        file: fileName,
        repaired: false,
        method: 'already_valid',
      };
    }

    fs.writeFileSync(filePath, validLines.join('\n'), 'utf-8');
    
    logger.warn(`[Agents:SessionFileRepair] Repaired ${repairedCount} invalid lines in ${sessionId}/${fileName}`);
    
    return {
      sessionId,
      file: fileName,
      repaired: true,
      method: `remove_${repairedCount}_invalid_lines`,
    };
  } catch (err) {
    return {
      sessionId,
      file: fileName,
      repaired: false,
      method: 'error',
      error: String(err),
    };
  }
}

export function repairSessionFiles(sessionId: string): RepairResult[] {
  if (!sessionDirExists(sessionId)) {
    return [];
  }

  const results: RepairResult[] = [];
  const jsonFiles = ['session.json'];
  const jsonlFiles = ['chat.jsonl', 'tool-calls.jsonl'];

  for (const file of jsonFiles) {
    results.push(repairJsonFile(sessionId, file));
  }

  for (const file of jsonlFiles) {
    results.push(repairJsonlFile(sessionId, file));
  }

  const repairedCount = results.filter(r => r.repaired).length;
  if (repairedCount > 0) {
    logger.info(`[Agents:SessionFileRepair] Repaired ${repairedCount} files for session ${sessionId}`);
  }

  return results;
}

export function backupFile(sessionId: string, fileName: string): string | null {
  const filePath = getSessionFilePath(sessionId, fileName);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.bak.${Date.now()}`;
  try {
    fs.copyFileSync(filePath, backupPath);
    logger.debug(`[Agents:SessionFileRepair] Backed up ${fileName} for ${sessionId}`);
    return backupPath;
  } catch (err) {
    logger.error(`[Agents:SessionFileRepair] Failed to backup ${fileName} for ${sessionId}:`, err);
    return null;
  }
}

export function validateSessionFiles(sessionId: string): { file: string; valid: boolean; error?: string }[] {
  if (!sessionDirExists(sessionId)) {
    return [];
  }

  const results: { file: string; valid: boolean; error?: string }[] = [];
  const checkFiles = ['session.json', 'chat.jsonl', 'tool-calls.jsonl'];

  for (const file of checkFiles) {
    const filePath = getSessionFilePath(sessionId, file);
    
    if (!fs.existsSync(filePath)) {
      results.push({ file, valid: true });
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (file.endsWith('.jsonl')) {
        const { invalid } = isJsonlValid(content);
        results.push({
          file,
          valid: invalid === 0,
          error: invalid > 0 ? `${invalid} invalid lines` : undefined,
        });
      } else {
        const valid = isJsonValid(content);
        results.push({
          file,
          valid,
          error: !valid ? 'Invalid JSON' : undefined,
        });
      }
    } catch (err) {
      results.push({ file, valid: false, error: String(err) });
    }
  }

  return results;
}

logger.debug('[Agents:SessionFileRepair] Module loaded');

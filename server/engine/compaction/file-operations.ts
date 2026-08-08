export interface FileOperations {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

export interface CompactionFileDetails {
  readFiles: string[];
  modifiedFiles: string[];
}

const READ_TOOL_NAMES = new Set([
  'read_file', 'readFile', 'read',
  'view_file', 'viewFile', 'view',
  'cat', 'head', 'tail',
]);

const WRITE_TOOL_NAMES = new Set([
  'write_file', 'writeFile', 'write',
  'create_file', 'createFile', 'create',
  'save_file', 'saveFile', 'save',
  'upload_file', 'uploadFile', 'upload',
]);

const EDIT_TOOL_NAMES = new Set([
  'edit_file', 'editFile', 'edit',
  'patch', 'applyPatch', 'apply_patch',
  'update_file', 'updateFile', 'update',
  'modify_file', 'modifyFile', 'modify',
  'replace', 'sed',
]);

function extractPathFromArgs(args: any): string | null {
  if (!args || typeof args !== 'object') return null;

  const record = args as Record<string, any>;

  if (typeof record.path === 'string' && record.path.length > 0) {
    return record.path;
  }
  if (typeof record.filePath === 'string' && record.filePath.length > 0) {
    return record.filePath;
  }
  if (typeof record.file_path === 'string' && record.file_path.length > 0) {
    return record.file_path;
  }
  if (typeof record.file === 'string' && record.file.length > 0) {
    return record.file;
  }
  if (typeof record.filename === 'string' && record.filename.length > 0) {
    return record.filename;
  }

  const values = Object.values(record);
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0 && (v.includes('/') || v.includes('\\') || v.endsWith('.ts') || v.endsWith('.js') || v.endsWith('.json') || v.endsWith('.md'))) {
      return v;
    }
  }

  return null;
}

function getToolNameFromCall(tc: any): string | null {
  if (!tc || typeof tc !== 'object') return null;
  const call = tc as Record<string, any>;

  if (call.function && typeof call.function === 'object') {
    const fn = call.function as Record<string, any>;
    if (typeof fn.name === 'string') return fn.name;
  }

  if (typeof call.name === 'string') return call.name;
  if (typeof call.toolName === 'string') return call.toolName;
  if (typeof call.tool_name === 'string') return call.tool_name;

  return null;
}

function getToolArgsFromCall(tc: any): any {
  if (!tc || typeof tc !== 'object') return null;
  const call = tc as Record<string, any>;

  if (call.function && typeof call.function === 'object') {
    const fn = call.function as Record<string, any>;
    if (fn.arguments !== undefined) return fn.arguments;
  }

  if (call.arguments !== undefined) return call.arguments;
  if (call.args !== undefined) return call.args;
  if (call.params !== undefined) return call.params;
  if (call.input !== undefined) return call.input;

  return null;
}

function parseArgsString(raw: any): Record<string, any> | null {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, any>;
  }
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function processToolCall(tc: any, fileOps: FileOperations): void {
  const toolName = getToolNameFromCall(tc);
  if (!toolName) return;

  const toolNameLower = toolName.toLowerCase().replace(/_/g, '').replace(/-/g, '');

  let category: 'read' | 'written' | 'edited' | null = null;

  for (const name of READ_TOOL_NAMES) {
    const normalized = name.toLowerCase().replace(/_/g, '').replace(/-/g, '');
    if (toolNameLower === normalized || toolNameLower.includes(normalized)) {
      category = 'read';
      break;
    }
  }
  if (!category) {
    for (const name of WRITE_TOOL_NAMES) {
      const normalized = name.toLowerCase().replace(/_/g, '').replace(/-/g, '');
      if (toolNameLower === normalized || toolNameLower.includes(normalized)) {
        category = 'written';
        break;
      }
    }
  }
  if (!category) {
    for (const name of EDIT_TOOL_NAMES) {
      const normalized = name.toLowerCase().replace(/_/g, '').replace(/-/g, '');
      if (toolNameLower === normalized || toolNameLower.includes(normalized)) {
        category = 'edited';
        break;
      }
    }
  }

  if (!category) return;

  const rawArgs = getToolArgsFromCall(tc);
  const args = parseArgsString(rawArgs);
  const path = extractPathFromArgs(args);

  if (path) {
    fileOps[category].add(path);
  }
}

export function extractFileOpsFromMessage(
  message: any,
  fileOps: FileOperations,
): void {
  if (!message || typeof message !== 'object') return;
  const msg = message as Record<string, any>;

  if (msg.role !== 'assistant') return;

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    for (const tc of msg.tool_calls) {
      processToolCall(tc, fileOps);
    }
  }

  if (msg.metadata && typeof msg.metadata === 'object') {
    const meta = msg.metadata as Record<string, any>;
    if (Array.isArray(meta.toolCalls) && meta.toolCalls.length > 0) {
      for (const tc of meta.toolCalls) {
        processToolCall(tc, fileOps);
      }
    }
  }

  if (typeof msg.content === 'string' && msg.content.length > 0) {
    const content = msg.content;
    const patterns = [
      /(?:read|view|cat|head|tail)\s+(?:file\s+)?["'`]?([^"'`\s]+?\.(?:ts|js|tsx|jsx|json|md|py|go|rs|java|kt|scala|rb|php|yml|yaml|toml|ini|cfg|conf|sql|sh|css|scss|less|vue|svelte|html|htm|xml|csv|txt))["'`]?/gi,
      /(?:write|create|save)\s+(?:file\s+)?["'`]?([^"'`\s]+?\.(?:ts|js|tsx|jsx|json|md|py|go|rs|java|kt|scala|rb|php|yml|yaml|toml|ini|cfg|conf|sql|sh|css|scss|less|vue|svelte|html|htm|xml|csv|txt))["'`]?/gi,
      /(?:edit|patch|modify|update|replace)\s+(?:file\s+)?["'`]?([^"'`\s]+?\.(?:ts|js|tsx|jsx|json|md|py|go|rs|java|kt|scala|rb|php|yml|yaml|toml|ini|cfg|conf|sql|sh|css|scss|less|vue|svelte|html|htm|xml|csv|txt))["'`]?/gi,
    ];

    for (const pat of patterns) {
      const matches = content.matchAll(pat);
      for (const m of matches) {
        if (m[1]) {
          const op = pat.source.slice(0, 5).toLowerCase();
          if (op.includes('read') || op.includes('view') || op.includes('cat') || op.includes('head') || op.includes('tail')) {
            fileOps.read.add(m[1]);
          } else if (op.includes('write') || op.includes('creat') || op.includes('save')) {
            fileOps.written.add(m[1]);
          } else if (op.includes('edit') || op.includes('patch') || op.includes('modif') || op.includes('updat') || op.includes('replac')) {
            fileOps.edited.add(m[1]);
          }
        }
      }
    }
  }
}

export function extractFileOperations(
  messagesToSummarize: any[],
  prevCompactionDetails?: CompactionFileDetails | null,
): FileOperations {
  const fileOps: FileOperations = {
    read: new Set<string>(),
    written: new Set<string>(),
    edited: new Set<string>(),
  };

  if (prevCompactionDetails) {
    for (const f of prevCompactionDetails.readFiles || []) {
      fileOps.read.add(f);
    }
    for (const f of prevCompactionDetails.modifiedFiles || []) {
      fileOps.written.add(f);
    }
  }

  if (!Array.isArray(messagesToSummarize)) {
    return fileOps;
  }

  for (const msg of messagesToSummarize) {
    extractFileOpsFromMessage(msg, fileOps);
  }

  return fileOps;
}

export function computeFileLists(
  fileOps: FileOperations,
): CompactionFileDetails {
  const modifiedSet = new Set<string>();
  for (const f of fileOps.written) modifiedSet.add(f);
  for (const f of fileOps.edited) modifiedSet.add(f);

  const readList = Array.from(fileOps.read).filter((f) => !modifiedSet.has(f)).sort();
  const modifiedList = Array.from(modifiedSet).sort();

  return {
    readFiles: readList,
    modifiedFiles: modifiedList,
  };
}

export function formatFileOperations(
  details: CompactionFileDetails,
): string {
  const parts: string[] = [];

  if (details.readFiles.length > 0 || details.modifiedFiles.length > 0) {
    parts.push('<file-operations>');

    if (details.readFiles.length > 0) {
      parts.push('<read-files>');
      for (const f of details.readFiles) {
        parts.push(`<file>${f}</file>`);
      }
      parts.push('</read-files>');
    }

    if (details.modifiedFiles.length > 0) {
      parts.push('<modified-files>');
      for (const f of details.modifiedFiles) {
        parts.push(`<file>${f}</file>`);
      }
      parts.push('</modified-files>');
    }

    parts.push('</file-operations>');
  }

  return parts.join('\n');
}

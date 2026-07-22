export interface DiffEntry {
  path: string;
  op: 'add' | 'remove' | 'replace';
  oldValue?: unknown;
  newValue?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function getPath(parentPath: string, key: string | number): string {
  return parentPath ? `${parentPath}.${key}` : String(key);
}

export function deepDiff(obj1: unknown, obj2: unknown, path = ''): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  if (obj1 === obj2) {
    return diffs;
  }

  if (obj1 === undefined && obj2 === undefined) {
    return diffs;
  }

  if (obj1 === null && obj2 === null) {
    return diffs;
  }

  if (obj1 === undefined || obj1 === null) {
    diffs.push({
      path: path || '',
      op: obj2 === undefined || obj2 === null ? 'replace' : 'add',
      oldValue: obj1,
      newValue: obj2,
    });
    return diffs;
  }

  if (obj2 === undefined || obj2 === null) {
    diffs.push({
      path: path || '',
      op: 'remove',
      oldValue: obj1,
      newValue: obj2,
    });
    return diffs;
  }

  if (typeof obj1 !== typeof obj2) {
    diffs.push({
      path: path || '',
      op: 'replace',
      oldValue: obj1,
      newValue: obj2,
    });
    return diffs;
  }

  if (isArray(obj1) && isArray(obj2)) {
    const maxLen = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLen; i++) {
      const currentPath = getPath(path, i);
      if (i >= obj1.length) {
        diffs.push({
          path: currentPath,
          op: 'add',
          newValue: obj2[i],
        });
      } else if (i >= obj2.length) {
        diffs.push({
          path: currentPath,
          op: 'remove',
          oldValue: obj1[i],
        });
      } else {
        diffs.push(...deepDiff(obj1[i], obj2[i], currentPath));
      }
    }
    return diffs;
  }

  if (isObject(obj1) && isObject(obj2)) {
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const currentPath = getPath(path, key);
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (!(key in obj1)) {
        diffs.push({
          path: currentPath,
          op: 'add',
          newValue: val2,
        });
      } else if (!(key in obj2)) {
        diffs.push({
          path: currentPath,
          op: 'remove',
          oldValue: val1,
        });
      } else {
        diffs.push(...deepDiff(val1, val2, currentPath));
      }
    }
    return diffs;
  }

  diffs.push({
    path: path || '',
    op: 'replace',
    oldValue: obj1,
    newValue: obj2,
  });

  return diffs;
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (isObject(current)) {
      current = current[part];
    } else if (isArray(current)) {
      const index = Number(part);
      if (!Number.isNaN(index)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return current;
}

function setNestedValue(obj: unknown, path: string, value: unknown): unknown {
  if (!path) return value;

  const parts = path.split('.');
  const root = structuredClone(obj);
  let current: unknown = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const isNextArray = /^\d+$/.test(nextPart);

    if (isObject(current)) {
      if (!(part in current) || current[part] === null || current[part] === undefined) {
        current[part] = isNextArray ? [] : {};
      }
      current = current[part];
    } else if (isArray(current)) {
      const index = Number(part);
      if (!Number.isNaN(index)) {
        if (current[index] === null || current[index] === undefined) {
          current[index] = isNextArray ? ([] as unknown) : ({} as unknown);
        }
        current = current[index];
      }
    }
  }

  const lastPart = parts[parts.length - 1];
  if (isObject(current)) {
    current[lastPart] = value;
  } else if (isArray(current)) {
    const index = Number(lastPart);
    if (!Number.isNaN(index)) {
      current[index] = value;
    }
  }

  return root;
}

function deleteNestedValue(obj: unknown, path: string): unknown {
  if (!path) return undefined;

  const parts = path.split('.');
  const root = structuredClone(obj);
  let current: unknown = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (isObject(current)) {
      current = current[part];
    } else if (isArray(current)) {
      const index = Number(part);
      if (!Number.isNaN(index)) {
        current = current[index];
      }
    }
    if (current === null || current === undefined) {
      return root;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (isObject(current)) {
    delete current[lastPart];
  } else if (isArray(current)) {
    const index = Number(lastPart);
    if (!Number.isNaN(index) && index >= 0 && index < current.length) {
      current.splice(index, 1);
    }
  }

  return root;
}

export function applyPatch(obj: unknown, patches: DiffEntry[]): unknown {
  let result = obj;

  const sortedPatches = [...patches].sort((a, b) => {
    const aDepth = a.path ? a.path.split('.').length : 0;
    const bDepth = b.path ? b.path.split('.').length : 0;
    return bDepth - aDepth;
  });

  for (const patch of sortedPatches) {
    switch (patch.op) {
      case 'add':
      case 'replace':
        result = setNestedValue(result, patch.path, patch.newValue);
        break;
      case 'remove':
        result = deleteNestedValue(result, patch.path);
        break;
    }
  }

  return result;
}

export function reversePatch(patches: DiffEntry[]): DiffEntry[] {
  const reversed: DiffEntry[] = [];

  for (const patch of patches) {
    switch (patch.op) {
      case 'add':
        reversed.push({
          path: patch.path,
          op: 'remove',
          oldValue: patch.newValue,
        });
        break;
      case 'remove':
        reversed.push({
          path: patch.path,
          op: 'add',
          newValue: patch.oldValue,
        });
        break;
      case 'replace':
        reversed.push({
          path: patch.path,
          op: 'replace',
          oldValue: patch.newValue,
          newValue: patch.oldValue,
        });
        break;
    }
  }

  return reversed.reverse();
}

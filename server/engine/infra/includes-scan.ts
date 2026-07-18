import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, extname } from "path";

export type ScanResult = {
  found: boolean;
  matches: string[];
  lineNumbers: number[];
};

export type ScanOptions = {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
};

export function scanFileForPattern(filePath: string, pattern: string, options: ScanOptions = {}): ScanResult {
  const { caseSensitive = true, regex = false, wholeWord = false } = options;

  if (!existsSync(filePath)) {
    return { found: false, matches: [], lineNumbers: [] };
  }

  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const matches: string[] = [];
  const lineNumbers: number[] = [];

  let searchPattern: RegExp;

  if (regex) {
    searchPattern = new RegExp(pattern, caseSensitive ? "g" : "gi");
  } else if (wholeWord) {
    searchPattern = new RegExp(`\\b${pattern}\\b`, caseSensitive ? "g" : "gi");
  } else {
    searchPattern = new RegExp(pattern, caseSensitive ? "g" : "gi");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (searchPattern.test(line)) {
      matches.push(line.trim());
      lineNumbers.push(i + 1);
    }
  }

  return {
    found: matches.length > 0,
    matches,
    lineNumbers,
  };
}

export function scanDirectoryForPattern(
  directory: string,
  pattern: string,
  options: ScanOptions & { includeExtensions?: string[] } = {},
): { [filePath: string]: ScanResult } {
  const { includeExtensions } = options;
  const results: { [filePath: string]: ScanResult } = {};
  const files = getAllFiles(directory, includeExtensions);

  for (const file of files) {
    const result = scanFileForPattern(file, pattern, options);
    if (result.found) {
      results[file] = result;
    }
  }

  return results;
}

export function containsPattern(filePath: string, pattern: string, options: ScanOptions = {}): boolean {
  return scanFileForPattern(filePath, pattern, options).found;
}

export function countPatternOccurrences(filePath: string, pattern: string, options: ScanOptions = {}): number {
  const result = scanFileForPattern(filePath, pattern, options);
  return result.matches.length;
}

function getAllFiles(directory: string, includeExtensions?: string[]): string[] {
  const files: string[] = [];

  try {
    const items = readdirSync(directory, { withFileTypes: true });
    for (const item of items) {
      const fullPath = resolve(directory, item.name);
      if (item.isDirectory()) {
        files.push(...getAllFiles(fullPath, includeExtensions));
      } else if (item.isFile()) {
        if (!includeExtensions || includeExtensions.includes(extname(item.name))) {
          files.push(fullPath);
        }
      }
    }
  } catch {
  }

  return files;
}

export function scanForIncludes(filePath: string, includePatterns: string[]): string[] {
  const includes: string[] = [];
  if (!existsSync(filePath)) {
    return includes;
  }

  const content = readFileSync(filePath, "utf8");

  for (const pattern of includePatterns) {
    const regex = new RegExp(pattern, "gi");
    let match;
    while ((match = regex.exec(content)) !== null) {
      includes.push(match[0]);
    }
  }

  return includes;
}
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export type DotenvParseResult = Record<string, string>;

export type DotenvOptions = {
  path?: string;
  encoding?: BufferEncoding;
  debug?: boolean;
};

export function parseDotenv(content: string): DotenvParseResult {
  const result: DotenvParseResult = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!key) {
      continue;
    }

    const value = valueParts.join("=").trim();

    let finalValue = value;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      finalValue = value.slice(1, -1);
    }

    result[key.trim()] = finalValue;
  }

  return result;
}

export function loadDotenv(options: DotenvOptions = {}): DotenvParseResult {
  const { path = ".env", encoding = "utf8" } = options;

  const resolvedPath = resolve(path);

  if (!existsSync(resolvedPath)) {
    return {};
  }

  const content = readFileSync(resolvedPath, encoding);
  return parseDotenv(content);
}

export function loadDotenvIntoProcess(options: DotenvOptions = {}): void {
  const parsed = loadDotenv(options);

  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function stringifyDotenv(env: DotenvParseResult): string {
  return Object.entries(env)
    .map(([key, value]) => {
      if (value.includes(" ") || value.includes("=") || value.includes("#")) {
        return `${key}="${value}"`;
      }
      return `${key}=${value}`;
    })
    .join("\n");
}

export function interpolateEnv(value: string, env: DotenvParseResult = process.env as DotenvParseResult): string {
  return value.replace(/\$(\w+)/g, (_, key) => env[key] || `$${key}`);
}
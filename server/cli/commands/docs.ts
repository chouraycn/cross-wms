import type { Command } from "commander";
import { logger } from "../../logger.js";

const SEARCH_API = "https://docs.openclaw.ai/api/search";
const SEARCH_TIMEOUT_MS = 30_000;

interface DocResult {
  title: string;
  link: string;
  snippet?: string;
}

interface DocsSearchResponse {
  results?: unknown;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[()[\]]/g, "\\$&");
}

function buildMarkdown(query: string, results: DocResult[]): string {
  const lines: string[] = [`# Docs search: ${escapeMarkdown(query)}`, ""];
  if (results.length === 0) {
    lines.push("_No results._");
    return lines.join("\n");
  }
  for (const item of results) {
    const title = escapeMarkdown(item.title);
    const snippet = item.snippet ? escapeMarkdown(item.snippet) : "";
    const suffix = snippet ? ` - ${snippet}` : "";
    lines.push(`- [${title}](${item.link})${suffix}`);
  }
  return lines.join("\n");
}

function formatLinkLabel(link: string): string {
  return link.replace(/^https?:\/\//i, "");
}

function formatDocsLink(link: string, label?: string): string {
  return `${label || link} <${link}>`;
}

function renderRichResults(query: string, results: DocResult[]) {
  logger.info(`Docs search: ${query}`);
  if (results.length === 0) {
    logger.info("No results.");
    return;
  }
  for (const item of results) {
    const linkLabel = formatLinkLabel(item.link);
    const link = formatDocsLink(item.link, linkLabel);
    logger.info(`- ${item.title} (${link})`);
    if (item.snippet) {
      logger.info(`  ${item.snippet}`);
    }
  }
}

async function fetchDocsSearch(query: string): Promise<DocResult[]> {
  const url = new URL(SEARCH_API);
  url.searchParams.set("q", query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as DocsSearchResponse;
    return parseDocsSearchResults(payload.results);
  } finally {
    clearTimeout(timeout);
  }
}

function parseDocsSearchResults(raw: unknown): DocResult[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: DocResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.link !== "string") {
      continue;
    }
    results.push({
      title: entry.title,
      link: entry.link,
      snippet: typeof entry.snippet === "string" && entry.snippet.trim() ? entry.snippet : undefined,
    });
  }
  return results;
}

export function registerDocsCommand(program: Command): void {
  program
    .command("docs")
    .description("Search the live OpenClaw docs")
    .argument("[query...]", "Search query")
    .option("--json", "JSON output format")
    .action(async (queryParts: string[], options: { json?: boolean }) => {
      const query = queryParts.join(" ").trim();
      if (!query) {
        const docs = formatDocsLink("https://docs.openclaw.ai/", "docs.openclaw.ai");
        logger.info(`Docs: ${docs}`);
        logger.info(`Search: cdfknow docs "your query"`);
        return;
      }

      let results: DocResult[];
      try {
        results = await fetchDocsSearch(query);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Docs search failed: ${message}`);
        return;
      }

      if (options.json) {
        logger.info(JSON.stringify(results, null, 2));
        return;
      }

      renderRichResults(query, results);
    });
}
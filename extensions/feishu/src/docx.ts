// Feishu plugin module implements docx behavior for cross-wms.
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient } from "./client.js";
import type { FeishuConfig, ResolvedFeishuAccount } from "./types.js";

function resolveFeishuRuntimeAccount(params: { cfg: any; accountId?: string }): ResolvedFeishuAccount & { configured: boolean } {
  const feishuCfg = params.cfg?.feishu ?? params.cfg;
  const appId = feishuCfg?.appId ?? feishuCfg?.app_id;
  const appSecret = feishuCfg?.appSecret ?? feishuCfg?.app_secret;
  return {
    accountId: params.accountId ?? "default", selectionSource: "explicit",
    enabled: !!(appId && appSecret), configured: !!(appId && appSecret),
    appId, appSecret, domain: feishuCfg?.domain ?? "feishu",
    encryptKey: feishuCfg?.encryptKey, verificationToken: feishuCfg?.verificationToken,
    config: feishuCfg ?? {},
  };
}

type DocxBlock = {
  block_id?: string;
  block_type?: number;
  text?: { elements?: DocxTextElement[]; style?: Record<string, unknown> };
  heading1?: { elements?: DocxTextElement[] };
  heading2?: { elements?: DocxTextElement[] };
  heading3?: { elements?: DocxTextElement[] };
  heading4?: { elements?: DocxTextElement[] };
  heading5?: { elements?: DocxTextElement[] };
  heading6?: { elements?: DocxTextElement[] };
  heading7?: { elements?: DocxTextElement[] };
  heading8?: { elements?: DocxTextElement[] };
  heading9?: { elements?: DocxTextElement[] };
  bullet?: { elements?: DocxTextElement[] };
  ordered?: { elements?: DocxTextElement[] };
  code?: { elements?: DocxTextElement[]; style?: Record<string, unknown> };
  quote?: { elements?: DocxTextElement[] };
  todo?: { elements?: DocxTextElement[]; style?: Record<string, unknown> };
  [key: string]: unknown;
};

type DocxTextElement = {
  text_run?: { content?: string; text_element_style?: Record<string, unknown> };
  mention_doc?: { token?: string; text_type?: string; text_element_style?: Record<string, unknown> };
  equation?: { content?: string };
  [key: string]: unknown;
};

function extractTextFromDocxElements(elements?: DocxTextElement[]): string {
  if (!elements) return "";
  return elements
    .map((el) => {
      if (el.text_run?.content) return el.text_run.content;
      if (el.mention_doc?.token) return `[doc:${el.mention_doc.token}]`;
      if (el.equation?.content) return `$${el.equation.content}$`;
      return "";
    })
    .join("");
}

const BLOCK_TYPE_NAMES: Record<number, string> = {
  1: "page", 2: "text", 3: "heading1", 4: "heading2", 5: "heading3",
  6: "heading4", 7: "heading5", 8: "heading6", 9: "heading7", 10: "heading8",
  11: "heading9", 12: "bullet", 13: "ordered", 14: "code", 15: "quote",
  16: "todo", 17: "bitable", 18: "callout", 19: "chat_card", 20: "diagram",
  21: "divider", 22: "file", 23: "grid", 24: "iframe", 25: "image",
  26: "mindmap", 27: "sheet", 28: "table", 29: "view",
};

function blockTypeToMarkdownHeading(blockType: number, text: string): string {
  const headingLevel = blockType - 2; // heading1=3, heading2=4, etc.
  if (headingLevel >= 1 && headingLevel <= 9) {
    return `${"#".repeat(headingLevel)} ${text}`;
  }
  return text;
}

export function convertDocxBlockToMarkdown(block: DocxBlock): string {
  const blockType = block.block_type;
  if (!blockType) return "";

  // Text block
  if (blockType === 2) {
    return extractTextFromDocxElements(block.text?.elements);
  }

  // Heading blocks (3-11)
  if (blockType >= 3 && blockType <= 11) {
    const key = BLOCK_TYPE_NAMES[blockType] as keyof DocxBlock;
    const headingBlock = block[key] as { elements?: DocxTextElement[] } | undefined;
    const text = extractTextFromDocxElements(headingBlock?.elements);
    return blockTypeToMarkdownHeading(blockType, text);
  }

  // Bullet
  if (blockType === 12) {
    const text = extractTextFromDocxElements(block.bullet?.elements);
    return `- ${text}`;
  }

  // Ordered
  if (blockType === 13) {
    const text = extractTextFromDocxElements(block.ordered?.elements);
    return `1. ${text}`;
  }

  // Code
  if (blockType === 14) {
    const text = extractTextFromDocxElements(block.code?.elements);
    return `\`\`\`\n${text}\n\`\`\``;
  }

  // Quote
  if (blockType === 15) {
    const text = extractTextFromDocxElements(block.quote?.elements);
    return `> ${text}`;
  }

  // Todo
  if (blockType === 16) {
    const text = extractTextFromDocxElements(block.todo?.elements);
    return `- [ ] ${text}`;
  }

  // Divider
  if (blockType === 21) {
    return "---";
  }

  return "";
}

export async function getDocxContent(params: {
  cfg: any; documentId: string; accountId?: string;
}): Promise<{ content: string; blocks: DocxBlock[] }> {
  const { cfg, documentId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);

  const response = await client.docx.documentBlock.list({
    path: { document_id: documentId },
    params: { page_size: 500 },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu docx fetch failed: ${response.msg || `code ${response.code}`}`);
  }

  const blocks = ((response as any)?.data?.items ?? []) as DocxBlock[];
  const content = blocks.map(convertDocxBlockToMarkdown).filter(Boolean).join("\n\n");

  return { content, blocks };
}

export function registerFeishuDocTools(api: any) {
  if (!api?.config) return;
  // Doc tools registration - will be wired to cross-wms tool framework
}

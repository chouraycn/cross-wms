// Feishu plugin module implements media behavior for cross-wms.
import fs from "node:fs";
import path from "node:path";
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient } from "./client.js";
import type { FeishuSendResult, ResolvedFeishuAccount } from "./types.js";

const FEISHU_MEDIA_HTTP_TIMEOUT_MS = 120_000;

// Account resolution helper
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

function resolveFeishuSendTarget(params: { cfg: any; to: string; accountId?: string }) {
  const account = resolveFeishuRuntimeAccount({ cfg: params.cfg, accountId: params.accountId });
  const client = createFeishuClient({ ...account, httpTimeoutMs: FEISHU_MEDIA_HTTP_TIMEOUT_MS });
  const to = params.to;
  let receiveId: string;
  let receiveIdType: "chat_id" | "email" | "open_id" | "union_id" | "user_id";
  if (to.startsWith("chat:")) { receiveId = to.slice(5); receiveIdType = "chat_id"; }
  else if (to.startsWith("user:")) { receiveId = to.slice(5); receiveIdType = "open_id"; }
  else { receiveId = to; receiveIdType = "chat_id"; }
  return { client, receiveId, receiveIdType, account };
}

export type SaveMessageResourceResult = { saved: { path: string; size: number }; contentType?: string; fileName?: string };

export async function saveMessageResourceFeishu(params: {
  cfg: any; messageId: string; fileKey: string; type: "image" | "file";
  accountId?: string; maxBytes: number; originalFilename?: string;
}): Promise<SaveMessageResourceResult> {
  const { cfg, messageId, fileKey, type, accountId, maxBytes } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient({ ...account, httpTimeoutMs: FEISHU_MEDIA_HTTP_TIMEOUT_MS });
  const response = await client.im.messageResource.get({
    path: { message_id: messageId, file_key: fileKey },
    params: { type },
  });
  // Simplified: save to buffer
  let buffer: Buffer;
  if (Buffer.isBuffer(response)) buffer = response;
  else if (response instanceof ArrayBuffer) buffer = Buffer.from(response);
  else throw new Error("Unexpected response format from Feishu resource download");
  if (buffer.length > maxBytes) throw new Error(`Media exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
  return { saved: { path: fileKey, size: buffer.length } };
}

export type UploadImageResult = { imageKey: string };
export type UploadFileResult = { fileKey: string };
export type SendMediaResult = { messageId: string; chatId: string; receipt: { kind: string; messageId: string }; voiceIntentDegradedToFile?: boolean };

export async function uploadImageFeishu(params: {
  cfg: any; image: Buffer | string; imageType?: "message" | "avatar"; accountId?: string;
}): Promise<UploadImageResult> {
  const { cfg, image, imageType = "message", accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  const imageData = typeof image === "string" ? fs.readFileSync(image) : image;
  const response = await client.im.image.create({ data: { image_type: imageType, image: imageData } });
  const imageKey = (response as any)?.image_key ?? (response as any)?.data?.image_key;
  if (!imageKey) throw new Error("Feishu image upload failed: no image_key returned");
  return { imageKey };
}

export function sanitizeFileNameForUpload(fileName: string): string {
  return fileName.replace(/[\p{Cc}"\\]/gu, "_");
}

export async function uploadFileFeishu(params: {
  cfg: any; file: Buffer | string; fileName: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
  duration?: number; accountId?: string;
}): Promise<UploadFileResult> {
  const { cfg, file, fileName, fileType, duration, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  const fileData = typeof file === "string" ? fs.readFileSync(file) : file;
  const safeFileName = sanitizeFileNameForUpload(fileName);
  const response = await client.im.file.create({
    data: { file_type: fileType, file_name: safeFileName, file: fileData, ...(duration !== undefined ? { duration } : {}) },
  });
  const fileKey = (response as any)?.file_key ?? (response as any)?.data?.file_key;
  if (!fileKey) throw new Error("Feishu file upload failed: no file_key returned");
  return { fileKey };
}

export async function sendImageFeishu(params: {
  cfg: any; to: string; imageKey: string; replyToMessageId?: string;
  replyInThread?: boolean; accountId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, imageKey, replyToMessageId, replyInThread, accountId } = params;
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({ cfg, to, accountId });
  const content = JSON.stringify({ image_key: imageKey });
  let response: any;
  if (replyToMessageId) {
    response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: "image", ...(replyInThread ? { reply_in_thread: true } : {}) },
    });
  } else {
    response = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: { receive_id: receiveId, content, msg_type: "image" },
    });
  }
  if (response.code !== 0) throw new Error(`Feishu image send failed: ${response.msg || `code ${response.code}`}`);
  const messageId = response.data?.message_id ?? "";
  return { messageId, chatId: receiveId, receipt: { kind: "image", messageId } };
}

export async function sendFileFeishu(params: {
  cfg: any; to: string; fileKey: string; msgType?: "file" | "audio" | "media";
  replyToMessageId?: string; replyInThread?: boolean; accountId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, fileKey, msgType = "file", replyToMessageId, replyInThread, accountId } = params;
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({ cfg, to, accountId });
  const content = JSON.stringify({ file_key: fileKey });
  let response: any;
  if (replyToMessageId) {
    response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: msgType, ...(replyInThread ? { reply_in_thread: true } : {}) },
    });
  } else {
    response = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: { receive_id: receiveId, content, msg_type: msgType },
    });
  }
  if (response.code !== 0) throw new Error(`Feishu file send failed: ${response.msg || `code ${response.code}`}`);
  const messageId = response.data?.message_id ?? "";
  return { messageId, chatId: receiveId, receipt: { kind: msgType, messageId } };
}

export function detectFileType(fileName: string): "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream" {
  const ext = (path.extname(fileName) || "").toLowerCase();
  switch (ext) {
    case ".opus": case ".ogg": return "opus";
    case ".mp4": case ".mov": case ".avi": return "mp4";
    case ".pdf": return "pdf";
    case ".doc": case ".docx": return "doc";
    case ".xls": case ".xlsx": return "xls";
    case ".ppt": case ".pptx": return "ppt";
    default: return "stream";
  }
}

export function shouldSuppressFeishuTextForVoiceMedia(params: {
  mediaUrl?: string; fileName?: string; contentType?: string; audioAsVoice?: boolean;
}): boolean {
  if (params.audioAsVoice === true) return true;
  const ext = (path.extname(params.fileName || "") || "").toLowerCase();
  const ct = (params.contentType || "").toLowerCase();
  return ext === ".opus" || ext === ".ogg" || ct === "audio/ogg" || ct === "audio/opus";
}

export async function sendMediaFeishu(params: {
  cfg: any; to: string; mediaUrl?: string; mediaBuffer?: Buffer; fileName?: string;
  replyToMessageId?: string; replyInThread?: boolean; accountId?: string;
  mediaLocalRoots?: readonly string[]; audioAsVoice?: boolean;
}): Promise<SendMediaResult> {
  const { cfg, to, mediaBuffer, fileName, replyToMessageId, replyInThread, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  if (!mediaBuffer && !params.mediaUrl) throw new Error("Either mediaUrl or mediaBuffer must be provided");
  const buffer = mediaBuffer ?? Buffer.from(""); // simplified
  const name = fileName ?? "file";
  const ext = (path.extname(name) || "").toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext);
  if (isImage) {
    const { imageKey } = await uploadImageFeishu({ cfg, image: buffer, accountId });
    return sendImageFeishu({ cfg, to, imageKey, replyToMessageId, replyInThread, accountId });
  }
  const fileType = detectFileType(name);
  const msgType = fileType === "opus" ? "audio" : fileType === "mp4" ? "media" : "file";
  const { fileKey } = await uploadFileFeishu({ cfg, file: buffer, fileName: name, fileType, accountId });
  return sendFileFeishu({ cfg, to, fileKey, msgType: msgType as any, replyToMessageId, replyInThread, accountId });
}

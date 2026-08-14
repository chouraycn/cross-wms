/**
 * 极简 XML 字段提取（公众号回调格式专用）
 * 与 extensions/wecom/src/xml.ts 同构，保持扩展自治不跨目录引用。
 */
export function extractXmlField(xml: string, field: string): string {
  const esc = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");

  const cdata = new RegExp(`<${field}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${field}>`).exec(xml);
  if (cdata) return cdata[1];

  const plain = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`).exec(xml);
  if (plain) return esc(plain[1].trim());

  return "";
}

/** 从回调 XML 提取公众号消息对象 */
export function parseWeChatCallbackXml(xml: string): Record<string, string> {
  const fields = [
    "ToUserName",
    "FromUserName",
    "CreateTime",
    "MsgType",
    "Content",
    "MsgId",
    "MsgDataId",
    "Idx",
    "Event",
    "EventKey",
    "PicUrl",
    "MediaId",
    "ThumbMediaId",
    "Format",
    "Url",
    "Title",
    "Description",
    "Location_X",
    "Location_Y",
    "Label",
  ];
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = extractXmlField(xml, f);
    if (v) out[f] = v;
  }
  return out;
}

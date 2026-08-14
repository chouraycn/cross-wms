/**
 * 极简 XML 字段提取（企业微信/公众号回调格式专用）
 *
 * 回调 XML 是扁平结构（无嵌套同名元素），这里只做安全字段提取：
 * - 支持 <![CDATA[...]]> 包裹
 * - 自动实体反转义（&lt; &gt; &amp; &quot; &apos;）
 */
export function extractXmlField(xml: string, field: string): string {
  const esc = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");

  // 优先 CDATA
  const cdata = new RegExp(`<${field}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${field}>`).exec(xml);
  if (cdata) return cdata[1];

  // 其次普通文本（单行内）
  const plain = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`).exec(xml);
  if (plain) return esc(plain[1].trim());

  return "";
}

/** 从回调 XML 提取企业微信消息对象（缺失字段返回 undefined） */
export function parseWeComCallbackXml(xml: string): Record<string, string> {
  const fields = [
    "ToUserName",
    "FromUserName",
    "CreateTime",
    "MsgType",
    "Content",
    "MsgId",
    "MsgId64",
    "AgentID",
    "ChatId",
    "Event",
    "EventKey",
    "PicUrl",
    "MediaId",
    "ThumbMediaId",
    "Format",
    "Url",
    "Title",
    "Description",
  ];
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = extractXmlField(xml, f);
    if (v) out[f] = v;
  }
  return out;
}

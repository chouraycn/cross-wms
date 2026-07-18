/**
 * SSML 解析器 — 解析 SSML 标签、提取文本与标记，并支持构建 SSML。
 *
 * 参考 openclaw/src/tts/directives.ts 的标签分类思路，实现轻量级 SSML 子集：
 * - <speak> 根标签
 * - <voice name="..."> 声音选择
 * - <prosody rate pitch volume> 韵律控制
 * - <mark name="..."/> 书签
 * - <break time="..."/> 停顿
 */

import type { ParsedSsml, SsmlMark } from './types.js';

/** 判断文本是否为 SSML（以 <speak 开头）。 */
export function isSsml(text: string): boolean {
  return /^\s*<speak[\s>]/i.test(text);
}

/** 去除所有 SSML/HTML 标签，仅保留可朗读文本。 */
export function stripSsml(ssml: string): string {
  if (!ssml) return '';
  // <break time="..."/> → 移除（停顿不朗读）
  let out = ssml.replace(/<break[^>]*\/?>/gi, '');
  // 移除所有标签
  out = out.replace(/<[^>]+>/g, '');
  // 折叠标签内换行产生的多余空白
  return out.replace(/\s+/g, ' ').trim();
}

/** 提取指定标签的属性值。 */
function getAttr(tag: string, attr: string): string | undefined {
  const re = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  if (!m) return undefined;
  return m[2] ?? m[3];
}

/**
 * 解析 SSML，提取纯文本与语音参数。
 * marks 数组记录每个 <mark> 名称及其前的文本。
 */
export function parseSsml(ssml: string): ParsedSsml {
  const text = stripSsml(ssml);
  const result: ParsedSsml = { text, marks: [] };

  // <voice name="...">
  const voiceTag = ssml.match(/<voice\b[^>]*>/i);
  if (voiceTag) {
    const name = getAttr(voiceTag[0], 'name');
    if (name) result.voice = name;
  }

  // <speak xml:lang="...">
  const speakTag = ssml.match(/<speak\b[^>]*>/i);
  if (speakTag) {
    const lang = getAttr(speakTag[0], 'xml:lang') ?? getAttr(speakTag[0], 'lang');
    if (lang) result.lang = lang;
  }

  // <prosody rate pitch volume>
  const prosodyTag = ssml.match(/<prosody\b[^>]*>/i);
  if (prosodyTag) {
    const rate = getAttr(prosodyTag[0], 'rate');
    const pitch = getAttr(prosodyTag[0], 'pitch');
    const volume = getAttr(prosodyTag[0], 'volume');
    if (rate) result.rate = rate;
    if (pitch) result.pitch = pitch;
    if (volume) result.volume = volume;
  }

  // <mark name="..."/> — 记录标记及其前累计文本
  const marks: SsmlMark[] = [];
  const tagRegex = /<[^>]+>/g;
  let accText = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(ssml)) !== null) {
    // 累加标签之间的文本
    accText += ssml.slice(lastIndex, m.index).replace(/\s+/g, ' ');
    lastIndex = m.index + m[0].length;

    if (/<mark\b/i.test(m[0])) {
      const name = getAttr(m[0], 'name');
      if (name) {
        marks.push({ name, textBefore: accText.trim() });
      }
    }
  }
  result.marks = marks;
  return result;
}

/** 构建语音参数选项。 */
export interface BuildSsmlOptions {
  voice?: string;
  lang?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  /** 在文本前插入停顿。 */
  breakBefore?: string;
  /** 在文本后插入停顿。 */
  breakAfter?: string;
}

/** 转义 SSML 文本中的特殊字符。 */
export function escapeSsmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 构建一段 SSML 文档。
 * 仅在传入选项时包裹对应标签，无选项则仅做 <speak> 包裹。
 */
export function buildSsml(text: string, options: BuildSsmlOptions = {}): string {
  const { voice, lang, rate, pitch, volume, breakBefore, breakAfter } = options;
  let inner = escapeSsmlText(text);
  if (breakBefore) inner = `<break time="${breakBefore}"/>${inner}`;
  if (breakAfter) inner = `${inner}<break time="${breakAfter}"/>`;

  if (rate || pitch || volume) {
    const attrs: string[] = [];
    if (rate) attrs.push(`rate="${rate}"`);
    if (pitch) attrs.push(`pitch="${pitch}"`);
    if (volume) attrs.push(`volume="${volume}"`);
    inner = `<prosody ${attrs.join(' ')}>${inner}</prosody>`;
  }
  if (voice) inner = `<voice name="${voice}">${inner}</voice>`;

  const speakAttrs = lang ? ` xml:lang="${lang}"` : '';
  return `<speak${speakAttrs}>${inner}</speak>`;
}

/**
 * 从文本中移除 SSML 标签并返回纯文本；
 * 若文本不是 SSML，原样返回。
 */
export function ensurePlainText(text: string): string {
  return isSsml(text) ? stripSsml(text) : text;
}

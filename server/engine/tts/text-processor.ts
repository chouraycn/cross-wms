/**
 * 文本处理器 — 合成前的文本预处理。
 *
 * 参考 openclaw prepare-text.test.ts 中的 stripMarkdown 语义，并扩展：
 * - 句段切分（保留中英文标点）
 * - 数字归一化（中文/英文）
 * - 标点规整
 * - 中英文混排空格
 */

/** 预处理选项。 */
export interface PreprocessTextOptions {
  /** 目标语言：zh 时数字转为中文数字，en 时保留阿拉伯数字。 */
  language?: string;
  /** 是否去除 Markdown 标记。 */
  stripMarkdown?: boolean;
  /** 是否规整标点与空白。 */
  normalizePunctuation?: boolean;
  /** 是否进行数字归一化。 */
  normalizeNumbers?: boolean;
}

const SENTENCE_BOUNDARY = /([。！？!?；;\n])/g;

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNITS = ['', '十', '百', '千'];
const CN_BIG_UNITS = ['', '万', '亿'];

/**
 * 将 0 ~ 9999 的整数转为中文数字。
 * 仅处理合成朗读所需的常见范围，超出范围原样返回。
 */
function integerToChinese(num: number): string {
  if (num === 0) return '零';
  if (num < 0 || num > 9999) return String(num);

  const digits = String(num).split('').map(Number);
  let result = '';
  const len = digits.length;
  let lastZero = false;

  for (let i = 0; i < len; i++) {
    const d = digits[i];
    const unitIndex = len - 1 - i;
    if (d === 0) {
      lastZero = true;
      continue;
    }
    if (lastZero) {
      result += '零';
      lastZero = false;
    }
    // 「一十」在口语中通常读作「十」，仅当它是最高位时省略「一」。
    if (d === 1 && unitIndex === 1 && len === 2) {
      result += CN_UNITS[unitIndex];
    } else {
      result += CN_DIGITS[d] + CN_UNITS[unitIndex];
    }
  }
  return result;
}

/** 将任意非负整数转为中文数字（支持万、亿）。 */
function numberToChinese(num: number): string {
  if (num < 0) return '负' + numberToChinese(-num);
  if (num <= 9999) return integerToChinese(num);

  // 按万、亿分组
  const yi = Math.floor(num / 1_0000_0000);
  const wan = Math.floor((num % 1_0000_0000) / 10000);
  const rest = num % 10000;

  let result = '';
  if (yi > 0) result += integerToChinese(yi) + CN_BIG_UNITS[2];
  if (wan > 0) {
    if (yi > 0 && wan < 1000) result += '零';
    result += integerToChinese(wan) + CN_BIG_UNITS[1];
  }
  if (rest > 0) {
    if ((yi > 0 || wan > 0) && rest < 1000) result += '零';
    result += integerToChinese(rest);
  }
  return result;
}

/** 将阿拉伯数字（含小数）转为中文数字朗读形式。 */
function digitsToChinese(token: string): string {
  if (!/^\d+(\.\d+)?$/.test(token)) return token;
  if (token.includes('.')) {
    const [intPart, decPart] = token.split('.');
    const intChinese = intPart === '0' ? '零' : numberToChinese(Number(intPart));
    const decChinese = decPart.split('').map((d) => CN_DIGITS[Number(d)]).join('');
    return `${intChinese}点${decChinese}`;
  }
  return numberToChinese(Number(token));
}

/**
 * 数字归一化。
 * - zh：阿拉伯数字 → 中文数字（如 123 → 一百二十三）
 * - 其他语言：保留阿拉伯数字，仅规整全角数字。
 */
export function normalizeNumbers(text: string, language = 'zh'): string {
  const normalizedFullWidth = text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
  if (language !== 'zh') return normalizedFullWidth;
  return normalizedFullWidth.replace(/\d+(?:\.\d+)?/g, (match) => digitsToChinese(match));
}

/** 规整标点：合并连续标点、折叠空白、去除行尾空白。 */
export function normalizePunctuation(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/([。！？!?；;，,])\1+/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 去除 Markdown 标记，使合成引擎不朗读格式符号。
 * 覆盖标题、粗体/斜体、行内代码、引用、分隔线、链接。
 */
export function stripMarkdown(text: string): string {
  let out = text;
  // 代码块
  out = out.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim());
  out = out.replace(/~~~[\s\S]*?~~~/g, (m) => m.replace(/~~~/g, '').trim());
  // 标题
  out = out.replace(/^#{1,6}\s+/gm, '');
  // 粗体/斜体（保留连字符中的下划线，如 foo_bar）
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/(?<!\w)__([^_]+)__(?!\w)/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');
  // 行内代码
  out = out.replace(/`+([^`]+)`+/g, '$1');
  // 引用
  out = out.replace(/^>\s?/gm, '');
  // 分隔线
  out = out.replace(/^[-*_]{3,}$/gm, '');
  // 链接 [text](url) → text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // 图片 ![alt](url) → alt
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  return out;
}

/** 根据字符范围检测主要语言：含 CJK 字符视为 zh，否则 en。 */
export function detectLanguage(text: string): string {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  return cjkCount > 0 ? 'zh' : 'en';
}

/** 在中英文交界处插入空格，提升朗读节奏。 */
export function padMixedCnEn(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])([a-zA-Z0-9])/g, '$1 $2')
    .replace(/([a-zA-Z0-9])([\u4e00-\u9fff])/g, '$1 $2');
}

/**
 * 将长文本按句段边界切分为不超过 maxLength 的片段。
 * 保留句末标点，片段间不重叠。
 */
export function segmentText(text: string, maxLength = 1500): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 先按句段边界切分，保留分隔符
  const pieces = trimmed.split(SENTENCE_BOUNDARY).filter((p) => p !== '');
  // 把分隔符并回前一段
  const sentences: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (/^[。！？!?；;\n]$/.test(piece)) {
      if (sentences.length > 0) {
        sentences[sentences.length - 1] += piece;
      } else {
        sentences.push(piece);
      }
    } else if (piece) {
      sentences.push(piece);
    }
  }

  // 如果没有切分出句子（比如没有标点），就把整个文本作为一句
  if (sentences.length === 0) {
    sentences.push(trimmed);
  }

  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      // 超长单句按字符硬切分
      for (let i = 0; i < sentence.length; i += maxLength) {
        chunks.push(sentence.slice(i, i + maxLength));
      }
    } else {
      chunks.push(sentence);
    }
  }
  return chunks;
}

/**
 * 文本预处理流水线：去 Markdown → 规整标点 → 数字归一化 → 中英文空格。
 */
export function preprocessText(
  text: string,
  options: PreprocessTextOptions = {},
): string {
  const {
    language,
    stripMarkdown: doStrip = true,
    normalizePunctuation: doPunct = true,
    normalizeNumbers: doNumbers = true,
  } = options;

  const lang = language || detectLanguage(text);
  let result = text;
  if (doStrip) result = stripMarkdown(result);
  if (doPunct) result = normalizePunctuation(result);
  if (doNumbers) result = normalizeNumbers(result, lang);
  result = padMixedCnEn(result);
  return result.trim();
}

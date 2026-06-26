/**
 * A2UI 解析器
 *
 * 负责从 Markdown 代码块或纯 JSON 字符串中解析 A2UI 组件描述。
 */

import type {
  A2UIComponent,
  A2UILayout,
  A2UIParseOptions,
  A2UIParseResult,
  A2UIComponentType,
  A2UILayoutType,
} from './a2uiTypes';

const VALID_COMPONENT_TYPES: A2UIComponentType[] = [
  'text',
  'heading',
  'list',
  'table',
  'card',
  'button',
  'input',
  'progress',
  'chart',
  'image',
  'code',
  'divider',
  'tabs',
  'alert',
];

const VALID_LAYOUT_TYPES: A2UILayoutType[] = ['row', 'column', 'grid'];

/**
 * 从 Markdown 内容中提取 ```a2ui ``` 代码块的内容
 */
export function extractA2UIBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```a2ui\s*\n([\s\S]*?)```/gi;
  let match;

  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }

  return blocks;
}

/**
 * 验证组件是否为有效的 A2UI 组件
 */
function isValidComponent(obj: unknown, options: A2UIParseOptions): obj is A2UIComponent {
  if (!obj || typeof obj !== 'object') return false;

  const comp = obj as Record<string, unknown>;

  if (typeof comp.id !== 'string') return false;
  if (typeof comp.type !== 'string') return false;

  if (!VALID_COMPONENT_TYPES.includes(comp.type as A2UIComponentType)) {
    if (options.strict) return false;
  }

  return true;
}

/**
 * 验证是否为有效的布局组件
 */
function isValidLayout(obj: unknown, options: A2UIParseOptions): obj is A2UILayout {
  if (!obj || typeof obj !== 'object') return false;

  const layout = obj as Record<string, unknown>;

  if (typeof layout.id !== 'string') return false;
  if (typeof layout.type !== 'string') return false;

  if (!VALID_LAYOUT_TYPES.includes(layout.type as A2UILayoutType)) {
    if (options.strict) return false;
  }

  if (!Array.isArray(layout.children)) {
    if (options.strict) return false;
    (layout as { children: unknown[] }).children = [];
  }

  return true;
}

/**
 * 递归验证组件树
 */
function validateTree(
  node: unknown,
  options: A2UIParseOptions,
  errors: string[],
  path = 'root'
): boolean {
  if (!node || typeof node !== 'object') {
    errors.push(`${path}: 不是有效的对象`);
    return false;
  }

  const obj = node as Record<string, unknown>;
  const type = obj.type;

  if (VALID_LAYOUT_TYPES.includes(type as A2UILayoutType)) {
    if (!isValidLayout(node, options)) {
      errors.push(`${path}: 无效的布局组件`);
      return false;
    }
    const layout = node as A2UILayout;
    let allValid = true;
    layout.children.forEach((child, index) => {
      const childValid = validateTree(child, options, errors, `${path}.children[${index}]`);
      if (!childValid) allValid = false;
    });
    return allValid;
  }

  if (VALID_COMPONENT_TYPES.includes(type as A2UIComponentType)) {
    if (!isValidComponent(node, options)) {
      errors.push(`${path}: 无效的组件`);
      return false;
    }

    if (type === 'card') {
      const card = node as { children?: unknown[] };
      if (card.children && Array.isArray(card.children)) {
        let allValid = true;
        card.children.forEach((child, index) => {
          const childValid = validateTree(child, options, errors, `${path}.children[${index}]`);
          if (!childValid) allValid = false;
        });
        return allValid;
      }
    }

    if (type === 'tabs') {
      const tabs = node as { tabs?: Array<{ children?: unknown[] }> };
      if (tabs.tabs && Array.isArray(tabs.tabs)) {
        let allValid = true;
        tabs.tabs.forEach((tab, tabIndex) => {
          if (tab.children && Array.isArray(tab.children)) {
            tab.children.forEach((child, childIndex) => {
              const childValid = validateTree(
                child,
                options,
                errors,
                `${path}.tabs[${tabIndex}].children[${childIndex}]`
              );
              if (!childValid) allValid = false;
            });
          }
        });
        return allValid;
      }
    }

    return true;
  }

  errors.push(`${path}: 未知的类型 "${type}"`);
  return false;
}

/**
 * 解析 JSON 格式的 A2UI 描述
 */
export function parseA2UIJSON(
  jsonStr: string,
  options: A2UIParseOptions = {}
): A2UIParseResult {
  const defaultOptions: A2UIParseOptions = {
    strict: false,
    validateSchema: true,
  };
  const opts = { ...defaultOptions, ...options };

  try {
    const parsed = JSON.parse(jsonStr);

    if (opts.validateSchema) {
      const errors: string[] = [];
      validateTree(parsed, opts, errors);

      if (errors.length > 0 && opts.strict) {
        return {
          success: false,
          content: null,
          error: `A2UI 验证失败:\n${errors.join('\n')}`,
        };
      }
    }

    return {
      success: true,
      content: parsed as A2UIComponent | A2UILayout,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      content: null,
      error: `JSON 解析失败: ${error}`,
    };
  }
}

/**
 * 从 Markdown 中解析 A2UI
 * 支持从 ```a2ui ``` 代码块中提取 JSON 并解析
 * 如果找到多个代码块，返回第一个有效的
 */
export function parseA2UIMarkdown(
  content: string,
  options: A2UIParseOptions = {}
): A2UIParseResult {
  const blocks = extractA2UIBlocks(content);

  if (blocks.length === 0) {
    return {
      success: false,
      content: null,
      error: '未找到 a2ui 代码块',
    };
  }

  const errors: string[] = [];

  for (const block of blocks) {
    const result = parseA2UIJSON(block, options);
    if (result.success) {
      return result;
    }
    if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    success: false,
    content: null,
    error: `所有 a2ui 代码块解析失败:\n${errors.join('\n')}`,
  };
}

/**
 * 智能解析：先尝试按 Markdown 解析，再尝试按纯 JSON 解析
 */
export function parseA2UIContent(
  content: string,
  options: A2UIParseOptions = {}
): A2UIParseResult {
  const trimmed = content.trim();

  if (trimmed.startsWith('```')) {
    return parseA2UIMarkdown(content, options);
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonResult = parseA2UIJSON(trimmed, options);
    if (jsonResult.success) {
      return jsonResult;
    }
  }

  const mdResult = parseA2UIMarkdown(content, options);
  if (mdResult.success) {
    return mdResult;
  }

  const jsonResult = parseA2UIJSON(trimmed, options);
  if (jsonResult.success) {
    return jsonResult;
  }

  return {
    success: false,
    content: null,
    error: mdResult.error || jsonResult.error || '无法解析 A2UI 内容',
  };
}

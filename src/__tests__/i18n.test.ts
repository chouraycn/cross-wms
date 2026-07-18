import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import i18n, {
  t,
  interpolate,
  pluralize,
  formatDate,
  formatNumber,
  formatCurrency,
  changeLanguage,
  getCurrentLanguage,
  getAvailableLocales,
  getFallbackChain,
  i18nEvents,
  loadLanguage,
  SUPPORTED_LANGUAGES,
  NAMESPACES,
  FALLBACK_LANGUAGE_CHAIN,
} from '../i18n';

describe('i18n 多语言系统', () => {
  beforeEach(() => {
    // 确保测试前语言为中文
    i18n.changeLanguage('zh-CN');
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 测试 1: 基本翻译
  it('基本翻译 - 中文', () => {
    const result = t('common:save');
    expect(result).toBe('保存');
  });

  // 测试 2: 基本翻译 - 英文
  it('基本翻译 - 英文', async () => {
    await changeLanguage('en-US');
    const result = t('common:save');
    expect(result).toBe('Save');
  });

  // 测试 3: 变量插值
  it('变量插值 - {{name}} 风格', () => {
    const template = '你好，{{name}}！欢迎来到 {{app}}。';
    const result = interpolate(template, { name: '张三', app: 'CrossWMS' });
    expect(result).toBe('你好，张三！欢迎来到 CrossWMS。');
  });

  // 测试 4: 变量插值 - 缺失参数时保留原模板
  it('变量插值 - 缺失参数时保留原占位符', () => {
    const template = '你好，{{name}}！';
    const result = interpolate(template, {});
    expect(result).toBe('你好，{{name}}！');
  });

  // 测试 5: 复数形式 - 单数
  it('复数形式 - 单数', () => {
    const template = '{{count}} item | {{count}} items';
    const result = pluralize(template, 1);
    expect(result).toBe('1 item');
  });

  // 测试 6: 复数形式 - 复数
  it('复数形式 - 复数', () => {
    const template = '{{count}} item | {{count}} items';
    const result = pluralize(template, 5);
    expect(result).toBe('5 items');
  });

  // 测试 7: 日期格式化
  it('日期格式化 - 基于 Intl.DateTimeFormat', () => {
    const date = new Date('2024-01-15T00:00:00');
    const result = formatDate(date, 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(result).toContain('2024');
    expect(result).toContain('01');
    expect(result).toContain('15');
  });

  // 测试 8: 数字格式化
  it('数字格式化 - 基于 Intl.NumberFormat', () => {
    const result = formatNumber(1234567.89, 'en-US');
    expect(result).toBe('1,234,567.89');
  });

  // 测试 9: 货币格式化
  it('货币格式化 - 人民币', () => {
    const result = formatCurrency(99.9, 'CNY', 'zh-CN');
    expect(result).toContain('99.90');
    expect(result).toMatch(/¥|CNY|人民币/);
  });

  // 测试 10: 语言切换事件
  it('语言切换事件 - EventEmitter', async () => {
    let eventData: { previous: string; current: string } | null = null;
    const handler = (data: unknown) => {
      eventData = data as { previous: string; current: string };
    };

    const unsubscribe = i18nEvents.on('languageChanged', handler);

    await changeLanguage('en-US');

    expect(eventData).not.toBeNull();
    expect(eventData!.current).toBe('en-US');

    unsubscribe();
    await changeLanguage('zh-CN');
  });

  // 测试 11: 后备语言链
  it('后备语言链 - zh-TW -> zh-CN -> en-US', () => {
    const chain = getFallbackChain('zh-TW');
    expect(chain).toEqual(['zh-CN', 'en-US']);
  });

  // 测试 12: 命名空间支持
  it('命名空间 - sidebar 命名空间翻译', () => {
    const result = t('sidebar:dashboard');
    expect(result).toBe('仪表盘');
  });

  // 测试 13: 命名空间 - chat 命名空间
  it('命名空间 - chat 命名空间翻译', () => {
    const result = t('chat:newChat');
    expect(result).toBe('新建对话');
  });

  // 测试 14: 缺失 key 返回 fallback（key 本身）
  it('缺失 key - 返回 key 作为 fallback', () => {
    const result = t('common:nonexistentKey12345');
    expect(result).toBe('common:nonexistentKey12345');
  });

  // 测试 15: 可用语言列表和基本信息
  it('可用语言列表 - 包含 4 种语言', () => {
    const locales = getAvailableLocales();
    expect(locales.length).toBeGreaterThanOrEqual(4);
    expect(locales.some((l) => l.code === 'zh-CN')).toBe(true);
    expect(locales.some((l) => l.code === 'en-US')).toBe(true);
    expect(locales.some((l) => l.code === 'zh-TW')).toBe(true);
    expect(locales.some((l) => l.code === 'ja-JP')).toBe(true);
  });
});

describe('i18n 工具函数', () => {
  // 测试 16: interpolate 函数 - 数字参数
  it('interpolate - 数字参数转换为字符串', () => {
    const result = interpolate('共 {{count}} 条', { count: 42 });
    expect(result).toBe('共 42 条');
  });

  // 测试 17: pluralize 函数 - 带额外参数
  it('pluralize - 带额外参数的复数', () => {
    const template = '{{name}} 有 {{count}} 个苹果 | {{name}} 有 {{count}} 个苹果';
    const result = pluralize(template, 3, { name: '小明' });
    expect(result).toBe('小明 有 3 个苹果');
  });

  // 测试 18: FALLBACK_LANGUAGE_CHAIN 结构
  it('FALLBACK_LANGUAGE_CHAIN - 完整后备链', () => {
    expect(FALLBACK_LANGUAGE_CHAIN['zh-TW']).toContain('zh-CN');
    expect(FALLBACK_LANGUAGE_CHAIN['zh-TW']).toContain('en-US');
    expect(FALLBACK_LANGUAGE_CHAIN['ja-JP']).toContain('en-US');
  });

  // 测试 19: NAMESPACES 包含指定命名空间
  it('NAMESPACES - 包含所有必需的命名空间', () => {
    expect(NAMESPACES).toContain('common');
    expect(NAMESPACES).toContain('sidebar');
    expect(NAMESPACES).toContain('chat');
    expect(NAMESPACES).toContain('models');
    expect(NAMESPACES).toContain('settings');
    expect(NAMESPACES).toContain('errors');
    expect(NAMESPACES).toContain('status');
  });

  // 测试 20: getCurrentLanguage 返回当前语言
  it('getCurrentLanguage - 返回当前语言代码', () => {
    const lang = getCurrentLanguage();
    expect(typeof lang).toBe('string');
    expect(SUPPORTED_LANGUAGES.some((l) => l.code === lang)).toBe(true);
  });
});

describe('i18n 动态加载', () => {
  // 测试 21: 动态加载 ja-JP 语言包
  it('动态加载 - ja-JP 语言包', async () => {
    await loadLanguage('ja-JP');
    // 加载后可以添加资源（这里只测试不报错）
    expect(true).toBe(true);
  });

  // 测试 22: 重复加载不报错
  it('动态加载 - 重复加载不报错', async () => {
    await loadLanguage('zh-CN');
    await loadLanguage('zh-CN');
    expect(true).toBe(true);
  });
});

describe('i18n 多语言切换', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    await changeLanguage('zh-CN');
  });

  // 测试 23: 切换到日文后翻译
  it('语言切换 - 日文翻译', async () => {
    await changeLanguage('ja-JP');
    const result = t('common:save');
    expect(result).toBe('保存');
  });

  // 测试 24: 切换语言后持久化到 localStorage
  it('语言切换 - 持久化到 localStorage', async () => {
    await changeLanguage('en-US');
    expect(localStorage.getItem('app_language')).toBe('en-US');
  });

  // 测试 25: 错误信息命名空间
  it('errors 命名空间 - 网络错误', async () => {
    await changeLanguage('zh-CN');
    const result = t('errors:networkError');
    expect(result).toContain('网络');
  });
});

/**
 * E2E 测试：工具执行系统
 *
 * 端到端验证 3 个工具执行系统核心能力：
 * 1. 工具循环检测（连续调用、相同参数重复、窗口占比）
 * 2. 工具 Profile（minimal/coding/messaging/full 四档切换）
 * 3. 工具 Schema 投影（参数裁剪、描述截断）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolLoopDetector, toolLoopDetector, type ToolLoopDetectionConfig } from '../engine/toolLoopDetection.js';
import {
  toolProfileManager,
  projectToolSchema,
  projectToolSchemas,
  TOOL_PROFILES,
  TOOL_GROUPS,
  type ToolProfileId,
} from '../engine/toolProfiles.js';

function makeTool(name: string, desc: string, params: Record<string, any> = {}): any {
  return {
    function: {
      name,
      description: desc,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '查询关键词' },
          limit: { type: 'number', description: '返回数量限制' },
          offset: { type: 'number', description: '偏移量' },
          verbose: { type: 'boolean', description: '是否输出详细信息' },
          ...params,
        },
        required: ['query'],
      },
    },
  };
}

describe('E2E: 工具执行系统', () => {

  // ==================== 1. 工具循环检测 ====================
  describe('工具循环检测器', () => {
    let detector: typeof toolLoopDetector;

    beforeEach(() => {
      // 使用独立实例测试
      detector = new ToolLoopDetector({
        maxConsecutiveCalls: 5,
        maxIdenticalCalls: 3,
        windowSize: 10,
        cooldownMs: 100,
      } as ToolLoopDetectionConfig);
    });

    it('正常工具调用不应触发循环检测', () => {
      const result = detector.recordAndDetect('tool_a', { query: 'test' });
      expect(result.isLoop).toBe(false);
      expect(detector.isInCooldown()).toBe(false);
    });

    it('连续调用同一工具超过阈值应触发 consecutive_limit 循环', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 3,
        maxIdenticalCalls: 10,
        windowSize: 20,
        cooldownMs: 100,
      });

      // 前 3 次正常
      for (let i = 0; i < 3; i++) {
        const r = d.recordAndDetect('same_tool', { i });
        expect(r.isLoop).toBe(false);
      }

      // 第 4 次触发
      const r = d.recordAndDetect('same_tool', { i: 4 });
      expect(r.isLoop).toBe(true);
      if (r.isLoop) {
        expect(r.reason).toBe('consecutive_limit');
        expect(r.toolName).toBe('same_tool');
        expect(r.count).toBe(4);
      }
    });

    it('相同参数重复调用超过阈值应触发 identical_repeat 循环', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 20,
        maxIdenticalCalls: 2,
        windowSize: 20,
        cooldownMs: 100,
      });

      const args = { query: 'exact same args' };
      // 前 2 次正常
      d.recordAndDetect('tool_x', args);
      d.recordAndDetect('tool_y', { other: 'tool' }); // 中间插入不同工具，确保不触发 consecutive
      const r1 = d.recordAndDetect('tool_x', args);
      expect(r1.isLoop).toBe(false); // 第 2 次相同调用，未超限

      // 第 3 次相同参数触发
      d.recordAndDetect('tool_y', { other: 'tool' });
      const r2 = d.recordAndDetect('tool_x', args);
      expect(r2.isLoop).toBe(true);
      if (r2.isLoop) {
        expect(r2.reason).toBe('identical_repeat');
      }
    });

    it('窗口内单一工具占比过高应触发 window_limit 循环', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 100,
        maxIdenticalCalls: 100,
        windowSize: 10,
        cooldownMs: 100,
      });

      // 9 次相同工具 + 1 次其他 = 90% > 80%，应触发
      for (let i = 0; i < 9; i++) {
        const r = d.recordAndDetect('dominant_tool', { i });
        expect(r.isLoop).toBe(false);
      }
      d.recordAndDetect('other_tool', { x: 1 });

      // 第 11 次调用 dominant_tool 时窗口已满 10 条，第 11 条加入后占比仍高
      const r = d.recordAndDetect('dominant_tool', { i: 10 });
      expect(r.isLoop).toBe(true);
      if (r.isLoop) {
        expect(r.reason).toBe('window_limit');
      }
    });

    it('触发循环后应进入冷却期', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 2,
        maxIdenticalCalls: 10,
        windowSize: 10,
        cooldownMs: 50,
      });

      d.recordAndDetect('hot_tool', { a: 1 });
      d.recordAndDetect('hot_tool', { a: 2 });
      const r = d.recordAndDetect('hot_tool', { a: 3 });
      expect(r.isLoop).toBe(true);
      expect(d.isInCooldown()).toBe(true);
    });

    it('冷却期过后应恢复正常', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 2,
        maxIdenticalCalls: 10,
        windowSize: 10,
        cooldownMs: 20,
      });

      // 触发冷却
      d.recordAndDetect('t', {});
      d.recordAndDetect('t', {});
      d.recordAndDetect('t', {});
      expect(d.isInCooldown()).toBe(true);

      // 等待冷却
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(d.isInCooldown()).toBe(false);
          d.reset();
          const r = d.recordAndDetect('t', {});
          expect(r.isLoop).toBe(false);
          resolve();
        }, 30);
      });
    });

    it('reset 应重置所有状态', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 3,
        maxIdenticalCalls: 10,
        windowSize: 10,
        cooldownMs: 1000,
      });

      for (let i = 0; i < 5; i++) {
        d.recordAndDetect('loop_tool', { i });
      }
      expect(d.isInCooldown()).toBe(true);

      d.reset();
      expect(d.isInCooldown()).toBe(false);
      expect(d.getHistory().length).toBe(0);

      const r = d.recordAndDetect('loop_tool', { reset: true });
      expect(r.isLoop).toBe(false);
    });

    it('交替调用不同工具不应触发循环', () => {
      const d = new ToolLoopDetector({
        maxConsecutiveCalls: 3,
        maxIdenticalCalls: 3,
        windowSize: 10,
        cooldownMs: 100,
      });

      for (let i = 0; i < 10; i++) {
        const r = d.recordAndDetect(i % 2 === 0 ? 'tool_a' : 'tool_b', { i });
        expect(r.isLoop).toBe(false);
      }
    });
  });

  // ==================== 2. 工具 Profile ====================
  describe('工具 Profile 系统', () => {
    beforeEach(() => {
      toolProfileManager.setProfile('full');
      toolProfileManager.clearCustomOverride();
    });

    it('应有 4 个内置 Profile', () => {
      const profiles = toolProfileManager.listProfiles();
      expect(profiles.length).toBe(4);
      expect(profiles.map(p => p.id)).toContain('minimal');
      expect(profiles.map(p => p.id)).toContain('coding');
      expect(profiles.map(p => p.id)).toContain('messaging');
      expect(profiles.map(p => p.id)).toContain('full');
    });

    it('full Profile 应包含所有工具', () => {
      const tools = [
        makeTool('system_info', '系统信息'),
        makeTool('file_readFile', '读取文件'),
        makeTool('file_writeFile', '写入文件'),
        makeTool('file_execCommand', '执行命令'),
        makeTool('web_search', 'Web 搜索'),
        makeTool('web_fetch', 'Web 抓取'),
        makeTool('db_query', '数据库查询'),
        makeTool('desktop_click', '桌面点击'),
        makeTool('desktop_screenshot', '屏幕截图'),
      ];

      toolProfileManager.setProfile('full');
      const filtered = toolProfileManager.applyProfile(tools as any);
      expect(filtered.length).toBe(tools.length);
    });

    it('minimal Profile 应仅包含 system 和 file_read', () => {
      const tools = [
        makeTool('system_info', '系统信息'),
        makeTool('file_listDir', '列出目录'),
        makeTool('file_readFile', '读取文件'),
        makeTool('file_writeFile', '写入文件'),
        makeTool('file_execCommand', '执行命令'),
        makeTool('web_search', 'Web 搜索'),
      ];

      toolProfileManager.setProfile('minimal');
      const filtered = toolProfileManager.applyProfile(tools as any);
      const names = filtered.map(t => t.function.name);
      expect(names).toContain('system_info');
      expect(names).toContain('file_listDir');
      expect(names).toContain('file_readFile');
      expect(names).not.toContain('file_writeFile');
      expect(names).not.toContain('file_execCommand');
      expect(names).not.toContain('web_search');
    });

    it('coding Profile 应包含文件、数据库、Web 工具', () => {
      const tools = [
        makeTool('system_info', '系统信息'),
        makeTool('file_readFile', '读取文件'),
        makeTool('file_writeFile', '写入文件'),
        makeTool('db_query', '数据库查询'),
        makeTool('web_search', '搜索'),
        makeTool('web_fetch', '抓取'),
        makeTool('desktop_click', '桌面点击'),
        makeTool('desktop_screenshot', '截图'),
      ];

      toolProfileManager.setProfile('coding');
      const filtered = toolProfileManager.applyProfile(tools as any);
      const names = filtered.map(t => t.function.name);
      expect(names).toContain('system_info');
      expect(names).toContain('file_readFile');
      expect(names).toContain('file_writeFile');
      expect(names).toContain('db_query');
      expect(names).toContain('web_search');
      expect(names).not.toContain('desktop_click');
      expect(names).not.toContain('desktop_screenshot');
    });

    it('messaging Profile 应仅包含 system 和 web 工具', () => {
      const tools = [
        makeTool('system_info', '系统信息'),
        makeTool('file_readFile', '读取文件'),
        makeTool('web_search', '搜索'),
        makeTool('web_fetch', '抓取'),
        makeTool('web_apiCall', 'API 调用'),
      ];

      toolProfileManager.setProfile('messaging');
      const filtered = toolProfileManager.applyProfile(tools as any);
      const names = filtered.map(t => t.function.name);
      expect(names).toContain('system_info');
      expect(names).toContain('web_search');
      expect(names).toContain('web_fetch');
      expect(names).toContain('web_apiCall');
      expect(names).not.toContain('file_readFile');
    });

    it('isToolAllowed 应正确判断工具是否允许', () => {
      toolProfileManager.setProfile('minimal');
      expect(toolProfileManager.isToolAllowed('system_info')).toBe(true);
      expect(toolProfileManager.isToolAllowed('file_readFile')).toBe(true);
      expect(toolProfileManager.isToolAllowed('file_writeFile')).toBe(false);
      expect(toolProfileManager.isToolAllowed('desktop_click')).toBe(false);
    });

    it('custom override 应覆盖 Profile 配置', () => {
      toolProfileManager.setProfile('minimal');
      toolProfileManager.setCustomOverride({
        includeNamespaces: ['system', 'file', 'web'],
        excludeTools: [],
      });

      const tools = [
        makeTool('system_info', ''),
        makeTool('web_search', ''),
        makeTool('desktop_click', ''),
      ];
      const filtered = toolProfileManager.applyProfile(tools as any);
      expect(filtered.length).toBe(2);
      expect(filtered.map(t => t.function.name)).toContain('web_search');
    });

    it('expandToolGroups 应展开分组', () => {
      const expanded = toolProfileManager.expandToolGroups(['fs']);
      expect(expanded.length).toBeGreaterThanOrEqual(4); // file_listDir, file_readFile, file_writeFile, file_execCommand
      expect(expanded).toContain('file_listDir');
      expect(expanded).toContain('file_readFile');
    });

    it('TOOL_GROUPS 应有 5 个内置分组', () => {
      const groups = Object.keys(TOOL_GROUPS);
      expect(groups.length).toBeGreaterThanOrEqual(5);
      expect(groups).toContain('fs');
      expect(groups).toContain('web');
      expect(groups).toContain('db');
      expect(groups).toContain('desktop');
      expect(groups).toContain('system');
    });
  });

  // ==================== 3. 工具 Schema 投影 ====================
  describe('工具 Schema 投影', () => {
    it('应截断过长的工具描述', () => {
      const tool = makeTool('test_tool', 'A'.repeat(500));
      const projected = projectToolSchema(tool as any, { maxDescriptionLength: 100 });
      expect(projected.function.description.length).toBeLessThanOrEqual(100);
    });

    it('hideOptionalParams 应移除非 required 参数', () => {
      const tool = makeTool('test_tool', 'test');
      const projected = projectToolSchema(tool as any, { hideOptionalParams: true });
      const props = projected.function.parameters.properties;
      expect(props.query).toBeDefined();
      expect(props.limit).toBeUndefined();
      expect(props.offset).toBeUndefined();
      expect(props.verbose).toBeUndefined();
      expect(projected.function.parameters.required).toEqual(['query']);
    });

    it('excludeParams 应排除指定参数', () => {
      const tool = makeTool('test_tool', 'test');
      const projected = projectToolSchema(tool as any, {
        excludeParams: ['verbose', 'offset'],
      });
      const props = projected.function.parameters.properties;
      expect(props.query).toBeDefined();
      expect(props.limit).toBeDefined();
      expect(props.offset).toBeUndefined();
      expect(props.verbose).toBeUndefined();
    });

    it('maxParams 应限制参数数量', () => {
      const tool = makeTool('test_tool', 'test');
      const projected = projectToolSchema(tool as any, { maxParams: 2 });
      const props = projected.function.parameters.properties;
      const propCount = Object.keys(props).length;
      expect(propCount).toBeLessThanOrEqual(2);
    });

    it('projectToolSchemas 应批量投影', () => {
      const tools = [
        makeTool('tool_a', 'A'.repeat(300)),
        makeTool('tool_b', 'B'.repeat(300)),
      ];
      const projected = projectToolSchemas(tools as any, { maxDescriptionLength: 50 });
      expect(projected.length).toBe(2);
      expect(projected[0].function.description.length).toBeLessThanOrEqual(50);
      expect(projected[1].function.description.length).toBeLessThanOrEqual(50);
    });

    it('不应修改原始工具对象', () => {
      const original = makeTool('test_tool', 'A'.repeat(200));
      const originalDesc = original.function.description;
      projectToolSchema(original as any, { maxDescriptionLength: 50 });
      expect(original.function.description).toBe(originalDesc); // 原始不应被修改
    });

    it('应重新计算 required 数组', () => {
      const tool = makeTool('test_tool', 'test');
      const projected = projectToolSchema(tool as any, {
        excludeParams: ['query'], // 排除 required 参数
      });
      expect(projected.function.parameters.required).not.toContain('query');
    });
  });

  // ==================== 4. 集成测试 ====================
  describe('Profile + Schema 投影集成', () => {
    it('应能链式调用 Profile 过滤和 Schema 投影', () => {
      const tools = [
        makeTool('system_info', '系统信息工具，用于获取当前系统的基本信息，包括操作系统版本、CPU 架构、内存大小、磁盘使用情况等详细信息'),
        makeTool('file_readFile', '读取文件内容，支持指定路径和编码方式，返回文件内容字符串'),
        makeTool('web_search', '执行 Web 搜索，支持多个搜索引擎，返回搜索结果列表'),
        makeTool('desktop_click', '模拟鼠标点击操作'),
      ];

      toolProfileManager.setProfile('coding');
      const filtered = toolProfileManager.applyProfile(tools as any);
      const projected = projectToolSchemas(filtered as any, {
        maxDescriptionLength: 50,
      });

      // coding profile 排除 desktop_*
      expect(projected.length).toBe(3);
      expect(projected.some(t => t.function.name === 'desktop_click')).toBe(false);
      // 描述被截断
      for (const t of projected) {
        expect(t.function.description.length).toBeLessThanOrEqual(50);
      }
    });
  });
});

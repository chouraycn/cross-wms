import { describe, it, expect } from 'vitest';
import {
  normalizeInputProvenance,
  applyInputProvenanceToUserMessage,
  isInterSessionInputProvenance,
  isAgentMediatedCompletionSourceTool,
  shouldPreserveUserFacingSessionStateForInputProvenance,
  hasInterSessionUserProvenance,
  buildInterSessionPromptPrefix,
  stripInterSessionPromptPrefixForDisplay,
  annotateInterSessionPromptText,
  INTER_SESSION_PROMPT_PREFIX_BASE,
  INPUT_PROVENANCE_KIND_VALUES,
} from '../input-provenance.js';
import type { InputProvenance, PersistedUserTurnMessage } from '../types.js';

describe('input-provenance — 输入来源追踪', () => {
  describe('normalizeInputProvenance', () => {
    it('规范化有效的 provenance 对象', () => {
      const result = normalizeInputProvenance({
        kind: 'external_user',
        sourceSessionKey: 'test-session',
      });
      expect(result).not.toBeUndefined();
      expect(result?.kind).toBe('external_user');
      expect(result?.sourceSessionKey).toBe('test-session');
    });

    it('对无效 kind 返回 undefined', () => {
      expect(normalizeInputProvenance({ kind: 'invalid' })).toBeUndefined();
      expect(normalizeInputProvenance(null)).toBeUndefined();
      expect(normalizeInputProvenance(undefined)).toBeUndefined();
      expect(normalizeInputProvenance('string')).toBeUndefined();
    });

    it('保留所有可选字段', () => {
      const provenance: InputProvenance = {
        kind: 'inter_session',
        originSessionId: 'orig-123',
        sourceSessionKey: 'source-key',
        sourceChannel: 'slack',
        sourceTool: 'image_generate',
      };
      const result = normalizeInputProvenance(provenance);
      expect(result).toEqual(provenance);
    });
  });

  describe('applyInputProvenanceToUserMessage', () => {
    it('为用户消息添加 provenance', () => {
      const message: PersistedUserTurnMessage = {
        role: 'user',
        content: 'hello',
        timestamp: 123456,
      };
      const provenance: InputProvenance = { kind: 'external_user' };

      const result = applyInputProvenanceToUserMessage(message, provenance);
      expect(result.provenance).toEqual(provenance);
    });

    it('不修改已有 provenance 的消息', () => {
      const existing: InputProvenance = { kind: 'external_user' };
      const message: PersistedUserTurnMessage = {
        role: 'user',
        content: 'hello',
        timestamp: 123456,
        provenance: existing,
      };
      const newProvenance: InputProvenance = { kind: 'inter_session' };

      const result = applyInputProvenanceToUserMessage(message, newProvenance);
      expect(result.provenance).toEqual(existing);
    });

    it('不修改非用户消息', () => {
      const message = {
        role: 'assistant',
        content: 'hi',
        timestamp: 123456,
      } as unknown as PersistedUserTurnMessage;
      const provenance: InputProvenance = { kind: 'external_user' };

      const result = applyInputProvenanceToUserMessage(message, provenance);
      expect(result.provenance).toBeUndefined();
    });

    it('provenance 为 undefined 时返回原消息', () => {
      const message: PersistedUserTurnMessage = {
        role: 'user',
        content: 'hello',
        timestamp: 123456,
      };
      const result = applyInputProvenanceToUserMessage(message, undefined);
      expect(result).toEqual(message);
    });
  });

  describe('isInterSessionInputProvenance', () => {
    it('对 inter_session kind 返回 true', () => {
      expect(isInterSessionInputProvenance({ kind: 'inter_session' })).toBe(true);
    });

    it('对其他 kind 返回 false', () => {
      expect(isInterSessionInputProvenance({ kind: 'external_user' })).toBe(false);
      expect(isInterSessionInputProvenance({ kind: 'internal_system' })).toBe(false);
      expect(isInterSessionInputProvenance(null)).toBe(false);
      expect(isInterSessionInputProvenance(undefined)).toBe(false);
    });
  });

  describe('isAgentMediatedCompletionSourceTool', () => {
    it('对代理介导工具返回 true', () => {
      expect(isAgentMediatedCompletionSourceTool('image_generate')).toBe(true);
      expect(isAgentMediatedCompletionSourceTool('video_generate')).toBe(true);
    });

    it('对其他工具返回 false', () => {
      expect(isAgentMediatedCompletionSourceTool('unknown_tool')).toBe(false);
      expect(isAgentMediatedCompletionSourceTool(null)).toBe(false);
    });
  });

  describe('shouldPreserveUserFacingSessionStateForInputProvenance', () => {
    it('对 inter_session 且源工具在保留列表中返回 true', () => {
      expect(
        shouldPreserveUserFacingSessionStateForInputProvenance({
          kind: 'inter_session',
          sourceTool: 'image_generate',
        }),
      ).toBe(true);
    });

    it('对非 inter_session 返回 false', () => {
      expect(
        shouldPreserveUserFacingSessionStateForInputProvenance({
          kind: 'external_user',
          sourceTool: 'image_generate',
        }),
      ).toBe(false);
    });
  });

  describe('hasInterSessionUserProvenance', () => {
    it('对用户角色且 inter_session provenance 返回 true', () => {
      expect(
        hasInterSessionUserProvenance({
          role: 'user',
          provenance: { kind: 'inter_session' },
        }),
      ).toBe(true);
    });

    it('对非用户角色返回 false', () => {
      expect(
        hasInterSessionUserProvenance({
          role: 'assistant',
          provenance: { kind: 'inter_session' },
        }),
      ).toBe(false);
    });

    it('对非 inter_session provenance 返回 false', () => {
      expect(
        hasInterSessionUserProvenance({
          role: 'user',
          provenance: { kind: 'external_user' },
        }),
      ).toBe(false);
    });
  });

  describe('buildInterSessionPromptPrefix', () => {
    it('构建包含基本前缀的提示', () => {
      const prefix = buildInterSessionPromptPrefix({ kind: 'inter_session' });
      expect(prefix).toContain(INTER_SESSION_PROMPT_PREFIX_BASE);
      expect(prefix).toContain('isUser=false');
    });

    it('包含源会话信息', () => {
      const prefix = buildInterSessionPromptPrefix({
        kind: 'inter_session',
        sourceSessionKey: 'source-key',
        sourceChannel: 'slack',
        sourceTool: 'image_generate',
      });
      expect(prefix).toContain('sourceSession=source-key');
      expect(prefix).toContain('sourceChannel=slack');
      expect(prefix).toContain('sourceTool=image_generate');
    });

    it('对非 inter_session provenance 仍返回基本前缀', () => {
      const prefix = buildInterSessionPromptPrefix({ kind: 'external_user' });
      expect(prefix).toContain(INTER_SESSION_PROMPT_PREFIX_BASE);
    });
  });

  describe('stripInterSessionPromptPrefixForDisplay', () => {
    it('移除会话间提示前缀', () => {
      const prefix = buildInterSessionPromptPrefix({ kind: 'inter_session' });
      const fullText = `${prefix}\nActual content here`;
      const stripped = stripInterSessionPromptPrefixForDisplay(fullText);
      expect(stripped).toBe('Actual content here');
    });

    it('没有前缀时返回原文', () => {
      const text = 'Just some regular text';
      expect(stripInterSessionPromptPrefixForDisplay(text)).toBe(text);
    });
  });

  describe('annotateInterSessionPromptText', () => {
    it('为文本添加会话间前缀', () => {
      const provenance: InputProvenance = { kind: 'inter_session' };
      const annotated = annotateInterSessionPromptText('Hello world', provenance);
      expect(annotated.startsWith(INTER_SESSION_PROMPT_PREFIX_BASE)).toBe(true);
      expect(annotated.endsWith('Hello world')).toBe(true);
    });

    it('已有前缀时不重复添加', () => {
      const provenance: InputProvenance = { kind: 'inter_session' };
      const prefix = buildInterSessionPromptPrefix(provenance);
      const annotated = annotateInterSessionPromptText(`${prefix}\nHello`, provenance);
      expect(annotated).toBe(`${prefix}\nHello`);
    });

    it('对非 inter_session provenance 返回原文', () => {
      const provenance: InputProvenance = { kind: 'external_user' };
      const text = 'Hello world';
      expect(annotateInterSessionPromptText(text, provenance)).toBe(text);
    });
  });

  describe('INPUT_PROVENANCE_KIND_VALUES', () => {
    it('包含所有有效的 kind', () => {
      expect(INPUT_PROVENANCE_KIND_VALUES).toContain('external_user');
      expect(INPUT_PROVENANCE_KIND_VALUES).toContain('inter_session');
      expect(INPUT_PROVENANCE_KIND_VALUES).toContain('internal_system');
    });
  });
});

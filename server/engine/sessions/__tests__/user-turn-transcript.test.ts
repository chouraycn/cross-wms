import { describe, it, expect } from 'vitest';
import {
  resolvePersistedUserTurnText,
  buildPersistedUserTurnMessage,
  buildPersistedUserTurnMediaInputsFromFields,
  mergePreparedUserTurnMessageForRuntime,
  isUserMessage,
  type UserTurnInput,
  type PersistedUserTurnMessage,
} from '../user-turn-transcript.js';
import type { InputProvenance } from '../types.js';

describe('user-turn-transcript — 用户轮次转录本', () => {
  describe('resolvePersistedUserTurnText', () => {
    it('返回规范化的文本', () => {
      expect(resolvePersistedUserTurnText('  hello world  ')).toBe('hello world');
    });

    it('对空值返回 undefined', () => {
      expect(resolvePersistedUserTurnText(null)).toBeUndefined();
      expect(resolvePersistedUserTurnText(undefined)).toBeUndefined();
      expect(resolvePersistedUserTurnText('')).toBeUndefined();
      expect(resolvePersistedUserTurnText('   ')).toBeUndefined();
    });

    it('有媒体时移除媒体占位符', () => {
      const placeholder = '<media:image>';
      expect(resolvePersistedUserTurnText(placeholder, { hasMedia: true })).toBeUndefined();
      expect(resolvePersistedUserTurnText(placeholder, { hasMedia: false })).toBe(placeholder);
    });

    it('处理带描述的媒体占位符', () => {
      const placeholder = '<media:image> (photo.jpg)';
      expect(resolvePersistedUserTurnText(placeholder, { hasMedia: true })).toBeUndefined();
    });
  });

  describe('buildPersistedUserTurnMessage', () => {
    it('构建基本的用户消息', () => {
      const input: UserTurnInput = {
        text: 'Hello world',
        timestamp: 1234567890,
      };

      const message = buildPersistedUserTurnMessage(input);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello world');
      expect(message.timestamp).toBe(1234567890);
    });

    it('没有时间戳时使用当前时间', () => {
      const input: UserTurnInput = { text: 'Hello' };
      const before = Date.now();
      const message = buildPersistedUserTurnMessage(input);
      const after = Date.now();
      expect(message.timestamp).toBeGreaterThanOrEqual(before);
      expect(message.timestamp).toBeLessThanOrEqual(after);
    });

    it('包含幂等键', () => {
      const input: UserTurnInput = {
        text: 'Hello',
        idempotencyKey: 'key-123',
      };

      const message = buildPersistedUserTurnMessage(input);
      expect(message.idempotencyKey).toBe('key-123');
    });

    it('包含 provenance', () => {
      const provenance: InputProvenance = { kind: 'external_user' };
      const input: UserTurnInput = {
        text: 'Hello',
        provenance,
      };

      const message = buildPersistedUserTurnMessage(input);
      expect(message.provenance).toEqual(provenance);
    });

    it('包含媒体字段', () => {
      const input: UserTurnInput = {
        text: 'Check this image',
        media: [
          { path: '/path/to/image.jpg', contentType: 'image/jpeg' },
        ],
      };

      const message = buildPersistedUserTurnMessage(input);
      expect(message.MediaPath).toBe('/path/to/image.jpg');
      expect(message.MediaPaths).toEqual(['/path/to/image.jpg']);
      expect(message.MediaType).toBe('image/jpeg');
      expect(message.MediaTypes).toEqual(['image/jpeg']);
    });

    it('仅有媒体时使用 mediaOnlyText', () => {
      const input: UserTurnInput = {
        text: '',
        media: [{ path: '/path/to/image.jpg' }],
        mediaOnlyText: '[image]',
      };

      const message = buildPersistedUserTurnMessage(input);
      expect(message.content).toBe('[image]');
    });
  });

  describe('buildPersistedUserTurnMediaInputsFromFields', () => {
    it('从字段构建媒体输入', () => {
      const result = buildPersistedUserTurnMediaInputsFromFields({
        MediaPath: '/path/1.jpg',
        MediaPaths: ['/path/1.jpg', '/path/2.jpg'],
        MediaType: 'image/jpeg',
        MediaTypes: ['image/jpeg', 'image/png'],
      });

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/path/1.jpg');
      expect(result[0].contentType).toBe('image/jpeg');
      expect(result[1].path).toBe('/path/2.jpg');
      expect(result[1].contentType).toBe('image/png');
    });

    it('处理单个媒体路径', () => {
      const result = buildPersistedUserTurnMediaInputsFromFields({
        MediaPath: '/path/single.jpg',
      });

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/path/single.jpg');
    });

    it('对空字段返回空数组', () => {
      expect(buildPersistedUserTurnMediaInputsFromFields(null)).toEqual([]);
      expect(buildPersistedUserTurnMediaInputsFromFields(undefined)).toEqual([]);
      expect(buildPersistedUserTurnMediaInputsFromFields({})).toEqual([]);
    });
  });

  describe('mergePreparedUserTurnMessageForRuntime', () => {
    it('合并准备好的消息到运行时消息', () => {
      const runtimeMessage: PersistedUserTurnMessage = {
        role: 'user',
        content: 'original',
        timestamp: 1000,
      };
      const preparedMessage: PersistedUserTurnMessage = {
        role: 'user',
        content: 'prepared',
        timestamp: 2000,
        idempotencyKey: 'key-123',
      };

      const result = mergePreparedUserTurnMessageForRuntime({
        runtimeMessage,
        preparedMessage,
      });

      expect(result.content).toBe('prepared');
      expect(result.idempotencyKey).toBe('key-123');
    });

    it('没有准备好的消息时返回运行时消息', () => {
      const runtimeMessage: PersistedUserTurnMessage = {
        role: 'user',
        content: 'original',
        timestamp: 1000,
      };

      const result = mergePreparedUserTurnMessageForRuntime({ runtimeMessage });
      expect(result).toBe(runtimeMessage);
    });
  });

  describe('isUserMessage', () => {
    it('对用户消息返回 true', () => {
      expect(isUserMessage({ role: 'user' })).toBe(true);
    });

    it('对非用户消息返回 false', () => {
      expect(isUserMessage({ role: 'assistant' })).toBe(false);
      expect(isUserMessage({ role: 'system' })).toBe(false);
      expect(isUserMessage({})).toBe(false);
    });
  });
});

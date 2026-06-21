/**
 * @vitest-environment node
 *
 * chatService.ts — Module structure and utility-level tests
 *
 * Tests focus on:
 * 1. Module exports (handleChat is exported and is a function)
 * 2. Queue execution patterns (QueueExecuteParams interface shape verification via enqueue calls)
 * 3. Module loads without errors (all 20+ dependencies are mocked)
 * 4. All external dependencies are properly mocked and functional
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ====================================================================
// Mock ALL external dependencies (20+ modules)
// ====================================================================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-0000'),
}));

vi.mock('../../aiClient.js', () => ({
  callAIModel: vi.fn(),
  AIAPIError: class AIAPIError extends Error {
    constructor(msg: string, public category: string, public statusCode?: number) {
      super(msg);
      this.name = 'AIAPIError';
    }
  },
}));

vi.mock('../../engine/toolExecutor.js', () => ({
  executeToolLoop: vi.fn(),
  getToolRiskLevel: vi.fn(),
}));

vi.mock('../../engine/executionStrategy.js', () => ({
  ExecutionStrategyFactory: { create: vi.fn(), getDefaultMode: vi.fn() },
  ExecutionMode: {} as Record<string, string>,
}));

vi.mock('../../engine/soulLoader.js', () => ({
  buildSoulSystemMessage: vi.fn().mockReturnValue(''),
}));

vi.mock('../../engine/contextTruncate.js', () => ({
  sanitizeToolMessages: vi.fn(),
  estimateMessagesTokens: vi.fn(),
  truncateContextForModel: vi.fn(),
}));

vi.mock('../../engine/contextCompress.js', () => ({
  compressContextWithSummary: vi.fn(),
}));

vi.mock('../../modelsStore.js', () => ({
  loadModelsConfig: vi.fn(),
  ModelsFile: {} as any,
  isLocalModel: vi.fn(),
}));

vi.mock('../../keyRotator.js', () => ({
  selectKey: vi.fn(),
  reportKeyResult: vi.fn(),
}));

vi.mock('../../dao/chat.js', () => ({
  getSessions: vi.fn(),
  createSession: vi.fn(),
  getSessionMessages: vi.fn(),
  addMessage: vi.fn(),
}));

vi.mock('../../services/pluginAutoInvoke.js', () => ({
  matchTriggers: vi.fn(),
  executePluginTrigger: vi.fn(),
}));

vi.mock('../../engine/messageQueue.js', () => ({
  messageQueue: {
    enqueue: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCurrentAbortController: vi.fn(),
    getSessionState: vi.fn(),
    getQueueLength: vi.fn(),
    getCurrentAssistantId: vi.fn(),
    markCompleted: vi.fn(),
  },
}));

vi.mock('../../engine/vecMemoryStore.js', () => ({
  searchMemory: vi.fn(),
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../modelSelector.js', () => ({
  autoSelectModel: vi.fn(),
  generateMockResponse: vi.fn(),
  isModelAvailable: vi.fn(),
  MODEL_PRESETS: {} as Record<string, { label: string; temperature: number; topP: number }>,
}));

vi.mock('../memoryExtractor.js', () => ({
  extractAndAppendMemory: vi.fn(),
  readMemoryMd: vi.fn().mockResolvedValue(''),
}));

vi.mock('../toolPermissionService.js', () => ({
  permissionEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), once: vi.fn(), removeListener: vi.fn() },
  isSystemAuthorized: vi.fn(),
  initSessionApprovedTools: vi.fn(),
  registerPermissionRequest: vi.fn(),
}));

vi.mock('../../dao/settings.js', () => ({
  getAppSettings: vi.fn(),
}));

vi.mock('../chatHelpers/fileExtractor.js', () => ({
  extractFileContent: vi.fn(),
}));

vi.mock('../chatHelpers/thinkingCache.js', () => ({
  getThinkingCacheKey: vi.fn(),
  getThinkingCache: vi.fn(),
  setThinkingCache: vi.fn(),
}));

vi.mock('../chatHelpers/sseHelper.js', () => ({
  activeSSEConnections: new Map<string, { res: any; assistantMessageId: string }>(),
}));

// ====================================================================
// Imports (mocks are hoisted, so these resolve to mocked modules)
// ====================================================================

import { v4 as uuidv4 } from 'uuid';
import * as aiClientModule from '../../aiClient.js';
import * as toolExecutorModule from '../../engine/toolExecutor.js';
import * as executionStrategyModule from '../../engine/executionStrategy.js';
import * as soulLoaderModule from '../../engine/soulLoader.js';
import * as contextTruncateModule from '../../engine/contextTruncate.js';
import * as contextCompressModule from '../../engine/contextCompress.js';
import * as modelsStoreModule from '../../modelsStore.js';
import * as keyRotatorModule from '../../keyRotator.js';
import * as daoChatModule from '../../dao/chat.js';
import * as pluginAutoInvokeModule from '../../services/pluginAutoInvoke.js';
import * as messageQueueModule from '../../engine/messageQueue.js';
import * as vecMemoryStoreModule from '../../engine/vecMemoryStore.js';
import * as loggerModule from '../../logger.js';
import * as modelSelectorModule from '../modelSelector.js';
import * as memoryExtractorModule from '../memoryExtractor.js';
import * as toolPermissionServiceModule from '../toolPermissionService.js';
import * as daoSettingsModule from '../../dao/settings.js';
import * as fileExtractorModule from '../chatHelpers/fileExtractor.js';
import * as thinkingCacheModule from '../chatHelpers/thinkingCache.js';
import * as sseHelperModule from '../chatHelpers/sseHelper.js';

// ====================================================================
// Test Suite
// ====================================================================

describe('chatService.ts — Module Structure', () => {
  let chatService: typeof import('../chatService.js');

  beforeAll(async () => {
    // Dynamic import ensures mocks are fully established
    chatService = (await import('../chatService.js')) as any;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1: Module loads without errors ──────────────────────────

  it('should load the module without throwing when all dependencies are mocked', () => {
    // The module was imported in beforeAll; if it threw, the test would fail
    expect(chatService).toBeDefined();
    expect(typeof chatService).toBe('object');
  });

  // ─── Test 2: Module exports ────────────────────────────────────────

  describe('exports', () => {
    it('should export handleChat as a function', () => {
      expect(chatService.handleChat).toBeDefined();
      expect(typeof chatService.handleChat).toBe('function');
      expect(chatService.handleChat.name).toBe('handleChat');
    });

    it('should export activeSSEConnections as a Map (re-exported from sseHelper)', () => {
      expect(chatService.activeSSEConnections).toBeDefined();
      expect(chatService.activeSSEConnections).toBeInstanceOf(Map);
    });

    it('should have exactly two exports: handleChat and activeSSEConnections', () => {
      const exportNames = Object.keys(chatService).sort();
      expect(exportNames).toEqual(['activeSSEConnections', 'handleChat']);
    });
  });

  // ─── Test 3: handleChat signature ─────────────────────────────────

  describe('handleChat function signature', () => {
    it('should accept two parameters (req, res)', () => {
      expect(chatService.handleChat.length).toBe(2);
    });

    it('should return a Promise (async function)', async () => {
      const result = chatService.handleChat(
        { body: { message: 'test' } } as any,
        { setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false, socket: { setNoDelay: vi.fn() } } as any,
      );
      expect(result).toBeInstanceOf(Promise);
      // Await and swallow rejection since mocks are minimal
      await result.catch(() => {});
    });
  });

  // ─── Test 4: Queue execution patterns ─────────────────────────────

  describe('queue execution patterns (MessageQueue integration)', () => {
    it('should call messageQueue.enqueue with correct parameter shape when queueMode is set', async () => {
      const mockEnqueue = messageQueueModule.messageQueue.enqueue as ReturnType<typeof vi.fn>;
      const mockRes = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        writableEnded: false,
        socket: { setNoDelay: vi.fn() },
      } as any;

      // Arrange mocks for the happy path
      (modelsStoreModule.loadModelsConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
      });
      (modelSelectorModule.autoSelectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        modelId: 'test-model',
        modelName: 'Test Model',
        reason: 'default',
        reasonType: 'default',
      });
      (daoChatModule.getSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (daoChatModule.createSession as ReturnType<typeof vi.fn>).mockReturnValue({});
      (daoChatModule.addMessage as ReturnType<typeof vi.fn>).mockReturnValue({});
      (soulLoaderModule.buildSoulSystemMessage as ReturnType<typeof vi.fn>).mockReturnValue('');
      (memoryExtractorModule.readMemoryMd as ReturnType<typeof vi.fn>).mockResolvedValue('');
      mockEnqueue.mockReturnValue({ accepted: true, messageId: 'msg-1', assistantMessageId: 'ast-1' });
      (messageQueueModule.messageQueue.on as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      (messageQueueModule.messageQueue.getSessionState as ReturnType<typeof vi.fn>).mockReturnValue('idle');

      const req = {
        body: {
          message: 'hello',
          model: 'auto',
          queueMode: 'single',
        },
      } as any;

      await chatService.handleChat(req, mockRes);

      // enqueue should be called with the sessionId, message, queueMode, and a params object
      expect(mockEnqueue).toHaveBeenCalledOnce();
      const enqueueArgs = mockEnqueue.mock.calls[0];
      expect(enqueueArgs).toHaveLength(4);
      expect(typeof enqueueArgs[0]).toBe('string');                // sessionId
      expect(typeof enqueueArgs[1]).toBe('string');                // message
      expect(enqueueArgs[2]).toBe('single');                       // queueMode
      expect(typeof enqueueArgs[3]).toBe('object');                // params object

      // Verify the params object shape matches QueueExecuteParams-like structure
      const params = enqueueArgs[3];
      expect(params).toHaveProperty('model');
      expect(params).toHaveProperty('modelName');
      expect(params).toHaveProperty('skillContext');
      expect(params).toHaveProperty('skillId');
      expect(params).toHaveProperty('preset');
      expect(params).toHaveProperty('attachments');
      expect(params).toHaveProperty('reasoningEffort');
      expect(params).toHaveProperty('executionMode');
      expect(params).toHaveProperty('conversationHistory');
      expect(params).toHaveProperty('autoReason');
      expect(params).toHaveProperty('autoReasonType');

      expect(typeof params.model).toBe('string');
      expect(typeof params.modelName).toBe('string');
      expect(params.model).toBe('test-model');
    });

    it('should register and unregister a queue event listener', async () => {
      const mockOn = messageQueueModule.messageQueue.on as ReturnType<typeof vi.fn>;
      const mockOff = messageQueueModule.messageQueue.off as ReturnType<typeof vi.fn>;
      const mockEnqueue = messageQueueModule.messageQueue.enqueue as ReturnType<typeof vi.fn>;
      const mockRes = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        writableEnded: false,
        socket: { setNoDelay: vi.fn() },
      } as any;

      (modelsStoreModule.loadModelsConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
      });
      (modelSelectorModule.autoSelectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        modelId: 'test-model', modelName: 'Test Model', reason: 'default', reasonType: 'default',
      });
      (daoChatModule.getSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
      mockEnqueue.mockReturnValue({ accepted: true, messageId: 'msg-1', assistantMessageId: 'ast-1' });
      (messageQueueModule.messageQueue.getSessionState as ReturnType<typeof vi.fn>).mockReturnValue('idle');

      await chatService.handleChat(
        { body: { message: 'hello', queueMode: 'single' } } as any,
        mockRes,
      );

      expect(mockOn).toHaveBeenCalledWith('queue', expect.any(Function));
    });
  });

  // ─── Test 5: Mock verification ────────────────────────────────────

  describe('all mocked dependencies are properly set up', () => {
    it('uuid.v4 returns a consistent mock value', () => {
      expect(uuidv4()).toBe('test-uuid-0000');
    });

    it('aiClient.js mock: callAIModel is a vi.fn and AIAPIError is constructable', () => {
      expect(vi.isMockFunction(aiClientModule.callAIModel)).toBe(true);
      const err = new aiClientModule.AIAPIError('test', 'auth', 401);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AIAPIError');
      expect(err.category).toBe('auth');
      expect(err.statusCode).toBe(401);
    });

    it('toolExecutor.js mock: executeToolLoop and getToolRiskLevel are vi.fn', () => {
      expect(vi.isMockFunction(toolExecutorModule.executeToolLoop)).toBe(true);
      expect(vi.isMockFunction(toolExecutorModule.getToolRiskLevel)).toBe(true);
    });

    it('executionStrategy.js mock: ExecutionStrategyFactory has create and getDefaultMode', () => {
      expect(vi.isMockFunction(executionStrategyModule.ExecutionStrategyFactory.create)).toBe(true);
      expect(vi.isMockFunction(executionStrategyModule.ExecutionStrategyFactory.getDefaultMode)).toBe(true);
      expect(executionStrategyModule.ExecutionMode).toBeDefined();
    });

    it('soulLoader.js mock: buildSoulSystemMessage returns empty string', () => {
      expect(vi.isMockFunction(soulLoaderModule.buildSoulSystemMessage)).toBe(true);
      expect(soulLoaderModule.buildSoulSystemMessage()).toBe('');
    });

    it('contextTruncate.js mock: all three functions are vi.fn', () => {
      expect(vi.isMockFunction(contextTruncateModule.sanitizeToolMessages)).toBe(true);
      expect(vi.isMockFunction(contextTruncateModule.estimateMessagesTokens)).toBe(true);
      expect(vi.isMockFunction(contextTruncateModule.truncateContextForModel)).toBe(true);
    });

    it('contextCompress.js mock: compressContextWithSummary is vi.fn', () => {
      expect(vi.isMockFunction(contextCompressModule.compressContextWithSummary)).toBe(true);
    });

    it('modelsStore.js mock: loadModelsConfig and isLocalModel are vi.fn', () => {
      expect(vi.isMockFunction(modelsStoreModule.loadModelsConfig)).toBe(true);
      expect(vi.isMockFunction(modelsStoreModule.isLocalModel)).toBe(true);
    });

    it('keyRotator.js mock: selectKey and reportKeyResult are vi.fn', () => {
      expect(vi.isMockFunction(keyRotatorModule.selectKey)).toBe(true);
      expect(vi.isMockFunction(keyRotatorModule.reportKeyResult)).toBe(true);
    });

    it('dao/chat.js mock: all four functions are vi.fn', () => {
      expect(vi.isMockFunction(daoChatModule.getSessions)).toBe(true);
      expect(vi.isMockFunction(daoChatModule.createSession)).toBe(true);
      expect(vi.isMockFunction(daoChatModule.getSessionMessages)).toBe(true);
      expect(vi.isMockFunction(daoChatModule.addMessage)).toBe(true);
    });

    it('pluginAutoInvoke.js mock: matchTriggers and executePluginTrigger are vi.fn', () => {
      expect(vi.isMockFunction(pluginAutoInvokeModule.matchTriggers)).toBe(true);
      expect(vi.isMockFunction(pluginAutoInvokeModule.executePluginTrigger)).toBe(true);
    });

    it('messageQueue.js mock: all required methods exist and are vi.fn', () => {
      const mq = messageQueueModule.messageQueue;
      const methods = ['enqueue', 'on', 'off', 'getCurrentAbortController', 'getSessionState', 'getQueueLength', 'getCurrentAssistantId', 'markCompleted'];
      for (const method of methods) {
        expect(vi.isMockFunction((mq as any)[method])).toBe(true);
      }
    });

    it('vecMemoryStore.js mock: searchMemory is vi.fn', () => {
      expect(vi.isMockFunction(vecMemoryStoreModule.searchMemory)).toBe(true);
    });

    it('logger.js mock: all four log levels are vi.fn', () => {
      expect(vi.isMockFunction(loggerModule.logger.info)).toBe(true);
      expect(vi.isMockFunction(loggerModule.logger.warn)).toBe(true);
      expect(vi.isMockFunction(loggerModule.logger.error)).toBe(true);
      expect(vi.isMockFunction(loggerModule.logger.debug)).toBe(true);
    });

    it('modelSelector.js mock: all exports are vi.fn or empty object', () => {
      expect(vi.isMockFunction(modelSelectorModule.autoSelectModel)).toBe(true);
      expect(vi.isMockFunction(modelSelectorModule.generateMockResponse)).toBe(true);
      expect(vi.isMockFunction(modelSelectorModule.isModelAvailable)).toBe(true);
      expect(modelSelectorModule.MODEL_PRESETS).toEqual({});
    });

    it('memoryExtractor.js mock: extractAndAppendMemory is vi.fn, readMemoryMd resolves to empty string', () => {
      expect(vi.isMockFunction(memoryExtractorModule.extractAndAppendMemory)).toBe(true);
      expect(vi.isMockFunction(memoryExtractorModule.readMemoryMd)).toBe(true);
    });

    it('toolPermissionService.js mock: all exports are properly mocked', () => {
      expect(vi.isMockFunction(toolPermissionServiceModule.permissionEmitter.on)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.permissionEmitter.off)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.permissionEmitter.emit)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.permissionEmitter.once)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.permissionEmitter.removeListener)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.isSystemAuthorized)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.initSessionApprovedTools)).toBe(true);
      expect(vi.isMockFunction(toolPermissionServiceModule.registerPermissionRequest)).toBe(true);
    });

    it('dao/settings.js mock: getAppSettings is vi.fn', () => {
      expect(vi.isMockFunction(daoSettingsModule.getAppSettings)).toBe(true);
    });

    it('fileExtractor.js mock: extractFileContent is vi.fn', () => {
      expect(vi.isMockFunction(fileExtractorModule.extractFileContent)).toBe(true);
    });

    it('thinkingCache.js mock: all three functions are vi.fn', () => {
      expect(vi.isMockFunction(thinkingCacheModule.getThinkingCacheKey)).toBe(true);
      expect(vi.isMockFunction(thinkingCacheModule.getThinkingCache)).toBe(true);
      expect(vi.isMockFunction(thinkingCacheModule.setThinkingCache)).toBe(true);
    });

    it('sseHelper.js mock: activeSSEConnections is a Map', () => {
      expect(sseHelperModule.activeSSEConnections).toBeInstanceOf(Map);
    });
  });

  });
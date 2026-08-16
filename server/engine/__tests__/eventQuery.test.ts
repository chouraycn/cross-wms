// eventQuery unit tests cover the turn/step timeline fold (P1a):
// turn grouping, step pairing by callId, orphan completion handling,
// compaction and channel-delivery attachment to turns.
import { describe, expect, it } from 'vitest';
import { foldStepTimeline, type LedgerEventLike } from '../eventQuery.js';

function ev(seq: number, type: string, payload: Record<string, unknown>, runId?: string): LedgerEventLike {
  return { seq, type, payload, timestamp: 1_700_000_000_000 + seq * 1000, runId };
}

describe('engine/eventQuery — foldStepTimeline', () => {
  it('groups turns and pairs tool calls into steps by callId', () => {
    const events = [
      ev(1, 'turn.started', { model: 'gpt-4o', executionMode: 'REACT', systemPromptVersion: 'chat.v1', toolSchemaCount: 30 }, 'run-1'),
      ev(2, 'message.created', { role: 'user', content: '查库存' }),
      ev(3, 'tool.call.started', { toolName: 'wms_inventory_check', toolCallId: 'call_1', toolArgs: '{"zone":"A"}' }),
      ev(4, 'tool.call.completed', { toolName: 'wms_inventory_check', toolCallId: 'call_1', result: '{"items":10}', duration: 200 }),
      ev(5, 'tool.call.started', { toolName: 'wms_outbound_create', toolCallId: 'call_2', toolArgs: '{}' }),
      ev(6, 'tool.call.failed', { toolName: 'wms_outbound_create', toolCallId: 'call_2', error: '库存不足' }),
      ev(7, 'message.created', { role: 'assistant', content: '库存 10 件，建单失败' }),
      ev(8, 'turn.completed', { toolCallsCount: 2, usage: { totalTokens: 512 } }),
    ];
    const turns = foldStepTimeline(events);
    expect(turns.length).toBe(1);
    const t = turns[0];
    expect(t.model).toBe('gpt-4o');
    expect(t.systemPromptVersion).toBe('chat.v1');
    expect(t.userMessage).toBe('查库存');
    expect(t.assistantContent).toBe('库存 10 件，建单失败');
    expect(t.status).toBe('completed');
    expect(t.steps.length).toBe(2);
    expect(t.steps[0]).toMatchObject({ stepIndex: 1, toolName: 'wms_inventory_check', status: 'success', durationMs: 200 });
    expect(t.steps[1]).toMatchObject({ stepIndex: 2, toolName: 'wms_outbound_create', status: 'failed', error: '库存不足' });
    expect(t.usage?.totalTokens).toBe(512);
  });

  it('handles orphan completion events (started missing) as standalone steps', () => {
    const turns = foldStepTimeline([
      ev(1, 'turn.started', {}),
      ev(2, 'tool.call.completed', { toolName: 'orphan_tool', toolCallId: 'x1', result: 'ok', duration: 5 }),
    ]);
    expect(turns[0].steps).toHaveLength(1);
    expect(turns[0].steps[0]).toMatchObject({ stepIndex: 1, toolName: 'orphan_tool', status: 'success' });
  });

  it('attaches compaction and channel delivery to the current turn', () => {
    const turns = foldStepTimeline([
      ev(1, 'turn.started', {}),
      ev(2, 'context.compacted', { summary: '前 6 轮摘要', reason: 'token_overflow', tokensBefore: 128000, tokensAfter: 24000 }),
      ev(3, 'channel.delivered', { deliveryId: 'd1', channel: 'wecom', status: 'delivered', externalId: 'ext-1' }),
      ev(4, 'turn.completed', {}),
    ]);
    expect(turns[0].compactions).toHaveLength(1);
    expect(turns[0].compactions[0]).toMatchObject({ reason: 'token_overflow', tokensBefore: 128000 });
    expect(turns[0].deliveries).toHaveLength(1);
    expect(turns[0].deliveries[0]).toMatchObject({ channel: 'wecom', status: 'delivered', externalId: 'ext-1' });
  });

  it('separates multiple turns by turn.started', () => {
    const turns = foldStepTimeline([
      ev(1, 'turn.started', { model: 'a' }),
      ev(2, 'turn.completed', {}),
      ev(3, 'turn.started', { model: 'b' }),
      ev(4, 'tool.call.started', { toolName: 't', toolCallId: 'c1' }),
      ev(5, 'tool.call.completed', { toolName: 't', toolCallId: 'c1', result: 'r' }),
    ]);
    expect(turns.length).toBe(2);
    expect(turns[0].model).toBe('a');
    expect(turns[0].steps).toHaveLength(0);
    expect(turns[1].model).toBe('b');
    expect(turns[1].steps).toHaveLength(1);
  });

  it('ignores events before any turn.started', () => {
    const turns = foldStepTimeline([
      ev(1, 'message.created', { role: 'user', content: 'early' }),
      ev(2, 'turn.started', {}),
    ]);
    expect(turns.length).toBe(1);
    expect(turns[0].userMessage).toBeUndefined();
  });
});

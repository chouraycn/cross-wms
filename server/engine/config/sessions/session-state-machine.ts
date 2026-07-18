import { logger } from '../../../logger.js';
import type { SessionStatus } from './types.js';

type State = SessionStatus;

interface Transition {
  from: State | State[];
  to: State;
  guard?: (context: StateMachineContext) => boolean;
  action?: (context: StateMachineContext) => void;
}

interface StateMachineContext {
  sessionId: string;
  currentStatus: SessionStatus;
  metadata: Record<string, unknown>;
}

const TRANSITIONS: Transition[] = [
  {
    from: 'active',
    to: 'archived',
    guard: (ctx) => {
      const lastActive = ctx.metadata.lastActiveAt as string;
      if (!lastActive) return false;
      const age = Date.now() - new Date(lastActive).getTime();
      return age > 24 * 60 * 60 * 1000;
    },
    action: (ctx) => {
      logger.info(`[StateMachine] 会话归档: ${ctx.sessionId}`);
    },
  },
  {
    from: 'active',
    to: 'daily_reset',
    action: (ctx) => {
      logger.info(`[StateMachine] 会话每日重置: ${ctx.sessionId}`);
    },
  },
  {
    from: 'active',
    to: 'deleted',
    action: (ctx) => {
      logger.info(`[StateMachine] 会话标记删除: ${ctx.sessionId}`);
    },
  },
  {
    from: 'archived',
    to: 'active',
    action: (ctx) => {
      logger.info(`[StateMachine] 会话恢复: ${ctx.sessionId}`);
    },
  },
  {
    from: 'archived',
    to: 'deleted',
    action: (ctx) => {
      logger.info(`[StateMachine] 归档会话删除: ${ctx.sessionId}`);
    },
  },
  {
    from: 'daily_reset',
    to: 'archived',
    action: (ctx) => {
      logger.info(`[StateMachine] 重置会话归档: ${ctx.sessionId}`);
    },
  },
  {
    from: 'daily_reset',
    to: 'deleted',
    action: (ctx) => {
      logger.info(`[StateMachine] 重置会话删除: ${ctx.sessionId}`);
    },
  },
  {
    from: ['archived', 'daily_reset'],
    to: 'active',
    action: (ctx) => {
      logger.info(`[StateMachine] 会话从 ${ctx.currentStatus} 恢复到 active: ${ctx.sessionId}`);
    },
  },
];

export class SessionStateMachine {
  private currentState: State;
  private context: StateMachineContext;

  constructor(sessionId: string, initialStatus: SessionStatus) {
    this.currentState = initialStatus;
    this.context = {
      sessionId,
      currentStatus: initialStatus,
      metadata: {},
    };
  }

  transition(to: State): boolean {
    const transition = this.findTransition(this.currentState, to);

    if (!transition) {
      logger.warn(`[StateMachine] 不允许的状态转换: ${this.currentState} -> ${to}`);
      return false;
    }

    if (transition.guard && !transition.guard(this.context)) {
      logger.warn(`[StateMachine] 状态转换条件不满足: ${this.currentState} -> ${to}`);
      return false;
    }

    if (transition.action) {
      try {
        transition.action(this.context);
      } catch (err) {
        logger.error(`[StateMachine] 状态转换动作失败: ${err}`);
        return false;
      }
    }

    this.currentState = to;
    this.context.currentStatus = to;

    logger.debug(`[StateMachine] 状态转换成功: ${this.context.currentStatus} -> ${to}`);
    return true;
  }

  getCurrentState(): State {
    return this.currentState;
  }

  canTransition(to: State): boolean {
    const transition = this.findTransition(this.currentState, to);
    if (!transition) return false;
    if (transition.guard && !transition.guard(this.context)) return false;
    return true;
  }

  getPossibleTransitions(): State[] {
    const possible: State[] = [];

    for (const transition of TRANSITIONS) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
      if (fromStates.includes(this.currentState)) {
        if (!transition.guard || transition.guard(this.context)) {
          possible.push(transition.to);
        }
      }
    }

    return [...new Set(possible)];
  }

  updateContext(metadata: Record<string, unknown>): void {
    this.context.metadata = { ...this.context.metadata, ...metadata };
  }

  getContext(): StateMachineContext {
    return { ...this.context };
  }

  reset(): void {
    this.currentState = 'active';
    this.context.currentStatus = 'active';
    this.context.metadata = {};
  }

  private findTransition(from: State, to: State): Transition | undefined {
    return TRANSITIONS.find(t => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      return fromStates.includes(from) && t.to === to;
    });
  }
}

export function isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS.some(t => {
    const fromStates = Array.isArray(t.from) ? t.from : [t.from];
    return fromStates.includes(from) && t.to === to;
  });
}

export function getValidTransitions(from: SessionStatus): SessionStatus[] {
  const transitions = TRANSITIONS.filter(t => {
    const fromStates = Array.isArray(t.from) ? t.from : [t.from];
    return fromStates.includes(from);
  });
  return [...new Set(transitions.map(t => t.to))];
}
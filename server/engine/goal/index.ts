export { goalStore } from '../goalStore.js';
export type { Goal, GoalState, GoalEntry } from '../goalTypes.js';
export { goalTools } from '../goalTools.js';

export { GoalTracker, default as goalTracker } from './goalTracker.js';
export type {
  GoalProgressUpdate,
  GoalMilestone,
  GoalEventType,
  GoalEvent,
  GoalTrackerConfig,
} from './goalTracker.js';

export const goal = {
  store: goalStore,
  tracker: goalTracker,
  tools: goalTools,
};
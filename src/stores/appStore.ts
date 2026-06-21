/**
 * appStore.ts
 * 统一状态管理层 — 基于现有事件总线模式的组合 Store
 *
 * 将 skillStore、chainStore、pluginStore、warehouseCapabilityStore
 * 统一为单一入口，消除自定义事件总线模式，提供 React Hook 接口。
 *
 * 设计原则：
 * - 每个 domain 一个 slice（skills、chains、plugins、warehouse）
 * - 使用 React useState + useEffect 封装为 Hook（不依赖 zustand）
 * - 读操作：同步读内存缓存
 * - 写操作：调 API → 成功后更新缓存 → 触发 React 重渲染
 * - 向后兼容：保留原有 store 的 API，新增 useAppStore Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Skill, SkillAudit, SkillChain, UsageStats } from '../types/skill';
import type { PluginInfo, PluginHealth } from '../services/plugins/api';
import type { Warehouse, TransitOrder, InventoryItem } from '../types';
import * as skillApi from '../services/api';
import * as pluginApi from '../services/plugins/api';

// ===================== Skills Slice =====================

interface SkillsState {
  userSkills: Skill[];
  builtinStatusPatches: Record<string, string>;
  usageStatsCache: Map<string, UsageStats>;
  auditStatusCache: Map<string, SkillAudit>;
  skillsLoading: boolean;
  skillsError: string | null;
}

const initialSkillsState: SkillsState = {
  userSkills: [],
  builtinStatusPatches: {},
  usageStatsCache: new Map(),
  auditStatusCache: new Map(),
  skillsLoading: false,
  skillsError: null,
};

// ===================== Chains Slice =====================

interface ChainsState {
  chains: SkillChain[];
  chainsLoading: boolean;
  chainsError: string | null;
}

const initialChainsState: ChainsState = {
  chains: [],
  chainsLoading: false,
  chainsError: null,
};

// ===================== Plugins Slice =====================

interface PluginsState {
  plugins: PluginInfo[];
  pluginHealth: PluginHealth | null;
  pluginsLoading: boolean;
  pluginsError: string | null;
}

const initialPluginsState: PluginsState = {
  plugins: [],
  pluginHealth: null,
  pluginsLoading: false,
  pluginsError: null,
};

// ===================== Warehouse Slice =====================

interface WarehouseState {
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];
  warehouseLoading: boolean;
  warehouseError: string | null;
}

const initialWarehouseState: WarehouseState = {
  warehouses: [],
  transitOrders: [],
  inventory: [],
  warehouseLoading: false,
  warehouseError: null,
};

// ===================== Unified Store State =====================

export interface AppStoreState
  extends SkillsState,
    ChainsState,
    PluginsState,
    WarehouseState {}

const initialState: AppStoreState = {
  ...initialSkillsState,
  ...initialChainsState,
  ...initialPluginsState,
  ...initialWarehouseState,
};

// ===================== Store Instance (Singleton) =====================

let storeState: AppStoreState = { ...initialState };
const listeners = new Set<(state: AppStoreState) => void>();

function setStore(partial: Partial<AppStoreState>): void {
  storeState = { ...storeState, ...partial };
  listeners.forEach((fn) => {
    try { fn(storeState); } catch { /* ignore */ }
  });
}

function getStore(): AppStoreState {
  return storeState;
}

function subscribeStore(fn: (state: AppStoreState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ===================== Actions =====================

// ---- Skills Actions ----

async function initSkillsFromApi(): Promise<void> {
  try {
    const [skills, patches] = await Promise.all([
      skillApi.getUserSkills(),
      skillApi.getBuiltinPatches(),
    ]);
    setStore({ userSkills: skills, builtinStatusPatches: patches });
    await loadAllUsageStats();
  } catch (e) {
    setStore({ skillsError: e instanceof Error ? e.message : 'init failed' });
  }
}

async function refreshSkillsFromRemote(): Promise<void> {
  try {
    const [skills, patches] = await Promise.all([
      skillApi.getUserSkills(),
      skillApi.getBuiltinPatches(),
    ]);
    setStore({ userSkills: skills, builtinStatusPatches: patches });
    await loadAllUsageStats();
  } catch (e) {
    setStore({ skillsError: e instanceof Error ? e.message : 'refresh failed' });
  }
}

async function addSkill(skill: Omit<Skill, 'id' | 'source' | 'installedAt'>): Promise<Skill> {
  const newSkill: Skill = {
    ...skill,
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'user',
    installedAt: Date.now(),
  };
  const created = await skillApi.createUserSkill(newSkill);
  setStore({ userSkills: [...getStore().userSkills, created] });
  return created;
}

async function updateSkill(id: string, updates: Partial<Omit<Skill, 'id' | 'source'>>): Promise<boolean> {
  const idx = getStore().userSkills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  const updated = await skillApi.updateUserSkill(id, updates);
  const userSkills = [...getStore().userSkills];
  userSkills[idx] = updated;
  setStore({ userSkills });
  return true;
}

async function setSkillStatus(id: string, status: Skill['status']): Promise<boolean> {
  const uIdx = getStore().userSkills.findIndex((s) => s.id === id);
  if (uIdx !== -1) {
    const updated = await skillApi.updateUserSkill(id, { status });
    const userSkills = [...getStore().userSkills];
    userSkills[uIdx] = updated;
    setStore({ userSkills });
    return true;
  }
  await skillApi.setBuiltinPatch(id, status);
  setStore({ builtinStatusPatches: { ...getStore().builtinStatusPatches, [id]: status } });
  return true;
}

async function removeSkill(id: string): Promise<boolean> {
  const skill = getStore().userSkills.find((s) => s.id === id);
  if (!skill || skill.source === 'builtin') return false;
  await skillApi.deleteUserSkill(id);
  setStore({ userSkills: getStore().userSkills.filter((s) => s.id !== id) });
  return true;
}

async function loadAllUsageStats(): Promise<void> {
  try {
    const statsMap = await skillApi.fetchSkillUsageStats();
    const cache = new Map<string, UsageStats>();
    for (const [skillId, stats] of Object.entries(statsMap)) {
      cache.set(skillId, stats as UsageStats);
    }
    setStore({ usageStatsCache: cache });
  } catch { /* ignore */ }
}

async function loadAuditStatuses(): Promise<void> {
  const { BUILTIN_SKILLS } = await import('../types/skill');
  const skills = getStore().userSkills;
  const cache = new Map(getStore().auditStatusCache);
  for (const skill of [...BUILTIN_SKILLS, ...skills]) {
    try {
      if (skill.source === 'builtin') {
        if (!cache.has(skill.id)) {
          cache.set(skill.id, {
            id: `builtin-audit-${skill.id}`,
            skillId: skill.id,
            skillVersion: skill.version || '1.0',
            score: 100,
            level: 'safe',
            reportJson: JSON.stringify({ summary: { level: 'safe', score: 100, skillName: skill.name }, findings: [] }),
            reportMarkdown: `# 安全审计报告\n\n## 执行摘要\n- **审计对象**: ${skill.name}\n- **审计结果**: 安全\n- **评分**: 100/100\n\n该技能为系统内置，已通过安全审查。`,
            triggeredBy: 'import',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        const audit = await skillApi.fetchSkillAudit(skill.id);
        if (audit) cache.set(skill.id, audit);
      }
    } catch { /* ignore single skill */ }
  }
  setStore({ auditStatusCache: cache });
}

async function refreshAuditForSkill(skillId: string): Promise<void> {
  const audit = await skillApi.triggerSkillAudit(skillId, '', true);
  const cache = new Map(getStore().auditStatusCache);
  cache.set(skillId, audit);
  setStore({ auditStatusCache: cache });
}

function setAuditStatus(skillId: string, audit: SkillAudit): void {
  const cache = new Map(getStore().auditStatusCache);
  cache.set(skillId, audit);
  setStore({ auditStatusCache: cache });
}

// ---- Chains Actions ----

async function loadChains(): Promise<void> {
  try {
    const chains = await skillApi.fetchSkillChains();
    setStore({ chains });
  } catch (e) {
    setStore({ chainsError: e instanceof Error ? e.message : 'load failed' });
  }
}

async function createChain(data: Omit<SkillChain, 'id' | 'createdAt' | 'updatedAt'>): Promise<SkillChain> {
  const chain = await skillApi.createSkillChain(data);
  setStore({ chains: [...getStore().chains, chain] });
  return chain;
}

async function updateChain(id: string, data: Partial<SkillChain>): Promise<void> {
  const updated = await skillApi.updateSkillChain(id, data);
  setStore({
    chains: getStore().chains.map((c) => (c.id === id ? updated : c)),
  });
}

async function deleteChain(id: string): Promise<void> {
  await skillApi.deleteSkillChain(id);
  setStore({ chains: getStore().chains.filter((c) => c.id !== id) });
}

async function duplicateChain(id: string): Promise<SkillChain> {
  const dup = await skillApi.duplicateSkillChain(id);
  setStore({ chains: [...getStore().chains, dup] });
  return dup;
}

// ---- Plugins Actions ----

async function refreshPlugins(): Promise<void> {
  try {
    const [result, health] = await Promise.all([
      pluginApi.fetchPlugins(),
      pluginApi.fetchPluginHealth().catch(() => null),
    ]);
    setStore({ plugins: result.plugins, pluginHealth: health });
  } catch (e) {
    setStore({ pluginsError: e instanceof Error ? e.message : 'refresh failed' });
  }
}

async function installPlugin(file: File): Promise<void> {
  await pluginApi.installPlugin(file);
  await refreshPlugins();
}

async function uninstallPlugin(id: string): Promise<void> {
  await pluginApi.uninstallPlugin(id);
  setStore({ plugins: getStore().plugins.filter((p) => p.id !== id) });
}

async function enablePlugin(id: string): Promise<void> {
  await pluginApi.enablePlugin(id);
  setStore({
    plugins: getStore().plugins.map((p) => (p.id === id ? { ...p, status: 'enabled' as const } : p)),
  });
}

async function disablePlugin(id: string): Promise<void> {
  await pluginApi.disablePlugin(id);
  setStore({
    plugins: getStore().plugins.map((p) => (p.id === id ? { ...p, status: 'disabled' as const } : p)),
  });
}

// ---- Warehouse Actions ----

async function initWarehouseFromApi(): Promise<void> {
  try {
    const [warehouses, transitOrders, inventory] = await Promise.all([
      skillApi.getWarehouses(),
      skillApi.getTransitOrders(),
      skillApi.getInventoryItems(),
    ]);
    setStore({ warehouses, transitOrders, inventory });
  } catch (e) {
    setStore({ warehouseError: e instanceof Error ? e.message : 'init failed' });
  }
}

async function addWarehouse(w: Warehouse): Promise<void> {
  const created = await skillApi.createWarehouse(w);
  setStore({ warehouses: [...getStore().warehouses, created] });
}

async function updateWarehouse(w: Warehouse): Promise<void> {
  const saved = await skillApi.updateWarehouse(w.id, w);
  setStore({
    warehouses: getStore().warehouses.map((wh) => (wh.id === w.id ? saved : wh)),
  });
}

async function removeWarehouse(id: string): Promise<void> {
  await skillApi.deleteWarehouse(id);
  setStore({ warehouses: getStore().warehouses.filter((w) => w.id !== id) });
}

async function addTransitOrder(o: TransitOrder): Promise<void> {
  const created = await skillApi.createTransitOrder(o);
  setStore({ transitOrders: [...getStore().transitOrders, created] });
}

async function updateTransitOrder(o: TransitOrder): Promise<void> {
  const saved = await skillApi.updateTransitOrder(o.id, o);
  setStore({
    transitOrders: getStore().transitOrders.map((to) => (to.id === o.id ? saved : to)),
  });
}

async function removeTransitOrder(id: string): Promise<void> {
  await skillApi.deleteTransitOrder(id);
  setStore({ transitOrders: getStore().transitOrders.filter((o) => o.id !== id) });
}

async function addInventoryItem(item: InventoryItem): Promise<void> {
  const created = await skillApi.createInventoryItem(item);
  setStore({ inventory: [...getStore().inventory, created] });
}

async function updateInventoryItem(item: InventoryItem): Promise<void> {
  const saved = await skillApi.updateInventoryItem(item.id, item);
  setStore({
    inventory: getStore().inventory.map((i) => (i.id === item.id ? saved : i)),
  });
}

async function removeInventoryItem(id: string): Promise<void> {
  await skillApi.deleteInventoryItem(id);
  setStore({ inventory: getStore().inventory.filter((i) => i.id !== id) });
}

// ===================== React Hook =====================

export interface AppStoreActions {
  // Skills
  initSkillsFromApi: () => Promise<void>;
  refreshSkillsFromRemote: () => Promise<void>;
  addSkill: (skill: Omit<Skill, 'id' | 'source' | 'installedAt'>) => Promise<Skill>;
  updateSkill: (id: string, updates: Partial<Omit<Skill, 'id' | 'source'>>) => Promise<boolean>;
  setSkillStatus: (id: string, status: Skill['status']) => Promise<boolean>;
  removeSkill: (id: string) => Promise<boolean>;
  loadAllUsageStats: () => Promise<void>;
  loadAuditStatuses: () => Promise<void>;
  refreshAuditForSkill: (skillId: string) => Promise<void>;
  setAuditStatus: (skillId: string, audit: SkillAudit) => void;
  // Chains
  loadChains: () => Promise<void>;
  createChain: (data: Omit<SkillChain, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SkillChain>;
  updateChain: (id: string, data: Partial<SkillChain>) => Promise<void>;
  deleteChain: (id: string) => Promise<void>;
  duplicateChain: (id: string) => Promise<SkillChain>;
  // Plugins
  refreshPlugins: () => Promise<void>;
  installPlugin: (file: File) => Promise<void>;
  uninstallPlugin: (id: string) => Promise<void>;
  enablePlugin: (id: string) => Promise<void>;
  disablePlugin: (id: string) => Promise<void>;
  // Warehouse
  initWarehouseFromApi: () => Promise<void>;
  addWarehouse: (w: Warehouse) => Promise<void>;
  updateWarehouse: (w: Warehouse) => Promise<void>;
  removeWarehouse: (id: string) => Promise<void>;
  addTransitOrder: (o: TransitOrder) => Promise<void>;
  updateTransitOrder: (o: TransitOrder) => Promise<void>;
  removeTransitOrder: (id: string) => Promise<void>;
  addInventoryItem: (item: InventoryItem) => Promise<void>;
  updateInventoryItem: (item: InventoryItem) => Promise<void>;
  removeInventoryItem: (id: string) => Promise<void>;
}

const actions: AppStoreActions = {
  initSkillsFromApi,
  refreshSkillsFromRemote,
  addSkill,
  updateSkill,
  setSkillStatus,
  removeSkill,
  loadAllUsageStats,
  loadAuditStatuses,
  refreshAuditForSkill,
  setAuditStatus,
  loadChains,
  createChain,
  updateChain,
  deleteChain,
  duplicateChain,
  refreshPlugins,
  installPlugin,
  uninstallPlugin,
  enablePlugin,
  disablePlugin,
  initWarehouseFromApi,
  addWarehouse,
  updateWarehouse,
  removeWarehouse,
  addTransitOrder,
  updateTransitOrder,
  removeTransitOrder,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
};

/** 统一状态管理 Hook — 订阅全量 state 变更 */
export function useAppStore(): AppStoreState & AppStoreActions {
  const [state, setState] = useState<AppStoreState>(getStore);

  useEffect(() => {
    return subscribeStore(setState);
  }, []);

  return { ...state, ...actions };
}

/** 按需订阅 — 只订阅指定 selector 的变更（性能优化） */
export function useAppStoreSelector<T>(selector: (state: AppStoreState) => T): T {
  const [value, setValue] = useState<T>(() => selector(getStore()));
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    return subscribeStore((state) => {
      setValue(selectorRef.current(state));
    });
  }, []);

  return value;
}

// ===================== Selectors (性能优化) =====================

/** 获取所有技能（内置 + 用户，应用状态覆盖） */
export function selectAllSkills(state: AppStoreState): Skill[] {
  // 动态导入避免循环依赖
  const { BUILTIN_SKILLS } = require('../types/skill');
  const patchedBuiltins = BUILTIN_SKILLS.map((s: Skill) => {
    const patch = state.builtinStatusPatches[s.id];
    return patch ? { ...s, status: patch as Skill['status'] } : s;
  });
  return [...patchedBuiltins, ...state.userSkills];
}

/** 根据 ID 获取技能 */
export function selectSkillById(state: AppStoreState, id: string): Skill | undefined {
  return selectAllSkills(state).find((s) => s.id === id);
}

/** 按触发词匹配技能 */
export function selectSkillsByTrigger(state: AppStoreState, query: string): Skill[] {
  const q = query.toLowerCase().trim();
  if (!q) return selectAllSkills(state).filter((s) => s.status === 'active');
  return selectAllSkills(state).filter(
    (s) =>
      s.status === 'active' &&
      (s.name.toLowerCase().includes(q) ||
        (s.trigger || '').toLowerCase().includes(q) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        s.id.replace('builtin-', '').includes(q))
  );
}

/** 获取已启用插件 */
export function selectEnabledPlugins(state: AppStoreState): PluginInfo[] {
  return state.plugins.filter((p) => p.status === 'enabled');
}

/** 获取仓库完整视图 */
export function selectWarehouseFullView(
  state: AppStoreState,
  id: string
): { warehouse: Warehouse | undefined; transit: TransitOrder[]; inventory: InventoryItem[] } {
  return {
    warehouse: state.warehouses.find((w) => w.id === id),
    transit: state.transitOrders.filter((t) => t.fromWarehouseId === id || t.toWarehouseId === id),
    inventory: state.inventory.filter((i) => i.warehouseId === id),
  };
}

// ===================== Backward-compatible exports =====================

// 导出原有 store 的 API，让现有代码无需修改即可工作
export {
  getStore,
  subscribeStore,
  setStore,
  // Skills
  initSkillsFromApi,
  refreshSkillsFromRemote,
  addSkill,
  updateSkill,
  setSkillStatus,
  removeSkill,
  loadAllUsageStats,
  loadAuditStatuses,
  refreshAuditForSkill,
  setAuditStatus,
  // Chains
  loadChains,
  createChain,
  updateChain,
  deleteChain,
  duplicateChain,
  // Plugins
  refreshPlugins,
  installPlugin,
  uninstallPlugin,
  enablePlugin,
  disablePlugin,
  // Warehouse
  initWarehouseFromApi,
  addWarehouse,
  updateWarehouse,
  removeWarehouse,
  addTransitOrder,
  updateTransitOrder,
  removeTransitOrder,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
};

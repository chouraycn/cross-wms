/**
 * ToolDependencyGraph — 工具依赖图 + 拓扑排序
 *
 * 构建工具调用之间的依赖关系 DAG，按拓扑层级并行执行。
 * 同层级无依赖工具可并行，跨层级串行执行。
 *
 * 依赖关系来源：
 * 1. 显式声明：工具 A 的输出是工具 B 的输入参数
 * 2. 隐式推断：同类型工具（如多个 wms_*）按参数名判断顺序
 * 3. 权限约束：confirm/high-risk 工具需串行执行
 *
 * v6.0: P2-4 并行工具执行优化
 */

// ===================== 类型定义 =====================

/** 工具调用节点 */
export interface ToolCallNode {
  /** 唯一标识（用 index） */
  id: string;
  /** 工具名 */
  toolName: string;
  /** 工具调用参数（JSON string） */
  arguments: string;
  /** 原始 ToolCall 引用索引 */
  index: number;
  /** 权限级别 */
  permission: 'allow' | 'confirm' | 'high-risk' | 'deny';
}

/** 拓扑层级 */
export interface TopologyLayer {
  /** 层级序号 (0-based) */
  layerIndex: number;
  /** 该层级的工具调用节点 */
  nodes: ToolCallNode[];
  /** 该层是否可并行执行 */
  parallelizable: boolean;
}

/** 依赖边 */
export interface DependencyEdge {
  /** 源节点 ID */
  from: string;
  /** 目标节点 ID */
  to: string;
  /** 依赖类型 */
  type: 'data' | 'ordering' | 'permission';
}

// ===================== 常量 =====================

/** 工具间的已知依赖关系（显式声明） */
const KNOWN_DEPENDENCIES: Record<string, string[]> = {
  // 先查询再操作
  'wms_outbound_create': ['wms_inventory', 'wms_outbound_list'],
  'wms_inbound_create': ['wms_inventory', 'wms_inbound_list'],
  'file_writeFile': ['file_readFile', 'file_listDir'],
  'shell_exec': ['system_info'],
};

/** 同族工具（相同前缀）的隐式排序 */
const TOOL_FAMILIES: Record<string, number> = {
  // WMS 族
  'wms_inventory': 1,
  'wms_outbound_list': 2,
  'wms_outbound_create': 3,
  'wms_inbound_list': 2,
  'wms_inbound_create': 3,
  // File 族
  'file_listDir': 1,
  'file_readFile': 2,
  'file_writeFile': 3,
  // Desktop 族
  'desktop_screenshot': 1,
  'desktop_see': 2,
  'desktop_click': 3,
  'desktop_type': 4,
};

// ===================== ToolDependencyGraph 类 =====================

export class ToolDependencyGraph {
  private nodes: Map<string, ToolCallNode>;
  private edges: DependencyEdge[];

  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  /**
   * 添加工具调用节点。
   */
  addNode(node: ToolCallNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * 自动推断依赖关系并添加边。
   * 基于已知依赖 + 同族排序 + 参数引用推断。
   */
  inferDependencies(): void {
    const nodeArray = Array.from(this.nodes.values());

    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        const nodeA = nodeArray[i];
        const nodeB = nodeArray[j];

        // 1. 已知依赖：B 依赖 A 的输出
        const deps = KNOWN_DEPENDENCIES[nodeB.toolName];
        if (deps && deps.includes(nodeA.toolName)) {
          this.edges.push({ from: nodeA.id, to: nodeB.id, type: 'data' });
          continue;
        }

        // 反向：A 依赖 B
        const depsA = KNOWN_DEPENDENCIES[nodeA.toolName];
        if (depsA && depsA.includes(nodeB.toolName)) {
          this.edges.push({ from: nodeB.id, to: nodeA.id, type: 'data' });
          continue;
        }

        // 2. 同族工具按排序确定顺序
        const familyA = TOOL_FAMILIES[nodeA.toolName];
        const familyB = TOOL_FAMILIES[nodeB.toolName];
        if (familyA !== undefined && familyB !== undefined) {
          // 检查是否同族（相同前缀）
          const prefixA = nodeA.toolName.split('_').slice(0, 2).join('_');
          const prefixB = nodeB.toolName.split('_').slice(0, 2).join('_');
          if (prefixA === prefixB) {
            if (familyA < familyB) {
              this.edges.push({ from: nodeA.id, to: nodeB.id, type: 'ordering' });
            } else if (familyB < familyA) {
              this.edges.push({ from: nodeB.id, to: nodeA.id, type: 'ordering' });
            }
          }
        }

        // 3. 权限约束：confirm/high-risk 工具与 allow 工具间加 ordering 边
        //    确保权限工具串行执行
        if ((nodeA.permission === 'confirm' || nodeA.permission === 'high-risk') &&
            (nodeB.permission === 'confirm' || nodeB.permission === 'high-risk')) {
          // 同为权限工具，按出现顺序串行
          this.edges.push({ from: nodeA.id, to: nodeB.id, type: 'permission' });
        }
      }
    }
  }

  /**
   * 拓扑排序，返回按层级分组的节点列表。
   * 检测循环依赖时降级为全串行。
   */
  topologicalSort(): TopologyLayer[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 初始化
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    // 构建邻接表 + 入度
    for (const edge of this.edges) {
      adjacency.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    // BFS 按层
    const layers: TopologyLayer[] = [];
    let queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId);
    }

    let processedCount = 0;
    let layerIndex = 0;

    while (queue.length > 0) {
      const currentLayerNodes = queue
        .map(id => this.nodes.get(id)!)
        .filter(Boolean);

      if (currentLayerNodes.length > 0) {
        // 判断该层是否可并行：所有节点都是 allow 权限且无互斥依赖
        const allAllow = currentLayerNodes.every(n => n.permission === 'allow');
        const hasPermissionEdges = currentLayerNodes.some(n =>
          this.edges.some(e => e.type === 'permission' && (e.from === n.id || e.to === n.id))
        );

        layers.push({
          layerIndex,
          nodes: currentLayerNodes,
          parallelizable: allAllow && !hasPermissionEdges,
        });
        layerIndex++;
      }

      const nextQueue: string[] = [];
      for (const nodeId of queue) {
        processedCount++;
        for (const neighbor of adjacency.get(nodeId) ?? []) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    // 循环依赖检测
    if (processedCount !== this.nodes.size) {
      console.warn('[ToolDependencyGraph] 检测到循环依赖，降级为全串行执行');
      // 降级：所有节点放一层，串行执行
      return [{
        layerIndex: 0,
        nodes: Array.from(this.nodes.values()),
        parallelizable: false,
      }];
    }

    return layers;
  }

  /**
   * 获取依赖边列表。
   */
  getEdges(): DependencyEdge[] {
    return [...this.edges];
  }

  /**
   * 重置图。
   */
  reset(): void {
    this.nodes.clear();
    this.edges = [];
  }
}

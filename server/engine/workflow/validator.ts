/**
 * 工作流验证器
 * 提供工作流定义的完整性和正确性检查
 */

import type { Workflow, WorkflowNode, ValidationResult, ValidationIssue } from './types.js';

/**
 * 工作流验证器类
 * 检查工作流的循环依赖、未连接节点、无效引用和配置完整性
 */
export class WorkflowValidator {
  /**
   * 验证工作流定义
   * @param workflow 工作流定义
   * @returns 验证结果
   */
  validate(workflow: Workflow): ValidationResult {
    const issues: ValidationIssue[] = [];

    this.validateBasicStructure(workflow, issues);
    this.validateTriggerNodes(workflow, issues);
    this.validateNodeConnections(workflow, issues);
    this.validateCircularDependencies(workflow, issues);
    this.validateUnconnectedNodes(workflow, issues);
    this.validateInvalidReferences(workflow, issues);
    this.validateConfiguration(workflow, issues);

    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');

    return {
      valid: errors.length === 0,
      issues,
      errors,
      warnings,
    };
  }

  /**
   * 验证基本结构
   */
  private validateBasicStructure(workflow: Workflow, issues: ValidationIssue[]): void {
    if (!workflow.id) {
      issues.push({ level: 'error', message: '工作流 ID 不能为空' });
    }
    if (!workflow.name || workflow.name.trim() === '') {
      issues.push({ level: 'error', message: '工作流名称不能为空' });
    }
    if (!workflow.nodes || workflow.nodes.length === 0) {
      issues.push({ level: 'error', message: '工作流至少需要一个节点' });
    }
  }

  /**
   * 验证触发器节点
   */
  private validateTriggerNodes(workflow: Workflow, issues: ValidationIssue[]): void {
    const triggerNodes = workflow.nodes.filter(n => n.type === 'trigger');

    if (triggerNodes.length === 0) {
      issues.push({ level: 'error', message: '工作流至少需要一个触发器节点' });
    }

    const triggerIds = new Set<string>();
    for (const node of triggerNodes) {
      if (triggerIds.has(node.id)) {
        issues.push({ level: 'error', message: `重复的节点 ID: ${node.id}`, nodeId: node.id });
      }
      triggerIds.add(node.id);

      if (!node.config || !node.config.type) {
        issues.push({ level: 'warning', message: `触发器节点缺少类型配置: ${node.name}`, nodeId: node.id });
      }
    }
  }

  /**
   * 验证节点连接
   */
  private validateNodeConnections(workflow: Workflow, issues: ValidationIssue[]): void {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    for (const node of workflow.nodes) {
      if (!node.connections) continue;

      for (const conn of node.connections) {
        if (conn.source !== node.id) {
          issues.push({
            level: 'warning',
            message: `节点 ${node.name} 的连接 source 与节点 ID 不匹配`,
            nodeId: node.id,
          });
        }

        if (!nodeIds.has(conn.target)) {
          issues.push({
            level: 'error',
            message: `节点 ${node.name} 的连接目标不存在: ${conn.target}`,
            nodeId: node.id,
            field: 'connections',
          });
        }

        const targetNode = workflow.nodes.find(n => n.id === conn.target);
        if (targetNode && targetNode.type === 'trigger') {
          issues.push({
            level: 'warning',
            message: `连接目标不能是触发器节点: ${targetNode.name}`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  /**
   * 验证循环依赖（使用 DFS 检测环）
   */
  private validateCircularDependencies(workflow: Workflow, issues: ValidationIssue[]): void {
    const adjacencyList = new Map<string, string[]>();
    for (const node of workflow.nodes) {
      const targets = (node.connections || [])
        .filter(c => c.source === node.id)
        .map(c => c.target);
      adjacencyList.set(node.id, targets);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycleNodes: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          cycleNodes.push(...path.slice(cycleStart), neighbor);
          return true;
        }
      }

      path.pop();
      recStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id, [])) break;
      }
    }

    if (cycleNodes.length > 0) {
      const cycleNames = cycleNodes
        .map(id => workflow.nodes.find(n => n.id === id)?.name || id)
        .join(' → ');

      issues.push({
        level: 'error',
        message: `检测到循环依赖: ${cycleNames}`,
        nodeId: cycleNodes[0],
      });
    }
  }

  /**
   * 验证未连接节点
   */
  private validateUnconnectedNodes(workflow: Workflow, issues: ValidationIssue[]): void {
    if (workflow.nodes.length <= 1) return;

    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const reachable = new Set<string>();

    const triggerNodes = workflow.nodes.filter(n => n.type === 'trigger');

    const bfs = (startId: string) => {
      const queue = [startId];
      reachable.add(startId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentNode = workflow.nodes.find(n => n.id === current);
        if (!currentNode) continue;

        const targets = (currentNode.connections || [])
          .filter(c => c.source === current)
          .map(c => c.target);

        for (const target of targets) {
          if (!reachable.has(target)) {
            reachable.add(target);
            queue.push(target);
          }
        }
      }
    };

    for (const trigger of triggerNodes) {
      bfs(trigger.id);
    }

    for (const nodeId of nodeIds) {
      if (!reachable.has(nodeId)) {
        const node = workflow.nodes.find(n => n.id === nodeId);
        if (node && node.type !== 'trigger') {
          issues.push({
            level: 'warning',
            message: `节点未连接到工作流: ${node.name}`,
            nodeId: nodeId,
          });
        }
      }
    }
  }

  /**
   * 验证无效引用
   */
  private validateInvalidReferences(workflow: Workflow, issues: ValidationIssue[]): void {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    for (const node of workflow.nodes) {
      const config = node.config as Record<string, unknown> || {};

      if (node.type === 'condition') {
        const condConfig = config as { branches?: { true?: string; false?: string } };
        if (condConfig.branches) {
          if (condConfig.branches.true && !nodeIds.has(condConfig.branches.true)) {
            issues.push({
              level: 'error',
              message: `条件节点 true 分支引用无效节点: ${condConfig.branches.true}`,
              nodeId: node.id,
            });
          }
          if (condConfig.branches.false && !nodeIds.has(condConfig.branches.false)) {
            issues.push({
              level: 'error',
              message: `条件节点 false 分支引用无效节点: ${condConfig.branches.false}`,
              nodeId: node.id,
            });
          }
        }
      }

      if (node.type === 'parallel') {
        const parConfig = config as { branches?: string[] };
        if (parConfig.branches) {
          for (const branchId of parConfig.branches) {
            if (!nodeIds.has(branchId)) {
              issues.push({
                level: 'error',
                message: `并行节点引用无效分支节点: ${branchId}`,
                nodeId: node.id,
              });
            }
          }
        }
      }

      if (node.type === 'loop') {
        const loopConfig = config as { bodyNodeId?: string };
        if (loopConfig.bodyNodeId && !nodeIds.has(loopConfig.bodyNodeId)) {
          issues.push({
            level: 'error',
            message: `循环节点引用无效循环体节点: ${loopConfig.bodyNodeId}`,
            nodeId: node.id,
          });
        }
      }

      if (node.type === 'switch') {
        const switchConfig = config as { cases?: Array<{ targetNodeId: string }>; defaultTargetNodeId?: string };
        if (switchConfig.cases) {
          for (const caseItem of switchConfig.cases) {
            if (caseItem.targetNodeId && !nodeIds.has(caseItem.targetNodeId)) {
              issues.push({
                level: 'error',
                message: `Switch 节点 case 分支引用无效节点: ${caseItem.targetNodeId}`,
                nodeId: node.id,
              });
            }
          }
        }
        if (switchConfig.defaultTargetNodeId && !nodeIds.has(switchConfig.defaultTargetNodeId)) {
          issues.push({
            level: 'warning',
            message: `Switch 节点默认分支引用无效节点: ${switchConfig.defaultTargetNodeId}`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  /**
   * 验证配置完整性
   */
  private validateConfiguration(workflow: Workflow, issues: ValidationIssue[]): void {
    for (const node of workflow.nodes) {
      const config = node.config as Record<string, unknown> || {};

      switch (node.type) {
        case 'delay':
          if (config.duration === undefined && !config.durationExpression) {
            issues.push({
              level: 'warning',
              message: `延迟节点缺少持续时间配置: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;

        case 'script':
          if (!config.code) {
            issues.push({
              level: 'error',
              message: `脚本节点缺少代码: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;

        case 'transform':
          const transformConfig = config as { mappings?: unknown[] };
          if (!transformConfig.mappings || transformConfig.mappings.length === 0) {
            issues.push({
              level: 'warning',
              message: `数据转换节点缺少映射配置: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;

        case 'switch':
          const switchConfig = config as { expression?: string; cases?: unknown[] };
          if (!switchConfig.expression) {
            issues.push({
              level: 'error',
              message: `Switch 节点缺少条件表达式: ${node.name}`,
              nodeId: node.id,
            });
          }
          if (!switchConfig.cases || switchConfig.cases.length === 0) {
            issues.push({
              level: 'warning',
              message: `Switch 节点缺少 case 分支: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;

        case 'subworkflow':
          const subConfig = config as { workflowId?: string };
          if (!subConfig.workflowId) {
            issues.push({
              level: 'error',
              message: `子工作流节点缺少工作流 ID: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;

        case 'merge':
          const mergeConfig = config as { mode?: string; inputCount?: number };
          if (mergeConfig.mode === 'all' && !mergeConfig.inputCount) {
            issues.push({
              level: 'warning',
              message: `合并节点 (all 模式) 建议配置 inputCount: ${node.name}`,
              nodeId: node.id,
            });
          }
          break;
      }
    }

    const requiredVarNames = new Set<string>();
    for (const node of workflow.nodes) {
      this.extractReferencedVariables(node, requiredVarNames);
    }

    const definedVarNames = new Set(workflow.variables.map(v => v.name));
    for (const varName of requiredVarNames) {
      if (!definedVarNames.has(varName) && !varName.includes('.')) {
        issues.push({
          level: 'info',
          message: `引用了未定义的变量: ${varName}（可能是运行时变量）`,
        });
      }
    }
  }

  /**
   * 提取节点中引用的变量
   */
  private extractReferencedVariables(node: WorkflowNode, variables: Set<string>): void {
    const configStr = JSON.stringify(node.config || {});
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(configStr)) !== null) {
      const expr = match[1].trim();
      const varMatch = expr.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (varMatch) {
        variables.add(varMatch[0]);
      }
    }
  }
}

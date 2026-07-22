import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Chip, Button, Paper,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useToast } from '../contexts/ToastContext';
import { fetchSkillDependencyGraph } from '../services/api';
import type { SkillDepNode, SkillDepEdge } from '../services/api';
import { getGrayScale } from '../constants/theme';
import { usePageFadeIn } from '../hooks/usePageFadeIn';
import { useTranslation } from 'react-i18next';

interface LayoutNode {
  id: string;
  name: string;
  status: 'active' | 'available' | 'unknown';
  x: number;
  y: number;
  level: number;
  deps: number;
  dependents: number;
}

interface LayoutEdge {
  source: string;
  target: string;
  type: 'required' | 'optional' | 'conflicts';
}

const NODE_WIDTH = 130;
const NODE_HEIGHT = 36;
const LEVEL_GAP = 80;
const SIBLING_GAP = 20;

function layoutGraph(nodes: SkillDepNode[], edges: SkillDepEdge[]): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (nodes.length === 0) {
    return { nodes: [], edges: edges.map((e) => ({ source: e.source, target: e.target, type: e.type })), width: 800, height: 400 };
  }

  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
    inEdges.set(n.id, []);
  }

  for (const e of edges) {
    if (e.type === 'conflicts') continue;
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue;
    outEdges.get(e.source)!.push(e.target);
    inEdges.get(e.target)!.push(e.source);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      level.set(id, 0);
      queue.push(id);
    }
  }

  if (queue.length === 0 && nodes.length > 0) {
    level.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = level.get(current) || 0;
    for (const next of outEdges.get(current) || []) {
      const newLevel = currentLevel + 1;
      if (!level.has(next) || (level.get(next) || 0) < newLevel) {
        level.set(next, newLevel);
        queue.push(next);
      }
    }
  }

  let maxLevel = 0;
  for (const l of level.values()) maxLevel = Math.max(maxLevel, l);
  for (const n of nodes) {
    if (!level.has(n.id)) {
      maxLevel += 1;
      level.set(n.id, maxLevel);
    }
  }

  const levelGroups = new Map<number, string[]>();
  for (const [id, lv] of level) {
    if (!levelGroups.has(lv)) levelGroups.set(lv, []);
    levelGroups.get(lv)!.push(id);
  }

  const layoutNodes: LayoutNode[] = [];
  const idMap = new Map<string, SkillDepNode>();
  for (const n of nodes) idMap.set(n.id, n);

  let maxRowWidth = 0;
  for (const [, ids] of levelGroups) {
    const rowWidth = ids.length * NODE_WIDTH + (ids.length - 1) * SIBLING_GAP;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
  }

  for (const [lv, ids] of levelGroups) {
    const rowWidth = ids.length * NODE_WIDTH + (ids.length - 1) * SIBLING_GAP;
    const startX = (maxRowWidth - rowWidth) / 2;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const node = idMap.get(id);
      if (!node) continue;
      const depCount = (inEdges.get(id) || []).length;
      const dependentCount = (outEdges.get(id) || []).length;
      layoutNodes.push({
        id: node.id,
        name: node.name,
        status: node.status,
        x: startX + i * (NODE_WIDTH + SIBLING_GAP),
        y: lv * (NODE_HEIGHT + LEVEL_GAP),
        level: lv,
        deps: depCount,
        dependents: dependentCount,
      });
    }
  }

  const layoutEdges: LayoutEdge[] = edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }));

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: Math.max(maxRowWidth + 80, 800),
    height: (maxLevel + 1) * (NODE_HEIGHT + LEVEL_GAP) + 80,
  };
}

const SkillDependencyGraphPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation('skills');
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<{ nodes: SkillDepNode[]; edges: SkillDepEdge[] } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'required' | 'optional' | 'conflicts'>('all');
  const isDark = false;
  const gs = getGrayScale(isDark);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSkillDependencyGraph();
      setGraph(data);
    } catch (e) {
      showToast(`加载依赖图谱失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const layout = useMemo(() => {
    if (!graph) return null;
    return layoutGraph(graph.nodes, graph.edges);
  }, [graph]);

  const stats = useMemo(() => {
    if (!graph) return { total: 0, required: 0, optional: 0, conflicts: 0, roots: 0, leaves: 0 };
    const required = graph.edges.filter((e) => e.type === 'required').length;
    const optional = graph.edges.filter((e) => e.type === 'optional').length;
    const conflicts = graph.edges.filter((e) => e.type === 'conflicts').length;
    const incoming = new Set(graph.edges.map((e) => e.target));
    const roots = graph.nodes.filter((n) => !incoming.has(n.id)).length;
    const leaves = graph.nodes.length - roots;
    return { total: graph.nodes.length, required, optional, conflicts, roots, leaves };
  }, [graph]);

  const filteredEdges = useMemo(() => {
    if (!graph) return [];
    if (filterType === 'all') return graph.edges;
    return graph.edges.filter((e) => e.type === filterType);
  }, [graph, filterType]);

  const nodeById = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    if (layout) {
      for (const n of layout.nodes) map.set(n.id, n);
    }
    return map;
  }, [layout]);

  const getNodeColor = (status: string) => {
    switch (status) {
      case 'active':
        return { bg: '#ECFDF5', border: '#10B981', text: '#047857' };
      case 'available':
        return { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' };
      default:
        return { bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' };
    }
  };

  const getEdgeColor = (type: string) => {
    switch (type) {
      case 'required':
        return { stroke: '#3B82F6', dash: 'none', width: 1.5 };
      case 'optional':
        return { stroke: '#9CA3AF', dash: '4 4', width: 1 };
      case 'conflicts':
        return { stroke: '#DC2626', dash: 'none', width: 1.5 };
      default:
        return { stroke: '#9CA3AF', dash: 'none', width: 1 };
    }
  };

  const fadeCls = usePageFadeIn();

  if (loading && !graph) {
    return (
      <Box className={fadeCls} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 1.5 }}>
        <CircularProgress size={20} sx={{ color: gs.textMuted }} />
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>加载技能依赖图谱...</Typography>
      </Box>
    );
  }

  return (
    <Box className={fadeCls} sx={{ p: 1 }}>
      {/* 顶部标题栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AccountTreeIcon sx={{ fontSize: 20, color: '#7C3AED' }} />
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary }}>
              技能依赖图谱
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            可视化展示技能间的依赖与冲突关系，识别循环依赖和孤立节点
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
          onClick={loadGraph}
          disabled={loading}
          sx={{ textTransform: 'none', fontSize: '0.8125rem' }}
        >
          刷新
        </Button>
      </Box>

      {/* 统计卡片 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1.5, mb: 2.5 }}>
        {[
          { label: t('common:total'), value: stats.total, color: '#1F2937' },
          { label: t('dependency.edgeTypes.required'), value: stats.required, color: '#2563EB' },
          { label: t('dependency.edgeTypes.optional'), value: stats.optional, color: '#6B7280' },
          { label: t('dependency.conflicts'), value: stats.conflicts, color: '#DC2626' },
          { label: '根节点', value: stats.roots, color: '#059669' },
          { label: '叶子节点', value: stats.leaves, color: '#7C3AED' },
        ].map((card) => (
          <Paper
            key={card.label}
            elevation={0}
            sx={{ p: 1.5, borderRadius: '10px', border: `1px solid ${gs.border}` }}
          >
            <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted, mb: 0.5 }}>
              {card.label}
            </Typography>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: card.color }}>
              {card.value}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* 过滤器 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted, mr: 1 }}>
          {t('common:filter')}:
        </Typography>
        {[
          { key: 'all', label: t('common:all'), color: gs.textPrimary },
          { key: 'required', label: t('dependency.edgeTypes.required'), color: '#2563EB' },
          { key: 'optional', label: t('dependency.edgeTypes.optional'), color: '#6B7280' },
          { key: 'conflicts', label: t('dependency.conflicts'), color: '#DC2626' },
        ].map((f) => {
          const isActive = filterType === f.key;
          return (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              onClick={() => setFilterType(f.key as 'all' | 'required' | 'optional' | 'conflicts')}
              sx={{
                cursor: 'pointer',
                fontSize: '0.75rem',
                height: 24,
                backgroundColor: isActive ? f.color : 'transparent',
                color: isActive ? '#FFFFFF' : f.color,
                border: `1px solid ${f.color}`,
                '&:hover': { backgroundColor: isActive ? f.color : `${f.color}20` },
              }}
            />
          );
        })}
      </Box>

      {/* 图谱区域 */}
      {graph && layout && (
        <Box sx={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 320px' : '1fr', gap: 2 }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: '12px',
              border: `1px solid ${gs.border}`,
              backgroundColor: gs.bgPanel,
              overflow: 'auto',
              maxHeight: 'calc(100vh - 320px)',
            }}
          >
            <Box sx={{ minWidth: layout.width, minHeight: layout.height, p: 2, position: 'relative' }}>
              <svg
                width={layout.width}
                height={layout.height}
                style={{ display: 'block' }}
              >
                {filteredEdges.map((edge, idx) => {
                  const source = nodeById.get(edge.source);
                  const target = nodeById.get(edge.target);
                  if (!source || !target) return null;
                  const colors = getEdgeColor(edge.type);
                  const x1 = source.x + NODE_WIDTH / 2;
                  const y1 = source.y + NODE_HEIGHT;
                  const x2 = target.x + NODE_WIDTH / 2;
                  const y2 = target.y;
                  const midY = (y1 + y2) / 2;
                  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
                  return (
                    <g key={idx}>
                      <path
                        d={path}
                        stroke={colors.stroke}
                        strokeWidth={colors.width}
                        strokeDasharray={colors.dash}
                        fill="none"
                        opacity={0.7}
                      />
                      {edge.type === 'required' && (
                        <polygon
                          points={`${x2 - 4},${y2 - 8} ${x2 + 4},${y2 - 8} ${x2},${y2 - 2}`}
                          fill={colors.stroke}
                          opacity={0.7}
                        />
                      )}
                      {edge.type === 'conflicts' && (
                        <circle cx={x2} cy={y2 - 4} r={3} fill={colors.stroke} opacity={0.7} />
                      )}
                    </g>
                  );
                })}

                {layout.nodes.map((node) => {
                  const colors = getNodeColor(node.status);
                  const isSelected = selectedNode === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                    >
                      <rect
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        rx={6}
                        ry={6}
                        fill={colors.bg}
                        stroke={isSelected ? '#7C3AED' : colors.border}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                      <text
                        x={NODE_WIDTH / 2}
                        y={NODE_HEIGHT / 2 - 4}
                        textAnchor="middle"
                        fill={colors.text}
                        fontSize="11"
                        fontWeight="500"
                        style={{ pointerEvents: 'none' }}
                      >
                        {node.name.length > 12 ? `${node.name.slice(0, 11)}…` : node.name}
                      </text>
                      <text
                        x={NODE_WIDTH / 2}
                        y={NODE_HEIGHT / 2 + 10}
                        textAnchor="middle"
                        fill={colors.text}
                        fontSize="9"
                        opacity={0.6}
                        style={{ pointerEvents: 'none' }}
                      >
                        L{node.level} · ↑{node.deps} ↓{node.dependents}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </Box>
          </Paper>

          {selectedNode && (() => {
            const node = graph.nodes.find((n) => n.id === selectedNode);
            const incoming = graph.edges.filter((e) => e.target === selectedNode);
            const outgoing = graph.edges.filter((e) => e.source === selectedNode);
            if (!node) return null;
            const conflictOut = outgoing.filter((e) => e.type === 'conflicts');
            const colors = getNodeColor(node.status);
            return (
              <Paper
                elevation={0}
                sx={{ p: 2, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel, maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary }}>
                    {node.name}
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                    onClick={() => navigate(`/skills/${encodeURIComponent(node.id)}`)}
                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    详情
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: colors.border }} />
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    状态: {node.status}
                  </Typography>
                </Box>

                {incoming.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary, mb: 0.75 }}>
                      ↑ 依赖此技能 ({incoming.length})
                    </Typography>
                    {incoming.map((e, i) => {
                      const sourceNode = graph.nodes.find((n) => n.id === e.source);
                      return (
                        <Box
                          key={i}
                          onClick={() => setSelectedNode(e.source)}
                          sx={{
                            p: 1, mb: 0.5, borderRadius: '6px', cursor: 'pointer',
                            backgroundColor: gs.bgHover,
                            fontSize: '0.75rem', color: gs.textSecondary,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            '&:hover': { backgroundColor: gs.border },
                          }}
                        >
                          <span>{sourceNode?.name || e.source}</span>
                          <Chip label={e.type === 'conflicts' ? t('dependency.conflicts') : e.type === 'required' ? t('dependency.required') : t('dependency.optional')} size="small" sx={{ height: 16, fontSize: '0.625rem' }} />
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {outgoing.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary, mb: 0.75 }}>
                      ↓ 依赖的技能 ({outgoing.length})
                    </Typography>
                    {outgoing.map((e, i) => {
                      const targetNode = graph.nodes.find((n) => n.id === e.target);
                      return (
                        <Box
                          key={i}
                          onClick={() => setSelectedNode(e.target)}
                          sx={{
                            p: 1, mb: 0.5, borderRadius: '6px', cursor: 'pointer',
                            backgroundColor: e.type === 'conflicts' ? '#FEF2F2' : gs.bgHover,
                            fontSize: '0.75rem', color: e.type === 'conflicts' ? '#DC2626' : gs.textSecondary,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            '&:hover': { backgroundColor: e.type === 'conflicts' ? '#FEE2E2' : gs.border },
                          }}
                        >
                          <span>{targetNode?.name || e.target}</span>
                          {e.type === 'conflicts' && <ErrorOutlineIcon sx={{ fontSize: 14, color: '#DC2626' }} />}
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {incoming.length === 0 && outgoing.length === 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, backgroundColor: gs.bgHover, borderRadius: '6px' }}>
                    <CheckCircleIcon sx={{ fontSize: 16, color: '#059669' }} />
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                      孤立节点，没有依赖关系
                    </Typography>
                  </Box>
                )}

                {conflictOut.length > 0 && (
                  <Box sx={{ mt: 1.5, p: 1.5, backgroundColor: '#FEF2F2', borderRadius: '6px', border: '1px solid #FECACA' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <WarningAmberIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#DC2626' }}>
                        存在 {conflictOut.length} 个冲突声明
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
            );
          })()}
        </Box>
      )}

      {graph && graph.nodes.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AccountTreeIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 2 }} />
          <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
            暂无技能依赖数据
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
            技能需要在 SKILL.md 中声明 dependencies/conflicts 字段
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SkillDependencyGraphPage;

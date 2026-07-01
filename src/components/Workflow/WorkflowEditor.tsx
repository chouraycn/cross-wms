/**
 * 工作流可视化编辑器
 * 支持节点拖拽、连线、属性编辑、缩放和平移
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Divider,
  Chip,
  Tooltip,
  useTheme,
  Slider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Save as SaveIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import type {
  Workflow,
  WorkflowNode,
  NodeType,
  NodeConnection,
  CanvasState,
} from '../../../server/engine/workflow/types';

// 节点类型配置
const NODE_TYPES: Array<{ type: NodeType; label: string; color: string; icon: string }> = [
  { type: 'trigger', label: '触发器', color: '#4CAF50', icon: '⚡' },
  { type: 'condition', label: '条件', color: '#FF9800', icon: '🔀' },
  { type: 'action', label: '动作', color: '#2196F3', icon: '🎯' },
  { type: 'parallel', label: '并行', color: '#9C27B0', icon: '⚡⚡' },
  { type: 'loop', label: '循环', color: '#F44336', icon: '🔄' },
  { type: 'wait', label: '等待', color: '#607D8B', icon: '⏱️' },
];

// 默认节点尺寸
const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;

/**
 * 工作流编辑器组件
 */
const WorkflowEditor: React.FC<{
  workflow: Workflow | null;
  onSave: (workflow: Workflow) => void;
  onExecute?: () => void;
  onCancel?: () => void;
  isExecuting?: boolean;
}> = memo(({ workflow, onSave, onExecute, onCancel, isExecuting }) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  // 编辑器状态
  const [nodes, setNodes] = useState<WorkflowNode[]>(workflow?.nodes || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [undoStack, setUndoStack] = useState<WorkflowNode[][]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowNode[][]>([]);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null);

  // 初始化节点
  useEffect(() => {
    if (workflow) {
      setNodes(workflow.nodes);
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [workflow]);

  // 保存状态到撤销栈
  const saveToUndoStack = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-19), nodes]);
    setRedoStack([]);
  }, [nodes]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const prevNodes = undoStack[undoStack.length - 1];
      setRedoStack(prev => [...prev, nodes]);
      setUndoStack(prev => prev.slice(0, -1));
      setNodes(prevNodes);
    }
  }, [undoStack, nodes]);

  // 重做
  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextNodes = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev, nodes]);
      setRedoStack(prev => prev.slice(0, -1));
      setNodes(nextNodes);
    }
  }, [redoStack, nodes]);

  // 缩放
  const handleZoom = useCallback((delta: number) => {
    setCanvas(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(3, prev.zoom + delta)),
    }));
  }, []);

  // 适应屏幕
  const handleFitScreen = useCallback(() => {
    if (nodes.length === 0) return;

    const minX = Math.min(...nodes.map(n => n.position.x));
    const maxX = Math.max(...nodes.map(n => n.position.x)) + NODE_WIDTH;
    const minY = Math.min(...nodes.map(n => n.position.y));
    const maxY = Math.max(...nodes.map(n => n.position.y)) + NODE_HEIGHT;

    const width = maxX - minX;
    const height = maxY - minY;

    const canvasWidth = svgRef.current?.clientWidth || 800;
    const canvasHeight = svgRef.current?.clientHeight || 600;

    const zoom = Math.min(canvasWidth / width, canvasHeight / height, 1) * 0.9;
    const panX = (canvasWidth - width * zoom) / 2 - minX * zoom;
    const panY = (canvasHeight - height * zoom) / 2 - minY * zoom;

    setCanvas({ zoom, panX, panY });
  }, [nodes]);

  // 添加节点
  const handleAddNode = useCallback((type: NodeType) => {
    saveToUndoStack();

    const newNode: WorkflowNode = {
      id: uuidv4(),
      type,
      name: NODE_TYPES.find(n => n.type === type)?.label || type,
      config: {},
      position: {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      },
      connections: [],
      enabled: true,
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  }, [saveToUndoStack]);

  // 删除节点
  const handleDeleteNode = useCallback((nodeId: string) => {
    saveToUndoStack();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setSelectedNodeId(null);
  }, [saveToUndoStack]);

  // 开始拖拽节点
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setIsDraggingNode(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  }, []);

  // 开始拖拽画布
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && !isDraggingNode) {
      setIsDraggingCanvas(true);
      setDragStartPos({ x: e.clientX - canvas.panX, y: e.clientY - canvas.panY });
    }
  }, [isDraggingNode, canvas.panX, canvas.panY]);

  // 鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingNode && selectedNodeId) {
      const deltaX = (e.clientX - dragStartPos.x) / canvas.zoom;
      const deltaY = (e.clientY - dragStartPos.y) / canvas.zoom;

      setNodes(prev =>
        prev.map(node =>
          node.id === selectedNodeId
            ? {
                ...node,
                position: {
                  x: node.position.x + deltaX,
                  y: node.position.y + deltaY,
                },
              }
            : node
        )
      );
      setDragStartPos({ x: e.clientX, y: e.clientY });
    } else if (isDraggingCanvas) {
      setCanvas(prev => ({
        ...prev,
        panX: e.clientX - dragStartPos.x,
        panY: e.clientY - dragStartPos.y,
      }));
    }
  }, [isDraggingNode, isDraggingCanvas, selectedNodeId, canvas.zoom, dragStartPos]);

  // 鼠标释放
  const handleMouseUp = useCallback(() => {
    if (isDraggingNode) {
      saveToUndoStack();
    }
    setIsDraggingNode(false);
    setIsDraggingCanvas(false);
    setConnectingFrom(null);
  }, [isDraggingNode, saveToUndoStack]);

  // 开始连线
  const handleStartConnection = useCallback((nodeId: string) => {
    setConnectingFrom(nodeId);
  }, []);

  // 完成连线
  const handleEndConnection = useCallback((targetNodeId: string) => {
    if (connectingFrom && connectingFrom !== targetNodeId) {
      saveToUndoStack();

      const connection: NodeConnection = {
        source: connectingFrom,
        target: targetNodeId,
      };

      setNodes(prev =>
        prev.map(node =>
          node.id === connectingFrom
            ? { ...node, connections: [...node.connections, connection] }
            : node
        )
      );
    }
    setConnectingFrom(null);
  }, [connectingFrom, saveToUndoStack]);

  // 打开属性编辑对话框
  const handleEditNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setEditingNode({ ...node });
      setPropertyDialogOpen(true);
    }
  }, [nodes]);

  // 保存节点属性
  const handleSaveNodeProperty = useCallback(() => {
    if (editingNode) {
      saveToUndoStack();
      setNodes(prev =>
        prev.map(node => node.id === editingNode.id ? editingNode : node)
      );
      setPropertyDialogOpen(false);
      setEditingNode(null);
    }
  }, [editingNode, saveToUndoStack]);

  // 保存工作流
  const handleSave = useCallback(() => {
    if (workflow) {
      onSave({
        ...workflow,
        nodes,
        updatedAt: Date.now(),
      });
    }
  }, [workflow, nodes, onSave]);

  // 渲染节点
  const renderNode = useCallback((node: WorkflowNode) => {
    const nodeType = NODE_TYPES.find(n => n.type === node.type);
    const isSelected = selectedNodeId === node.id;

    return (
      <g
        key={node.id}
        transform={`translate(${node.position.x * canvas.zoom + canvas.panX}, ${node.position.y * canvas.zoom + canvas.panY})`}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
        onDoubleClick={() => handleEditNode(node.id)}
        style={{ cursor: 'move' }}
      >
        {/* 节点主体 */}
        <rect
          width={NODE_WIDTH * canvas.zoom}
          height={NODE_HEIGHT * canvas.zoom}
          fill={nodeType?.color || '#ccc'}
          stroke={isSelected ? '#000' : '#666'}
          strokeWidth={isSelected ? 3 : 1}
          rx={8 * canvas.zoom}
          opacity={node.enabled ? 1 : 0.5}
        />

        {/* 节点图标和名称 */}
        <text
          x={NODE_WIDTH * canvas.zoom / 2}
          y={30 * canvas.zoom}
          textAnchor="middle"
          fill="#fff"
          fontSize={16 * canvas.zoom}
          fontWeight="bold"
        >
          {nodeType?.icon || '?'}
        </text>
        <text
          x={NODE_WIDTH * canvas.zoom / 2}
          y={55 * canvas.zoom}
          textAnchor="middle"
          fill="#fff"
          fontSize={12 * canvas.zoom}
        >
          {node.name}
        </text>

        {/* 连接点 */}
        {connectingFrom === null && (
          <>
            {/* 输出连接点 */}
            <circle
              cx={NODE_WIDTH * canvas.zoom}
              cy={NODE_HEIGHT * canvas.zoom / 2}
              r={8 * canvas.zoom}
              fill="#fff"
              stroke="#666"
              strokeWidth={2}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartConnection(node.id);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                handleEndConnection(node.id);
              }}
              style={{ cursor: 'crosshair' }}
            />
          </>
        )}
      </g>
    );
  }, [
    canvas,
    selectedNodeId,
    connectingFrom,
    handleNodeMouseDown,
    handleEditNode,
    handleStartConnection,
    handleEndConnection,
  ]);

  // 渲染连线
  const renderConnections = useCallback(() => {
    return nodes.map(node =>
      node.connections.map((conn, idx) => {
        const sourceNode = nodes.find(n => n.id === conn.source);
        const targetNode = nodes.find(n => n.id === conn.target);

        if (!sourceNode || !targetNode) return null;

        const x1 = (sourceNode.position.x + NODE_WIDTH) * canvas.zoom + canvas.panX;
        const y1 = (sourceNode.position.y + NODE_HEIGHT / 2) * canvas.zoom + canvas.panY;
        const x2 = targetNode.position.x * canvas.zoom + canvas.panX;
        const y2 = (targetNode.position.y + NODE_HEIGHT / 2) * canvas.zoom + canvas.panY;

        // 计算贝塞尔曲线
        const midX = (x1 + x2) / 2;
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

        return (
          <path
            key={`${conn.source}-${conn.target}-${idx}`}
            d={path}
            fill="none"
            stroke="#666"
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        );
      })
    );
  }, [nodes, canvas]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 节点添加按钮 */}
        {NODE_TYPES.map(nt => (
          <Tooltip key={nt.type} title={`添加${nt.label}节点`}>
            <IconButton
              size="small"
              onClick={() => handleAddNode(nt.type)}
              sx={{ bgcolor: nt.color, color: '#fff', '&:hover': { bgcolor: nt.color } }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        ))}

        <Divider orientation="vertical" flexItem />

        {/* 撤销/重做 */}
        <Tooltip title="撤销">
          <IconButton size="small" onClick={handleUndo} disabled={undoStack.length === 0}>
            <UndoIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="重做">
          <IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}>
            <RedoIcon />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* 缩放控制 */}
        <Tooltip title="缩小">
          <IconButton size="small" onClick={() => handleZoom(-0.1)}>
            <ZoomOutIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ width: 60, textAlign: 'center' }}>
          {Math.round(canvas.zoom * 100)}%
        </Typography>
        <Tooltip title="放大">
          <IconButton size="small" onClick={() => handleZoom(0.1)}>
            <ZoomInIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="适应屏幕">
          <IconButton size="small" onClick={handleFitScreen}>
            <FitScreenIcon />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* 删除节点 */}
        {selectedNodeId && (
          <Tooltip title="删除节点">
            <IconButton size="small" onClick={() => handleDeleteNode(selectedNodeId)}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* 保存和执行 */}
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          保存
        </Button>
        {isExecuting ? (
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<StopIcon />}
            onClick={onCancel}
          >
            停止
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<PlayArrowIcon />}
            onClick={onExecute}
            disabled={!workflow || workflow.status !== 'published'}
          >
            执行
          </Button>
        )}
      </Paper>

      {/* SVG 画布 */}
      <Box sx={{ flexGrow: 1, position: 'relative', bgcolor: '#f5f5f5' }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDraggingCanvas ? 'grabbing' : 'grab' }}
        >
          {/* 箭头标记 */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
          </defs>

          {/* 连线 */}
          {renderConnections()}

          {/* 节点 */}
          {nodes.map(renderNode)}

          {/* 正在连接的线 */}
          {connectingFrom && nodes.find(n => n.id === connectingFrom) && (
            <line
              x1={(nodes.find(n => n.id === connectingFrom)!.position.x + NODE_WIDTH) * canvas.zoom + canvas.panX}
              y1={(nodes.find(n => n.id === connectingFrom)!.position.y + NODE_HEIGHT / 2) * canvas.zoom + canvas.panY}
              x2={dragStartPos.x}
              y2={dragStartPos.y}
              stroke="#999"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}
        </svg>
      </Box>

      {/* 属性编辑对话框 */}
      <Dialog open={propertyDialogOpen} onClose={() => setPropertyDialogOpen(false)}>
        <DialogTitle>编辑节点属性</DialogTitle>
        <DialogContent>
          {editingNode && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="节点名称"
                value={editingNode.name}
                onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                fullWidth
              />
              <TextField
                label="描述"
                value={editingNode.description || ''}
                onChange={(e) => setEditingNode({ ...editingNode, description: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
              <FormControl fullWidth>
                <InputLabel>启用状态</InputLabel>
                <Select
                  value={editingNode.enabled ? 'enabled' : 'disabled'}
                  onChange={(e) => setEditingNode({ ...editingNode, enabled: e.target.value === 'enabled' })}
                >
                  <MenuItem value="enabled">启用</MenuItem>
                  <MenuItem value="disabled">禁用</MenuItem>
                </Select>
              </FormControl>
              {/* 根据节点类型显示不同的配置项 */}
              {editingNode.type === 'action' && (
                <TextField
                  label="动作类型"
                  value={(editingNode.config as any).type || ''}
                  onChange={(e) => setEditingNode({ ...editingNode, config: { ...editingNode.config, type: e.target.value } })}
                  fullWidth
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPropertyDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveNodeProperty}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

WorkflowEditor.displayName = 'WorkflowEditor';

export default WorkflowEditor;
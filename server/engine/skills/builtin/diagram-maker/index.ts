import { logger } from '../../../../logger.js';

interface DiagramNode {
  id: string;
  label: string;
  shape?: 'rectangle' | 'round' | 'stadium' | 'subroutine' | 'diamond' | 'parallelogram';
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'arrow' | 'dotted' | 'thick';
}

interface FlowchartResult {
  mermaidCode: string;
  type: string;
  nodeCount: number;
  edgeCount: number;
}

interface SequenceParticipant {
  name: string;
  alias?: string;
  type?: 'actor' | 'participant' | 'database' | 'queue';
}

interface SequenceMessage {
  from: string;
  to: string;
  message: string;
  type?: 'solid' | 'dashed' | 'note';
}

interface SequenceResult {
  mermaidCode: string;
  type: string;
  participantCount: number;
  messageCount: number;
}

interface ArchitectureService {
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'external';
  layer?: 'presentation' | 'application' | 'data';
}

interface ArchitectureConnection {
  from: string;
  to: string;
  protocol?: string;
  direction?: 'uni' | 'bi';
}

interface ArchitectureResult {
  mermaidCode: string;
  type: string;
  serviceCount: number;
  connectionCount: number;
}

function getMermaidShape(shape?: string): string {
  switch (shape) {
    case 'round':
      return '()';
    case 'stadium':
      return '([ ])';
    case 'subroutine':
      return '[[ ]]';
    case 'diamond':
      return '{ }';
    case 'parallelogram':
      return '[/ /]';
    default:
      return '[ ]';
  }
}

export function generateFlowchart(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: string = 'TB',
): FlowchartResult {
  logger.debug('[diagram-maker] generateFlowchart nodes:', nodes.length, 'edges:', edges.length);

  const lines: string[] = [`flowchart ${direction}`, ''];

  for (const node of nodes) {
    const shape = getMermaidShape(node.shape);
    if (shape === '[ ]') {
      lines.push(`    ${node.id}["${node.label}"]`);
    } else if (shape === '()') {
      lines.push(`    ${node.id}("${node.label}")`);
    } else if (shape === '([ ])') {
      lines.push(`    ${node.id}(["${node.label}"])`);
    } else if (shape === '[[ ]]') {
      lines.push(`    ${node.id}[["${node.label}"]]`);
    } else if (shape === '{ }') {
      lines.push(`    ${node.id}{"${node.label}"}`);
    } else if (shape === '[/ /]') {
      lines.push(`    ${node.id}["${node.label}"]`);
    }
  }

  lines.push('');

  for (const edge of edges) {
    let arrow = '-->';
    if (edge.style === 'dotted') arrow = '-.->';
    if (edge.style === 'thick') arrow = '==>';

    if (edge.label) {
      lines.push(`    ${edge.from} ${arrow}|${edge.label}| ${edge.to}`);
    } else {
      lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
    }
  }

  return {
    mermaidCode: lines.join('\n'),
    type: 'flowchart',
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

export function generateSequenceDiagram(
  participants: SequenceParticipant[],
  messages: SequenceMessage[],
): SequenceResult {
  logger.debug('[diagram-maker] generateSequenceDiagram participants:', participants.length, 'messages:', messages.length);

  const lines: string[] = ['sequenceDiagram', ''];

  for (const p of participants) {
    const alias = p.alias ? ` as ${p.alias}` : '';
    switch (p.type) {
      case 'actor':
        lines.push(`    actor ${p.name}${alias}`);
        break;
      case 'database':
        lines.push(`    participant ${p.name}${alias}`);
        break;
      case 'queue':
        lines.push(`    participant ${p.name}${alias}`);
        break;
      default:
        lines.push(`    participant ${p.name}${alias}`);
    }
  }

  lines.push('');

  for (const msg of messages) {
    let arrow = '->>';
    if (msg.type === 'dashed') arrow = '-->>';
    if (msg.type === 'note') {
      lines.push(`    Note over ${msg.from},${msg.to}: ${msg.message}`);
      continue;
    }
    lines.push(`    ${msg.from}${arrow}${msg.to}: ${msg.message}`);
  }

  return {
    mermaidCode: lines.join('\n'),
    type: 'sequence',
    participantCount: participants.length,
    messageCount: messages.length,
  };
}

export function generateArchitectureDiagram(
  services: ArchitectureService[],
  connections: ArchitectureConnection[],
): ArchitectureResult {
  logger.debug('[diagram-maker] generateArchitectureDiagram services:', services.length, 'connections:', connections.length);

  const lines: string[] = ['flowchart TB', ''];

  const layers = {
    presentation: services.filter((s) => s.layer === 'presentation'),
    application: services.filter((s) => s.layer === 'application'),
    data: services.filter((s) => s.layer === 'data' || !s.layer),
  };

  const getServiceShape = (type: string, name: string) => {
    switch (type) {
      case 'frontend':
        return `${name}["🖥️ ${name}"]`;
      case 'backend':
        return `${name}["⚙️ ${name}"]`;
      case 'database':
        return `${name}(("🗄️ ${name}"))`;
      case 'cache':
        return `${name}["⚡ ${name}"]`;
      case 'queue':
        return `${name}["📨 ${name}"]`;
      case 'external':
        return `${name}{{"🌐 ${name}"}}`;
      default:
        return `${name}["${name}"]`;
    }
  };

  if (layers.presentation.length > 0) {
    lines.push('    subgraph 表现层');
    for (const s of layers.presentation) {
      lines.push(`        ${getServiceShape(s.type, s.name)}`);
    }
    lines.push('    end');
    lines.push('');
  }

  if (layers.application.length > 0) {
    lines.push('    subgraph 应用层');
    for (const s of layers.application) {
      lines.push(`        ${getServiceShape(s.type, s.name)}`);
    }
    lines.push('    end');
    lines.push('');
  }

  if (layers.data.length > 0) {
    lines.push('    subgraph 数据层');
    for (const s of layers.data) {
      lines.push(`        ${getServiceShape(s.type, s.name)}`);
    }
    lines.push('    end');
    lines.push('');
  }

  for (const conn of connections) {
    const arrow = conn.direction === 'bi' ? '<-->' : '-->';
    const label = conn.protocol ? `|${conn.protocol}|` : '';
    lines.push(`    ${conn.from} ${arrow}${label} ${conn.to}`);
  }

  return {
    mermaidCode: lines.join('\n'),
    type: 'architecture',
    serviceCount: services.length,
    connectionCount: connections.length,
  };
}

export function renderMermaid(code: string): { success: boolean; type?: string; error?: string } {
  logger.debug('[diagram-maker] renderMermaid called');

  try {
    const trimmed = code.trim();
    let type = 'unknown';

    if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) {
      type = 'flowchart';
    } else if (trimmed.startsWith('sequenceDiagram')) {
      type = 'sequence';
    } else if (trimmed.startsWith('classDiagram')) {
      type = 'class';
    } else if (trimmed.startsWith('stateDiagram')) {
      type = 'state';
    } else if (trimmed.startsWith('gantt')) {
      type = 'gantt';
    } else if (trimmed.startsWith('pie')) {
      type = 'pie';
    }

    return { success: true, type };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default {
  name: 'diagram-maker',
  description: '使用 Mermaid/Excalidraw 生成流程图、架构图',
  tools: [
    {
      name: 'diagram_flowchart',
      description: '生成流程图',
      handler: (args: { nodes: DiagramNode[]; edges: DiagramEdge[]; direction?: string }) =>
        generateFlowchart(args.nodes, args.edges, args.direction),
    },
    {
      name: 'diagram_sequence',
      description: '生成时序图',
      handler: (args: { participants: SequenceParticipant[]; messages: SequenceMessage[] }) =>
        generateSequenceDiagram(args.participants, args.messages),
    },
    {
      name: 'diagram_architecture',
      description: '生成架构图',
      handler: (args: { services: ArchitectureService[]; connections: ArchitectureConnection[] }) =>
        generateArchitectureDiagram(args.services, args.connections),
    },
    {
      name: 'diagram_render',
      description: '渲染 Mermaid 代码',
      handler: (args: { code: string }) => renderMermaid(args.code),
    },
  ],
};

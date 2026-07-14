import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodoItem, ArtifactItem, ToolCallItem, TrajectoryEventItem } from '../TaskMonitorItems';
import { getGrayScale } from '../../../constants/theme';
import type { TodoItem as TodoItemType, Artifact, ToolCall, TrajectoryEvent } from '../../../services/taskMonitorApi';

const gs = getGrayScale(false);

function makeTodo(over: Partial<TodoItemType> = {}): TodoItemType {
  return {
    id: 'todo-1',
    sessionId: 'session-1',
    text: 'Test todo',
    status: 'pending',
    priority: 'normal',
    source: 'auto',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    orderIndex: 0,
    ...over,
  };
}

function makeArtifact(over: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-1',
    sessionId: 'session-1',
    messageId: 'msg-1',
    fileName: 'test.txt',
    filePath: '/path/test.txt',
    fileSize: 1024,
    mimeType: 'text/plain',
    description: null,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function makeToolCall(over: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tool-call-1',
    sessionId: 'session-1',
    messageId: 'msg-1',
    toolName: 'test-tool',
    toolType: 'skill',
    status: 'success',
    arguments: { param: 'value' },
    result: { data: 'result' },
    errorMessage: null,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 100,
    ...over,
  };
}

function makeTrajectoryEvent(over: Partial<TrajectoryEvent> = {}): TrajectoryEvent {
  return {
    id: 'event-1',
    traceId: 'trace-1',
    schemaVersion: 1,
    source: 'runtime',
    type: 'tool_call',
    ts: new Date().toISOString(),
    seq: 1,
    sessionId: 'session-1',
    runId: null,
    entryId: null,
    parentEntryId: null,
    data: { message: 'test' },
    provider: null,
    modelId: null,
    workspaceDir: null,
    ...over,
  };
}

describe('TodoItem', () => {
  it('renders todo text and status', () => {
    render(
      <TodoItem
        todo={makeTodo({ text: 'Buy milk' })}
        selectedTodoIds={new Set()}
        selectMode={false}
        draggedTodoId={null}
        dragOverTodoId={null}
        completingTodoIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onToggleTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
        onCyclePriority={vi.fn()}
        onPriorityMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('calls onToggleTodo when checkbox is clicked', () => {
    const onToggleTodo = vi.fn();
    render(
      <TodoItem
        todo={makeTodo()}
        selectedTodoIds={new Set()}
        selectMode={false}
        draggedTodoId={null}
        dragOverTodoId={null}
        completingTodoIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onToggleTodo={onToggleTodo}
        onDeleteTodo={vi.fn()}
        onCyclePriority={vi.fn()}
        onPriorityMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleTodo).toHaveBeenCalledWith('todo-1');
  });

  it('calls onToggleSelect when clicked in select mode', () => {
    const onToggleSelect = vi.fn();
    render(
      <TodoItem
        todo={makeTodo()}
        selectedTodoIds={new Set()}
        selectMode={true}
        draggedTodoId={null}
        dragOverTodoId={null}
        completingTodoIds={new Set()}
        gs={gs}
        onToggleSelect={onToggleSelect}
        onToggleTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
        onCyclePriority={vi.fn()}
        onPriorityMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Test todo'));
    expect(onToggleSelect).toHaveBeenCalledWith('todo-1');
  });

  it('shows completed style when status is done', () => {
    render(
      <TodoItem
        todo={makeTodo({ status: 'done' })}
        selectedTodoIds={new Set()}
        selectMode={false}
        draggedTodoId={null}
        dragOverTodoId={null}
        completingTodoIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onToggleTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
        onCyclePriority={vi.fn()}
        onPriorityMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });
});

describe('ArtifactItem', () => {
  it('renders file name and size', () => {
    render(
      <ArtifactItem
        artifact={makeArtifact({ fileName: 'report.pdf', fileSize: 2048 })}
        selectedArtifactIds={new Set()}
        artifactSelectMode={false}
        deletingArtifactIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onPreviewArtifact={vi.fn()}
        onCopyPath={vi.fn()}
        onDeleteArtifact={vi.fn()}
        downloadUrl="/download/test"
      />
    );
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('calls onPreviewArtifact when preview button is clicked', () => {
    const onPreviewArtifact = vi.fn();
    const artifact = makeArtifact();
    render(
      <ArtifactItem
        artifact={artifact}
        selectedArtifactIds={new Set()}
        artifactSelectMode={false}
        deletingArtifactIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onPreviewArtifact={onPreviewArtifact}
        onCopyPath={vi.fn()}
        onDeleteArtifact={vi.fn()}
        downloadUrl="/download/test"
      />
    );
    fireEvent.click(screen.getByLabelText('预览'));
    expect(onPreviewArtifact).toHaveBeenCalledWith(artifact);
  });

  it('calls onCopyPath when copy button is clicked', () => {
    const onCopyPath = vi.fn();
    render(
      <ArtifactItem
        artifact={makeArtifact({ filePath: '/docs/report.pdf' })}
        selectedArtifactIds={new Set()}
        artifactSelectMode={false}
        deletingArtifactIds={new Set()}
        gs={gs}
        onToggleSelect={vi.fn()}
        onPreviewArtifact={vi.fn()}
        onCopyPath={onCopyPath}
        onDeleteArtifact={vi.fn()}
        downloadUrl="/download/test"
      />
    );
    fireEvent.click(screen.getByLabelText('复制路径'));
    expect(onCopyPath).toHaveBeenCalledWith('/docs/report.pdf');
  });
});

describe('ToolCallItem', () => {
  it('renders tool name and status', () => {
    render(
      <ToolCallItem
        toolCall={makeToolCall({ toolName: 'search', status: 'success' })}
        maxDuration={1000}
        gs={gs}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
  });

  it('shows error status correctly', () => {
    render(
      <ToolCallItem
        toolCall={makeToolCall({ status: 'error' })}
        maxDuration={1000}
        gs={gs}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
  });

  it('shows running status with spinner', () => {
    render(
      <ToolCallItem
        toolCall={makeToolCall({ status: 'running' })}
        maxDuration={1000}
        gs={gs}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <ToolCallItem
        toolCall={makeToolCall()}
        maxDuration={1000}
        gs={gs}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByText('test-tool'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('TrajectoryEventItem', () => {
  it('renders event type and timestamp', () => {
    render(
      <TrajectoryEventItem
        event={makeTrajectoryEvent({ type: 'tool_call' })}
        isExpanded={false}
        gs={gs}
        isDark={false}
        onToggleExpand={vi.fn()}
        onCopy={vi.fn()}
        copiedField={null}
      />
    );
    expect(screen.getByText('tool_call')).toBeInTheDocument();
  });

  it('shows expanded content when isExpanded is true', () => {
    render(
      <TrajectoryEventItem
        event={makeTrajectoryEvent({ data: { key: 'value' } })}
        isExpanded={true}
        gs={gs}
        isDark={false}
        onToggleExpand={vi.fn()}
        onCopy={vi.fn()}
        copiedField={null}
      />
    );
    expect(screen.getByText('数据 (data)')).toBeInTheDocument();
  });

  it('calls onToggleExpand when clicked', () => {
    const onToggleExpand = vi.fn();
    render(
      <TrajectoryEventItem
        event={makeTrajectoryEvent()}
        isExpanded={false}
        gs={gs}
        isDark={false}
        onToggleExpand={onToggleExpand}
        onCopy={vi.fn()}
        copiedField={null}
      />
    );
    fireEvent.click(screen.getByText('tool_call'));
    expect(onToggleExpand).toHaveBeenCalled();
  });
});

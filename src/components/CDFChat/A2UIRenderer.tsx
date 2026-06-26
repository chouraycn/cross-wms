import React, { useState, useEffect, useCallback, Component, ReactNode } from 'react';
import { parseA2UIContent } from './a2uiParser';
import type {
  A2UIComponent,
  A2UILayout,
  A2UIEventHandler,
  A2UIRendererProps,
  A2UIAlertComponent,
  A2UIButtonComponent,
  A2UICardComponent,
  A2UIChartComponent,
  A2UICodeComponent,
  A2UIDividerComponent,
  A2UIHeadingComponent,
  A2UIImageComponent,
  A2UIInputComponent,
  A2UIListComponent,
  A2UIProgressComponent,
  A2UITableComponent,
  A2UITabsComponent,
  A2UITextComponent,
  A2UIGridLayout,
  A2UIRowLayout,
  A2UIColumnLayout,
} from './a2uiTypes';

// ===================== 错误边界 =====================

interface ErrorBoundaryProps {
  children: ReactNode;
  darkMode?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: string | null;
}

class A2UIErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('A2UI 渲染错误:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={`a2ui-error-boundary ${this.props.darkMode ? 'cdf-dark' : ''}`}>
          <div className="a2ui-error-boundary__icon">⚠️</div>
          <div className="a2ui-error-boundary__title">渲染失败</div>
          <div className="a2ui-error-boundary__message">{this.state.error}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===================== 单个组件渲染 =====================

interface RenderComponentProps {
  component: A2UIComponent | A2UILayout;
  onEvent?: A2UIEventHandler;
  darkMode?: boolean;
}

const RenderText: React.FC<{ comp: A2UITextComponent }> = ({ comp }) => (
  <p
    className={`a2ui-text ${comp.className || ''}`}
    style={{
      fontWeight: comp.bold ? 600 : undefined,
      fontStyle: comp.italic ? 'italic' : undefined,
      color: comp.color,
      ...comp.style,
    }}
  >
    {comp.content}
  </p>
);

const RenderHeading: React.FC<{ comp: A2UIHeadingComponent }> = ({ comp }) => {
  const Tag = `h${comp.level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag className={`a2ui-heading a2ui-heading--${comp.level} ${comp.className || ''}`} style={comp.style}>
      {comp.content}
    </Tag>
  );
};

const RenderList: React.FC<{ comp: A2UIListComponent }> = ({ comp }) => {
  const Tag = comp.listType === 'ordered' ? 'ol' : 'ul';
  return (
    <Tag className={`a2ui-list a2ui-list--${comp.listType || 'unordered'} ${comp.className || ''}`} style={comp.style}>
      {comp.items.map((item, index) => (
        <li key={index} className="a2ui-list__item">
          {item}
        </li>
      ))}
    </Tag>
  );
};

const RenderTable: React.FC<{ comp: A2UITableComponent }> = ({ comp }) => (
  <div className={`a2ui-table-wrapper ${comp.className || ''}`} style={comp.style}>
    <table className="a2ui-table">
      <thead>
        <tr>
          {comp.headers.map((header, index) => (
            <th key={index} className="a2ui-table__th">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {comp.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="a2ui-table__tr">
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="a2ui-table__td">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const RenderCard: React.FC<{ comp: A2UICardComponent; onEvent?: A2UIEventHandler; darkMode?: boolean }> = ({
  comp,
  onEvent,
  darkMode,
}) => (
  <div
    className={`a2ui-card ${comp.className || ''}`}
    style={comp.style}
    onClick={() => {
      if (comp.onClick && onEvent) {
        onEvent({
          type: comp.onClick.action,
          componentId: comp.id,
          payload: comp.onClick.payload,
        });
      }
    }}
  >
    {comp.title && <div className="a2ui-card__title">{comp.title}</div>}
    {comp.description && <div className="a2ui-card__description">{comp.description}</div>}
    {comp.children && comp.children.length > 0 && (
      <div className="a2ui-card__children">
        {comp.children.map((child, index) => (
          <RenderComponent key={child.id || index} component={child} onEvent={onEvent} darkMode={darkMode} />
        ))}
      </div>
    )}
  </div>
);

const RenderButton: React.FC<{ comp: A2UIButtonComponent; onEvent?: A2UIEventHandler }> = ({ comp, onEvent }) => (
  <button
    className={`a2ui-button a2ui-button--${comp.variant || 'primary'} a2ui-button--${comp.size || 'md'} ${comp.className || ''}`}
    style={comp.style}
    disabled={comp.disabled}
    onClick={() => {
      if (onEvent) {
        onEvent({
          type: comp.onClick.action,
          componentId: comp.id,
          payload: comp.onClick.payload,
        });
      }
    }}
  >
    {comp.label}
  </button>
);

const RenderInput: React.FC<{ comp: A2UIInputComponent; onEvent?: A2UIEventHandler }> = ({ comp, onEvent }) => {
  const [value, setValue] = useState(comp.value || '');

  useEffect(() => {
    setValue(comp.value || '');
  }, [comp.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    if (comp.onChange && onEvent) {
      onEvent({
        type: comp.onChange.action,
        componentId: comp.id,
        payload: { ...comp.onChange.payload, value: newValue },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && comp.onSubmit && comp.inputType !== 'textarea') {
      e.preventDefault();
      if (onEvent) {
        onEvent({
          type: comp.onSubmit.action,
          componentId: comp.id,
          payload: { ...comp.onSubmit.payload, value },
        });
      }
    }
  };

  return (
    <div className={`a2ui-input-wrapper ${comp.className || ''}`} style={comp.style}>
      {comp.label && <label className="a2ui-input__label">{comp.label}</label>}
      {comp.inputType === 'textarea' ? (
        <textarea
          className="a2ui-input a2ui-input--textarea"
          placeholder={comp.placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <input
          type={comp.inputType || 'text'}
          className="a2ui-input"
          placeholder={comp.placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
};

const RenderProgress: React.FC<{ comp: A2UIProgressComponent }> = ({ comp }) => {
  const max = comp.max || 100;
  const percentage = Math.min(100, Math.max(0, (comp.value / max) * 100));
  return (
    <div className={`a2ui-progress-wrapper ${comp.className || ''}`} style={comp.style}>
      {comp.showLabel && (
        <div className="a2ui-progress__label">
          {comp.label || `${comp.value} / ${max}`}
        </div>
      )}
      <div className={`a2ui-progress a2ui-progress--${comp.variant || 'default'}`}>
        <div className="a2ui-progress__bar" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const RenderChart: React.FC<{ comp: A2UIChartComponent }> = ({ comp }) => {
  const width = comp.width || 400;
  const height = comp.height || 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = comp.datasets.flatMap(d => d.data);
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);
  const valueRange = maxValue - minValue || 1;

  const xStep = comp.labels.length > 1 ? chartWidth / (comp.labels.length - 1) : chartWidth;

  const colors = comp.datasets.map((d, i) => d.color || `hsl(${i * 60}, 70%, 50%)`);

  return (
    <div className={`a2ui-chart-wrapper ${comp.className || ''}`} style={comp.style}>
      {comp.title && <div className="a2ui-chart__title">{comp.title}</div>}
      <svg width={width} height={height} className="a2ui-chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + chartHeight * (1 - ratio);
          const value = minValue + valueRange * ratio;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className="a2ui-chart__grid"
              />
              <text x={padding.left - 5} y={y + 4} textAnchor="end" className="a2ui-chart__y-label">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {comp.labels.map((label, i) => (
          <text
            key={i}
            x={padding.left + i * xStep}
            y={height - padding.bottom + 15}
            textAnchor="middle"
            className="a2ui-chart__x-label"
          >
            {label}
          </text>
        ))}

        {comp.chartType === 'bar' && (
          <g>
            {comp.datasets.map((dataset, datasetIndex) => (
              <g key={datasetIndex}>
                {dataset.data.map((value, i) => {
                  const barWidth = xStep * 0.6 / comp.datasets.length;
                  const x = padding.left + i * xStep - (xStep * 0.3) + datasetIndex * barWidth;
                  const barHeight = ((value - minValue) / valueRange) * chartHeight;
                  const y = padding.top + chartHeight - barHeight;
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill={colors[datasetIndex]}
                      className="a2ui-chart__bar"
                    />
                  );
                })}
              </g>
            ))}
          </g>
        )}

        {comp.chartType === 'line' && (
          <g>
            {comp.datasets.map((dataset, datasetIndex) => {
              const points = dataset.data.map((value, i) => {
                const x = padding.left + i * xStep;
                const y = padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;
                return `${x},${y}`;
              });
              return (
                <polyline
                  key={datasetIndex}
                  points={points.join(' ')}
                  fill="none"
                  stroke={colors[datasetIndex]}
                  strokeWidth={2}
                  className="a2ui-chart__line"
                />
              );
            })}
          </g>
        )}

        <g className="a2ui-chart__legend">
          {comp.datasets.map((dataset, i) => (
            <g key={i} transform={`translate(${padding.left + i * 80}, 5)`}>
              <rect x={0} y={0} width={12} height={12} fill={colors[i]} />
              <text x={16} y={10} className="a2ui-chart__legend-text">
                {dataset.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

const RenderImage: React.FC<{ comp: A2UIImageComponent }> = ({ comp }) => (
  <img
    src={comp.src}
    alt={comp.alt || ''}
    className={`a2ui-image ${comp.rounded ? 'a2ui-image--rounded' : ''} ${comp.className || ''}`}
    style={{
      width: comp.width,
      height: comp.height,
      ...comp.style,
    }}
  />
);

const RenderCode: React.FC<{ comp: A2UICodeComponent }> = ({ comp }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(comp.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [comp.content]);

  const lines = comp.content.split('\n');

  return (
    <div className={`a2ui-code-wrapper ${comp.className || ''}`} style={comp.style}>
      {comp.language && (
        <div className="a2ui-code__header">
          <span className="a2ui-code__language">{comp.language}</span>
          <button className="a2ui-code__copy" onClick={handleCopy}>
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      <pre className="a2ui-code">
        {comp.showLineNumbers ? (
          <code>
            {lines.map((line, index) => (
              <div key={index} className="a2ui-code__line">
                <span className="a2ui-code__line-number">{index + 1}</span>
                <span className="a2ui-code__line-content">{line}</span>
              </div>
            ))}
          </code>
        ) : (
          <code>{comp.content}</code>
        )}
      </pre>
    </div>
  );
};

const RenderDivider: React.FC<{ comp: A2UIDividerComponent }> = ({ comp }) => (
  <hr
    className={`a2ui-divider a2ui-divider--${comp.orientation || 'horizontal'} ${comp.className || ''}`}
    style={comp.style}
  />
);

const RenderTabs: React.FC<{ comp: A2UITabsComponent; onEvent?: A2UIEventHandler; darkMode?: boolean }> = ({
  comp,
  onEvent,
  darkMode,
}) => {
  const [activeKey, setActiveKey] = useState(comp.defaultActiveKey || comp.tabs[0]?.key);

  const activeTab = comp.tabs.find(t => t.key === activeKey);

  return (
    <div className={`a2ui-tabs ${comp.className || ''}`} style={comp.style}>
      <div className="a2ui-tabs__nav">
        {comp.tabs.map(tab => (
          <button
            key={tab.key}
            className={`a2ui-tabs__nav-item ${tab.key === activeKey ? 'a2ui-tabs__nav-item--active' : ''}`}
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="a2ui-tabs__content">
        {activeTab?.children.map((child, index) => (
          <RenderComponent key={child.id || index} component={child} onEvent={onEvent} darkMode={darkMode} />
        ))}
      </div>
    </div>
  );
};

const RenderAlert: React.FC<{ comp: A2UIAlertComponent }> = ({ comp }) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const icons: Record<string, string> = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ',
  };

  return (
    <div className={`a2ui-alert a2ui-alert--${comp.alertType} ${comp.className || ''}`} style={comp.style}>
      <span className="a2ui-alert__icon">{icons[comp.alertType]}</span>
      <div className="a2ui-alert__content">
        {comp.title && <div className="a2ui-alert__title">{comp.title}</div>}
        <div className="a2ui-alert__message">{comp.message}</div>
      </div>
      {comp.closable && (
        <button className="a2ui-alert__close" onClick={() => setVisible(false)}>
          ×
        </button>
      )}
    </div>
  );
};

// ===================== 布局组件渲染 =====================

const RenderRowLayout: React.FC<{ layout: A2UIRowLayout; onEvent?: A2UIEventHandler; darkMode?: boolean }> = ({
  layout,
  onEvent,
  darkMode,
}) => (
  <div
    className={`a2ui-layout a2ui-layout--row ${layout.className || ''}`}
    style={{
      gap: layout.gap,
      alignItems: layout.align,
      justifyContent: layout.justify,
      ...layout.style,
    }}
  >
    {layout.children.map((child, index) => (
      <RenderComponent key={(child as { id?: string }).id || index} component={child} onEvent={onEvent} darkMode={darkMode} />
    ))}
  </div>
);

const RenderColumnLayout: React.FC<{ layout: A2UIColumnLayout; onEvent?: A2UIEventHandler; darkMode?: boolean }> = ({
  layout,
  onEvent,
  darkMode,
}) => (
  <div
    className={`a2ui-layout a2ui-layout--column ${layout.className || ''}`}
    style={{
      gap: layout.gap,
      alignItems: layout.align,
      justifyContent: layout.justify,
      ...layout.style,
    }}
  >
    {layout.children.map((child, index) => (
      <RenderComponent key={(child as { id?: string }).id || index} component={child} onEvent={onEvent} darkMode={darkMode} />
    ))}
  </div>
);

const RenderGridLayout: React.FC<{ layout: A2UIGridLayout; onEvent?: A2UIEventHandler; darkMode?: boolean }> = ({
  layout,
  onEvent,
  darkMode,
}) => (
  <div
    className={`a2ui-layout a2ui-layout--grid ${layout.className || ''}`}
    style={{
      gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`,
      gap: layout.gap,
      rowGap: layout.rowGap,
      columnGap: layout.columnGap,
      ...layout.style,
    }}
  >
    {layout.children.map((child, index) => (
      <RenderComponent key={(child as { id?: string }).id || index} component={child} onEvent={onEvent} darkMode={darkMode} />
    ))}
  </div>
);

// ===================== 通用组件渲染器 =====================

const RenderComponent: React.FC<RenderComponentProps> = ({ component, onEvent, darkMode }) => {
  const comp = component as { type: string };

  if (comp.type === 'row') {
    return <RenderRowLayout layout={component as A2UIRowLayout} onEvent={onEvent} darkMode={darkMode} />;
  }
  if (comp.type === 'column') {
    return <RenderColumnLayout layout={component as A2UIColumnLayout} onEvent={onEvent} darkMode={darkMode} />;
  }
  if (comp.type === 'grid') {
    return <RenderGridLayout layout={component as A2UIGridLayout} onEvent={onEvent} darkMode={darkMode} />;
  }

  switch (comp.type) {
    case 'text':
      return <RenderText comp={component as A2UITextComponent} />;
    case 'heading':
      return <RenderHeading comp={component as A2UIHeadingComponent} />;
    case 'list':
      return <RenderList comp={component as A2UIListComponent} />;
    case 'table':
      return <RenderTable comp={component as A2UITableComponent} />;
    case 'card':
      return <RenderCard comp={component as A2UICardComponent} onEvent={onEvent} darkMode={darkMode} />;
    case 'button':
      return <RenderButton comp={component as A2UIButtonComponent} onEvent={onEvent} />;
    case 'input':
      return <RenderInput comp={component as A2UIInputComponent} onEvent={onEvent} />;
    case 'progress':
      return <RenderProgress comp={component as A2UIProgressComponent} />;
    case 'chart':
      return <RenderChart comp={component as A2UIChartComponent} />;
    case 'image':
      return <RenderImage comp={component as A2UIImageComponent} />;
    case 'code':
      return <RenderCode comp={component as A2UICodeComponent} />;
    case 'divider':
      return <RenderDivider comp={component as A2UIDividerComponent} />;
    case 'tabs':
      return <RenderTabs comp={component as A2UITabsComponent} onEvent={onEvent} darkMode={darkMode} />;
    case 'alert':
      return <RenderAlert comp={component as A2UIAlertComponent} />;
    default:
      return (
        <div className="a2ui-unknown">
          未知组件类型: {(component as { type?: string }).type}
        </div>
      );
  }
};

// ===================== 主组件 =====================

export const A2UIRenderer: React.FC<A2UIRendererProps> = ({ a2uiContent, onEvent, darkMode = false }) => {
  const [parsedContent, setParsedContent] = useState<A2UIComponent | A2UILayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const result = parseA2UIContent(a2uiContent);

    if (result.success && result.content) {
      setParsedContent(result.content);
      setError(null);
    } else {
      setParsedContent(null);
      setError(result.error || '解析失败');
    }

    setIsLoading(false);
  }, [a2uiContent]);

  if (isLoading) {
    return (
      <div className={`a2ui-renderer a2ui-renderer--loading ${darkMode ? 'cdf-dark' : ''}`}>
        <div className="cdf-loading">
          <span className="cdf-spinner" />
          <span>正在解析 A2UI 内容...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`a2ui-renderer a2ui-renderer--error ${darkMode ? 'cdf-dark' : ''}`}>
        <div className="a2ui-error">
          <div className="a2ui-error__icon">⚠️</div>
          <div className="a2ui-error__title">A2UI 解析错误</div>
          <div className="a2ui-error__message">{error}</div>
        </div>
      </div>
    );
  }

  if (!parsedContent) {
    return (
      <div className={`a2ui-renderer a2ui-renderer--empty ${darkMode ? 'cdf-dark' : ''}`}>
        <div className="a2ui-empty">
          <div className="a2ui-empty__icon">📋</div>
          <div className="a2ui-empty__text">暂无 A2UI 内容</div>
        </div>
      </div>
    );
  }

  return (
    <A2UIErrorBoundary darkMode={darkMode}>
      <div className={`a2ui-renderer ${darkMode ? 'cdf-dark' : ''}`}>
        <RenderComponent component={parsedContent} onEvent={onEvent} darkMode={darkMode} />
        <style>{`
          .a2ui-renderer {
            padding: 16px;
            color: var(--cdf-text-primary);
            font-family: var(--cdf-font);
            font-size: 14px;
            line-height: 1.6;
          }

          .a2ui-renderer--loading,
          .a2ui-renderer--error,
          .a2ui-renderer--empty {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 200px;
          }

          .a2ui-error,
          .a2ui-empty {
            text-align: center;
            color: var(--cdf-text-muted);
          }

          .a2ui-error__icon,
          .a2ui-empty__icon {
            font-size: 32px;
            margin-bottom: 12px;
          }

          .a2ui-error__title {
            font-size: 14px;
            font-weight: 600;
            color: var(--cdf-text-secondary);
            margin-bottom: 4px;
          }

          .a2ui-error__message {
            font-size: 12px;
            color: var(--cdf-text-muted);
            max-width: 300px;
            word-break: break-word;
          }

          .a2ui-error-boundary {
            padding: 16px;
            background: rgba(239, 68, 68, 0.05);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 8px;
            text-align: center;
          }

          .a2ui-error-boundary__icon {
            font-size: 24px;
            margin-bottom: 8px;
          }

          .a2ui-error-boundary__title {
            font-size: 13px;
            font-weight: 600;
            color: #ef4444;
            margin-bottom: 4px;
          }

          .a2ui-error-boundary__message {
            font-size: 12px;
            color: var(--cdf-text-muted);
          }

          .a2ui-text {
            margin: 4px 0;
            color: var(--cdf-text-secondary);
          }

          .a2ui-heading {
            margin: 12px 0 6px;
            color: var(--cdf-text-primary);
            font-weight: 600;
            line-height: 1.4;
          }

          .a2ui-heading--1 { font-size: 24px; }
          .a2ui-heading--2 { font-size: 20px; }
          .a2ui-heading--3 { font-size: 18px; }
          .a2ui-heading--4 { font-size: 16px; }
          .a2ui-heading--5 { font-size: 14px; }
          .a2ui-heading--6 { font-size: 13px; }

          .a2ui-list {
            margin: 6px 0;
            padding-left: 20px;
            color: var(--cdf-text-secondary);
          }

          .a2ui-list__item {
            margin: 2px 0;
          }

          .a2ui-table-wrapper {
            margin: 8px 0;
            overflow-x: auto;
          }

          .a2ui-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }

          .a2ui-table__th {
            padding: 8px 12px;
            text-align: left;
            font-weight: 600;
            color: var(--cdf-text-primary);
            background: var(--cdf-bg-hover);
            border-bottom: 1px solid var(--cdf-border);
          }

          .a2ui-table__td {
            padding: 8px 12px;
            color: var(--cdf-text-secondary);
            border-bottom: 1px solid var(--cdf-border-lighter);
          }

          .a2ui-table__tr:hover {
            background: var(--cdf-bg-hover);
          }

          .a2ui-card {
            margin: 8px 0;
            padding: 16px;
            background: var(--cdf-bg-panel);
            border: 1px solid var(--cdf-border);
            border-radius: 12px;
            transition: all 0.15s ease;
          }

          .a2ui-card:hover {
            border-color: var(--cdf-border-darker);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          }

          .a2ui-card__title {
            font-size: 15px;
            font-weight: 600;
            color: var(--cdf-text-primary);
            margin-bottom: 4px;
          }

          .a2ui-card__description {
            font-size: 13px;
            color: var(--cdf-text-muted);
            margin-bottom: 8px;
          }

          .a2ui-card__children {
            margin-top: 8px;
          }

          .a2ui-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            font-family: var(--cdf-font);
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .a2ui-button--sm {
            padding: 4px 10px;
            font-size: 12px;
          }

          .a2ui-button--lg {
            padding: 10px 20px;
            font-size: 14px;
          }

          .a2ui-button--primary {
            background: #f97316;
            color: white;
          }

          .a2ui-button--primary:hover:not(:disabled) {
            background: #ea580c;
          }

          .a2ui-button--secondary {
            background: var(--cdf-bg-hover);
            color: var(--cdf-text-primary);
          }

          .a2ui-button--secondary:hover:not(:disabled) {
            background: var(--cdf-bg-active);
          }

          .a2ui-button--danger {
            background: #ef4444;
            color: white;
          }

          .a2ui-button--danger:hover:not(:disabled) {
            background: #dc2626;
          }

          .a2ui-button--ghost {
            background: transparent;
            color: var(--cdf-text-secondary);
          }

          .a2ui-button--ghost:hover:not(:disabled) {
            background: var(--cdf-bg-hover);
          }

          .a2ui-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .a2ui-input-wrapper {
            margin: 8px 0;
          }

          .a2ui-input__label {
            display: block;
            font-size: 12px;
            font-weight: 500;
            color: var(--cdf-text-secondary);
            margin-bottom: 4px;
          }

          .a2ui-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--cdf-border);
            border-radius: 8px;
            background: var(--cdf-bg-input);
            color: var(--cdf-text-primary);
            font-size: 13px;
            font-family: var(--cdf-font);
            outline: none;
            transition: border-color 0.15s ease;
            box-sizing: border-box;
          }

          .a2ui-input:focus {
            border-color: #f97316;
          }

          .a2ui-input--textarea {
            min-height: 80px;
            resize: vertical;
          }

          .a2ui-progress-wrapper {
            margin: 8px 0;
          }

          .a2ui-progress__label {
            font-size: 12px;
            color: var(--cdf-text-muted);
            margin-bottom: 4px;
          }

          .a2ui-progress {
            height: 8px;
            background: var(--cdf-bg-hover);
            border-radius: 4px;
            overflow: hidden;
          }

          .a2ui-progress__bar {
            height: 100%;
            background: #3b82f6;
            border-radius: 4px;
            transition: width 0.3s ease;
          }

          .a2ui-progress--success .a2ui-progress__bar {
            background: #22c55e;
          }

          .a2ui-progress--warning .a2ui-progress__bar {
            background: #f59e0b;
          }

          .a2ui-progress--error .a2ui-progress__bar {
            background: #ef4444;
          }

          .a2ui-chart-wrapper {
            margin: 8px 0;
          }

          .a2ui-chart__title {
            font-size: 14px;
            font-weight: 600;
            color: var(--cdf-text-primary);
            margin-bottom: 8px;
          }

          .a2ui-chart {
            display: block;
            max-width: 100%;
            height: auto;
          }

          .a2ui-chart__grid {
            stroke: var(--cdf-border);
            stroke-width: 1;
          }

          .a2ui-chart__x-label,
          .a2ui-chart__y-label {
            fill: var(--cdf-text-muted);
            font-size: 11px;
            font-family: var(--cdf-font);
          }

          .a2ui-chart__bar {
            transition: opacity 0.15s ease;
          }

          .a2ui-chart__bar:hover {
            opacity: 0.8;
          }

          .a2ui-chart__line {
            fill: none;
            transition: stroke-width 0.15s ease;
          }

          .a2ui-chart__legend-text {
            fill: var(--cdf-text-secondary);
            font-size: 11px;
            font-family: var(--cdf-font);
          }

          .a2ui-image {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 8px 0;
          }

          .a2ui-image--rounded {
            border-radius: 8px;
          }

          .a2ui-code-wrapper {
            margin: 8px 0;
            border: 1px solid var(--cdf-border);
            border-radius: 8px;
            overflow: hidden;
          }

          .a2ui-code__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px;
            background: var(--cdf-bg-hover);
            border-bottom: 1px solid var(--cdf-border);
          }

          .a2ui-code__language {
            font-size: 11px;
            font-weight: 500;
            color: var(--cdf-text-muted);
            text-transform: uppercase;
          }

          .a2ui-code__copy {
            padding: 2px 8px;
            border: none;
            background: transparent;
            color: var(--cdf-text-muted);
            font-size: 11px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.15s ease;
          }

          .a2ui-code__copy:hover {
            background: var(--cdf-bg-active);
            color: var(--cdf-text-primary);
          }

          .a2ui-code {
            margin: 0;
            padding: 12px;
            background: var(--cdf-code-bg);
            color: var(--cdf-text-primary);
            font-family: var(--cdf-mono);
            font-size: 12px;
            line-height: 1.5;
            overflow-x: auto;
          }

          .a2ui-code__line {
            display: flex;
          }

          .a2ui-code__line-number {
            display: inline-block;
            width: 32px;
            flex-shrink: 0;
            color: var(--cdf-text-disabled);
            text-align: right;
            padding-right: 12px;
            user-select: none;
          }

          .a2ui-code__line-content {
            flex: 1;
          }

          .a2ui-divider {
            border: none;
            margin: 16px 0;
            border-top: 1px solid var(--cdf-border);
          }

          .a2ui-divider--vertical {
            border-top: none;
            border-left: 1px solid var(--cdf-border);
            margin: 0 16px;
            height: auto;
            width: 0;
          }

          .a2ui-tabs {
            margin: 8px 0;
          }

          .a2ui-tabs__nav {
            display: flex;
            gap: 4px;
            border-bottom: 1px solid var(--cdf-border);
            margin-bottom: 12px;
          }

          .a2ui-tabs__nav-item {
            padding: 8px 16px;
            border: none;
            background: transparent;
            color: var(--cdf-text-muted);
            font-size: 13px;
            font-weight: 500;
            font-family: var(--cdf-font);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            transition: all 0.15s ease;
          }

          .a2ui-tabs__nav-item:hover {
            color: var(--cdf-text-primary);
          }

          .a2ui-tabs__nav-item--active {
            color: #f97316;
            border-bottom-color: #f97316;
          }

          .a2ui-tabs__content {
            padding-top: 4px;
          }

          .a2ui-alert {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 8px;
            margin: 8px 0;
          }

          .a2ui-alert__icon {
            font-size: 16px;
            line-height: 1.5;
          }

          .a2ui-alert__content {
            flex: 1;
            min-width: 0;
          }

          .a2ui-alert__title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 2px;
          }

          .a2ui-alert__message {
            font-size: 13px;
            line-height: 1.5;
          }

          .a2ui-alert__close {
            border: none;
            background: transparent;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            opacity: 0.5;
            transition: opacity 0.15s ease;
            padding: 0 4px;
          }

          .a2ui-alert__close:hover {
            opacity: 1;
          }

          .a2ui-alert--success {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            color: #16a34a;
          }

          .a2ui-alert--success .a2ui-alert__title,
          .a2ui-alert--success .a2ui-alert__message {
            color: #16a34a;
          }

          .a2ui-alert--warning {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            color: #d97706;
          }

          .a2ui-alert--warning .a2ui-alert__title,
          .a2ui-alert--warning .a2ui-alert__message {
            color: #d97706;
          }

          .a2ui-alert--error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #dc2626;
          }

          .a2ui-alert--error .a2ui-alert__title,
          .a2ui-alert--error .a2ui-alert__message {
            color: #dc2626;
          }

          .a2ui-alert--info {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            color: #2563eb;
          }

          .a2ui-alert--info .a2ui-alert__title,
          .a2ui-alert--info .a2ui-alert__message {
            color: #2563eb;
          }

          .a2ui-layout {
            display: flex;
          }

          .a2ui-layout--row {
            flex-direction: row;
          }

          .a2ui-layout--column {
            flex-direction: column;
          }

          .a2ui-layout--grid {
            display: grid;
          }

          .a2ui-unknown {
            padding: 8px 12px;
            background: rgba(239, 68, 68, 0.05);
            color: #ef4444;
            border-radius: 6px;
            font-size: 12px;
          }
        `}</style>
      </div>
    </A2UIErrorBoundary>
  );
};

export default A2UIRenderer;

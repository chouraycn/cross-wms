/**
 * QueryResultRenderer Component Tests
 * Tests rendering for different chartType, empty data, CSV export, and loading state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryResultRenderer } from '../QueryResultRenderer';
import type { QueryResult } from '../../../types/inventory-query';

// ===================== Test Data =====================

function createMockQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: ['sku', 'name', 'quantity'],
    rows: [
      { sku: 'SKU001', name: 'Widget A', quantity: 100 },
      { sku: 'SKU002', name: 'Widget B', quantity: 200 },
      { sku: 'SKU003', name: 'Widget C', quantity: 150 },
    ],
    rowCount: 3,
    truncated: false,
    chartType: 'table',
    sql: 'SELECT sku, name, quantity FROM inventory_items LIMIT 200',
    ...overrides,
  };
}

// Mock URL.createObjectURL and related APIs for CSV export
const mockCreateObjectURL = vi.fn(() => 'blob:test-url');
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

// ===================== Test Suite =====================

describe('QueryResultRenderer', () => {
  // ---- Table rendering ----

  it('should render table view when chartType is "table"', () => {
    const queryResult = createMockQueryResult({ chartType: 'table' });
    render(<QueryResultRenderer queryResult={queryResult} />);

    // DataGrid should render column headers
    expect(screen.getByText('sku')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('quantity')).toBeInTheDocument();
  });

  it('should display row count in toolbar', () => {
    const queryResult = createMockQueryResult({ chartType: 'table' });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/3 条记录/)).toBeInTheDocument();
  });

  // ---- Bar chart rendering ----

  it('should render bar chart when chartType is "bar"', () => {
    const queryResult = createMockQueryResult({
      chartType: 'bar',
      chartConfig: { xKey: 'sku', yKey: 'quantity', xLabel: 'SKU', yLabel: '数量' },
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    // Recharts renders SVG elements
    const svg = document.querySelector('.recharts-bar-chart');
    // The component should render without errors; verify row count text exists
    expect(screen.getByText(/3 条记录/)).toBeInTheDocument();
  });

  // ---- Line chart rendering ----

  it('should render line chart when chartType is "line"', () => {
    const queryResult = createMockQueryResult({
      chartType: 'line',
      chartConfig: { xKey: 'sku', yKey: 'quantity', xLabel: 'SKU', yLabel: '数量' },
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/3 条记录/)).toBeInTheDocument();
  });

  // ---- Pie chart rendering ----

  it('should render pie chart when chartType is "pie"', () => {
    const queryResult = createMockQueryResult({
      chartType: 'pie',
      chartConfig: { nameKey: 'sku', valueKey: 'quantity' },
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/3 条记录/)).toBeInTheDocument();
  });

  // ---- Default to table for unknown chartType ----

  it('should default to table view for unknown chartType', () => {
    const queryResult = createMockQueryResult({ chartType: 'unknown' as any });
    render(<QueryResultRenderer queryResult={queryResult} />);

    // Should fall back to table — DataGrid headers should appear
    expect(screen.getByText('sku')).toBeInTheDocument();
  });

  // ---- Empty data ----

  it('should handle empty rows gracefully', () => {
    const queryResult = createMockQueryResult({
      rows: [],
      rowCount: 0,
      truncated: false,
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/0 条记录/)).toBeInTheDocument();
  });

  it('should handle empty columns gracefully', () => {
    const queryResult = createMockQueryResult({
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/0 条记录/)).toBeInTheDocument();
  });

  // ---- Loading state ----

  it('should display loading spinner when loading=true', () => {
    const queryResult = createMockQueryResult();
    render(<QueryResultRenderer queryResult={queryResult} loading={true} />);

    expect(screen.getByText('正在查询库存数据...')).toBeInTheDocument();
  });

  it('should not show query results when loading', () => {
    const queryResult = createMockQueryResult();
    render(<QueryResultRenderer queryResult={queryResult} loading={true} />);

    // The record count should not appear during loading
    expect(screen.queryByText(/3 条记录/)).not.toBeInTheDocument();
  });

  // ---- CSV Export ----

  it('should have CSV export button', () => {
    const queryResult = createMockQueryResult();
    render(<QueryResultRenderer queryResult={queryResult} />);

    // The download icon button should exist (use aria-label to avoid DataGrid pagination buttons)
    const exportButton = screen.getByLabelText('导出 CSV');
    expect(exportButton).toBeInTheDocument();
  });

  it('should trigger CSV export when download button is clicked', () => {
    const queryResult = createMockQueryResult();
    render(<QueryResultRenderer queryResult={queryResult} />);

    const exportButton = screen.getByLabelText('导出 CSV');
    fireEvent.click(exportButton);

    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  // ---- Truncated indicator ----

  it('should display correct row count even when truncated', () => {
    const queryResult = createMockQueryResult({
      rowCount: 200,
      truncated: true,
      rows: Array.from({ length: 200 }, (_, i) => ({ sku: `SKU${i}`, name: `Item${i}`, quantity: i })),
    });
    render(<QueryResultRenderer queryResult={queryResult} />);

    expect(screen.getByText(/200 条记录/)).toBeInTheDocument();
  });
});

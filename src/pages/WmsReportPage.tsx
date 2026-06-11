/**
 * 报表生成页面
 *
 * 提供报表生成表单 + 历史记录查看 + 报表下载。
 * API: POST /api/wms/reports/generate, GET /api/wms/reports, GET /api/wms/reports/:id/download
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import PageHeader from '../components/Common/PageHeader';
import WmsReportGenerator from '../components/wms/WmsReportGenerator';
import { subscribeRefresh } from '../App';
import { useToast } from '../contexts/ToastContext';
import { getApiUrl, getApiBaseUrl } from '../utils/api';
import type { WmsReport, ReportType, FileFormat } from '../types/wms';

const WmsReportPage: React.FC = () => {
  const { showToast } = useToast();

  const [reports, setReports] = useState<WmsReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/wms/reports'));
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setReports(json.data || []);
      } else {
        showToast(json.message || json.error || '获取报表列表失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const unsub = subscribeRefresh('wms-reports', fetchReports);
    return unsub;
  }, [fetchReports]);

  /** 生成报表 */
  const handleGenerate = async (params: {
    reportType: ReportType;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    fileFormat: FileFormat;
  }) => {
    try {
      const res = await fetch(getApiUrl('/api/wms/reports/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (json.code === 0 || json.success) {
        showToast('报表生成成功', 'success');
        fetchReports();
      } else {
        showToast(json.message || json.error || '生成失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  /** 下载报表 */
  const handleDownload = async (report: WmsReport) => {
    if (!report.id) return;
    try {
      // 对于 pywebview 环境尝试使用原生保存对话框
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof window !== 'undefined' && (window as any).pywebview?.api?.save_file) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (window as any).pywebview.api;
        const res = await fetch(getApiUrl(`/api/wms/reports/${report.id}/download`));
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const filename = `report-${report.reportType}-${report.id}.${report.fileFormat}`;
            await api.save_file(filename, base64, 'application/octet-stream');
            } catch (e) {
              console.warn('[WmsReportPage] pywebview save_file failed', e);
            }
          };
          reader.readAsDataURL(blob);
          return;
      }

      // 浏览器环境：直接下载
      const a = document.createElement('a');
      a.href = getApiUrl(`/api/wms/reports/${report.id}/download`);
      a.download = `report-${report.reportType}-${report.id}.${report.fileFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('下载已开始', 'success');
    } catch {
      showToast('下载失败', 'error');
    }
  };

  return (
    <Box>
      <PageHeader
        title="报表生成"
        subtitle="生成入库、出库、库存及自定义数据报表"
        summary={`共 ${reports.length} 条历史记录`}
      />

      <WmsReportGenerator
        reports={reports}
        loading={loading}
        onGenerate={handleGenerate}
        onDownload={handleDownload}
      />
    </Box>
  );
};

export default WmsReportPage;

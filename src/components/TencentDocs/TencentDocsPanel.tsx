import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Snackbar,
  Alert as MuiAlert,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import DescriptionIcon from '@mui/icons-material/Description';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { DocLinkItem, WeComDocLinkItem } from '../../contexts/AppSettingsContext';
import { useNavigate } from 'react-router-dom';
import {
  getAuthStatus,
  getDocContent,
  getSheetContent,
  extractFileIdFromUrl,
  getDocTypeFromUrl,
  docToMarkdown,
  isPyWebView,
  type TDocAuthStatus,
  type SheetRow,
  type SheetCell,
} from '../../services/tencentDocsApi';
import {
  getWeComAuthStatus,
  getWeComDocContent,
  getWeComSmartPageContent,
  getWeComSmartsheetStructure,
  getWeComSmartsheetData,
  extractWeComDocIdFromUrl,
  getWeComDocCategoryFromUrl,
  isWeComDocUrl,
  getWeComCategoryLabel,
  convertWeComSheetToTable,
  type WeComAuthStatus,
  type WeComDocCategory,
  type WeComFieldInfo,
} from '../../services/wecomDocsApi';
import { getWarehouses } from '../../stores/warehouseStore';
import type { Warehouse } from '../../types';

/** 腾讯文档品牌色 */
const TDOC_COLOR = '#27A17C';

/** 企业微信品牌色 */
const WECOM_COLOR = '#07C160';

/** 数据类型显示标签 */
const dataTypeLabels: Record<string, string> = {
  warehouses: '仓库信息',
  inventory: '库存数据',
  transit: '在途运单',
  other: '其他',
};

/** 视图模式 */
type ViewMode = 'list' | 'loading' | 'doc' | 'sheet' | 'error';

/** 文档来源 */
type DocSource = 'personal' | 'enterprise';

const TencentDocsPanel: React.FC = () => {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const docLinks = settings.tencentDocs.docLinks;
  const wecomDocLinks = settings.wecomDocs.docLinks;

  // 仓库列表（用于分组显示）
  const allWarehouses = getWarehouses();

  // 按仓库分组文档
  const getDocsGroupedByWarehouse = (docs: (DocLinkItem | WeComDocLinkItem)[]) => {
    const grouped: Record<string, { warehouseName: string; docs: (DocLinkItem | WeComDocLinkItem)[] }> = {};

    // 全局文档分组
    grouped['__global__'] = { warehouseName: '全局文档', docs: [] };

    // 按仓库分组
    docs.forEach((doc) => {
      const wid = doc.warehouseId;
      if (wid && allWarehouses.find((w) => w.id === wid)) {
        if (!grouped[wid]) {
          const wh = allWarehouses.find((w) => w.id === wid);
          grouped[wid] = { warehouseName: wh?.name || '未知仓库', docs: [] };
        }
        grouped[wid].docs.push(doc);
      } else {
        // 全局文档（无 warehouseId 或 warehouseId 无效）
        grouped['__global__'].docs.push(doc);
      }
    });

    // 转成数组并过滤掉空分组
    return Object.entries(grouped)
      .filter(([, v]) => v.docs.length > 0)
      .sort((a, b) => {
        // 全局文档排最后
        if (a[0] === '__global__') return 1;
        if (b[0] === '__global__') return -1;
        return 0;
      });
  };

  // 在浏览器中打开链接（适配 pywebview / 浏览器两种环境）
  const openInBrowser = useCallback(async (url: string) => {
    if (isPyWebView() && window.pywebview?.api) {
      try {
        await window.pywebview.api.open_in_browser(url);
        return;
      } catch {
        // 降级到 window.open
      }
    }
    window.open(url, '_blank');
  }, []);

  // 列表视图状态
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<TDocAuthStatus | null>(null);

  // 文档查看状态
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeDocTitle, setActiveDocTitle] = useState('');
  const [activeDocType, setActiveDocType] = useState<'doc' | 'sheet' | 'unknown'>('unknown');
  const [activeDocSource, setActiveDocSource] = useState<DocSource>('personal');
  const [docMarkdown, setDocMarkdown] = useState('');
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // 企业文档状态
  const [wecomAuthStatus, setWecomAuthStatus] = useState<WeComAuthStatus | null>(null);
  const [wecomRefreshing, setWecomRefreshing] = useState(false);

  // 缓存 key
  const cacheKey = (docId: string) => `crosswms-doc-cache-${docId}`;

  // 正在刷新的文档 ID（用于每文档刷新按钮的加载动画）
  const [refreshingDocId, setRefreshingDocId] = useState<string | null>(null);
  const [refreshingWecomDocId, setRefreshingWecomDocId] = useState<string | null>(null);

  // Snackbar 消息状态
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  /** 显示 Snackbar */
  const showSnackbar = useCallback((message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  }, []);

  /** 刷新单个腾讯文档 */
  const handleRefreshSingleDoc = useCallback(async (doc: DocLinkItem) => {
    setRefreshingDocId(doc.id);
    try {
      const fileId = extractFileIdFromUrl(doc.url);
      if (!fileId) {
        showSnackbar('无法从链接中提取文档 ID', 'error');
        return;
      }

      const isAuth = await checkAuth();
      if (!isAuth) {
        showSnackbar('尚未完成腾讯文档授权，无法刷新', 'error');
        return;
      }

      const docType = getDocTypeFromUrl(doc.url);
      if (docType === 'sheet') {
        const data = await getSheetContent(fileId, '0', 'A1:Z200');
        if (data?.gridData?.rows) {
          const rows = data.gridData.rows;
          const headers = rows.length > 0
            ? rows[0].values.map((_: SheetCell, i: number) => `列${i + 1}`)
            : [];
          localStorage.setItem(cacheKey(fileId), JSON.stringify({
            type: 'sheet',
            rows,
            headers,
            cachedAt: Date.now(),
          }));
          // 如果当前正在查看这个文档，同步更新显示
          if (activeDocTitle === doc.title && viewMode === 'sheet') {
            setSheetRows(rows);
            setSheetHeaders(headers);
          }
          showSnackbar(`「${doc.title}」已刷新（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`);
        } else {
          showSnackbar(`「${doc.title}」刷新成功（内容为空）`);
        }
      } else {
        const data = await getDocContent(fileId);
        if (data?.document) {
          const markdown = docToMarkdown(data.document);
          localStorage.setItem(cacheKey(fileId), JSON.stringify({
            type: 'doc',
            markdown,
            cachedAt: Date.now(),
          }));
          if (activeDocTitle === doc.title && viewMode === 'doc') {
            setDocMarkdown(markdown);
          }
          showSnackbar(`「${doc.title}」已刷新（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`);
        } else {
          showSnackbar(`「${doc.title}」刷新成功（内容为空）`);
        }
      }
    } catch (err) {
      console.error('刷新文档失败:', err);
      showSnackbar(`刷新「${doc.title}」失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setRefreshingDocId(null);
    }
  }, [activeDocTitle, viewMode, showSnackbar]);

  /** 刷新单个企业微信文档 */
  const handleRefreshSingleWecomDoc = useCallback(async (doc: WeComDocLinkItem) => {
    setRefreshingWecomDocId(doc.id);
    try {
      const docid = extractWeComDocIdFromUrl(doc.url);
      if (!docid) {
        showSnackbar('无法从链接中提取企业文档 ID', 'error');
        return;
      }

      const isAuth = await checkWeComAuth();
      if (!isAuth) {
        showSnackbar('企业微信未授权，无法刷新', 'error');
        return;
      }

      const category = getWeComDocCategoryFromUrl(doc.url);
      const cacheKeyStr = `crosswms-wecom-cache-${docid}`;

      if (category === 'smartpage') {
        const content = await getWeComSmartPageContent(docid);
        localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() }));
        if (activeDocTitle === doc.title && viewMode === 'doc') {
          setDocMarkdown(content || '（文档内容为空）');
        }
        showSnackbar(`「${doc.title}」已刷新（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`);
      } else if (category === 'smartsheet') {
        const structure = await getWeComSmartsheetStructure(docid);
        const sheetList = structure.sheets || [];
        if (sheetList.length > 0) {
          const firstSheet = sheetList[0];
          const fields = structure.fields[firstSheet.sheet_id] || [];
          const data = await getWeComSmartsheetData(docid, firstSheet.sheet_id);
          if (fields.length > 0 && data.records.length > 0) {
            const { headers, rows } = convertWeComSheetToTable(fields, data.records);
            const converted: SheetRow[] = [
              { values: headers.map((h) => ({ cellFormat: {}, cellValue: { text: h }, dataType: 'TEXT' } as SheetCell)) },
              ...rows.map((row) => ({
                values: row.map((cell) => ({ cellFormat: {}, cellValue: { text: cell }, dataType: 'TEXT' } as SheetCell)),
              })),
            ];
            localStorage.setItem(cacheKeyStr, JSON.stringify({ type: 'sheet', rows: converted, headers, cachedAt: Date.now() }));
            if (activeDocTitle === doc.title && viewMode === 'sheet') {
              setSheetHeaders(headers);
              setSheetRows(converted);
            }
            showSnackbar(`「${doc.title}」已刷新（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`);
          } else {
            showSnackbar(`「${doc.title}」刷新成功（无数据）`);
          }
        } else {
          showSnackbar(`「${doc.title}」刷新成功（无子表）`);
        }
      } else {
        const content = await getWeComDocContent(docid, category);
        localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() }));
        if (activeDocTitle === doc.title && viewMode === 'doc') {
          setDocMarkdown(content || '（文档内容为空）');
        }
        showSnackbar(`「${doc.title}」已刷新（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`);
      }
    } catch (err) {
      console.error('刷新企业文档失败:', err);
      showSnackbar(`刷新「${doc.title}」失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setRefreshingWecomDocId(null);
    }
  }, [activeDocTitle, viewMode, showSnackbar]);

  // 检查认证状态
  const checkAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);
      return status.authenticated;
    } catch {
      return false;
    }
  }, []);

  // 刷新按钮（个人文档）
  const handleRefresh = () => {
    setRefreshing(true);
    checkAuth().finally(() => {
      setTimeout(() => {
        setRefreshing(false);
        setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }, 500);
    });
  };

  // 检查企业微信认证状态
  const checkWeComAuth = useCallback(async () => {
    try {
      const status = await getWeComAuthStatus();
      setWecomAuthStatus(status);
      return status.authorized;
    } catch {
      return false;
    }
  }, []);

  // 企业文档刷新按钮
  const handleWecomRefresh = () => {
    setWecomRefreshing(true);
    checkWeComAuth().finally(() => {
      setTimeout(() => setWecomRefreshing(false), 500);
    });
  };

  // 从 URL 提取 fileId
  const getFileId = (url: string): string => {
    const id = extractFileIdFromUrl(url);
    if (!id) {
      // 尝试从 URL path 最后一段提取
      const parts = url.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    }
    return id;
  };

  // 打开文档内容
  const handleOpenDoc = async (docId: string, docTitle: string, docUrl: string) => {
    setViewMode('loading');
    setActiveDocTitle(docTitle);
    setActiveDocSource('personal');
    setErrorMsg('');

    const docType = getDocTypeFromUrl(docUrl);
    setActiveDocType(docType);
    const fileId = getFileId(docUrl);

    if (!fileId) {
      setViewMode('error');
      setErrorMsg('无法从链接中提取文档 ID，请检查链接格式');
      return;
    }

    // 先查 localStorage 缓存
    const cached = localStorage.getItem(cacheKey(fileId));
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.type === 'doc') {
          setDocMarkdown(parsed.markdown);
          setViewMode('doc');
          return;
        }
        if (parsed.type === 'sheet') {
          setSheetRows(parsed.rows);
          setSheetHeaders(parsed.headers);
          setViewMode('sheet');
          return;
        }
      } catch {
        // 缓存损坏，忽略
      }
    }

    try {
      // 先检查认证
      const isAuth = await checkAuth();
      if (!isAuth) {
        setViewMode('error');
        setErrorMsg('尚未完成腾讯文档授权，请在设置中配置 Client ID/Secret 并完成授权');
        return;
      }

      if (docType === 'sheet') {
        // 表格类型 — 需要先获取 sheetInfo 再获取内容
        // 简化处理：直接用默认 sheet ID 尝试
        const data = await getSheetContent(fileId, '0', 'A1:Z200');
        if (data?.gridData?.rows) {
          const rows = data.gridData.rows;
          const headers = rows.length > 0
            ? rows[0].values.map((_: SheetCell, i: number) => `列${i + 1}`)
            : [];
          setSheetRows(rows);
          setSheetHeaders(headers);
          // 缓存
          localStorage.setItem(cacheKey(fileId), JSON.stringify({
            type: 'sheet',
            rows,
            headers,
            cachedAt: Date.now(),
          }));
          setViewMode('sheet');
        } else {
          setViewMode('error');
          setErrorMsg('表格内容为空或格式不匹配');
        }
      } else {
        // 文档类型
        const data = await getDocContent(fileId);
        if (data?.document) {
          const markdown = docToMarkdown(data.document);
          setDocMarkdown(markdown || '（文档内容为空）');
          // 缓存
          localStorage.setItem(cacheKey(fileId), JSON.stringify({
            type: 'doc',
            markdown,
            cachedAt: Date.now(),
          }));
          setViewMode('doc');
        } else {
          setViewMode('error');
          setErrorMsg('文档内容为空或格式不匹配');
        }
      }
    } catch (err) {
      setViewMode('error');
      setErrorMsg(`加载失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleBackToList = () => {
    setViewMode('list');
    setDocMarkdown('');
    setSheetRows([]);
    setSheetHeaders([]);
    setErrorMsg('');
    setActiveDocSource('personal');
  };

  // 打开企业文档
  const handleOpenWeComDoc = async (docId: string, docTitle: string, docUrl: string) => {
    setViewMode('loading');
    setActiveDocTitle(docTitle);
    setActiveDocSource('enterprise');
    setErrorMsg('');

    const docid = extractWeComDocIdFromUrl(docUrl);
    const category = getWeComDocCategoryFromUrl(docUrl);

    if (!docid) {
      setViewMode('error');
      setErrorMsg('无法从链接中提取企业文档 ID，请检查链接格式');
      return;
    }

    // 检查认证
    const cacheKeyStr = `crosswms-wecom-cache-${docid}`;
    const cached = localStorage.getItem(cacheKeyStr);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setDocMarkdown(parsed.markdown);
        setActiveDocType('doc');
        setViewMode('doc');
        return;
      } catch {
        // 缓存损坏
      }
    }

    try {
      const isAuth = await checkWeComAuth();
      if (!isAuth) {
        setViewMode('error');
        setErrorMsg('企业微信未授权，请在终端执行 wecom-cli init 扫码授权');
        return;
      }

      if (category === 'smartpage') {
        // 智能文档 — 导出为 Markdown
        const content = await getWeComSmartPageContent(docid);
        setDocMarkdown(content || '（文档内容为空）');
        setActiveDocType('doc');
        localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() }));
        setViewMode('doc');
      } else if (category === 'smartsheet') {
        // 智能表格 — 获取结构和数据，用 MUI Table 渲染
        const structure = await getWeComSmartsheetStructure(docid);
        const sheetList = structure.sheets || [];
        if (sheetList.length === 0) {
          setViewMode('error');
          setErrorMsg('智能表格中没有子表');
          return;
        }
        const firstSheet = sheetList[0];
        const fields = structure.fields[firstSheet.sheet_id] || [];
        const data = await getWeComSmartsheetData(docid, firstSheet.sheet_id);

        if (fields.length > 0 && data.records.length > 0) {
          const { headers, rows } = convertWeComSheetToTable(fields, data.records);
          setSheetHeaders(headers);
          // 转换为 SheetRow 格式以复用现有渲染
          const converted: SheetRow[] = [
            { values: headers.map((h) => ({ cellFormat: {}, cellValue: { text: h }, dataType: 'TEXT' } as SheetCell)) },
            ...rows.map((row) => ({
              values: row.map((cell) => ({ cellFormat: {}, cellValue: { text: cell }, dataType: 'TEXT' } as SheetCell)),
            })),
          ];
          setSheetRows(converted);
          setActiveDocType('sheet');
          localStorage.setItem(cacheKeyStr, JSON.stringify({
            type: 'sheet',
            rows: converted,
            headers,
            cachedAt: Date.now(),
          }));
          setViewMode('sheet');
        } else {
          // 尝试作为文档读取 Markdown
          const content = await getWeComDocContent(docid, category);
          setDocMarkdown(content || '（文档内容为空）');
          setActiveDocType('doc');
          localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() }));
          setViewMode('doc');
        }
      } else {
        // 普通文档 — get_doc_content 返回 Markdown
        const content = await getWeComDocContent(docid, category);
        setDocMarkdown(content || '（文档内容为空）');
        setActiveDocType('doc');
        localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() }));
        setViewMode('doc');
      }
    } catch (err) {
      setViewMode('error');
      setErrorMsg(`加载失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 渲染单元格内容
  const renderCellValue = (cell: SheetCell): string => {
    if (cell.dataType === 'LOCATION' && cell.cellValue?.location) {
      return cell.cellValue.location.name || '';
    }
    return cell.cellValue?.text ?? '';
  };

  // ==================== 加载中 ====================
  if (viewMode === 'loading') {
    const docColor = activeDocSource === 'enterprise' ? WECOM_COLOR : TDOC_COLOR;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
        <CircularProgress sx={{ color: docColor, mb: 2 }} />
        <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>正在读取文档内容...</Typography>
      </Box>
    );
  }

  // ==================== 错误视图 ====================
  if (viewMode === 'error') {
    const docColor = activeDocSource === 'enterprise' ? WECOM_COLOR : TDOC_COLOR;
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Tooltip title="返回文档列表">
            <IconButton size="small" onClick={handleBackToList} sx={{ color: '#6B7280' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
            {activeDocTitle}
          </Typography>
        </Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMsg}
        </Alert>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={handleBackToList}>
            返回列表
          </Button>
          {docLinks.find(d => d.title === activeDocTitle) && (
            <Button
              variant="contained"
              startIcon={<OpenInNewIcon />}
              onClick={() => openInBrowser(docLinks.find(d => d.title === activeDocTitle)!.url)}
              sx={{ backgroundColor: docColor, '&:hover': { backgroundColor: activeDocSource === 'enterprise' ? '#06a451' : '#1e7a5e' } }}
            >
              在浏览器中打开
            </Button>
          )}
        </Box>
      </Box>
    );
  }

  // ==================== 文档内容视图 ====================
  if (viewMode === 'doc') {
    const docColor = activeDocSource === 'enterprise' ? WECOM_COLOR : TDOC_COLOR;
    const docSourceLabel = activeDocSource === 'enterprise' ? '企业文档' : '个人文档';
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* 顶部工具栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#FAFAFA',
            flexShrink: 0,
          }}
        >
          <Tooltip title="返回文档列表">
            <IconButton size="small" onClick={handleBackToList} sx={{ color: '#6B7280' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ width: 28, height: 28, borderRadius: 1, backgroundColor: docColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <DescriptionIcon sx={{ color: '#fff', fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {activeDocTitle}
          </Typography>
          <Chip label="文档" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: docColor }} />
          <Chip label={docSourceLabel} size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
          <CloudDoneIcon sx={{ fontSize: 16, color: docColor }} titleAccess="已从腾讯文档读取" />
        </Box>

        {/* 文档内容 — Markdown 渲染 */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#FFFFFF' }}>
          <Box sx={{
            maxWidth: 800,
            mx: 'auto',
            '& h1, & h2, & h3, & h4': { mt: 2, mb: 1, color: '#111827' },
            '& h1': { fontSize: '1.5rem', fontWeight: 700 },
            '& h2': { fontSize: '1.25rem', fontWeight: 600 },
            '& h3': { fontSize: '1.1rem', fontWeight: 600 },
            '& p': { mb: 1.5, lineHeight: 1.7, color: '#374151' },
            '& ul, & ol': { mb: 1.5, pl: 3 },
            '& li': { mb: 0.5, lineHeight: 1.6 },
            '& strong': { fontWeight: 600, color: '#111827' },
            '& code': { backgroundColor: '#F3F4F6', px: 0.5, py: 0.25, borderRadius: 0.5, fontSize: '0.875rem' },
            '& blockquote': { borderLeft: `3px solid ${TDOC_COLOR}`, pl: 2, ml: 0, color: '#6B7280' },
            '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 },
            '& th, & td': { border: '1px solid #E5E7EB', p: 1, fontSize: '0.875rem' },
            '& th': { backgroundColor: '#F9FAFB', fontWeight: 600 },
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {docMarkdown}
            </ReactMarkdown>
          </Box>
        </Box>
      </Box>
    );
  }

  // ==================== 表格内容视图 ====================
  if (viewMode === 'sheet') {
    const docColor = activeDocSource === 'enterprise' ? WECOM_COLOR : TDOC_COLOR;
    const docSourceLabel = activeDocSource === 'enterprise' ? '企业文档' : '个人文档';
    // 第一行作为表头
    const headerRow = sheetRows.length > 0 ? sheetRows[0] : null;
    const dataRows = sheetRows.length > 1 ? sheetRows.slice(1) : [];

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* 顶部工具栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#FAFAFA',
            flexShrink: 0,
          }}
        >
          <Tooltip title="返回文档列表">
            <IconButton size="small" onClick={handleBackToList} sx={{ color: '#6B7280' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ width: 28, height: 28, borderRadius: 1, backgroundColor: docColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TableChartIcon sx={{ color: '#fff', fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {activeDocTitle}
          </Typography>
          <Chip label="表格" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: docColor }} />
          <Chip label={docSourceLabel} size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
          <Typography variant="caption" color="text.secondary">
            {dataRows.length} 行
          </Typography>
          <CloudDoneIcon sx={{ fontSize: 16, color: docColor }} titleAccess="已从腾讯文档读取" />
        </Box>

        {/* 表格内容 */}
        <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: '#FFFFFF' }}>
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: '100%' }}>
            <Table size="small" stickyHeader>
              {headerRow && (
                <TableHead>
                  <TableRow>
                    {headerRow.values.map((cell, i) => (
                      <TableCell key={i} sx={{ fontWeight: 600, backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>
                        {renderCellValue(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
              )}
              <TableBody>
                {dataRows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} hover>
                    {row.values.map((cell, colIdx) => (
                      <TableCell key={colIdx} sx={{ whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {renderCellValue(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    );
  }

  // ==================== 列表视图：文档列表 + 企业文档区块 ====================
  return (
    <Box>
      {/* 旋转动画 keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Brand Header */}
      <Card elevation={0} sx={{ border: `2px solid ${TDOC_COLOR}`, borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                backgroundColor: TDOC_COLOR,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DescriptionIcon sx={{ color: '#fff', fontSize: 30 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: TDOC_COLOR }}>
                腾讯文档集成
              </Typography>
              <Typography variant="body2" color="text.secondary">
                本地读取文档内容，无需嵌入网页
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {authStatus && (
                <Chip
                  icon={authStatus.authenticated ? <CloudDoneIcon /> : <CloudOffIcon />}
                  label={authStatus.authenticated ? '已授权' : '未授权'}
                  size="small"
                  sx={{
                    borderColor: authStatus.authenticated ? TDOC_COLOR : '#D1D5DB',
                    color: authStatus.authenticated ? TDOC_COLOR : '#9CA3AF',
                  }}
                  variant="outlined"
                />
              )}
              <Chip
                icon={<LinkIcon />}
                label={`${docLinks.length} 个文档`}
                size="small"
                sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR }}
                variant="outlined"
              />
              <Button
                variant="outlined"
                startIcon={<RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />}
                onClick={handleRefresh}
                disabled={refreshing}
                sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR, '&:hover': { borderColor: '#1e7a5e', backgroundColor: '#f0faf6' } }}
              >
                {refreshing ? '同步中...' : '检查状态'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/settings')}
                sx={{ borderColor: TDOC_COLOR, color: TDOC_COLOR, '&:hover': { borderColor: '#1e7a5e', backgroundColor: '#f0faf6' } }}
              >
                添加链接
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 未授权提示 */}
      {authStatus && !authStatus.authenticated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          腾讯文档尚未授权 — 请在设置中配置 Client ID / Client Secret 并完成 OAuth 授权，才能读取文档内容
        </Alert>
      )}

      {/* No docs linked yet */}
      {docLinks.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <DescriptionIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ color: '#6B7280', fontSize: '0.95rem', mb: 1 }}>
            暂无关联文档
          </Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem', mb: 2 }}>
            在设置中粘贴腾讯文档链接，即可在应用内读取文档内容
          </Typography>
          <Button
            variant="contained"
            startIcon={<SettingsIcon />}
            onClick={() => navigate('/settings')}
            sx={{ backgroundColor: TDOC_COLOR, '&:hover': { backgroundColor: '#1e7a5e' } }}
          >
            前往设置添加文档
          </Button>
        </Box>
      )}

      {/* Document List — 按仓库分组 */}
      {docLinks.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              已关联文档（{docLinks.length} 个）
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {lastSync && (
                <Typography variant="caption" color="text.secondary">
                  上次检查：{lastSync}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">点击文档读取内容</Typography>
            </Box>
          </Box>
          {getDocsGroupedByWarehouse(docLinks as DocLinkItem[]).map(([warehouseId, group]) => (
            <Box key={warehouseId}>
              <Box sx={{ px: 2, py: 1, backgroundColor: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#374151' }}>
                  {group.warehouseName}
                  <Chip label={group.docs.length} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', backgroundColor: '#E5E7EB' }} />
                </Typography>
              </Box>
              <List disablePadding>
                {group.docs.map((doc, idx) => (
                  <React.Fragment key={doc.id}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="在浏览器中打开">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); openInBrowser(doc.url); }}
                              sx={{ color: '#6B7280' }}
                            >
                              <OpenInNewIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="刷新文档内容">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); handleRefreshSingleDoc(doc); }}
                              disabled={refreshingDocId === doc.id}
                              sx={{ color: refreshingDocId === doc.id ? TDOC_COLOR : '#6B7280' }}
                            >
                              <RefreshIcon sx={{ fontSize: 16, animation: refreshingDocId === doc.id ? 'spin 1s linear infinite' : 'none' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemButton
                        sx={{ py: 1.5 }}
                        onClick={() => handleOpenDoc(doc.id, doc.title, doc.url)}
                      >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          {doc.url.includes('/sheet/')
                            ? <TableChartIcon sx={{ color: TDOC_COLOR }} />
                            : <DescriptionIcon sx={{ color: '#111827' }} />}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{doc.title}</Typography>
                              <Chip
                                label={dataTypeLabels[doc.dataType] ?? '其他'}
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                              />
                              <Chip
                                label={getDocTypeFromUrl(doc.url) === 'sheet' ? '表格' : '文档'}
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: TDOC_COLOR }}
                              />
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 300 }}>
                                {doc.url}
                              </Typography>
                              {(() => {
                                const cached = localStorage.getItem(cacheKey(extractFileIdFromUrl(doc.url) || ''));
                                if (cached) {
                                  try {
                                    const parsed = JSON.parse(cached);
                                    if (parsed.cachedAt) {
                                      return (
                                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                          <AccessTimeIcon sx={{ fontSize: 12 }} />
                                          上次更新：{new Date(parsed.cachedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                      );
                                    }
                                  } catch {}
                                }
                                return null;
                              })()}
                            </Box>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {idx < group.docs.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Box>
          ))}
        </Card>
      )}

      {/* ===== 企业文档区块 ===== */}
      <Divider sx={{ my: 3 }} />

      {/* 企业文档品牌卡片 */}
      <Card elevation={0} sx={{ border: `2px solid ${WECOM_COLOR}`, borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                backgroundColor: WECOM_COLOR,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DescriptionIcon sx={{ color: '#fff', fontSize: 30 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: WECOM_COLOR }}>
                企业微信文档
              </Typography>
              <Typography variant="body2" color="text.secondary">
                通过 wecom-cli 读取企业文档内容，本地渲染
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {wecomAuthStatus && (
                <Chip
                  icon={wecomAuthStatus.authorized ? <CloudDoneIcon /> : <CloudOffIcon />}
                  label={!wecomAuthStatus.cliInstalled ? '未安装' : wecomAuthStatus.authorized ? '已授权' : '未授权'}
                  size="small"
                  sx={{
                    borderColor: wecomAuthStatus.authorized ? WECOM_COLOR : '#D1D5DB',
                    color: wecomAuthStatus.authorized ? WECOM_COLOR : '#9CA3AF',
                  }}
                  variant="outlined"
                />
              )}
              <Chip
                icon={<LinkIcon />}
                label={`${wecomDocLinks.length} 个文档`}
                size="small"
                sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR }}
                variant="outlined"
              />
              <Button
                variant="outlined"
                startIcon={<RefreshIcon sx={{ animation: wecomRefreshing ? 'spin 1s linear infinite' : 'none' }} />}
                onClick={handleWecomRefresh}
                disabled={wecomRefreshing}
                sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR, '&:hover': { borderColor: '#06a451', backgroundColor: '#ecfdf5' } }}
              >
                {wecomRefreshing ? '检查中...' : '检查状态'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/settings')}
                sx={{ borderColor: WECOM_COLOR, color: WECOM_COLOR, '&:hover': { borderColor: '#06a451', backgroundColor: '#ecfdf5' } }}
              >
                添加链接
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 企业文档未授权提示 */}
      {wecomAuthStatus && !wecomAuthStatus.cliInstalled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          wecom-cli 未安装 — 请在终端执行 <code>npm install -g @wecom/cli</code> 安装
        </Alert>
      )}
      {wecomAuthStatus && wecomAuthStatus.cliInstalled && !wecomAuthStatus.authorized && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          wecom-cli 未授权 — 请在终端执行 <code>wecom-cli init</code> 扫码授权
        </Alert>
      )}

      {/* No enterprise docs linked yet */}
      {wecomDocLinks.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1.5 }} />
          <Typography sx={{ color: '#6B7280', fontSize: '0.9rem', mb: 0.5 }}>
            暂无企业文档
          </Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
            在设置中添加企业微信文档链接（doc.weixin.qq.com）
          </Typography>
        </Box>
      )}

      {/* Enterprise Document List — 按仓库分组 */}
      {wecomDocLinks.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              企业文档（{wecomDocLinks.length} 个）
            </Typography>
            <Typography variant="caption" color="text.secondary">点击文档读取内容</Typography>
          </Box>
          {getDocsGroupedByWarehouse(wecomDocLinks as WeComDocLinkItem[]).map(([warehouseId, group]) => (
            <Box key={warehouseId}>
              <Box sx={{ px: 2, py: 1, backgroundColor: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#374151' }}>
                  {group.warehouseName}
                  <Chip label={group.docs.length} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', backgroundColor: '#E5E7EB' }} />
                </Typography>
              </Box>
              <List disablePadding>
                {group.docs.map((doc, idx) => {
                  const category = getWeComDocCategoryFromUrl(doc.url);
                  return (
                    <React.Fragment key={doc.id}>
                      <ListItem
                        disablePadding
                        secondaryAction={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Tooltip title="在浏览器中打开">
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); openInBrowser(doc.url); }}
                                sx={{ color: '#6B7280' }}
                              >
                                <OpenInNewIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="刷新文档内容">
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); handleRefreshSingleWecomDoc(doc); }}
                                disabled={refreshingWecomDocId === doc.id}
                                sx={{ color: refreshingWecomDocId === doc.id ? WECOM_COLOR : '#6B7280' }}
                              >
                                <RefreshIcon sx={{ fontSize: 16, animation: refreshingWecomDocId === doc.id ? 'spin 1s linear infinite' : 'none' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        }
                      >
                        <ListItemButton
                          sx={{ py: 1.5 }}
                          onClick={() => handleOpenWeComDoc(doc.id, doc.title, doc.url)}
                        >
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            {category === 'smartpage'
                              ? <DescriptionIcon sx={{ color: WECOM_COLOR }} />
                              : category === 'smartsheet'
                                ? <TableChartIcon sx={{ color: WECOM_COLOR }} />
                                : <DescriptionIcon sx={{ color: '#111827' }} />}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{doc.title}</Typography>
                                <Chip
                                  label={dataTypeLabels[doc.dataType] ?? '其他'}
                                  size="small"
                                  sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                                />
                                <Chip
                                  label={getWeComCategoryLabel(category)}
                                  size="small"
                                  sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#ECFDF5', color: WECOM_COLOR }}
                                />
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 300 }}>
                                  {doc.url}
                                </Typography>
                                {(() => {
                                  const docid = extractWeComDocIdFromUrl(doc.url);
                                  if (docid) {
                                    const cached = localStorage.getItem(`crosswms-wecom-cache-${docid}`);
                                    if (cached) {
                                      try {
                                        const parsed = JSON.parse(cached);
                                        if (parsed.cachedAt) {
                                          return (
                                            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                              <AccessTimeIcon sx={{ fontSize: 12 }} />
                                              上次更新：{new Date(parsed.cachedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </Typography>
                                          );
                                        }
                                      } catch {}
                                    }
                                  }
                                  return null;
                                })()}
                              </Box>
                            }
                          />
                        </ListItemButton>
                      </ListItem>
                      {idx < group.docs.length - 1 && <Divider />}
                    </React.Fragment>
                  );
                })}
              </List>
            </Box>
          ))}
        </Card>
      )}
      {/* Snackbar 消息提示 */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MuiAlert severity={snackbarSeverity} sx={{ width: '100%' }} onClose={() => setSnackbarOpen(false)}>
          {snackbarMessage}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
};

export default TencentDocsPanel;

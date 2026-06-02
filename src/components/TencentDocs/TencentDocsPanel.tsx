import React, { useState, useCallback } from 'react';
import { Box, Snackbar, Alert as MuiAlert } from '@mui/material';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { DocLinkItem, WeComDocLinkItem } from '../../contexts/AppSettingsContext';
import {
  getAuthStatus, getDocContent, getSheetContent, extractFileIdFromUrl,
  getDocTypeFromUrl, docToMarkdown, isPyWebView,
  type TDocAuthStatus, type SheetRow, type SheetCell,
} from '../../services/tencentDocsApi';
import {
  getWeComAuthStatus, getWeComDocContent, getWeComSmartPageContent,
  getWeComSmartsheetStructure, getWeComSmartsheetData,
  extractWeComDocIdFromUrl, getWeComDocCategoryFromUrl,
  convertWeComSheetToTable, type WeComAuthStatus,
} from '../../services/wecomDocsApi';
import AuthStatusSection from './AuthStatusSection';
import DocContentViewer from './DocContentViewer';
import DocLinkManager from './DocLinkManager';

type ViewMode = 'list' | 'loading' | 'doc' | 'sheet' | 'error';
type DocSource = 'personal' | 'enterprise';

const TencentDocsPanel: React.FC = () => {
  const { settings } = useAppSettings();
  const docLinks = settings.tencentDocs.docLinks;
  const wecomDocLinks = settings.wecomDocs.docLinks;

  // 认证状态
  const [authStatus, setAuthStatus] = useState<TDocAuthStatus | null>(null);
  const [wecomAuthStatus, setWecomAuthStatus] = useState<WeComAuthStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wecomRefreshing, setWecomRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // 文档查看状态
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeDocTitle, setActiveDocTitle] = useState('');
  const [activeDocSource, setActiveDocSource] = useState<DocSource>('personal');
  const [docMarkdown, setDocMarkdown] = useState('');
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // 刷新按钮状态
  const [refreshingDocId, setRefreshingDocId] = useState<string | null>(null);
  const [refreshingWecomDocId, setRefreshingWecomDocId] = useState<string | null>(null);

  // Snackbar
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const showSnackbar = useCallback((message: string, severity: 'success' | 'error' = 'success') => { setSnackbarMessage(message); setSnackbarSeverity(severity); setSnackbarOpen(true); }, []);

  const cacheKey = (docId: string) => `crosswms-doc-cache-${docId}`;

  const openInBrowser = useCallback(async (url: string) => {
    if (isPyWebView() && window.pywebview?.api) { try { await window.pywebview.api.open_in_browser(url); return; } catch { /* 降级 */ } }
    window.open(url, '_blank');
  }, []);

  // === 认证检查 ===
  const checkAuth = useCallback(async () => { try { const s = await getAuthStatus(); setAuthStatus(s); return s.authenticated; } catch { return false; } }, []);
  const checkWeComAuth = useCallback(async () => { try { const s = await getWeComAuthStatus(); setWecomAuthStatus(s); return s.authorized; } catch { return false; } }, []);
  const handleRefresh = () => { setRefreshing(true); checkAuth().finally(() => { setTimeout(() => { setRefreshing(false); setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); }, 500); }); };
  const handleWecomRefresh = () => { setWecomRefreshing(true); checkWeComAuth().finally(() => { setTimeout(() => setWecomRefreshing(false), 500); }); };

  // === 返回列表 ===
  const handleBackToList = () => { setViewMode('list'); setDocMarkdown(''); setSheetRows([]); setSheetHeaders([]); setErrorMsg(''); setActiveDocSource('personal'); };

  // === 打开个人文档 ===
  const handleOpenDoc = useCallback(async (docId: string, docTitle: string, docUrl: string) => {
    setViewMode('loading'); setActiveDocTitle(docTitle); setActiveDocSource('personal'); setErrorMsg('');
    const docType = getDocTypeFromUrl(docUrl); const fileId = extractFileIdFromUrl(docUrl) || '';
    if (!fileId) { setViewMode('error'); setErrorMsg('无法从链接中提取文档 ID，请检查链接格式'); return; }
    const cached = localStorage.getItem(cacheKey(fileId));
    if (cached) { try { const p = JSON.parse(cached); if (p.type === 'doc') { setDocMarkdown(p.markdown); setViewMode('doc'); return; } if (p.type === 'sheet') { setSheetRows(p.rows); setSheetHeaders(p.headers); setViewMode('sheet'); return; } } catch { /* ignore */ } }
    try {
      const isAuth = await checkAuth(); if (!isAuth) { setViewMode('error'); setErrorMsg('尚未完成腾讯文档授权'); return; }
      if (docType === 'sheet') {
        const data = await getSheetContent(fileId, '0', 'A1:Z200');
        if (data?.gridData?.rows) { const rows = data.gridData.rows; const headers = rows.length > 0 ? rows[0].values.map((_: SheetCell, i: number) => `列${i + 1}`) : []; setSheetRows(rows); setSheetHeaders(headers); localStorage.setItem(cacheKey(fileId), JSON.stringify({ type: 'sheet', rows, headers, cachedAt: Date.now() })); setViewMode('sheet'); }
        else { setViewMode('error'); setErrorMsg('表格内容为空或格式不匹配'); }
      } else {
        const data = await getDocContent(fileId);
        if (data?.document) { const markdown = docToMarkdown(data.document); setDocMarkdown(markdown || '（文档内容为空）'); localStorage.setItem(cacheKey(fileId), JSON.stringify({ type: 'doc', markdown, cachedAt: Date.now() })); setViewMode('doc'); }
        else { setViewMode('error'); setErrorMsg('文档内容为空或格式不匹配'); }
      }
    } catch (err) { setViewMode('error'); setErrorMsg(`加载失败：${err instanceof Error ? err.message : '未知错误'}`); }
  }, [checkAuth]);

  // === 打开企业文档 ===
  const handleOpenWeComDoc = useCallback(async (docId: string, docTitle: string, docUrl: string) => {
    setViewMode('loading'); setActiveDocTitle(docTitle); setActiveDocSource('enterprise'); setErrorMsg('');
    const docid = extractWeComDocIdFromUrl(docUrl); const category = getWeComDocCategoryFromUrl(docUrl);
    if (!docid) { setViewMode('error'); setErrorMsg('无法从链接中提取企业文档 ID'); return; }
    const cacheKeyStr = `crosswms-wecom-cache-${docid}`;
    const cached = localStorage.getItem(cacheKeyStr);
    if (cached) { try { const p = JSON.parse(cached); setDocMarkdown(p.markdown); setViewMode('doc'); return; } catch { /* ignore */ } }
    try {
      const isAuth = await checkWeComAuth(); if (!isAuth) { setViewMode('error'); setErrorMsg('企业微信未授权'); return; }
      if (category === 'smartpage') { const content = await getWeComSmartPageContent(docid); setDocMarkdown(content || '（文档内容为空）'); localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() })); setViewMode('doc'); }
      else if (category === 'smartsheet') {
        const structure = await getWeComSmartsheetStructure(docid); const sheetList = structure.sheets || [];
        if (sheetList.length === 0) { setViewMode('error'); setErrorMsg('智能表格中没有子表'); return; }
        const firstSheet = sheetList[0]; const fields = structure.fields[firstSheet.sheet_id] || []; const data = await getWeComSmartsheetData(docid, firstSheet.sheet_id);
        if (fields.length > 0 && data.records.length > 0) { const { headers, rows } = convertWeComSheetToTable(fields, data.records); const converted: SheetRow[] = [{ values: headers.map((h) => ({ cellFormat: {}, cellValue: { text: h }, dataType: 'TEXT' } as SheetCell)) }, ...rows.map((row) => ({ values: row.map((cell) => ({ cellFormat: {}, cellValue: { text: cell }, dataType: 'TEXT' } as SheetCell)) }))]; setSheetRows(converted); setSheetHeaders(headers); localStorage.setItem(cacheKeyStr, JSON.stringify({ type: 'sheet', rows: converted, headers, cachedAt: Date.now() })); setViewMode('sheet'); }
        else { const content = await getWeComDocContent(docid, category); setDocMarkdown(content || '（文档内容为空）'); localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() })); setViewMode('doc'); }
      } else { const content = await getWeComDocContent(docid, category); setDocMarkdown(content || '（文档内容为空）'); localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() })); setViewMode('doc'); }
    } catch (err) { setViewMode('error'); setErrorMsg(`加载失败：${err instanceof Error ? err.message : '未知错误'}`); }
  }, [checkWeComAuth]);

  // === 刷新单个个人文档 ===
  const handleRefreshSingleDoc = useCallback(async (doc: DocLinkItem) => {
    setRefreshingDocId(doc.id);
    try {
      const fileId = extractFileIdFromUrl(doc.url); if (!fileId) { showSnackbar('无法从链接中提取文档 ID', 'error'); return; }
      const isAuth = await checkAuth(); if (!isAuth) { showSnackbar('尚未完成腾讯文档授权，无法刷新', 'error'); return; }
      const docType = getDocTypeFromUrl(doc.url);
      if (docType === 'sheet') {
        const data = await getSheetContent(fileId, '0', 'A1:Z200');
        if (data?.gridData?.rows) { const rows = data.gridData.rows; const headers = rows.length > 0 ? rows[0].values.map((_: SheetCell, i: number) => `列${i + 1}`) : []; localStorage.setItem(cacheKey(fileId), JSON.stringify({ type: 'sheet', rows, headers, cachedAt: Date.now() })); if (activeDocTitle === doc.title && viewMode === 'sheet') { setSheetRows(rows); setSheetHeaders(headers); } showSnackbar(`「${doc.title}」已刷新`); }
        else { showSnackbar(`「${doc.title}」刷新成功（内容为空）`); }
      } else {
        const data = await getDocContent(fileId);
        if (data?.document) { const markdown = docToMarkdown(data.document); localStorage.setItem(cacheKey(fileId), JSON.stringify({ type: 'doc', markdown, cachedAt: Date.now() })); if (activeDocTitle === doc.title && viewMode === 'doc') { setDocMarkdown(markdown); } showSnackbar(`「${doc.title}」已刷新`); }
        else { showSnackbar(`「${doc.title}」刷新成功（内容为空）`); }
      }
    } catch (err) { showSnackbar(`刷新「${doc.title}」失败：${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setRefreshingDocId(null); }
  }, [activeDocTitle, viewMode, showSnackbar, checkAuth]);

  // === 刷新单个企业文档 ===
  const handleRefreshSingleWecomDoc = useCallback(async (doc: WeComDocLinkItem) => {
    setRefreshingWecomDocId(doc.id);
    try {
      const docid = extractWeComDocIdFromUrl(doc.url); if (!docid) { showSnackbar('无法从链接中提取企业文档 ID', 'error'); return; }
      const isAuth = await checkWeComAuth(); if (!isAuth) { showSnackbar('企业微信未授权，无法刷新', 'error'); return; }
      const category = getWeComDocCategoryFromUrl(doc.url); const cacheKeyStr = `crosswms-wecom-cache-${docid}`;
      if (category === 'smartpage') { const content = await getWeComSmartPageContent(docid); localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() })); if (activeDocTitle === doc.title && viewMode === 'doc') { setDocMarkdown(content || '（文档内容为空）'); } showSnackbar(`「${doc.title}」已刷新`); }
      else if (category === 'smartsheet') { const structure = await getWeComSmartsheetStructure(docid); const sheetList = structure.sheets || []; if (sheetList.length > 0) { const firstSheet = sheetList[0]; const fields = structure.fields[firstSheet.sheet_id] || []; const data = await getWeComSmartsheetData(docid, firstSheet.sheet_id); if (fields.length > 0 && data.records.length > 0) { const { headers, rows } = convertWeComSheetToTable(fields, data.records); const converted: SheetRow[] = [{ values: headers.map((h) => ({ cellFormat: {}, cellValue: { text: h }, dataType: 'TEXT' } as SheetCell)) }, ...rows.map((row) => ({ values: row.map((cell) => ({ cellFormat: {}, cellValue: { text: cell }, dataType: 'TEXT' } as SheetCell)) }))]; localStorage.setItem(cacheKeyStr, JSON.stringify({ type: 'sheet', rows: converted, headers, cachedAt: Date.now() })); if (activeDocTitle === doc.title && viewMode === 'sheet') { setSheetHeaders(headers); setSheetRows(converted); } showSnackbar(`「${doc.title}」已刷新`); } else { showSnackbar(`「${doc.title}」刷新成功（无数据）`); } } else { showSnackbar(`「${doc.title}」刷新成功（无子表）`); } }
      else { const content = await getWeComDocContent(docid, category); localStorage.setItem(cacheKeyStr, JSON.stringify({ markdown: content, cachedAt: Date.now() })); if (activeDocTitle === doc.title && viewMode === 'doc') { setDocMarkdown(content || '（文档内容为空）'); } showSnackbar(`「${doc.title}」已刷新`); }
    } catch (err) { showSnackbar(`刷新「${doc.title}」失败：${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setRefreshingWecomDocId(null); }
  }, [activeDocTitle, viewMode, showSnackbar, checkWeComAuth]);

  // === 内容视图 ===
  if (viewMode !== 'list') {
    const openBrowserUrl = viewMode === 'error' ? (docLinks.find(d => d.title === activeDocTitle)?.url || wecomDocLinks.find(d => d.title === activeDocTitle)?.url) : undefined;
    return (
      <DocContentViewer viewMode={viewMode} activeDocTitle={activeDocTitle} activeDocSource={activeDocSource} docMarkdown={docMarkdown} sheetRows={sheetRows} sheetHeaders={sheetHeaders} errorMsg={errorMsg} onBackToList={handleBackToList} onOpenInBrowser={openBrowserUrl ? () => openInBrowser(openBrowserUrl) : undefined} />
    );
  }

  // === 列表视图 ===
  return (
    <Box>
      <AuthStatusSection authStatus={authStatus} wecomAuthStatus={wecomAuthStatus} refreshing={refreshing} wecomRefreshing={wecomRefreshing} lastSync={lastSync} docCount={docLinks.length} wecomDocCount={wecomDocLinks.length} onRefresh={handleRefresh} onWecomRefresh={handleWecomRefresh} />
      <DocLinkManager docLinks={docLinks} wecomDocLinks={wecomDocLinks} lastSync={lastSync} refreshingDocId={refreshingDocId} refreshingWecomDocId={refreshingWecomDocId} cacheKeyFn={cacheKey} onOpenDoc={handleOpenDoc} onOpenWeComDoc={handleOpenWeComDoc} onRefreshSingleDoc={handleRefreshSingleDoc} onRefreshSingleWecomDoc={handleRefreshSingleWecomDoc} onOpenInBrowser={openInBrowser} />
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <MuiAlert severity={snackbarSeverity} sx={{ width: '100%' }} onClose={() => setSnackbarOpen(false)}>{snackbarMessage}</MuiAlert>
      </Snackbar>
    </Box>
  );
};

export default TencentDocsPanel;

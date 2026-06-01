import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Alert,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import DescriptionIcon from '@mui/icons-material/Description';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import EditIcon from '@mui/icons-material/Edit';
import type { AppSettings, DocLinkItem, WeComDocLinkItem, OnlineDataEntry } from '../../../contexts/AppSettingsContext';
import { getAuthStatus, getAuthUrl, exchangeToken, refreshToken, isPyWebView, getDocContent, extractFileIdFromUrl, extractTextFromDoc, type TDocAuthStatus } from '../../../services/tencentDocsApi';
import { getWeComAuthStatus, getWeComDocContent, getWeComSmartPageContent, isWeComDocUrl, getWeComDocCategoryFromUrl, getWeComCategoryLabel, extractWeComDocIdFromUrl, type WeComAuthStatus } from '../../../services/wecomDocsApi';
import { getWarehouses } from '../../../stores/warehouseStore';
import type { Warehouse } from '../../../types';
import { switchSx, textFieldSx } from '../sharedStyles';

// ===================== Props =====================

export interface TencentDocsTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  openInBrowser: (url: string) => void;
  onShowSnackbar: (msg: string) => void;
}

// ===================== Component =====================

const TencentDocsTab: React.FC<TencentDocsTabProps> = ({
  draft,
  setDraft,
  errors,
  setErrors,
  openInBrowser,
  onShowSnackbar,
}) => {
  const allWarehouses: Warehouse[] = getWarehouses();

  const getWarehouseName = useCallback((id?: string): string => {
    if (!id) return '全局';
    const w = allWarehouses.find((wh) => wh.id === id);
    return w ? w.name : '未知仓库';
  }, [allWarehouses]);

  // ---- 腾讯文档 OAuth 状态 ----
  const [tdocAuth, setTdocAuth] = useState<TDocAuthStatus | null>(null);
  const [tdocClientId, setTdocClientId] = useState('');
  const [tdocClientSecret, setTdocClientSecret] = useState('');
  const [tdocAuthCode, setTdocAuthCode] = useState('');
  const [tdocAuthLoading, setTdocAuthLoading] = useState(false);
  const [tdocAuthMsg, setTdocAuthMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [fetchingTdocTitle, setFetchingTdocTitle] = useState(false);

  // ---- 企业微信文档状态 ----
  const [wecomAuth, setWecomAuth] = useState<WeComAuthStatus | null>(null);
  const [wecomAuthLoading, setWecomAuthLoading] = useState(false);
  const [fetchingWecomTitle, setFetchingWecomTitle] = useState(false);
  const [newWecomLinkUrl, setNewWecomLinkUrl] = useState('');
  const [newWecomLinkTitle, setNewWecomLinkTitle] = useState('');
  const [newWecomLinkDataType, setNewWecomLinkDataType] = useState<WeComDocLinkItem['dataType']>('inventory');
  const [newWecomLinkWarehouseId, setNewWecomLinkWarehouseId] = useState<string>('');
  const [wecomLinkErrors, setWecomLinkErrors] = useState<Record<string, string>>({});

  // ---- 腾讯文档链接表单状态 ----
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkDataType, setNewLinkDataType] = useState<DocLinkItem['dataType']>('inventory');
  const [newLinkWarehouseId, setNewLinkWarehouseId] = useState<string>('');

  // ---- 在线数据输入状态 ----
  const [newDataName, setNewDataName] = useState('');
  const [newDataContent, setNewDataContent] = useState('');
  const [newDataDataType, setNewDataDataType] = useState<OnlineDataEntry['dataType']>('warehouses');
  const [editingDataId, setEditingDataId] = useState<string | null>(null);

  // ---- OAuth handlers ----

  const checkTdocAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setTdocAuth(status);
      setTdocClientId(status.clientId || '');
    } catch {
      setTdocAuth({ authenticated: false, hasToken: false, isExpired: true, clientId: '' });
    }
  }, []);

  useState(() => { checkTdocAuth(); });

  const handleTdocAuth = useCallback(async () => {
    if (!tdocClientId || !tdocClientSecret) {
      setTdocAuthMsg({ type: 'error', text: '请填写 Client ID 和 Client Secret' });
      return;
    }
    setTdocAuthLoading(true);
    setTdocAuthMsg(null);
    try {
      const { auth_url } = await getAuthUrl(tdocClientId, tdocClientSecret);
      openInBrowser(auth_url);
      setTdocAuthMsg({ type: 'info', text: '已打开授权页面，请在浏览器中完成授权后，将授权码粘贴到下方' });
    } catch (err) {
      setTdocAuthMsg({ type: 'error', text: `生成授权链接失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setTdocAuthLoading(false);
    }
  }, [tdocClientId, tdocClientSecret, openInBrowser]);

  const handleTdocExchange = useCallback(async () => {
    if (!tdocAuthCode) { setTdocAuthMsg({ type: 'error', text: '请输入授权码' }); return; }
    setTdocAuthLoading(true);
    try {
      const result = await exchangeToken(tdocAuthCode);
      if (result.ok) {
        setTdocAuthMsg({ type: 'success', text: `授权成功！Token 有效期 ${Math.round((result.expires_in ?? 0) / 86400)} 天` });
        setTdocAuthCode('');
        await checkTdocAuth();
      } else {
        setTdocAuthMsg({ type: 'error', text: `授权失败：${result.error || '未知错误'}` });
      }
    } catch (err) {
      setTdocAuthMsg({ type: 'error', text: `换取 Token 失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setTdocAuthLoading(false);
    }
  }, [tdocAuthCode, checkTdocAuth]);

  const handleTdocRefresh = useCallback(async () => {
    setTdocAuthLoading(true);
    try {
      const result = await refreshToken();
      if (result.ok) { setTdocAuthMsg({ type: 'success', text: 'Token 刷新成功' }); await checkTdocAuth(); }
      else { setTdocAuthMsg({ type: 'error', text: `刷新失败：${result.error || '未知错误'}` }); }
    } catch (err) {
      setTdocAuthMsg({ type: 'error', text: `刷新失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally { setTdocAuthLoading(false); }
  }, [checkTdocAuth]);

  // ---- 腾讯文档链接操作 ----

  const isValidDocUrl = (url: string): boolean =>
    /^https?:\/\/docs\.qq\.com\/(sheet|doc)\/[A-Za-z0-9]+/.test(url.trim());

  const extractDocId = (url: string): string => {
    const match = url.match(/docs\.qq\.com\/(sheet|doc)\/([A-Za-z0-9]+)/);
    return match ? match[2] : '';
  };

  const handleTencentLinkPaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted || !/^https?:\/\/docs\.qq\.com\//.test(pasted)) return;
    e.preventDefault();
    setNewLinkUrl(pasted);
    if (pasted.includes('/sheet/')) setNewLinkDataType('inventory');
    else setNewLinkDataType('other');
    setErrors((prev) => { const n = { ...prev }; delete n['docLink.url']; return n; });
    const docId = extractDocId(pasted);
    if (docId) setNewLinkTitle(`腾讯文档 ${docId.slice(0, 8)}`);
    if (tdocAuth?.authenticated) {
      setFetchingTdocTitle(true);
      try {
        const fileId = extractFileIdFromUrl(pasted);
        if (fileId) {
          const data = await getDocContent(fileId);
          const fullText = extractTextFromDoc(data.document);
          const firstLine = fullText.trim().split('\n')[0];
          if (firstLine && firstLine.length > 0) setNewLinkTitle(firstLine.replace(/^#\s*/, '').slice(0, 100));
        }
      } catch { /* keep default title */ } finally { setFetchingTdocTitle(false); }
    }
  }, [tdocAuth?.authenticated, setErrors]);

  const handleAddLink = useCallback(() => {
    const url = newLinkUrl.trim();
    if (!url) { setErrors((e) => ({ ...e, 'docLink.url': '请输入文档链接' })); return; }
    if (!isValidDocUrl(url)) { setErrors((e) => ({ ...e, 'docLink.url': '请输入有效的腾讯文档链接（如 https://docs.qq.com/sheet/...）' })); return; }
    if (draft.tencentDocs.docLinks.some((d) => d.url === url)) { setErrors((e) => ({ ...e, 'docLink.url': '该文档链接已存在' })); return; }
    const newLink: DocLinkItem = { id: `link-${Date.now()}`, url, title: newLinkTitle.trim() || `腾讯文档 ${extractDocId(url).slice(0, 6)}`, dataType: newLinkDataType, warehouseId: newLinkWarehouseId || undefined };
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: [...prev.tencentDocs.docLinks, newLink] } }));
    setNewLinkUrl(''); setNewLinkTitle(''); setNewLinkDataType('inventory'); setNewLinkWarehouseId('');
    setErrors((e) => { const n = { ...e }; delete n['docLink.url']; return n; });
  }, [newLinkUrl, newLinkTitle, newLinkDataType, newLinkWarehouseId, draft.tencentDocs.docLinks, setDraft, setErrors]);

  const handleRemoveLink = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: prev.tencentDocs.docLinks.filter((d) => d.id !== id) } }));
  }, [setDraft]);

  const updateDocLink = useCallback(<K extends keyof DocLinkItem>(id: string, key: K, value: DocLinkItem[K]) => {
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: prev.tencentDocs.docLinks.map((d) => d.id === id ? { ...d, [key]: value } : d) } }));
  }, [setDraft]);

  // ---- 企业微信文档操作 ----

  const checkWecomAuth = useCallback(async () => {
    try { const status = await getWeComAuthStatus(); setWecomAuth(status); }
    catch { setWecomAuth({ cliInstalled: false, authorized: false, checkedAt: Date.now() / 1000 }); }
  }, []);

  useEffect(() => { checkWecomAuth(); }, [checkWecomAuth]);

  const handleWecomLinkPaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted || !/^https?:\/\/doc\.weixin\.qq\.com\//.test(pasted)) return;
    e.preventDefault();
    setNewWecomLinkUrl(pasted);
    const category = getWeComDocCategoryFromUrl(pasted);
    setNewWecomLinkDataType(category === 'smartsheet' ? 'inventory' : 'other');
    setWecomLinkErrors((prev) => { const n = { ...prev }; delete n['wecomLink.url']; return n; });
    const docId = extractWeComDocIdFromUrl(pasted);
    if (docId) setNewWecomLinkTitle(`企业文档 ${docId.slice(0, 8)}`);
    if (wecomAuth?.authorized && docId) {
      setFetchingWecomTitle(true);
      try {
        if (category === 'smartpage') {
          const content = await getWeComSmartPageContent(docId);
          if (content) { const cleanTitle = content.trim().split('\n')[0].replace(/^#\s*/, '').trim(); if (cleanTitle) setNewWecomLinkTitle(cleanTitle); }
        } else {
          const content = await getWeComDocContent(docId, category);
          if (content) { const cleanTitle = content.trim().split('\n')[0].replace(/^#\s*/, '').trim(); if (cleanTitle) setNewWecomLinkTitle(cleanTitle); }
        }
      } catch { /* keep default title */ } finally { setFetchingWecomTitle(false); }
    }
  }, [wecomAuth?.authorized]);

  const handleAddWecomLink = useCallback(() => {
    const url = newWecomLinkUrl.trim();
    if (!url) { setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '请输入文档链接' })); return; }
    if (!isWeComDocUrl(url)) { setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '请输入有效的企业微信文档链接（如 https://doc.weixin.qq.com/doc/...）' })); return; }
    if (draft.wecomDocs?.docLinks?.some((d) => d.url === url)) { setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '该文档链接已存在' })); return; }
    const newLink: WeComDocLinkItem = { id: `wecom-${Date.now()}`, url, title: newWecomLinkTitle.trim() || `企业文档 ${extractWeComDocIdFromUrl(url).slice(0, 6)}`, dataType: newWecomLinkDataType, warehouseId: newWecomLinkWarehouseId || undefined };
    setDraft((prev) => ({ ...prev, wecomDocs: { docLinks: [...(prev.wecomDocs?.docLinks ?? []), newLink] } }));
    setNewWecomLinkUrl(''); setNewWecomLinkTitle(''); setNewWecomLinkDataType('inventory'); setNewWecomLinkWarehouseId('');
    setWecomLinkErrors({});
  }, [newWecomLinkUrl, newWecomLinkTitle, newWecomLinkDataType, newWecomLinkWarehouseId, draft.wecomDocs?.docLinks, setDraft]);

  const handleRemoveWecomLink = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, wecomDocs: { docLinks: (prev.wecomDocs?.docLinks ?? []).filter((d) => d.id !== id) } }));
  }, [setDraft]);

  const updateWeComDocLink = useCallback(<K extends keyof WeComDocLinkItem>(id: string, key: K, value: WeComDocLinkItem[K]) => {
    setDraft((prev) => ({ ...prev, wecomDocs: { docLinks: (prev.wecomDocs?.docLinks ?? []).map((d) => d.id === id ? { ...d, [key]: value } : d) } }));
  }, [setDraft]);

  // ---- 在线数据操作 ----

  const handleAddData = useCallback(() => {
    if (!newDataName.trim()) { setErrors((e) => ({ ...e, 'onlineData.name': '请输入数据名称' })); return; }
    if (!newDataContent.trim()) { setErrors((e) => ({ ...e, 'onlineData.data': '请输入数据内容' })); return; }
    try { JSON.parse(newDataContent); } catch { setErrors((e) => ({ ...e, 'onlineData.data': '数据内容必须是有效的JSON格式' })); return; }
    const newEntry: OnlineDataEntry = { id: `data-${Date.now()}`, name: newDataName.trim(), dataType: newDataDataType, data: newDataContent.trim(), updatedAt: new Date().toISOString() };
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, onlineData: [...prev.tencentDocs.onlineData, newEntry] } }));
    setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, [newDataName, newDataContent, newDataDataType, setDraft, setErrors]);

  const handleRemoveData = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, onlineData: prev.tencentDocs.onlineData.filter((d) => d.id !== id) } }));
  }, [setDraft]);

  const handleEditData = useCallback((entry: OnlineDataEntry) => {
    setEditingDataId(entry.id); setNewDataName(entry.name); setNewDataDataType(entry.dataType); setNewDataContent(entry.data);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!newDataName.trim()) { setErrors((e) => ({ ...e, 'onlineData.name': '请输入数据名称' })); return; }
    if (!newDataContent.trim()) { setErrors((e) => ({ ...e, 'onlineData.data': '请输入数据内容' })); return; }
    try { JSON.parse(newDataContent); } catch { setErrors((e) => ({ ...e, 'onlineData.data': '数据内容必须是有效的JSON格式' })); return; }
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, onlineData: prev.tencentDocs.onlineData.map((d) => d.id === editingDataId ? { ...d, name: newDataName.trim(), dataType: newDataDataType, data: newDataContent.trim(), updatedAt: new Date().toISOString() } : d) } }));
    setEditingDataId(null); setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, [newDataName, newDataContent, newDataDataType, editingDataId, setDraft, setErrors]);

  const handleCancelEdit = useCallback(() => {
    setEditingDataId(null); setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, [setErrors]);

  // ---- Render ----

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 560 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>腾讯文档集成</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>配置腾讯文档 API 后，可直接在应用内读取文档内容（不嵌入网页）。所有数据本地渲染。</Typography>

      {/* OAuth */}
      <Card elevation={0} sx={{ border: `1px solid ${tdocAuth?.authenticated ? '#27A17C' : '#E5E7EB'}`, borderRadius: 2, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          {tdocAuth?.authenticated ? <CloudDoneIcon sx={{ color: '#27A17C', fontSize: 20 }} /> : <CloudOffIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>API 授权状态</Typography>
          <Chip label={tdocAuth?.authenticated ? '已授权' : '未授权'} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: tdocAuth?.authenticated ? '#E8F5E9' : '#FEF2F2', color: tdocAuth?.authenticated ? '#27A17C' : '#EF4444' }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField label="Client ID" size="small" fullWidth placeholder="在 docs.qq.com/open/developers 注册应用获取" value={tdocClientId} onChange={(e) => setTdocClientId(e.target.value)} sx={textFieldSx} InputProps={{ startAdornment: <InputAdornment position="start"><VpnKeyIcon sx={{ fontSize: 16, color: '#9CA3AF' }} /></InputAdornment> }} />
          <TextField label="Client Secret" size="small" fullWidth type="password" placeholder="应用的密钥" value={tdocClientSecret} onChange={(e) => setTdocClientSecret(e.target.value)} sx={textFieldSx} />
          {tdocAuth?.authenticated ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button variant="outlined" size="small" onClick={handleTdocRefresh} disabled={tdocAuthLoading} sx={{ borderColor: '#27A17C', color: '#27A17C', '&:hover': { borderColor: '#1e7a5e' }, fontSize: '0.8rem' }}>{tdocAuthLoading ? '刷新中...' : '刷新 Token'}</Button>
              <Typography variant="caption" color="text.secondary">Token 有效期 30 天，到期前需刷新</Typography>
            </Box>
          ) : (
            <>
              <Button variant="contained" size="small" onClick={handleTdocAuth} disabled={tdocAuthLoading || !tdocClientId || !tdocClientSecret} sx={{ backgroundColor: '#27A17C', '&:hover': { backgroundColor: '#1e7a5e' }, fontSize: '0.8rem', alignSelf: 'flex-start' }}>{tdocAuthLoading ? '处理中...' : '发起 OAuth 授权'}</Button>
              <TextField label="授权码（Authorization Code）" size="small" fullWidth placeholder="在浏览器完成授权后，将 URL 中的 code 参数粘贴到此处" value={tdocAuthCode} onChange={(e) => setTdocAuthCode(e.target.value)} sx={textFieldSx} />
              <Button variant="outlined" size="small" onClick={handleTdocExchange} disabled={tdocAuthLoading || !tdocAuthCode} sx={{ borderColor: '#111827', color: '#111827', fontSize: '0.8rem', alignSelf: 'flex-start' }}>用授权码换取 Token</Button>
            </>
          )}
          {tdocAuthMsg && <Alert severity={tdocAuthMsg.type} sx={{ py: 0, fontSize: '0.8rem' }}>{tdocAuthMsg.text}</Alert>}
        </Box>
      </Card>

      <Divider />

      {/* 文档链接管理 */}
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>文档链接管理</Typography>
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>添加文档链接</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField label="文档链接" size="small" fullWidth placeholder="https://docs.qq.com/sheet/DZVJnQmJ4a3F2bWN5" value={newLinkUrl} onChange={(e) => { setNewLinkUrl(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['docLink.url']; return n; }); }} onPaste={handleTencentLinkPaste} InputProps={{ startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} /></InputAdornment> }} sx={textFieldSx} error={Boolean(errors['docLink.url'])} helperText={errors['docLink.url'] || '粘贴链接后自动识别并填充表单'} FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: '#9CA3AF' } }} />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField label="文档名称（选填）" size="small" sx={{ flex: 1, ...textFieldSx }} value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} placeholder="自动从链接解析" InputProps={{ endAdornment: fetchingTdocTitle ? <InputAdornment position="end"><Box component="span" sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>获取中...</Box></InputAdornment> : undefined }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select value={newLinkDataType} label="数据类型" onChange={(e) => setNewLinkDataType(e.target.value as DocLinkItem['dataType'])} sx={{ fontSize: '0.875rem' }}>
                <MenuItem value="inventory">库存数据</MenuItem><MenuItem value="transit">在途运单</MenuItem><MenuItem value="warehouses">仓库信息</MenuItem><MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>关联仓库</InputLabel>
              <Select value={newLinkWarehouseId} label="关联仓库" onChange={(e) => setNewLinkWarehouseId(e.target.value)} displayEmpty sx={{ fontSize: '0.875rem' }}>
                <MenuItem value="">全局（不关联）</MenuItem>
                {allWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddLink} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 40, whiteSpace: 'nowrap' }}>添加</Button>
          </Box>
        </Box>
      </Card>

      {draft.tencentDocs.docLinks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 36, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>暂无文档链接，请在上方添加</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {draft.tencentDocs.docLinks.map((doc) => (
            <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, overflow: 'visible' }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: 1, backgroundColor: '#27A17C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DescriptionIcon sx={{ color: '#fff', fontSize: 18 }} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</Typography>
                      <Chip label={doc.dataType === 'inventory' ? '库存' : doc.dataType === 'transit' ? '在途' : doc.dataType === 'warehouses' ? '仓库' : '其他'} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
                      {doc.warehouseId && <Chip label={getWarehouseName(doc.warehouseId)} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#DBEAFE', color: '#3B82F6' }} />}
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.url}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={() => openInBrowser(doc.url)} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    <Tooltip title="删除链接"><IconButton size="small" onClick={() => handleRemoveLink(doc.id)} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, ml: 5 }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>数据类型</InputLabel>
                    <Select value={doc.dataType} label="数据类型" onChange={(e) => updateDocLink(doc.id, 'dataType', e.target.value as DocLinkItem['dataType'])} sx={{ fontSize: '0.8rem' }}>
                      <MenuItem value="inventory">库存数据</MenuItem><MenuItem value="transit">在途运单</MenuItem><MenuItem value="warehouses">仓库信息</MenuItem><MenuItem value="other">其他</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>关联仓库</InputLabel>
                    <Select value={doc.warehouseId ?? ''} label="关联仓库" onChange={(e) => updateDocLink(doc.id, 'warehouseId' as keyof DocLinkItem, (e.target.value || undefined) as DocLinkItem[keyof DocLinkItem])} displayEmpty sx={{ fontSize: '0.8rem' }}>
                      <MenuItem value="">全局</MenuItem>
                      {allWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 1 }}>完成 API 授权后，点击文档即可在应用内读取内容（本地渲染，不嵌入网页）。也可点击浏览器图标在默认浏览器中编辑。</Alert>

      <Divider sx={{ my: 3 }} />

      {/* 在线数据输入 */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>在线数据输入</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>支持直接输入 JSON 格式数据，用于仪表盘实时展示。无需腾讯文档 API 授权即可使用。</Typography>
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>{editingDataId ? '编辑数据' : '添加数据'}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField label="数据名称" size="small" fullWidth placeholder="例如：深圳仓库存数据" value={newDataName} onChange={(e) => { setNewDataName(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['onlineData.name']; return n; }); }} sx={textFieldSx} error={Boolean(errors['onlineData.name'])} helperText={errors['onlineData.name']} />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select value={newDataDataType} label="数据类型" onChange={(e) => setNewDataDataType(e.target.value as OnlineDataEntry['dataType'])} sx={{ fontSize: '0.875rem' }}>
                <MenuItem value="warehouses">仓库信息</MenuItem><MenuItem value="inventory">库存数据</MenuItem><MenuItem value="transit">在途运单</MenuItem><MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            {editingDataId ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveEdit} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 40, whiteSpace: 'nowrap' }}>保存</Button>
                <Button variant="outlined" onClick={handleCancelEdit} sx={{ height: 40, whiteSpace: 'nowrap' }}>取消</Button>
              </Box>
            ) : (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddData} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 40, whiteSpace: 'nowrap' }}>添加</Button>
            )}
          </Box>
          <TextField label="数据内容（JSON格式）" size="small" fullWidth multiline rows={6} placeholder='例如：[{"id":"wh001","name":"深圳仓","usedItems":8500,"totalItems":10000}]' value={newDataContent} onChange={(e) => { setNewDataContent(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['onlineData.data']; return n; }); }} sx={{ ...textFieldSx, '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: '0.8rem' } }} error={Boolean(errors['onlineData.data'])} helperText={errors['onlineData.data']} />
        </Box>
      </Card>

      {draft.tencentDocs.onlineData.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <CodeIcon sx={{ fontSize: 36, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>暂无在线数据，请在上方添加</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {draft.tencentDocs.onlineData.map((entry) => (
            <Card key={entry.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: 1, backgroundColor: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CodeIcon sx={{ color: '#fff', fontSize: 18 }} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</Typography>
                      <Chip label={entry.dataType === 'inventory' ? '库存' : entry.dataType === 'transit' ? '在途' : entry.dataType === 'warehouses' ? '仓库' : '其他'} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>更新：{new Date(entry.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{' · '}{(() => { try { const p = JSON.parse(entry.data); return Array.isArray(p) ? p.length : 1; } catch { return 0; } })()} 条记录</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="编辑"><IconButton size="small" onClick={() => handleEditData(entry)} sx={{ color: '#6B7280' }}><EditIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="删除"><IconButton size="small" onClick={() => handleRemoveData(entry.id)} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* 企业微信文档 */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>企业微信文档</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>通过 wecom-cli 读取企业微信文档（doc.weixin.qq.com），支持文档、智能表格、智能文档</Typography>

      <Card elevation={0} sx={{ border: `1px solid ${wecomAuth?.authorized ? '#07C160' : '#E5E7EB'}`, borderRadius: 2, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          {wecomAuth?.authorized ? <CloudDoneIcon sx={{ color: '#07C160', fontSize: 20 }} /> : <CloudOffIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>企业微信授权状态</Typography>
          <Chip label={!wecomAuth?.cliInstalled ? 'CLI 未安装' : wecomAuth?.authorized ? '已授权' : '未授权'} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: wecomAuth?.authorized ? '#E8F5E9' : '#FEF2F2', color: wecomAuth?.authorized ? '#07C160' : '#EF4444' }} />
        </Box>
        {!wecomAuth?.cliInstalled ? (
          <Alert severity="info" sx={{ fontSize: '0.8rem', mb: 1 }}>未检测到 wecom-cli，请在终端执行 <code>npm install -g @wecom/cli</code> 安装</Alert>
        ) : !wecomAuth?.authorized ? (
          <Alert severity="warning" sx={{ fontSize: '0.8rem', mb: 1 }}>请在终端执行 <code>wecom-cli init</code> 扫码授权</Alert>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button variant="outlined" size="small" onClick={() => checkWecomAuth()} disabled={wecomAuthLoading} sx={{ borderColor: '#07C160', color: '#07C160', '&:hover': { borderColor: '#06a451' }, fontSize: '0.8rem' }}>{wecomAuthLoading ? '检查中...' : '重新检查'}</Button>
            <Typography variant="caption" color="text.secondary">已授权，可以读取企业文档内容</Typography>
          </Box>
        )}
      </Card>

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>企业文档链接</Typography>

      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2, mt: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>添加企业文档链接</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField label="文档链接" size="small" fullWidth placeholder="https://doc.weixin.qq.com/doc/e3_xxxxxxxx" value={newWecomLinkUrl} onChange={(e) => { setNewWecomLinkUrl(e.target.value); setWecomLinkErrors((prev) => { const n = { ...prev }; delete n['wecomLink.url']; return n; }); }} onPaste={handleWecomLinkPaste} InputProps={{ startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} /></InputAdornment> }} sx={textFieldSx} error={Boolean(wecomLinkErrors['wecomLink.url'])} helperText={wecomLinkErrors['wecomLink.url'] || '粘贴链接后自动识别并填充表单'} FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: '#9CA3AF' } }} />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField label="文档名称（选填）" size="small" sx={{ flex: 1, ...textFieldSx }} value={newWecomLinkTitle} onChange={(e) => setNewWecomLinkTitle(e.target.value)} placeholder="自动从链接解析" InputProps={{ endAdornment: fetchingWecomTitle ? <InputAdornment position="end"><Box component="span" sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>获取中...</Box></InputAdornment> : undefined }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select value={newWecomLinkDataType} label="数据类型" onChange={(e) => setNewWecomLinkDataType(e.target.value as WeComDocLinkItem['dataType'])} sx={{ fontSize: '0.875rem' }}>
                <MenuItem value="inventory">库存数据</MenuItem><MenuItem value="transit">在途运单</MenuItem><MenuItem value="warehouses">仓库信息</MenuItem><MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>关联仓库</InputLabel>
              <Select value={newWecomLinkWarehouseId} label="关联仓库" onChange={(e) => setNewWecomLinkWarehouseId(e.target.value)} displayEmpty sx={{ fontSize: '0.875rem' }}>
                <MenuItem value="">全局（不关联）</MenuItem>
                {allWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWecomLink} sx={{ backgroundColor: '#07C160', '&:hover': { backgroundColor: '#06a451' }, height: 40, whiteSpace: 'nowrap' }}>添加</Button>
          </Box>
        </Box>
      </Card>

      {(draft.wecomDocs?.docLinks ?? []).length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, border: '1px dashed #E5E7EB', borderRadius: 2, mt: 1.5 }}>
          <DescriptionIcon sx={{ fontSize: 32, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>暂无企业文档链接，请在上方添加</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
          {(draft.wecomDocs?.docLinks ?? []).map((doc) => {
            const cat = getWeComDocCategoryFromUrl(doc.url);
            return (
              <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, overflow: 'visible' }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: 1, backgroundColor: '#07C160', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DescriptionIcon sx={{ color: '#fff', fontSize: 18 }} /></Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</Typography>
                        <Chip label={doc.dataType === 'inventory' ? '库存' : doc.dataType === 'transit' ? '在途' : doc.dataType === 'warehouses' ? '仓库' : '其他'} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
                        <Chip label={getWeComCategoryLabel(cat)} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#ECFDF5', color: '#07C160' }} />
                        {doc.warehouseId && <Chip label={getWarehouseName(doc.warehouseId)} size="small" sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#DBEAFE', color: '#3B82F6' }} />}
                      </Box>
                      <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.url}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={() => openInBrowser(doc.url)} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      <Tooltip title="删除链接"><IconButton size="small" onClick={() => handleRemoveWecomLink(doc.id)} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, ml: 5 }}>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel sx={{ fontSize: '0.75rem' }}>关联仓库</InputLabel>
                      <Select value={doc.warehouseId ?? ''} label="关联仓库" onChange={(e) => updateWeComDocLink(doc.id, 'warehouseId' as keyof WeComDocLinkItem, (e.target.value || undefined) as WeComDocLinkItem[keyof WeComDocLinkItem])} displayEmpty sx={{ fontSize: '0.8rem' }}>
                        <MenuItem value="">全局</MenuItem>
                        {allWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
      <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem' }}>企业文档通过 wecom-cli 读取，需先在终端完成授权。支持文档、智能表格、智能文档三种品类。</Alert>
    </Box>
  );
};

export default TencentDocsTab;

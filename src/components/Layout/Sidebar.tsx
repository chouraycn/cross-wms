import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Tooltip,
  IconButton,
  Dialog,
  Grow,
  Card,
  CardContent,
  Chip,
  TextField,
  Button,
  Alert,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  InputAdornment,
  Snackbar,
} from '@mui/material';
// 线性（Outlined）图标
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InfoIcon from '@mui/icons-material/Info';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftOutlinedIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import EditIcon from '@mui/icons-material/Edit';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings, DashboardConfig, DashboardVisibility, DocLinkItem, OnlineDataEntry, SidebarConfig, HeatmapConfig } from '../../contexts/AppSettingsContext';
import { getAuthStatus, getAuthUrl, exchangeToken, refreshToken, isPyWebView, type TDocAuthStatus } from '../../services/tencentDocsApi';

// 从 package.json 自动读取版本号（Vite 环境变量注入）
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

// ===================== Settings Panel Types & Data =====================

type SettingsTab = 'menu' | 'tencentDocs' | 'tencentDocs_volumeDocs' | 'dashboardCalc' | 'dashboardIndicators' | 'about';

interface SettingsMenuItem {
  key: Exclude<SettingsTab, 'menu'>;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  { key: 'tencentDocs', label: '腾讯文档', icon: <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />, description: 'API 授权与文档链接管理' },
  { key: 'dashboardCalc', label: '仪表盘参数', icon: <DashboardIcon sx={{ fontSize: 20 }} />, description: '计算阈值和参数调整' },
  { key: 'dashboardIndicators', label: '指标控制', icon: <TuneIcon sx={{ fontSize: 20 }} />, description: '各模块显示与隐藏' },
  { key: 'about', label: '关于', icon: <InfoIcon sx={{ fontSize: 20 }} />, description: '系统信息与版本' },
];

// ===================== Shared Styles =====================

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
};

// ===================== Settings Panel Component =====================

const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 520;

interface SettingsPanelProps {
  onClose?: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { settings, updateSettings, resetSettings } = useAppSettings();

  const openInBrowser = useCallback(async (url: string) => {
    if (isPyWebView() && window.pywebview?.api) {
      try { await window.pywebview.api.open_in_browser(url); return; } catch { /* 降级 */ }
    }
    window.open(url, '_blank');
  }, []);

  const [activeTab, setActiveTab] = useState<SettingsTab>('menu');
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // 同步 settings → draft（当设置保存后，刷新界面显示）
  useEffect(() => {
    setDraft((prev) => {
      // 仅当 tencentDocs 确实变化时才更新，避免无限循环
      if (prev.tencentDocs !== settings.tencentDocs) {
        return { ...prev, tencentDocs: { ...settings.tencentDocs } };
      }
      return prev;
    });
  }, [settings.tencentDocs]);

  // 新链接表单
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkDataType, setNewLinkDataType] = useState<DocLinkItem['dataType']>('inventory');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 在线数据表单
  const [newDataName, setNewDataName] = useState('');
  const [newDataDataType, setNewDataDataType] = useState<OnlineDataEntry['dataType']>('warehouses');
  const [newDataContent, setNewDataContent] = useState('');
  const [editingDataId, setEditingDataId] = useState<string | null>(null);

  // 腾讯文档 OAuth 状态
  const [tdocAuth, setTdocAuth] = useState<TDocAuthStatus | null>(null);
  const [tdocClientId, setTdocClientId] = useState('');
  const [tdocClientSecret, setTdocClientSecret] = useState('');
  const [tdocAuthCode, setTdocAuthCode] = useState('');
  const [tdocAuthLoading, setTdocAuthLoading] = useState(false);
  const [tdocAuthMsg, setTdocAuthMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const checkTdocAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setTdocAuth(status);
      setTdocClientId(status.clientId || '');
    } catch {
      setTdocAuth({ authenticated: false, hasToken: false, isExpired: true, clientId: '' });
    }
  }, []);

  useEffect(() => { checkTdocAuth(); }, [checkTdocAuth]);

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
      setTdocAuthMsg({ type: 'info', text: '已打开授权页面，请在浏览器中完成授权后粘贴授权码' });
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
        setTdocAuthMsg({ type: 'success', text: `授权成功！` });
        setTdocAuthCode('');
        await checkTdocAuth();
      } else {
        setTdocAuthMsg({ type: 'error', text: `授权失败：${result.error || '未知错误'}` });
      }
    } catch (err) {
      setTdocAuthMsg({ type: 'error', text: `换取 Token 失败` });
    } finally {
      setTdocAuthLoading(false);
    }
  }, [tdocAuthCode, checkTdocAuth]);

  const handleTdocRefresh = useCallback(async () => {
    setTdocAuthLoading(true);
    try {
      const result = await refreshToken();
      if (result.ok) { setTdocAuthMsg({ type: 'success', text: 'Token 刷新成功' }); await checkTdocAuth(); }
      else { setTdocAuthMsg({ type: 'error', text: `刷新失败` }); }
    } catch { setTdocAuthMsg({ type: 'error', text: '刷新失败' }); }
    finally { setTdocAuthLoading(false); }
  }, [checkTdocAuth]);

  const isValidDocUrl = (url: string) => /^https?:\/\/docs\.qq\.com\/(sheet|doc)\/[A-Za-z0-9]+/.test(url.trim());
  const extractDocId = (url: string) => { const m = url.match(/docs\.qq\.com\/(sheet|doc)\/([A-Za-z0-9]+)/); return m ? m[2] : ''; };

  const handleAddLink = useCallback(() => {
    const url = newLinkUrl.trim();
    if (!url) { setErrors((e) => ({ ...e, 'docLink.url': '请输入文档链接' })); return; }
    if (!isValidDocUrl(url)) { setErrors((e) => ({ ...e, 'docLink.url': '请输入有效的腾讯文档链接' })); return; }
    if (draft.tencentDocs.docLinks.some((d) => d.url === url)) { setErrors((e) => ({ ...e, 'docLink.url': '该文档链接已存在' })); return; }
    const newLink: DocLinkItem = { id: `link-${Date.now()}`, url, title: newLinkTitle.trim() || `腾讯文档 ${extractDocId(url).slice(0, 6)}`, dataType: newLinkDataType };
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: [...prev.tencentDocs.docLinks, newLink] } }));
    setNewLinkUrl(''); setNewLinkTitle(''); setNewLinkDataType('inventory');
    setErrors((e) => { const n = { ...e }; delete n['docLink.url']; return n; });
  }, [newLinkUrl, newLinkTitle, newLinkDataType, draft.tencentDocs.docLinks]);

  const handleRemoveLink = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: prev.tencentDocs.docLinks.filter((d) => d.id !== id) } }));
  }, []);

  // ===================== 在线数据操作 =====================

  const handleAddData = useCallback(() => {
    if (!newDataName.trim()) { setErrors((e) => ({ ...e, 'onlineData.name': '请输入数据名称' })); return; }
    if (!newDataContent.trim()) { setErrors((e) => ({ ...e, 'onlineData.data': '请输入数据内容' })); return; }
    // 验证JSON格式
    try { JSON.parse(newDataContent); } catch {
      setErrors((e) => ({ ...e, 'onlineData.data': '数据内容必须是有效的JSON格式' })); return;
    }
    const newEntry: OnlineDataEntry = {
      id: `data-${Date.now()}`,
      name: newDataName.trim(),
      dataType: newDataDataType,
      data: newDataContent.trim(),
      updatedAt: new Date().toISOString(),
    };
    setDraft((prev) => ({
      ...prev,
      tencentDocs: { ...prev.tencentDocs, onlineData: [...prev.tencentDocs.onlineData, newEntry] },
    }));
    setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, [newDataName, newDataContent, newDataDataType]);

  const handleRemoveData = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      tencentDocs: { ...prev.tencentDocs, onlineData: prev.tencentDocs.onlineData.filter((d) => d.id !== id) },
    }));
  }, []);

  const handleEditData = useCallback((entry: OnlineDataEntry) => {
    setEditingDataId(entry.id);
    setNewDataName(entry.name);
    setNewDataDataType(entry.dataType);
    setNewDataContent(entry.data);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!newDataName.trim()) { setErrors((e) => ({ ...e, 'onlineData.name': '请输入数据名称' })); return; }
    if (!newDataContent.trim()) { setErrors((e) => ({ ...e, 'onlineData.data': '请输入数据内容' })); return; }
    try { JSON.parse(newDataContent); } catch {
      setErrors((e) => ({ ...e, 'onlineData.data': '数据内容必须是有效的JSON格式' })); return;
    }
    setDraft((prev) => ({
      ...prev,
      tencentDocs: {
        ...prev.tencentDocs,
        onlineData: prev.tencentDocs.onlineData.map((d) =>
          d.id === editingDataId ? { ...d, name: newDataName.trim(), dataType: newDataDataType, data: newDataContent.trim(), updatedAt: new Date().toISOString() } : d
        ),
      },
    }));
    setEditingDataId(null); setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, [newDataName, newDataContent, newDataDataType, editingDataId]);

  const handleCancelEdit = useCallback(() => {
    setEditingDataId(null); setNewDataName(''); setNewDataContent(''); setNewDataDataType('warehouses');
    setErrors((e) => { const n = { ...e }; delete n['onlineData.name']; delete n['onlineData.data']; return n; });
  }, []);

  const updateDocLink = useCallback(<K extends keyof DocLinkItem>(id: string, key: K, value: DocLinkItem[K]) => {
    setDraft((prev) => ({ ...prev, tencentDocs: { ...prev.tencentDocs, docLinks: prev.tencentDocs.docLinks.map((d) => d.id === id ? { ...d, [key]: value } : d) } }));
  }, []);

  const updateDashboard = useCallback(<K extends keyof DashboardConfig>(key: K, value: DashboardConfig[K]) => {
    setDraft((prev) => {
      const next = { ...prev, dashboard: { ...prev.dashboard, [key]: value } };
      if (key === 'fullThreshold' && typeof value === 'number' && value <= prev.dashboard.warningThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' }));
      } else if (key === 'warningThreshold' && typeof value === 'number' && value >= prev.dashboard.fullThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.warningThreshold': '预警线必须小于满仓线' }));
      } else {
        setErrors((e) => { const n = { ...e }; delete n['dashboard.fullThreshold']; delete n['dashboard.warningThreshold']; return n; });
      }
      return next;
    });
  }, []);

  const updateVisibility = useCallback(<K extends keyof DashboardVisibility>(key: K, value: DashboardVisibility[K]) => {
    setDraft((prev) => ({ ...prev, dashboard: { ...prev.dashboard, visibility: { ...prev.dashboard.visibility, [key]: value } } }));
  }, []);

  const updateSidebar = useCallback(<K extends keyof SidebarConfig>(key: K, value: SidebarConfig[K]) => {
    setDraft((prev) => ({ ...prev, sidebar: { ...prev.sidebar, [key]: value } }));
  }, []);

  const updateHeatmap = useCallback(<K extends keyof HeatmapConfig>(key: K, value: HeatmapConfig[K]) => {
    setDraft((prev) => ({ ...prev, dashboard: { ...prev.dashboard, heatmap: { ...prev.dashboard.heatmap, [key]: value } } }));
  }, []);

  const handleSave = () => {
    if (draft.dashboard.fullThreshold <= draft.dashboard.warningThreshold) {
      setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' })); return;
    }
    updateSettings({ tencentDocs: draft.tencentDocs });
    updateSettings({ dashboard: draft.dashboard });
    updateSettings({ sidebar: draft.sidebar });
    setSnackbarMsg('设置已保存'); setSnackbarOpen(true);
  };

  const handleReset = () => {
    resetSettings();
    setDraft({
      tencentDocs: { docLinks: [], onlineData: [] },
      wecomDocs: { docLinks: [] },
      volumeDocs: { docLinks: [] },
      dashboard: {
        warningThreshold: 70, fullThreshold: 90, ageWarningDays: 90, trendCompareDays: 30,
        dataRefreshInterval: 60, defaultTransitVolumeDays: 30, totalItems: 14300, transitAlertThreshold: 85,
        visibility: { kpiTransitVolume: true, kpiVolumeUtilization: true, kpiPendingInbound: true, kpiOutboundCount: true, kpiInventoryDepth: true, kpiTransitAlert: true, chartVolumeTrend: true, chartTransitPie: true, chartWarehouseBar: true, chartShipmentHeatmap: true, chartInventoryAlert: true, chartKpiComparison: true, chartTransitTime: true },
        heatmap: { days: 14, colorScheme: 'ocean' },
        componentOrder: ['kpi-cards', 'heatmap', 'volume-trend', 'transit-pie', 'warehouse-bar', 'inventory-alert', 'kpi-comparison', 'transit-time'],
        dataSource: { mode: 'mock', apiBaseUrl: '/api/v1', docMappings: {} },
      },
      sidebar: { showVersion: true },
    });
    setErrors({});
    setSnackbarMsg('已重置为默认值'); setSnackbarOpen(true);
  };

  const hasErrors = Object.keys(errors).length > 0;

  // ===================== Tab Renderers =====================

  const renderTencentDocs = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* OAuth 区域 */}
      <Card elevation={0} sx={{ border: `1px solid ${tdocAuth?.authenticated ? '#27A17C' : '#E5E7EB'}`, borderRadius: 2, p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {tdocAuth?.authenticated ? <CloudDoneIcon sx={{ color: '#27A17C', fontSize: 18 }} /> : <CloudOffIcon sx={{ color: '#9CA3AF', fontSize: 18 }} />}
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>API 授权状态</Typography>
          <Chip label={tdocAuth?.authenticated ? '已授权' : '未授权'} size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: tdocAuth?.authenticated ? '#E8F5E9' : '#FEF2F2', color: tdocAuth?.authenticated ? '#27A17C' : '#EF4444' }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField label="Client ID" size="small" fullWidth placeholder="在 docs.qq.com/open/developers 获取" value={tdocClientId} onChange={(e) => setTdocClientId(e.target.value)} sx={textFieldSx} InputProps={{ startAdornment: <InputAdornment position="start"><VpnKeyIcon sx={{ fontSize: 14, color: '#9CA3AF' }} /></InputAdornment> }} />
          <TextField label="Client Secret" size="small" fullWidth type="password" placeholder="应用的密钥" value={tdocClientSecret} onChange={(e) => setTdocClientSecret(e.target.value)} sx={textFieldSx} />
          {tdocAuth?.authenticated ? (
            <Button variant="outlined" size="small" onClick={handleTdocRefresh} disabled={tdocAuthLoading} sx={{ borderColor: '#27A17C', color: '#27A17C', fontSize: '0.75rem', alignSelf: 'flex-start' }}>{tdocAuthLoading ? '刷新中...' : '刷新 Token'}</Button>
          ) : (
            <>
              <Button variant="contained" size="small" onClick={handleTdocAuth} disabled={tdocAuthLoading || !tdocClientId || !tdocClientSecret} sx={{ backgroundColor: '#27A17C', '&:hover': { backgroundColor: '#1e7a5e' }, fontSize: '0.75rem', alignSelf: 'flex-start' }}>{tdocAuthLoading ? '处理中...' : '发起 OAuth 授权'}</Button>
              <TextField label="授权码" size="small" fullWidth placeholder="URL 中的 code 参数" value={tdocAuthCode} onChange={(e) => setTdocAuthCode(e.target.value)} sx={textFieldSx} />
              <Button variant="outlined" size="small" onClick={handleTdocExchange} disabled={tdocAuthLoading || !tdocAuthCode} sx={{ borderColor: '#111827', color: '#111827', fontSize: '0.75rem', alignSelf: 'flex-start' }}>换取 Token</Button>
            </>
          )}
          {tdocAuthMsg && <Alert severity={tdocAuthMsg.type} sx={{ py: 0, fontSize: '0.75rem' }}>{tdocAuthMsg.text}</Alert>}
        </Box>
      </Card>

      <Divider />

      {/* 文档链接列表 */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>文档链接管理</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField label="文档链接" size="small" fullWidth placeholder="https://docs.qq.com/sheet/..." value={newLinkUrl} onChange={(e) => { setNewLinkUrl(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['docLink.url']; return n; }); }} InputProps={{ startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 14, color: '#9CA3AF' }} /></InputAdornment> }} sx={textFieldSx} error={Boolean(errors['docLink.url'])} helperText={errors['docLink.url']} />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField label="名称（选填）" size="small" sx={{ flex: 1, ...textFieldSx }} value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} />
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel sx={{ fontSize: '0.75rem' }}>类型</InputLabel>
            <Select value={newLinkDataType} label="类型" onChange={(e) => setNewLinkDataType(e.target.value as DocLinkItem['dataType'])} sx={{ fontSize: '0.75rem' }}>
              <MenuItem value="inventory">库存</MenuItem>
              <MenuItem value="transit">在途</MenuItem>
              <MenuItem value="warehouses">仓库</MenuItem>
              <MenuItem value="other">其他</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddLink} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 36, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>添加</Button>
        </Box>
      </Box>

      {draft.tencentDocs.docLinks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 2, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 28, color: '#D1D5DB', mb: 0.5 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>暂无文档链接</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {draft.tencentDocs.docLinks.map((doc) => (
            <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 1.5 }}>
              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: 1, backgroundColor: '#27A17C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <DescriptionOutlinedIcon sx={{ color: '#fff', fontSize: 14 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</Typography>
                  </Box>
                  <Chip label={doc.dataType === 'inventory' ? '库存' : doc.dataType === 'transit' ? '在途' : doc.dataType === 'warehouses' ? '仓库' : '其他'} size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                  <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={() => openInBrowser(doc.url)} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                  <Tooltip title="删除"><IconButton size="small" onClick={() => handleRemoveLink(doc.id)} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider />

      {/* 在线数据输入 */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>在线数据输入</Typography>
      <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', mb: 1 }}>支持直接输入 JSON 格式数据，用于仪表盘实时展示</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          label="数据名称"
          size="small"
          fullWidth
          placeholder="例如：深圳仓库存数据"
          value={newDataName}
          onChange={(e) => { setNewDataName(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['onlineData.name']; return n; }); }}
          sx={textFieldSx}
          error={Boolean(errors['onlineData.name'])}
          helperText={errors['onlineData.name']}
        />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel sx={{ fontSize: '0.75rem' }}>数据类型</InputLabel>
            <Select
              value={newDataDataType}
              label="数据类型"
              onChange={(e) => setNewDataDataType(e.target.value as OnlineDataEntry['dataType'])}
              sx={{ fontSize: '0.75rem' }}
            >
              <MenuItem value="warehouses">仓库</MenuItem>
              <MenuItem value="inventory">库存</MenuItem>
              <MenuItem value="transit">在途</MenuItem>
              <MenuItem value="other">其他</MenuItem>
            </Select>
          </FormControl>
          {editingDataId ? (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSaveEdit} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 36, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>保存</Button>
              <Button variant="outlined" size="small" onClick={handleCancelEdit} sx={{ height: 36, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>取消</Button>
            </Box>
          ) : (
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddData} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 36, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>添加</Button>
          )}
        </Box>
        <TextField
          label="数据内容（JSON格式）"
          size="small"
          fullWidth
          multiline
          rows={4}
          placeholder='例如：[{"id":"wh001","name":"深圳仓","usedItems":8500,"totalItems":10000}]'
          value={newDataContent}
          onChange={(e) => { setNewDataContent(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['onlineData.data']; return n; }); }}
          sx={textFieldSx}
          error={Boolean(errors['onlineData.data'])}
          helperText={errors['onlineData.data']}
        />
      </Box>

      {draft.tencentDocs.onlineData.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 2, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <CodeIcon sx={{ fontSize: 28, color: '#D1D5DB', mb: 0.5 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>暂无在线数据</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {draft.tencentDocs.onlineData.map((entry) => (
            <Card key={entry.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 1.5 }}>
              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: 1, backgroundColor: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CodeIcon sx={{ color: '#fff', fontSize: 14 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>更新：{new Date(entry.updatedAt).toLocaleDateString('zh-CN')}</Typography>
                  </Box>
                  <Chip label={entry.dataType === 'inventory' ? '库存' : entry.dataType === 'transit' ? '在途' : entry.dataType === 'warehouses' ? '仓库' : '其他'} size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                  <Tooltip title="编辑"><IconButton size="small" onClick={() => handleEditData(entry)} sx={{ color: '#9CA3AF' }}><EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                  <Tooltip title="删除"><IconButton size="small" onClick={() => handleRemoveData(entry.id)} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
      {/* 二级栏目：容积率文档 */}
      <Divider sx={{ mt: 1 }} />
      <Box
        onClick={() => setActiveTab('tencentDocs_volumeDocs')}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 1.5, py: 1, cursor: 'pointer', borderRadius: '8px',
          '&:hover': { backgroundColor: '#f5f5f5' },
        }}
      >
        <DescriptionOutlinedIcon sx={{ fontSize: 18, color: '#6B7280' }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: '#111827' }}>容积率文档</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>容积率文档管理</Typography>
        </Box>
        <ChevronRightIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
      </Box>
    </Box>
  );

  const renderVolumeDocs = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 容积率标准模板 */}
      <Box>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>容积率标准模板</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mb: 1 }}>供在线文档制作参考，符合跨境WMS仓库管理规范</Typography>
        <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>仓库容积率标准模板（JSON）</Typography>
          <Box
            component="pre"
            sx={{
              fontSize: '0.7rem', lineHeight: 1.6, color: '#374151',
              backgroundColor: '#F9FAFB', borderRadius: 1, p: 1.5,
              overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap',
              border: '1px solid #E5E7EB', fontFamily: 'monospace',
            }}
          >{`[
  {
    "warehouseId": "wh001",
    "warehouseName": "深圳仓",
    "totalItems": 10000,
    "usedItems": 7500,
    "utilizationRate": 75.0,
    "standard": {
      "low": 40,
      "normal": 70,
      "high": 85,
      "full": 100
    },
    "alertLevel": "normal",
    "updateTime": "2026-05-30T10:00:00Z"
  },
  {
    "warehouseId": "wh002",
    "warehouseName": "洛杉矶仓",
    "totalItems": 8000,
    "usedItems": 7200,
    "utilizationRate": 90.0,
    "standard": {
      "low": 40,
      "normal": 70,
      "high": 85,
      "full": 100
    },
    "alertLevel": "high",
    "updateTime": "2026-05-30T10:00:00Z"
  }
]`}</Box>
          <Button
            variant="outlined" size="small" sx={{ mt: 1, fontSize: '0.7rem', borderColor: '#D1D5DB', color: '#374151' }}
            onClick={() => { setNewDataName('容积率标准模板'); setNewDataDataType('other'); setNewDataContent('[\n  {\n    "warehouseId": "wh001",\n    "warehouseName": "深圳仓",\n    "totalItems": 10000,\n    "usedItems": 7500,\n    "utilizationRate": 75.0,\n    "standard": {\n      "low": 40,\n      "normal": 70,\n      "high": 85,\n      "full": 100\n    },\n    "alertLevel": "normal",\n    "updateTime": "' + new Date().toISOString() + '"\n  }\n]'); setActiveTab('tencentDocs'); }}
          >
            复制到在线数据输入
          </Button>
        </Card>
      </Box>

      <Divider />

      {/* 容积率文档链接（如果有） */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>关联文档</Typography>
      {draft.tencentDocs.docLinks.filter(d => d.dataType === 'warehouses' || d.dataType === 'other').length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 2, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 28, color: '#D1D5DB', mb: 0.5 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>暂无容积率相关文档</Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>请在「腾讯文档」中先添加文档链接</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {draft.tencentDocs.docLinks
            .filter(d => d.dataType === 'warehouses' || d.dataType === 'other')
            .map((doc) => (
              <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 1.5 }}>
                <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 26, height: 26, borderRadius: 1, backgroundColor: '#27A17C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <DescriptionOutlinedIcon sx={{ color: '#fff', fontSize: 14 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</Typography>
                    </Box>
                    <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={() => openInBrowser(doc.url)} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                  </Box>
                </CardContent>
              </Card>
            ))}
        </Box>
      )}
    </Box>
  );

  const renderDashboardCalc = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>容积率预警线：{draft.dashboard.warningThreshold}%</Typography>
        <Slider value={draft.dashboard.warningThreshold} onChange={(_, v) => updateDashboard('warningThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#F59E0B' }} size="small" />
        {errors['dashboard.warningThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444' }}>{errors['dashboard.warningThreshold']}</Typography>}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>容积率满仓线：{draft.dashboard.fullThreshold}%</Typography>
        <Slider value={draft.dashboard.fullThreshold} onChange={(_, v) => updateDashboard('fullThreshold', v as number)} min={0} max={100} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`} sx={{ color: '#EF4444' }} size="small" />
        {errors['dashboard.fullThreshold'] && <Typography variant="caption" sx={{ color: '#EF4444' }}>{errors['dashboard.fullThreshold']}</Typography>}
      </Box>
      <Divider />
      <TextField label="库龄预警天数" type="number" size="small" fullWidth value={draft.dashboard.ageWarningDays} onChange={(e) => updateDashboard('ageWarningDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="KPI趋势对比天数" type="number" size="small" fullWidth value={draft.dashboard.trendCompareDays} onChange={(e) => updateDashboard('trendCompareDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="数据刷新间隔（秒）" type="number" size="small" fullWidth value={draft.dashboard.dataRefreshInterval} onChange={(e) => updateDashboard('dataRefreshInterval', Math.max(5, parseInt(e.target.value, 10) || 5))} inputProps={{ min: 5 }} sx={textFieldSx} />
      <TextField label="在途货物统计天数" type="number" size="small" fullWidth value={draft.dashboard.defaultTransitVolumeDays} onChange={(e) => updateDashboard('defaultTransitVolumeDays', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} sx={textFieldSx} />
      <TextField label="在途报警阈值（%）" type="number" size="small" fullWidth value={draft.dashboard.transitAlertThreshold} onChange={(e) => updateDashboard('transitAlertThreshold', Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))} inputProps={{ min: 1, max: 100 }} helperText="预计到仓后容积率超过此值即报警" sx={textFieldSx} />
      <Divider />
      <Typography sx={{ fontSize: '0.8rem', color: '#111827', fontWeight: 500 }}>总件数指标</Typography>
      <TextField label="仓库总件数" type="number" size="small" fullWidth value={draft.dashboard.totalItems} onChange={(e) => updateDashboard('totalItems', Math.max(1, parseInt(e.target.value, 10) || 1))} inputProps={{ min: 1 }} helperText="总容积利用率 = 已用容积件数 / 总件数" sx={textFieldSx} />
    </Box>
  );

  const renderDashboardIndicators = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>KPI 指标卡片</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiTransitVolume} onChange={(e) => updateVisibility('kpiTransitVolume', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途货物总量</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiVolumeUtilization} onChange={(e) => updateVisibility('kpiVolumeUtilization', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>仓库总容积利用率</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiPendingInbound} onChange={(e) => updateVisibility('kpiPendingInbound', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>待处理入库单</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiOutboundCount} onChange={(e) => updateVisibility('kpiOutboundCount', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>当日出库量</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiInventoryDepth} onChange={(e) => updateVisibility('kpiInventoryDepth', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>库存深度</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.kpiTransitAlert} onChange={(e) => updateVisibility('kpiTransitAlert', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途报警</Typography>} />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>图表组件</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartVolumeTrend} onChange={(e) => updateVisibility('chartVolumeTrend', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>容积率趋势图</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartTransitPie} onChange={(e) => updateVisibility('chartTransitPie', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>在途货物状态分布</Typography>} />
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartWarehouseBar} onChange={(e) => updateVisibility('chartWarehouseBar', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>各仓库容积使用情况</Typography>} />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>热力图</Typography>
      <FormControlLabel control={<Switch checked={draft.dashboard.visibility.chartShipmentHeatmap} onChange={(e) => updateVisibility('chartShipmentHeatmap', e.target.checked)} size="small" sx={switchSx} />} label={<Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>仓库出货热力图</Typography>} />
      {draft.dashboard.visibility.chartShipmentHeatmap && (
        <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>颜色方案</Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {([
                { key: 'ocean' as const, label: '海洋蓝', colors: ['#E0F2FE', '#0EA5E9', '#0369A1'] },
                { key: 'forest' as const, label: '森林绿', colors: ['#DCFCE7', '#22C55E', '#15803D'] },
                { key: 'sunset' as const, label: '日落橙', colors: ['#FED7AA', '#F97316', '#C2410C'] },
              ]).map((scheme) => (
                <Chip key={scheme.key} label={scheme.label} size="small" onClick={() => updateHeatmap('colorScheme', scheme.key)} sx={{ fontSize: '0.7rem', backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#111827' : '#F3F4F6', color: draft.dashboard.heatmap.colorScheme === scheme.key ? '#FFFFFF' : '#6B7280', '&:hover': { backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#374151' : '#f5f5f5' } }} icon={<Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>{scheme.colors.map((c, i) => (<Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c, border: '1px solid rgba(0,0,0,0.1)' }} />))}</Box>} />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );

  const renderAbout = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>系统名称</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>CDF Know CrossWMS</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>版本</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem' }}>构建日期</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.8rem', fontWeight: 500 }}>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}</Typography>
      </Box>
      <Divider sx={{ my: 0.5 }} />
      <Box sx={{ mb: 1 }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem', mb: 0.5 }}>软件介绍</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.75rem', lineHeight: 1.6 }}>
          CrossWMS 仓储系统配套线上知识库 / 随查平台，简称「随知」，专仓管、柜组库管、运维查询 WMS 全流程操作规范、单据规则、主数据查询等软件系统。
        </Typography>
      </Box>
      <FormControlLabel control={<Switch checked={draft.sidebar.showVersion} onChange={(e) => updateSidebar('showVersion', e.target.checked)} size="small" sx={switchSx} />} label={<Box><Typography sx={{ fontSize: '0.8rem', color: '#111827' }}>显示版本号</Typography><Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>在侧边栏 Logo 旁显示 v{APP_VERSION}</Typography></Box>} />
    </Box>
  );

  // ===================== Panel Layout =====================

  const renderPanelContent = () => {
    if (activeTab === 'menu') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {SETTINGS_MENU_ITEMS.map((item) => (
            <Box
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2, py: 1.5, cursor: 'pointer', borderRadius: '8px',
                '&:hover': { backgroundColor: '#f5f5f5' },
              }}
            >
              <Box sx={{ color: '#6B7280', display: 'flex', alignItems: 'center' }}>{item.icon}</Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: '#111827' }}>{item.label}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{item.description}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    return (
      <Box>
        {/* 返回按钮 + 标题 + 关闭按钮 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton size="small" onClick={() => setActiveTab('menu')} sx={{ color: '#6B7280' }}>
            <ArrowBackIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}>
            {SETTINGS_MENU_ITEMS.find((i) => i.key === activeTab)?.label}
          </Typography>
          <IconButton size="small" onClick={() => onClose?.()} sx={{ color: '#9CA3AF', '&:hover': { color: '#111827' } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* 内容区域 */}
        {activeTab === 'tencentDocs' && renderTencentDocs()}
        {activeTab === 'tencentDocs_volumeDocs' && renderVolumeDocs()}
        {activeTab === 'dashboardCalc' && renderDashboardCalc()}
        {activeTab === 'dashboardIndicators' && renderDashboardIndicators()}
        {activeTab === 'about' && renderAbout()}

        {/* 保存/重置按钮 */}
        <Divider sx={{ mt: 2, mb: 1.5 }} />
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={handleReset} sx={{ borderColor: '#E5E7EB', color: '#6B7280', fontSize: '0.75rem', '&:hover': { borderColor: '#9CA3AF' } }}>重置</Button>
          <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={handleSave} disabled={hasErrors} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, fontSize: '0.75rem', '&.Mui-disabled': { backgroundColor: '#E5E7EB', color: '#9CA3AF' } }}>保存</Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* 头部 — 应用信息 */}
      {activeTab === 'menu' && (
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <g fill="#111827">
                <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z"/>
                <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z"/>
              </g>
            </svg>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>CDF Know CrossWMS</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>v{APP_VERSION}</Typography>
          </Box>
        </Box>
      )}

      <Divider sx={{ mb: 1 }} />

      {/* 内容区 — 确保白色区域始终可见 */}
      <Box sx={{
        px: 2, pb: 2,
        flex: 1,
        overflow: 'auto',
        minHeight: 0, // flex 子元素溢出滚动的关键
        overscrollBehavior: 'none', // 禁止 macOS 弹性滚动
        WebkitOverflowScrolling: 'auto', // 禁用惯性滚动
      }}>
        {renderPanelContent()}
      </Box>

      <Snackbar open={snackbarOpen} autoHideDuration={2000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%' }}>{snackbarMsg}</Alert>
      </Snackbar>
    </Box>
  );
};

// ===================== Sidebar Component =====================

/** 单栏侧边栏布局 — 加宽至 260 */
const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 68;

// 背景色
const SIDEBAR_BG = '#F0F0F0';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: '仪表盘', path: '/', icon: <DashboardOutlinedIcon /> },
  { label: '技能', path: '/skills', icon: <AutoFixHighIcon /> },
  { label: 'Agent 应用', path: '/agent', icon: <SmartToyOutlinedIcon /> },
  { label: '仓库管理', path: '/warehouses', icon: <WarehouseOutlinedIcon /> },
  { label: '在途管理', path: '/in-transit', icon: <LocalShippingOutlinedIcon /> },
  { label: '库存管理', path: '/inventory', icon: <InventoryOutlinedIcon /> },
  { label: '腾讯文档', path: '/tencent-docs', icon: <DescriptionOutlinedIcon /> },
  { label: '统计报表', path: '/reports', icon: <AssessmentOutlinedIcon /> },
  { label: '定时任务', path: '/automation', icon: <ScheduleIcon /> },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useAppSettings();

  // 设置 Dialog 状态
  const [settingsOpen, setSettingsOpen] = useState(false);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  /** 判断导航项是否活跃 */
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <Box
      sx={{
        width,
        height: '100vh',
        boxSizing: 'border-box',
        paddingTop: 'var(--pw-top, 0px)',
        position: 'sticky',
        top: 0,
        zIndex: 1200,
        flexShrink: 0,
        backgroundColor: SIDEBAR_BG,
        overflow: 'visible', // 允许收起按钮显示在 paddingTop 区域
        display: 'flex',
        flexDirection: 'column',
        borderRight: collapsed ? '1px solid #E5E7EB' : 'none',
      }}
    >
      {/* 收起按钮 — 仅展开时显示，绝对定位固定在顶部系统按钮区域 */}
      {!collapsed && onToggle && (
        <IconButton
          onClick={onToggle}
          size="small"
          sx={{
            position: 'absolute',
            // 固定在顶部：paddingTop 区域下方 8px，始终可见可悬停
            top: 'calc(var(--pw-top, 0px) + 8px)',
            right: 8,
            color: '#6B7280',
            borderRadius: '6px',
            p: 0.5,
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            zIndex: 1,
            '&:hover': { backgroundColor: '#f5f5f5' },
            '&:focus': { outline: 'none' },
          }}
        >
          <ChevronLeftOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}

      {/* Logo 区域 */}
      <Box
        sx={{
          px: collapsed ? 0.5 : 2,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 1.25,
          flexShrink: 0,
        }}
      >
        {/* Logo 图标 — 收起时单独居中，展开时与文字同行 */}
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: '6px',
          }}
          onClick={() => navigate('/')}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g fill="#111827">
              <path d="M93.45,36.53l-11.5,16.57,10.03,14.41c2.25-5.4,3.5-11.32,3.5-17.53,0-4.68-.71-9.2-2.02-13.45Z"/>
              <path d="M57.48,88.15c-2.65.57-5.4.88-8.23.88-6.04,0-11.77-1.37-16.88-3.83V18.56c0-2.38,1.47-4.54,3.71-5.34,4.11-1.47,8.55-2.28,13.17-2.28.91,0,1.81.03,2.71.1v44.36c0,2.49,3.21,3.5,4.64,1.45l26.5-38.08c-7.87-8.37-18.87-13.77-31.13-14.32v.03c-.9-.05-1.8-.08-2.71-.08C24.07,4.39,3.66,24.8,3.66,49.99s20.41,45.59,45.59,45.59c1.04,0,2.07-.04,3.09-.11l-.03.04c10.67-.56,20.36-4.8,27.85-11.46l-6.65-9.55c-1.56-2.25-4.89-2.25-6.46-.01l-9.57,13.65Z"/>
            </g>
          </svg>
        </Box>

        {/* 名称 + 版本号 — 仅展开时显示 */}
        {!collapsed && (
          <Box
            sx={{
              maxWidth: 200,
              opacity: 1,
              overflow: 'hidden',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#111827',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              CDF Know CrossWMS
            </Typography>
            {settings.sidebar.showVersion && (
              <Typography
                sx={{
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#9CA3AF',
                  lineHeight: 1.2,
                }}
              >
                v{APP_VERSION}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* 导航列表 — 独立滚动，禁用上下缓动 */}
      <List sx={{
        pt: 0,
        px: collapsed ? 0.5 : 1,
        flex: 1,
        overflow: 'auto',
        overscrollBehaviorY: 'none',
        WebkitOverflowScrolling: 'auto',
      }}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <Tooltip title={collapsed ? item.label : ''} placement="right" arrow>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    minHeight: collapsed ? 40 : 36,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    px: collapsed ? 0 : 1.5,
                    py: 0.25,
                    borderRadius: '6px',
                    backgroundColor: active ? '#E0E0E0' : 'transparent',
                    '&:hover': {
                      backgroundColor: active ? '#D4D4D4' : '#f5f5f5',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: collapsed ? 0 : 1.5,
                      justifyContent: 'center',
                      color: active ? '#111827' : '#6B7280',
                      '& .MuiSvgIcon-root': { fontSize: collapsed ? '20px' : '18px' },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <Box
                    sx={{
                      maxWidth: collapsed ? 0 : 120,
                      opacity: collapsed ? 0 : 1,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: active ? 500 : 400,
                        color: active ? '#111827' : '#374151',
                        lineHeight: '36px',
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Box>
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      {/* 底部：收起/展开按钮 + 设置按钮 */}
      <Box sx={{ px: collapsed ? 0.5 : 1, pb: 1.5, flexShrink: 0 }}>
        <ListItemButton
          onClick={() => setSettingsOpen(true)}
          sx={{
            minHeight: collapsed ? 40 : 36,
            justifyContent: collapsed ? 'center' : 'flex-start',
            px: collapsed ? 0 : 1.5,
            borderRadius: '6px',
            backgroundColor: settingsOpen ? '#E0E0E0' : 'transparent',
            '&:hover': {
              backgroundColor: settingsOpen ? '#D4D4D4' : '#f5f5f5',
            },
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              mr: collapsed ? 0 : 1.5,
              justifyContent: 'center',
              color: settingsOpen ? '#111827' : '#6B7280',
              '& .MuiSvgIcon-root': { fontSize: collapsed ? '20px' : '18px' },
            }}
          >
            <SettingsOutlinedIcon />
          </ListItemIcon>
          <Box
            sx={{
              maxWidth: collapsed ? 0 : 120,
              opacity: collapsed ? 0 : 1,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.8125rem',
                fontWeight: settingsOpen ? 500 : 400,
                color: settingsOpen ? '#111827' : '#374151',
                lineHeight: '36px',
              }}
            >
              设置
            </Typography>
          </Box>
        </ListItemButton>
      </Box>

      {/* 设置 Dialog — 居中显示 */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: 680,
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
            maxHeight: '85vh',
          },
        }}
        TransitionComponent={Grow}
        TransitionProps={{ timeout: 200 }}
      >
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      </Dialog>
    </Box>
  );
};

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };
export default Sidebar;

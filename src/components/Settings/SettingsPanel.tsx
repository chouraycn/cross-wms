import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Slider,
  Button,
  IconButton,
  InputAdornment,
  Alert,
  Snackbar,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  Tooltip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DescriptionIcon from '@mui/icons-material/Description';
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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CodeIcon from '@mui/icons-material/Code';
import EditIcon from '@mui/icons-material/Edit';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { AppSettings, DashboardConfig, DashboardVisibility, DocLinkItem, WeComDocLinkItem, VolumeDocLinkItem, SidebarConfig, HeatmapConfig, ModelConfig, ModelsConfig, OnlineDataEntry } from '../../contexts/AppSettingsContext';
import { getAuthStatus, getAuthUrl, exchangeToken, refreshToken, isPyWebView, getDocContent, extractFileIdFromUrl, extractTextFromDoc, type TDocAuthStatus } from '../../services/tencentDocsApi';
import { getWeComAuthStatus, getWeComDocContent, getWeComSmartPageContent, isWeComDocUrl, getWeComDocCategoryFromUrl, getWeComCategoryLabel, extractWeComDocIdFromUrl, type WeComAuthStatus } from '../../services/wecomDocsApi';
import { getWarehouses } from '../../stores/warehouseStore';
import type { Warehouse } from '../../types';
import { openDownloadUrl, formatVersion, type UpdateStatus } from '../../services/updateService';
import { useUpdateContext } from '../../contexts/UpdateContext';
import { dashboardApi } from '../../services/dashboardApi';

// ===================== Tab Definitions =====================

// 从 package.json 自动读取版本号（Vite 环境变量注入）
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

type SettingsTab = 'tencentDocs' | 'dashboardCalc' | 'dashboardIndicators' | 'modelManagement' | 'about';

interface TabItem {
  key: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { key: 'tencentDocs', label: '腾讯文档', icon: <DescriptionIcon sx={{ fontSize: 20 }} /> },
  { key: 'dashboardCalc', label: '仪表盘参数', icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
  { key: 'dashboardIndicators', label: '指标控制', icon: <TuneIcon sx={{ fontSize: 20 }} /> },
  { key: 'modelManagement', label: '模型管理', icon: <SmartToyIcon sx={{ fontSize: 20 }} /> },
  { key: 'about', label: '关于', icon: <InfoIcon sx={{ fontSize: 20 }} /> },
];

// ===================== Switch Style =====================

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
};

const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
};

// ===================== Main Component =====================

const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useAppSettings();

  // 在浏览器中打开链接（适配 pywebview / 浏览器两种环境）
  const openInBrowser = useCallback(async (url: string) => {
    if (isPyWebView() && window.pywebview?.api) {
      try {
        await window.pywebview.api.open_in_browser(url);
        return;
      } catch {
        // 降级
      }
    }
    window.open(url, '_blank');
  }, []);

  // Active tab
  const [activeTab, setActiveTab] = useState<SettingsTab>('tencentDocs');

  // Local draft state for unsaved changes
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // New link form state
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkDataType, setNewLinkDataType] = useState<DocLinkItem['dataType']>('inventory');

  // 使用全局更新上下文
  const { checkForUpdates: globalCheckForUpdates, updateStatus, showUpdateNotification, hideUpdateNotification, downloadUpdate } = useUpdateContext();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Update check state（用于设置页内部状态展示）
  const [localUpdateStatus, setLocalUpdateStatus] = useState<UpdateStatus | null>(null);
  const effectiveUpdateStatus = showUpdateNotification ? updateStatus : localUpdateStatus;

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 仓库列表（用于文档关联）
  const allWarehouses = getWarehouses();

  /** 根据仓库 ID 获取仓库名称 */
  const getWarehouseName = useCallback((id?: string): string => {
    if (!id) return '全局';
    const w = allWarehouses.find((wh) => wh.id === id);
    return w ? w.name : '未知仓库';
  }, [allWarehouses]);

  // New link form — 关联仓库
  const [newLinkWarehouseId, setNewLinkWarehouseId] = useState<string>('');
  const [newWecomLinkWarehouseId, setNewWecomLinkWarehouseId] = useState<string>('');

  // 腾讯文档 OAuth 状态
  const [tdocAuth, setTdocAuth] = useState<TDocAuthStatus | null>(null);
  const [tdocClientId, setTdocClientId] = useState('');
  const [tdocClientSecret, setTdocClientSecret] = useState('');
  const [tdocAuthCode, setTdocAuthCode] = useState('');
  const [tdocAuthLoading, setTdocAuthLoading] = useState(false);
  const [tdocAuthMsg, setTdocAuthMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [fetchingTdocTitle, setFetchingTdocTitle] = useState(false);

  // 企业微信文档状态
  const [wecomAuth, setWecomAuth] = useState<WeComAuthStatus | null>(null);
  const [wecomAuthLoading, setWecomAuthLoading] = useState(false);
  const [fetchingWecomTitle, setFetchingWecomTitle] = useState(false);
  // 企业文档链接表单
  const [newWecomLinkUrl, setNewWecomLinkUrl] = useState('');
  const [newWecomLinkTitle, setNewWecomLinkTitle] = useState('');
  const [newWecomLinkDataType, setNewWecomLinkDataType] = useState<WeComDocLinkItem['dataType']>('inventory');
  const [wecomLinkErrors, setWecomLinkErrors] = useState<Record<string, string>>({});

  // 容积率文档链接状态
  const [newVolumeDocUrl, setNewVolumeDocUrl] = useState('');
  const [newVolumeDocTitle, setNewVolumeDocTitle] = useState('');
  const [newVolumeDocDataType, setNewVolumeDocDataType] = useState<VolumeDocLinkItem['dataType']>('volume');
  const [volumeDocErrors, setVolumeDocErrors] = useState<Record<string, string>>({});

  // 在线数据输入状态
  const [newDataName, setNewDataName] = useState('');
  const [newDataContent, setNewDataContent] = useState('');
  const [newDataDataType, setNewDataDataType] = useState<OnlineDataEntry['dataType']>('warehouses');
  const [editingDataId, setEditingDataId] = useState<string | null>(null);

  // ===================== 模型管理状态 =====================

  /** 模型对话框类型：'add' | 'edit' | null */
  const [modelDialogMode, setModelDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  /** 模型表单字段 */
  const [modelForm, setModelForm] = useState<{
    id: string;
    name: string;
    provider: ModelConfig['provider'];
    apiEndpoint: string;
    apiKey: string;
    enabled: boolean;
    description: string;
    contextWindow: string;
    maxTokens: string;
  }>({
    id: '',
    name: '',
    provider: 'openai',
    apiEndpoint: '',
    apiKey: '',
    enabled: true,
    description: '',
    contextWindow: '',
    maxTokens: '',
  });
  const [modelFormErrors, setModelFormErrors] = useState<Record<string, string>>({});

  // 检查腾讯文档认证状态
  const checkTdocAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setTdocAuth(status);
      setTdocClientId(status.clientId || '');
    } catch {
      setTdocAuth({ authenticated: false, hasToken: false, isExpired: true, clientId: '' });
    }
  }, []);

  // 初始化时检查认证状态
  useState(() => { checkTdocAuth(); });

  // 发起 OAuth 授权
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

  // 用授权码换取 Token
  const handleTdocExchange = useCallback(async () => {
    if (!tdocAuthCode) {
      setTdocAuthMsg({ type: 'error', text: '请输入授权码' });
      return;
    }
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

  // ===== 企业微信文档 =====

  const checkWecomAuth = useCallback(async () => {
    try {
      const status = await getWeComAuthStatus();
      setWecomAuth(status);
    } catch {
      setWecomAuth({ cliInstalled: false, authorized: false, checkedAt: Date.now() / 1000 });
    }
  }, []);

  // 初始化时检查企业微信认证
  useEffect(() => { checkWecomAuth(); }, [checkWecomAuth]);

  /** 添加企业文档链接 */
  const handleAddWecomLink = useCallback(() => {
    const url = newWecomLinkUrl.trim();
    if (!url) {
      setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '请输入文档链接' }));
      return;
    }
    if (!isWeComDocUrl(url)) {
      setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '请输入有效的企业微信文档链接（如 https://doc.weixin.qq.com/doc/...）' }));
      return;
    }
    if (draft.wecomDocs?.docLinks?.some((d) => d.url === url)) {
      setWecomLinkErrors((e) => ({ ...e, 'wecomLink.url': '该文档链接已存在' }));
      return;
    }

    const newLink: WeComDocLinkItem = {
      id: `wecom-${Date.now()}`,
      url,
      title: newWecomLinkTitle.trim() || `企业文档 ${extractWeComDocIdFromUrl(url).slice(0, 6)}`,
      dataType: newWecomLinkDataType,
      warehouseId: newWecomLinkWarehouseId || undefined,
    };

    setDraft((prev) => ({
      ...prev,
      wecomDocs: {
        docLinks: [...(prev.wecomDocs?.docLinks ?? []), newLink],
      },
    }));

    setNewWecomLinkUrl('');
    setNewWecomLinkTitle('');
    setNewWecomLinkDataType('inventory');
    setNewWecomLinkWarehouseId('');
    setWecomLinkErrors({});
  }, [newWecomLinkUrl, newWecomLinkTitle, newWecomLinkDataType, draft.wecomDocs?.docLinks, newWecomLinkWarehouseId]);

  /** 删除企业文档链接 */
  const handleRemoveWecomLink = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      wecomDocs: {
        docLinks: (prev.wecomDocs?.docLinks ?? []).filter((d) => d.id !== id),
      },
    }));
  }, []);

  /** Update a field on a specific WeCom doc link */
  const updateWeComDocLink = useCallback(<K extends keyof WeComDocLinkItem>(id: string, key: K, value: WeComDocLinkItem[K]) => {
    setDraft((prev) => ({
      ...prev,
      wecomDocs: {
        docLinks: (prev.wecomDocs?.docLinks ?? []).map((d) =>
          d.id === id ? { ...d, [key]: value } : d
        ),
      },
    }));
  }, []);

  /** 添加容积率文档链接 */
  const handleAddVolumeDocLink = useCallback(() => {
    const url = newVolumeDocUrl.trim();
    if (!url) {
      setVolumeDocErrors((e) => ({ ...e, 'volumeDoc.url': '请输入文档链接' }));
      return;
    }
    if (draft.volumeDocs?.docLinks?.some((d) => d.url === url)) {
      setVolumeDocErrors((e) => ({ ...e, 'volumeDoc.url': '该文档链接已存在' }));
      return;
    }

    const newLink: VolumeDocLinkItem = {
      id: `volume-doc-${Date.now()}`,
      url,
      title: newVolumeDocTitle.trim() || `容积率文档 ${new URL(url).hostname}`,
      dataType: newVolumeDocDataType,
    };

    setDraft((prev) => ({
      ...prev,
      volumeDocs: {
        docLinks: [...(prev.volumeDocs?.docLinks ?? []), newLink],
      },
    }));

    setNewVolumeDocUrl('');
    setNewVolumeDocTitle('');
    setNewVolumeDocDataType('volume');
    setVolumeDocErrors({});
  }, [newVolumeDocUrl, newVolumeDocTitle, newVolumeDocDataType, draft.volumeDocs?.docLinks]);

  /** 删除容积率文档链接 */
  const handleRemoveVolumeDocLink = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      volumeDocs: {
        docLinks: (prev.volumeDocs?.docLinks ?? []).filter((d) => d.id !== id),
      },
    }));
  }, []);

  /** Update a field on a specific volume doc link */
  const updateVolumeDocLink = useCallback(<K extends keyof VolumeDocLinkItem>(id: string, key: K, value: VolumeDocLinkItem[K]) => {
    setDraft((prev) => ({
      ...prev,
      volumeDocs: {
        docLinks: (prev.volumeDocs?.docLinks ?? []).map((d) =>
          d.id === id ? { ...d, [key]: value } : d
        ),
      },
    }));
  }, []);

  // 刷新 Token
  const handleTdocRefresh = useCallback(async () => {
    setTdocAuthLoading(true);
    try {
      const result = await refreshToken();
      if (result.ok) {
        setTdocAuthMsg({ type: 'success', text: 'Token 刷新成功' });
        await checkTdocAuth();
      } else {
        setTdocAuthMsg({ type: 'error', text: `刷新失败：${result.error || '未知错误'}` });
      }
    } catch (err) {
      setTdocAuthMsg({ type: 'error', text: `刷新失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setTdocAuthLoading(false);
    }
  }, [checkTdocAuth]);

  /** Validate a Tencent Docs URL */
  const isValidDocUrl = (url: string): boolean => {
    return /^https?:\/\/docs\.qq\.com\/(sheet|doc)\/[A-Za-z0-9]+/.test(url.trim());
  };

  /** Extract doc title hint from URL */
  const extractDocId = (url: string): string => {
    const match = url.match(/docs\.qq\.com\/(sheet|doc)\/([A-Za-z0-9]+)/);
    return match ? match[2] : '';
  };

  /** 处理腾讯文档链接粘贴 — 自动识别并填充表单 */
  const handleTencentLinkPaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted) return;

    // 检测是否为腾讯文档链接
    if (/^https?:\/\/docs\.qq\.com\//.test(pasted)) {
      e.preventDefault();
      setNewLinkUrl(pasted);

      // 根据 URL 路径自动选择数据类型
      if (pasted.includes('/sheet/')) {
        setNewLinkDataType('inventory');
      } else {
        setNewLinkDataType('other');
      }

      // 清除错误
      setErrors((prev) => {
        const n = { ...prev };
        delete n['docLink.url'];
        return n;
      });

      // 尝试从 URL 提取 docId 作为临时标题
      const docId = extractDocId(pasted);
      if (docId) {
        setNewLinkTitle(`腾讯文档 ${docId.slice(0, 8)}`);
      }

      // 如果已授权，尝试获取真实文档标题
      if (tdocAuth?.authenticated) {
        setFetchingTdocTitle(true);
        try {
          const fileId = extractFileIdFromUrl(pasted);
          if (fileId) {
            const data = await getDocContent(fileId);
            // 从文档 AST 中提取第一段文字作为标题
            const fullText = extractTextFromDoc(data.document);
            const firstLine = fullText.trim().split('\n')[0];
            if (firstLine && firstLine.length > 0) {
              setNewLinkTitle(firstLine.replace(/^#\s*/, '').slice(0, 100));
            }
          }
        } catch (err) {
          console.warn('获取文档标题失败，使用默认标题:', err);
          // 保持使用 docId 生成的临时标题
        } finally {
          setFetchingTdocTitle(false);
        }
      }
    }
  }, [tdocAuth?.authenticated]);

  /** 处理企业微信文档链接粘贴 — 自动识别并填充表单 */
  const handleWecomLinkPaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted) return;

    // 检测是否为企业微信文档链接
    if (/^https?:\/\/doc\.weixin\.qq\.com\//.test(pasted)) {
      e.preventDefault();
      setNewWecomLinkUrl(pasted);

      // 根据文档类型自动选择数据类型
      const category = getWeComDocCategoryFromUrl(pasted);
      if (category === 'smartsheet') {
        setNewWecomLinkDataType('inventory');
      } else {
        setNewWecomLinkDataType('other');
      }

      // 清除错误
      setWecomLinkErrors((prev) => {
        const n = { ...prev };
        delete n['wecomLink.url'];
        return n;
      });

      // 尝试从 URL 提取 docId 作为临时标题
      const docId = extractWeComDocIdFromUrl(pasted);
      if (docId) {
        setNewWecomLinkTitle(`企业文档 ${docId.slice(0, 8)}`);
      }

      // 如果已授权，尝试获取真实标题
      if (wecomAuth?.authorized && docId) {
        setFetchingWecomTitle(true);
        try {
          if (category === 'smartpage') {
            const content = await getWeComSmartPageContent(docId);
            if (content) {
              // 智能文档：第一行通常是标题
              const firstLine = content.trim().split('\n')[0];
              const cleanTitle = firstLine.replace(/^#\s*/, '').trim();
              if (cleanTitle) {
                setNewWecomLinkTitle(cleanTitle);
              }
            }
          } else {
            const content = await getWeComDocContent(docId, category);
            if (content) {
              const firstLine = content.trim().split('\n')[0];
              const cleanTitle = firstLine.replace(/^#\s*/, '').trim();
              if (cleanTitle) {
                setNewWecomLinkTitle(cleanTitle);
              }
            }
          }
        } catch (err) {
          console.warn('获取企业文档标题失败，使用默认标题:', err);
        } finally {
          setFetchingWecomTitle(false);
        }
      }
    }
  }, [wecomAuth?.authorized]);

  /** Add a new document link */
  const handleAddLink = useCallback(() => {
    const url = newLinkUrl.trim();
    if (!url) {
      setErrors((e) => ({ ...e, 'docLink.url': '请输入文档链接' }));
      return;
    }
    if (!isValidDocUrl(url)) {
      setErrors((e) => ({ ...e, 'docLink.url': '请输入有效的腾讯文档链接（如 https://docs.qq.com/sheet/...）' }));
      return;
    }
    // Check for duplicate
    if (draft.tencentDocs.docLinks.some((d) => d.url === url)) {
      setErrors((e) => ({ ...e, 'docLink.url': '该文档链接已存在' }));
      return;
    }

    const newLink: DocLinkItem = {
      id: `link-${Date.now()}`,
      url,
      title: newLinkTitle.trim() || `腾讯文档 ${extractDocId(url).slice(0, 6)}`,
      dataType: newLinkDataType,
      warehouseId: newLinkWarehouseId || undefined,
    };

    setDraft((prev) => ({
      ...prev,
      tencentDocs: {
        ...prev.tencentDocs,
        docLinks: [...prev.tencentDocs.docLinks, newLink],
      },
    }));

    setNewLinkUrl('');
    setNewLinkTitle('');
    setNewLinkDataType('inventory');
    setNewLinkWarehouseId('');
    setErrors((e) => {
      const n = { ...e };
      delete n['docLink.url'];
      return n;
    });
  }, [newLinkUrl, newLinkTitle, newLinkDataType, draft.tencentDocs.docLinks]);

  /** Remove a document link */
  const handleRemoveLink = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      tencentDocs: {
        ...prev.tencentDocs,
        docLinks: prev.tencentDocs.docLinks.filter((d) => d.id !== id),
      },
    }));
  }, []);

  /** Update a field on a specific doc link */
  const updateDocLink = useCallback(<K extends keyof DocLinkItem>(id: string, key: K, value: DocLinkItem[K]) => {
    setDraft((prev) => ({
      ...prev,
      tencentDocs: {
        ...prev.tencentDocs,
        docLinks: prev.tencentDocs.docLinks.map((d) =>
          d.id === id ? { ...d, [key]: value } : d
        ),
      },
    }));
  }, []);

  /** Update a dashboard field in the draft */
  const updateDashboard = useCallback(<K extends keyof DashboardConfig>(key: K, value: DashboardConfig[K]) => {
    setDraft((prev) => {
      const next = {
        ...prev,
        dashboard: { ...prev.dashboard, [key]: value },
      };
      if (key === 'fullThreshold' && typeof value === 'number' && value <= prev.dashboard.warningThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' }));
      } else if (key === 'warningThreshold' && typeof value === 'number' && value >= prev.dashboard.fullThreshold) {
        setErrors((e) => ({ ...e, 'dashboard.warningThreshold': '预警线必须小于满仓线' }));
      } else {
        setErrors((e) => {
          const n = { ...e };
          delete n['dashboard.fullThreshold'];
          delete n['dashboard.warningThreshold'];
          return n;
        });
      }
      return next;
    });
  }, []);

  /** Update a visibility toggle in the draft */
  const updateVisibility = useCallback(<K extends keyof DashboardVisibility>(key: K, value: DashboardVisibility[K]) => {
    setDraft((prev) => ({
      ...prev,
      dashboard: {
        ...prev.dashboard,
        visibility: { ...prev.dashboard.visibility, [key]: value },
      },
    }));
  }, []);

  /** Update a sidebar config field in the draft */
  const updateSidebar = useCallback(<K extends keyof SidebarConfig>(key: K, value: SidebarConfig[K]) => {
    setDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, [key]: value },
    }));
  }, []);

  /** Update a heatmap config field in the draft */
  const updateHeatmap = useCallback(<K extends keyof HeatmapConfig>(key: K, value: HeatmapConfig[K]) => {
    setDraft((prev) => ({
      ...prev,
      dashboard: {
        ...prev.dashboard,
        heatmap: { ...prev.dashboard.heatmap, [key]: value },
      },
    }));
  }, []);

  // ===================== 在线数据操作 =====================

  const handleAddData = useCallback(() => {
    if (!newDataName.trim()) { setErrors((e) => ({ ...e, 'onlineData.name': '请输入数据名称' })); return; }
    if (!newDataContent.trim()) { setErrors((e) => ({ ...e, 'onlineData.data': '请输入数据内容' })); return; }
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

  /** Save draft to the global settings store */
  const handleSave = () => {
    if (draft.dashboard.fullThreshold <= draft.dashboard.warningThreshold) {
      setErrors((e) => ({ ...e, 'dashboard.fullThreshold': '满仓线必须大于预警线' }));
      return;
    }
    updateSettings({ tencentDocs: draft.tencentDocs });
    updateSettings({ wecomDocs: draft.wecomDocs });
    updateSettings({ volumeDocs: draft.volumeDocs });
    updateSettings({ dashboard: draft.dashboard });
    updateSettings({ sidebar: draft.sidebar });
    updateSettings({ models: draft.models });
    setSnackbarMsg('设置已保存');
    setSnackbarOpen(true);
  };

  /** Reset to defaults */
  const handleReset = () => {
    resetSettings();
    setDraft({
      tencentDocs: {
        ...settings.tencentDocs,
        docLinks: [],
        onlineData: [],
      },
      wecomDocs: {
        docLinks: [],
      },
      volumeDocs: {
        docLinks: [],
      },
      dashboard: {
        warningThreshold: 70,
        fullThreshold: 90,
        ageWarningDays: 90,
        trendCompareDays: 30,
        dataRefreshInterval: 60,
        defaultTransitVolumeDays: 30,
        totalItems: 14300,
        transitAlertThreshold: 85,
        visibility: {
          kpiTransitVolume: true,
          kpiVolumeUtilization: true,
          kpiPendingInbound: true,
          kpiOutboundCount: true,
          kpiInventoryDepth: true,
          kpiTransitAlert: true,
          chartVolumeTrend: true,
          chartTransitPie: true,
          chartWarehouseBar: true,
          chartShipmentHeatmap: true,
          chartInventoryAlert: true,
          chartKpiComparison: true,
          chartTransitTime: true,
        },
        heatmap: {
          days: 14,
          colorScheme: 'ocean',
        },
        componentOrder: ['kpi-cards', 'heatmap', 'volume-trend', 'transit-pie', 'warehouse-bar', 'inventory-alert', 'kpi-comparison', 'transit-time'],
        dataSourceMode: 'mock',
        dataSourceApiBaseUrl: '/api/v1',
        dataSourceDocMappings: {
          warehouses: 'warehouses',
          transitOrders: 'transitOrders',
          inventory: 'inventory',
          inboundRecords: 'inboundRecords',
          outboundRecords: 'outboundRecords',
          volumeHistory: 'volumeHistory',
          inboundTrend: 'inboundTrend',
          outboundTrend: 'outboundTrend',
        },
      },
      sidebar: {
        showVersion: true,
      },
      models: settings.models,
    });
    setErrors({});
    setSnackbarMsg('已重置为默认值');
    setSnackbarOpen(true);
  };

  const hasErrors = Object.keys(errors).length > 0;

  // ===================== Tab Content Renderers =====================

  const renderTencentDocs = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 560 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        腾讯文档集成
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        配置腾讯文档 API 后，可直接在应用内读取文档内容（不嵌入网页）。所有数据本地渲染。
      </Typography>

      {/* ===== OAuth 配置区域 ===== */}
      <Card elevation={0} sx={{ border: `1px solid ${tdocAuth?.authenticated ? '#27A17C' : '#E5E7EB'}`, borderRadius: 2, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          {tdocAuth?.authenticated ? (
            <CloudDoneIcon sx={{ color: '#27A17C', fontSize: 20 }} />
          ) : (
            <CloudOffIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
          )}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
            API 授权状态
          </Typography>
          <Chip
            label={tdocAuth?.authenticated ? '已授权' : '未授权'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              backgroundColor: tdocAuth?.authenticated ? '#E8F5E9' : '#FEF2F2',
              color: tdocAuth?.authenticated ? '#27A17C' : '#EF4444',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="Client ID"
            size="small"
            fullWidth
            placeholder="在 docs.qq.com/open/developers 注册应用获取"
            value={tdocClientId}
            onChange={(e) => setTdocClientId(e.target.value)}
            sx={textFieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <VpnKeyIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Client Secret"
            size="small"
            fullWidth
            type="password"
            placeholder="应用的密钥"
            value={tdocClientSecret}
            onChange={(e) => setTdocClientSecret(e.target.value)}
            sx={textFieldSx}
          />

          {tdocAuth?.authenticated ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleTdocRefresh}
                disabled={tdocAuthLoading}
                sx={{ borderColor: '#27A17C', color: '#27A17C', '&:hover': { borderColor: '#1e7a5e' }, fontSize: '0.8rem' }}
              >
                {tdocAuthLoading ? '刷新中...' : '刷新 Token'}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Token 有效期 30 天，到期前需刷新
              </Typography>
            </Box>
          ) : (
            <>
              <Button
                variant="contained"
                size="small"
                onClick={handleTdocAuth}
                disabled={tdocAuthLoading || !tdocClientId || !tdocClientSecret}
                sx={{ backgroundColor: '#27A17C', '&:hover': { backgroundColor: '#1e7a5e' }, fontSize: '0.8rem', alignSelf: 'flex-start' }}
              >
                {tdocAuthLoading ? '处理中...' : '发起 OAuth 授权'}
              </Button>
              <TextField
                label="授权码（Authorization Code）"
                size="small"
                fullWidth
                placeholder="在浏览器完成授权后，将 URL 中的 code 参数粘贴到此处"
                value={tdocAuthCode}
                onChange={(e) => setTdocAuthCode(e.target.value)}
                sx={textFieldSx}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleTdocExchange}
                disabled={tdocAuthLoading || !tdocAuthCode}
                sx={{ borderColor: '#111827', color: '#111827', fontSize: '0.8rem', alignSelf: 'flex-start' }}
              >
                用授权码换取 Token
              </Button>
            </>
          )}

          {tdocAuthMsg && (
            <Alert severity={tdocAuthMsg.type} sx={{ py: 0, fontSize: '0.8rem' }}>
              {tdocAuthMsg.text}
            </Alert>
          )}
        </Box>
      </Card>

      <Divider />

      {/* ===== 文档链接管理 ===== */}
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>
        文档链接管理
      </Typography>

      {/* Add New Link Form */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>
          添加文档链接
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="文档链接"
            size="small"
            fullWidth
            placeholder="https://docs.qq.com/sheet/DZVJnQmJ4a3F2bWN5"
            value={newLinkUrl}
            onChange={(e) => {
              setNewLinkUrl(e.target.value);
              setErrors((prev) => {
                const n = { ...prev };
                delete n['docLink.url'];
                return n;
              });
            }}
            onPaste={handleTencentLinkPaste}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={textFieldSx}
            error={Boolean(errors['docLink.url'])}
            helperText={errors['docLink.url'] || '粘贴链接后自动识别并填充表单'}
            FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: '#9CA3AF' } }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField
              label="文档名称（选填）"
              size="small"
              sx={{ flex: 1, ...textFieldSx }}
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
              placeholder="自动从链接解析"
              InputProps={{
                endAdornment: fetchingTdocTitle ? (
                  <InputAdornment position="end">
                    <Box component="span" sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                      获取中...
                    </Box>
                  </InputAdornment>
                ) : undefined,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select
                value={newLinkDataType}
                label="数据类型"
                onChange={(e) => setNewLinkDataType(e.target.value as DocLinkItem['dataType'])}
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="inventory">库存数据</MenuItem>
                <MenuItem value="transit">在途运单</MenuItem>
                <MenuItem value="warehouses">仓库信息</MenuItem>
                <MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>关联仓库</InputLabel>
              <Select
                value={newLinkWarehouseId}
                label="关联仓库"
                onChange={(e) => setNewLinkWarehouseId(e.target.value)}
                displayEmpty
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="">全局（不关联）</MenuItem>
                {allWarehouses.map((wh) => (
                  <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddLink}
              sx={{
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#374151' },
                height: 40,
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </Button>
          </Box>
        </Box>
      </Card>

      {/* Existing Links List */}
      {draft.tencentDocs.docLinks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 36, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
            暂无文档链接，请在上方添加
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {draft.tencentDocs.docLinks.map((doc) => (
            <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, overflow: 'visible' }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      backgroundColor: '#27A17C',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <DescriptionIcon sx={{ color: '#fff', fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </Typography>
                      <Chip
                        label={doc.dataType === 'inventory' ? '库存' : doc.dataType === 'transit' ? '在途' : doc.dataType === 'warehouses' ? '仓库' : '其他'}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                      />
                      {doc.warehouseId && (
                        <Chip
                          label={getWarehouseName(doc.warehouseId)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#DBEAFE', color: '#3B82F6' }}
                        />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="在浏览器中打开">
                      <IconButton
                        size="small"
                        onClick={() => openInBrowser(doc.url)}
                        sx={{ color: '#6B7280' }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除链接">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveLink(doc.id)}
                        sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {/* Per-link settings — simplified, only dataType and warehouseId editable */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, ml: 5 }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>数据类型</InputLabel>
                    <Select
                      value={doc.dataType}
                      label="数据类型"
                      onChange={(e) => updateDocLink(doc.id, 'dataType', e.target.value as DocLinkItem['dataType'])}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      <MenuItem value="inventory">库存数据</MenuItem>
                      <MenuItem value="transit">在途运单</MenuItem>
                      <MenuItem value="warehouses">仓库信息</MenuItem>
                      <MenuItem value="other">其他</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel sx={{ fontSize: '0.75rem' }}>关联仓库</InputLabel>
                    <Select
                      value={doc.warehouseId ?? ''}
                      label="关联仓库"
                      onChange={(e) => updateDocLink(doc.id, 'warehouseId' as keyof DocLinkItem, (e.target.value || undefined) as DocLinkItem[keyof DocLinkItem])}
                      displayEmpty
                      sx={{ fontSize: '0.8rem' }}
                    >
                      <MenuItem value="">全局</MenuItem>
                      {allWarehouses.map((wh) => (
                        <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Info notice */}
      <Alert severity="info" sx={{ mt: 1 }}>
        完成 API 授权后，点击文档即可在应用内读取内容（本地渲染，不嵌入网页）。也可点击浏览器图标在默认浏览器中编辑。
      </Alert>

      <Divider sx={{ my: 3 }} />

      {/* ===== 在线数据输入 ===== */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
        在线数据输入
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>
        支持直接输入 JSON 格式数据，用于仪表盘实时展示。无需腾讯文档 API 授权即可使用。
      </Typography>

      {/* 添加/编辑表单 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>
          {editingDataId ? '编辑数据' : '添加数据'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select
                value={newDataDataType}
                label="数据类型"
                onChange={(e) => setNewDataDataType(e.target.value as OnlineDataEntry['dataType'])}
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="warehouses">仓库信息</MenuItem>
                <MenuItem value="inventory">库存数据</MenuItem>
                <MenuItem value="transit">在途运单</MenuItem>
                <MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            {editingDataId ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveEdit}
                  sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 40, whiteSpace: 'nowrap' }}
                >
                  保存
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCancelEdit}
                  sx={{ height: 40, whiteSpace: 'nowrap' }}
                >
                  取消
                </Button>
              </Box>
            ) : (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddData}
                sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' }, height: 40, whiteSpace: 'nowrap' }}
              >
                添加
              </Button>
            )}
          </Box>
          <TextField
            label="数据内容（JSON格式）"
            size="small"
            fullWidth
            multiline
            rows={6}
            placeholder='例如：[{"id":"wh001","name":"深圳仓","usedItems":8500,"totalItems":10000}]'
            value={newDataContent}
            onChange={(e) => { setNewDataContent(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n['onlineData.data']; return n; }); }}
            sx={{ ...textFieldSx, '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
            error={Boolean(errors['onlineData.data'])}
            helperText={errors['onlineData.data']}
          />
        </Box>
      </Card>

      {/* 已录入数据列表 */}
      {draft.tencentDocs.onlineData.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <CodeIcon sx={{ fontSize: 36, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
            暂无在线数据，请在上方添加
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {draft.tencentDocs.onlineData.map((entry) => (
            <Card key={entry.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      backgroundColor: '#3B82F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CodeIcon sx={{ color: '#fff', fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name}
                      </Typography>
                      <Chip
                        label={entry.dataType === 'inventory' ? '库存' : entry.dataType === 'transit' ? '在途' : entry.dataType === 'warehouses' ? '仓库' : '其他'}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                      更新：{new Date(entry.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{(() => { try { const p = JSON.parse(entry.data); return Array.isArray(p) ? p.length : 1; } catch { return 0; } })()} 条记录
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="编辑">
                      <IconButton
                        size="small"
                        onClick={() => handleEditData(entry)}
                        sx={{ color: '#6B7280' }}
                      >
                        <EditIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveData(entry.id)}
                        sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* ===== 企业微信文档 ===== */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
        企业微信文档
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>
        通过 wecom-cli 读取企业微信文档（doc.weixin.qq.com），支持文档、智能表格、智能文档
      </Typography>

      {/* wecom-cli 认证状态 */}
      <Card elevation={0} sx={{ border: `1px solid ${wecomAuth?.authorized ? '#07C160' : '#E5E7EB'}`, borderRadius: 2, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          {wecomAuth?.authorized ? (
            <CloudDoneIcon sx={{ color: '#07C160', fontSize: 20 }} />
          ) : (
            <CloudOffIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
          )}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
            企业微信授权状态
          </Typography>
          <Chip
            label={!wecomAuth?.cliInstalled ? 'CLI 未安装' : wecomAuth?.authorized ? '已授权' : '未授权'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              backgroundColor: wecomAuth?.authorized ? '#E8F5E9' : '#FEF2F2',
              color: wecomAuth?.authorized ? '#07C160' : '#EF4444',
            }}
          />
        </Box>

        {!wecomAuth?.cliInstalled ? (
          <Alert severity="info" sx={{ fontSize: '0.8rem', mb: 1 }}>
            未检测到 wecom-cli，请在终端执行 <code>npm install -g @wecom/cli</code> 安装
          </Alert>
        ) : !wecomAuth?.authorized ? (
          <Alert severity="warning" sx={{ fontSize: '0.8rem', mb: 1 }}>
            请在终端执行 <code>wecom-cli init</code> 扫码授权
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => checkWecomAuth()}
              disabled={wecomAuthLoading}
              sx={{ borderColor: '#07C160', color: '#07C160', '&:hover': { borderColor: '#06a451' }, fontSize: '0.8rem' }}
            >
              {wecomAuthLoading ? '检查中...' : '重新检查'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              已授权，可以读取企业文档内容
            </Typography>
          </Box>
        )}
      </Card>

      <Divider sx={{ my: 2 }} />

      {/* 企业文档链接管理 */}
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>
        企业文档链接
      </Typography>

      {/* Add New Link Form */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2, mt: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>
          添加企业文档链接
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="文档链接"
            size="small"
            fullWidth
            placeholder="https://doc.weixin.qq.com/doc/e3_xxxxxxxx"
            value={newWecomLinkUrl}
            onChange={(e) => {
              setNewWecomLinkUrl(e.target.value);
              setWecomLinkErrors((prev) => { const n = { ...prev }; delete n['wecomLink.url']; return n; });
            }}
            onPaste={handleWecomLinkPaste}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={textFieldSx}
            error={Boolean(wecomLinkErrors['wecomLink.url'])}
            helperText={wecomLinkErrors['wecomLink.url'] || '粘贴链接后自动识别并填充表单'}
            FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: '#9CA3AF' } }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField
              label="文档名称（选填）"
              size="small"
              sx={{ flex: 1, ...textFieldSx }}
              value={newWecomLinkTitle}
              onChange={(e) => setNewWecomLinkTitle(e.target.value)}
              placeholder="自动从链接解析"
              InputProps={{
                endAdornment: fetchingWecomTitle ? (
                  <InputAdornment position="end">
                    <Box component="span" sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                      获取中...
                    </Box>
                  </InputAdornment>
                ) : undefined,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>数据类型</InputLabel>
              <Select
                value={newWecomLinkDataType}
                label="数据类型"
                onChange={(e) => setNewWecomLinkDataType(e.target.value as WeComDocLinkItem['dataType'])}
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="inventory">库存数据</MenuItem>
                <MenuItem value="transit">在途运单</MenuItem>
                <MenuItem value="warehouses">仓库信息</MenuItem>
                <MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>关联仓库</InputLabel>
              <Select
                value={newWecomLinkWarehouseId}
                label="关联仓库"
                onChange={(e) => setNewWecomLinkWarehouseId(e.target.value)}
                displayEmpty
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="">全局（不关联）</MenuItem>
                {allWarehouses.map((wh) => (
                  <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddWecomLink}
              sx={{
                backgroundColor: '#07C160',
                '&:hover': { backgroundColor: '#06a451' },
                height: 40,
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </Button>
          </Box>
        </Box>
      </Card>

      {/* Existing Enterprise Links List */}
      {(draft.wecomDocs?.docLinks ?? []).length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, border: '1px dashed #E5E7EB', borderRadius: 2, mt: 1.5 }}>
          <DescriptionIcon sx={{ fontSize: 32, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
            暂无企业文档链接，请在上方添加
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
          {(draft.wecomDocs?.docLinks ?? []).map((doc) => {
            const cat = getWeComDocCategoryFromUrl(doc.url);
            return (
              <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, overflow: 'visible' }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        backgroundColor: '#07C160',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <DescriptionIcon sx={{ color: '#fff', fontSize: 18 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title}
                        </Typography>
                        <Chip
                          label={doc.dataType === 'inventory' ? '库存' : doc.dataType === 'transit' ? '在途' : doc.dataType === 'warehouses' ? '仓库' : '其他'}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                        />
                        <Chip
                          label={getWeComCategoryLabel(cat)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#ECFDF5', color: '#07C160' }}
                        />
                        {doc.warehouseId && (
                          <Chip
                            label={getWarehouseName(doc.warehouseId)}
                            size="small"
                            sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#DBEAFE', color: '#3B82F6' }}
                          />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.url}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      <Tooltip title="在浏览器中打开">
                        <IconButton
                          size="small"
                          onClick={() => openInBrowser(doc.url)}
                          sx={{ color: '#6B7280' }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除链接">
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveWecomLink(doc.id)}
                          sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  {/* Per-link settings — warehouseId editable */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, ml: 5 }}>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel sx={{ fontSize: '0.75rem' }}>关联仓库</InputLabel>
                      <Select
                        value={doc.warehouseId ?? ''}
                        label="关联仓库"
                        onChange={(e) => updateWeComDocLink(doc.id, 'warehouseId' as keyof WeComDocLinkItem, (e.target.value || undefined) as WeComDocLinkItem[keyof WeComDocLinkItem])}
                        displayEmpty
                        sx={{ fontSize: '0.8rem' }}
                      >
                        <MenuItem value="">全局</MenuItem>
                        {allWarehouses.map((wh) => (
                          <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem' }}>
        企业文档通过 wecom-cli 读取，需先在终端完成授权。支持文档、智能表格、智能文档三种品类。
      </Alert>
    </Box>
  );

  const renderDashboardCalc = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 480 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        仪表盘计算参数
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        调整仪表盘中的计算阈值和参数
      </Typography>

      {/* Warning Threshold Slider */}
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 1, fontWeight: 500 }}>
          容积率预警线：{draft.dashboard.warningThreshold}%
        </Typography>
        <Slider
          value={draft.dashboard.warningThreshold}
          onChange={(_, v) => updateDashboard('warningThreshold', v as number)}
          min={0}
          max={100}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          sx={{ color: '#F59E0B' }}
        />
        {errors['dashboard.warningThreshold'] && (
          <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5 }}>
            {errors['dashboard.warningThreshold']}
          </Typography>
        )}
      </Box>

      {/* Full Threshold Slider */}
      <Box>
        <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 1, fontWeight: 500 }}>
          容积率满仓线：{draft.dashboard.fullThreshold}%
        </Typography>
        <Slider
          value={draft.dashboard.fullThreshold}
          onChange={(_, v) => updateDashboard('fullThreshold', v as number)}
          min={0}
          max={100}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          sx={{ color: '#EF4444' }}
        />
        {errors['dashboard.fullThreshold'] && (
          <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5 }}>
            {errors['dashboard.fullThreshold']}
          </Typography>
        )}
      </Box>

      <Divider />

      <TextField
        label="库龄预警天数"
        type="number"
        size="small"
        fullWidth
        value={draft.dashboard.ageWarningDays}
        onChange={(e) => updateDashboard('ageWarningDays', Math.max(1, parseInt(e.target.value, 10) || 1))}
        inputProps={{ min: 1 }}
        sx={textFieldSx}
      />

      <TextField
        label="KPI趋势对比天数"
        type="number"
        size="small"
        fullWidth
        value={draft.dashboard.trendCompareDays}
        onChange={(e) => updateDashboard('trendCompareDays', Math.max(1, parseInt(e.target.value, 10) || 1))}
        inputProps={{ min: 1 }}
        sx={textFieldSx}
      />

      <TextField
        label="数据刷新间隔（秒）"
        type="number"
        size="small"
        fullWidth
        value={draft.dashboard.dataRefreshInterval}
        onChange={(e) => updateDashboard('dataRefreshInterval', Math.max(5, parseInt(e.target.value, 10) || 5))}
        inputProps={{ min: 5 }}
        sx={textFieldSx}
      />

      <TextField
        label="在途货物统计天数"
        type="number"
        size="small"
        fullWidth
        value={draft.dashboard.defaultTransitVolumeDays}
        onChange={(e) => updateDashboard('defaultTransitVolumeDays', Math.max(1, parseInt(e.target.value, 10) || 1))}
        inputProps={{ min: 1 }}
        sx={textFieldSx}
      />

      <Divider />

      <Typography sx={{ fontSize: '0.875rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>
        总件数指标
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        设置仓库总件数基数，影响仓库总容积利用率的计算
      </Typography>
      <TextField
        label="仓库总件数"
        type="number"
        size="small"
        fullWidth
        value={draft.dashboard.totalItems}
        onChange={(e) => updateDashboard('totalItems', Math.max(1, parseInt(e.target.value, 10) || 1))}
        inputProps={{ min: 1 }}
        helperText="总容积利用率 = 已用容积件数 / 总件数 × 100%"
        sx={textFieldSx}
      />

      <Divider sx={{ my: 2 }} />

      {/* ========== 数据源配置 ========== */}
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        数据源配置
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 2 }}>
        选择仪表盘数据来源：本地 Mock、后端 API 或腾讯文档
      </Typography>

      {/* 数据源模式选择 */}
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>数据源模式</InputLabel>
        <Select
          value={draft.dashboard.dataSourceMode || 'mock'}
          label="数据源模式"
          onChange={(e) => updateDashboard('dataSourceMode', e.target.value as 'mock' | 'api' | 'tencent-docs')}
        >
          <MenuItem value="mock">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10B981' }} />
              Mock 数据（本地演示）
            </Box>
          </MenuItem>
          <MenuItem value="api">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#3B82F6' }} />
              API 接口（后端服务）
            </Box>
          </MenuItem>
          <MenuItem value="tencent-docs">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#F59E0B' }} />
              腾讯文档（在线表格）
            </Box>
          </MenuItem>
        </Select>
      </FormControl>

      {/* API Base URL - 仅 API 模式显示 */}
      {draft.dashboard.dataSourceMode === 'api' && (
        <TextField
          label="API 基础地址"
          type="url"
          size="small"
          fullWidth
          value={draft.dashboard.dataSourceApiBaseUrl || ''}
          onChange={(e) => updateDashboard('dataSourceApiBaseUrl', e.target.value)}
          placeholder="例如：https://api.example.com"
          helperText="后端 API 服务的基础 URL 地址"
          sx={{ ...textFieldSx, mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />
      )}

      {/* 腾讯文档映射 - 仅腾讯文档模式显示 */}
      {draft.dashboard.dataSourceMode === 'tencent-docs' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
            请确保已在"腾讯文档"标签页完成授权，并填写以下文档 ID
          </Alert>
          <TextField
            label="仓库数据文档 ID"
            size="small"
            fullWidth
            value={draft.dashboard.dataSourceDocMappings?.warehouses || ''}
            onChange={(e) => updateDashboard('dataSourceDocMappings', {
              ...draft.dashboard.dataSourceDocMappings,
              warehouses: e.target.value,
            })}
            placeholder="文档 ID 或 URL"
            sx={textFieldSx}
          />
          <TextField
            label="在途订单文档 ID"
            size="small"
            fullWidth
            value={draft.dashboard.dataSourceDocMappings?.transitOrders || ''}
            onChange={(e) => updateDashboard('dataSourceDocMappings', {
              ...draft.dashboard.dataSourceDocMappings,
              transitOrders: e.target.value,
            })}
            placeholder="文档 ID 或 URL"
            sx={textFieldSx}
          />
          <TextField
            label="库存数据文档 ID"
            size="small"
            fullWidth
            value={draft.dashboard.dataSourceDocMappings?.inventory || ''}
            onChange={(e) => updateDashboard('dataSourceDocMappings', {
              ...draft.dashboard.dataSourceDocMappings,
              inventory: e.target.value,
            })}
            placeholder="文档 ID 或 URL"
            sx={textFieldSx}
          />
        </Box>
      )}

      {/* 状态提示 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1, bgcolor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
        {draft.dashboard.dataSourceMode === 'mock' ? (
          <>
            <CloudOffIcon sx={{ fontSize: 20, color: '#9CA3AF' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
              使用本地 Mock 数据，刷新页面后生效
            </Typography>
          </>
        ) : draft.dashboard.dataSourceMode === 'api' ? (
          <>
            <CloudDoneIcon sx={{ fontSize: 20, color: '#3B82F6' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
              从 API 获取数据：{draft.dashboard.dataSourceApiBaseUrl || '未配置'}
            </Typography>
          </>
        ) : (
          <>
            <DescriptionIcon sx={{ fontSize: 20, color: '#F59E0B' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
              从腾讯文档获取数据
            </Typography>
          </>
        )}
      </Box>

      {/* 应用配置按钮 */}
      <Button
        variant="contained"
        fullWidth
        onClick={() => {
          // 保存数据源配置到 dashboardApi
          const { dashboard } = draft;
          const dataSourceConfig = {
            mode: (dashboard.dataSourceMode || 'mock') as 'mock' | 'api' | 'tencent-docs',
            apiBaseUrl: dashboard.dataSourceApiBaseUrl || '/api',
            docMappings: dashboard.dataSourceDocMappings || {},
          };
          // 调用 dashboardApi.setConfig 持久化配置
          dashboardApi.setConfig(dataSourceConfig);

          // 显示成功消息
          setSnackbarMsg('数据源配置已保存，正在刷新数据...');
          setSnackbarOpen(true);
        }}
        sx={{
          mt: 1,
          bgcolor: '#111827',
          '&:hover': { bgcolor: '#1F2937' },
          height: 42,
          borderRadius: 1,
        }}
      >
        应用数据源配置
      </Button>
    </Box>
  );

  const renderDashboardIndicators = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 480 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        仪表盘指标控制
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        开关控制仪表盘上各模块的显示与隐藏
      </Typography>

      {/* KPI Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, mb: 0.5 }}>
        KPI 指标卡片
      </Typography>
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.kpiTransitVolume} onChange={(e) => updateVisibility('kpiTransitVolume', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>在途货物总量</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.kpiVolumeUtilization} onChange={(e) => updateVisibility('kpiVolumeUtilization', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>仓库总容积利用率</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.kpiPendingInbound} onChange={(e) => updateVisibility('kpiPendingInbound', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>待处理入库单</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.kpiOutboundCount} onChange={(e) => updateVisibility('kpiOutboundCount', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>当日出库量</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.kpiInventoryDepth} onChange={(e) => updateVisibility('kpiInventoryDepth', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>库存深度</Typography>}
      />

      <Divider sx={{ my: 1.5 }} />

      {/* Charts Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        图表组件
      </Typography>
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartVolumeTrend} onChange={(e) => updateVisibility('chartVolumeTrend', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>容积率趋势图</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartTransitPie} onChange={(e) => updateVisibility('chartTransitPie', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>在途货物状态分布</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartWarehouseBar} onChange={(e) => updateVisibility('chartWarehouseBar', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>各仓库容积使用情况</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartInventoryAlert} onChange={(e) => updateVisibility('chartInventoryAlert', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>库存预警列表</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartKpiComparison} onChange={(e) => updateVisibility('chartKpiComparison', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>各仓库KPI对比表</Typography>}
      />
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartTransitTime} onChange={(e) => updateVisibility('chartTransitTime', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>运单时效分析</Typography>}
      />

      <Divider sx={{ my: 1.5 }} />

      {/* Heatmap Section */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        热力图
      </Typography>
      <FormControlLabel
        control={<Switch checked={draft.dashboard.visibility.chartShipmentHeatmap} onChange={(e) => updateVisibility('chartShipmentHeatmap', e.target.checked)} size="small" sx={switchSx} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>仓库出货热力图</Typography>}
      />

      {/* 热力图详细设置（仅当热力图启用时显示） */}
      {draft.dashboard.visibility.chartShipmentHeatmap && (
        <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>
              时间范围
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[7, 14, 30, 365].map((d) => (
                <Chip
                  key={d}
                  label={`${d} 天`}
                  size="small"
                  onClick={() => updateHeatmap('days', d)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: draft.dashboard.heatmap.days === d ? '#111827' : '#F3F4F6',
                    color: draft.dashboard.heatmap.days === d ? '#FFFFFF' : '#6B7280',
                    '&:hover': {
                      backgroundColor: draft.dashboard.heatmap.days === d ? '#374151' : '#E5E7EB',
                    },
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#111827', mb: 0.5, fontWeight: 500 }}>
              颜色方案
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[
                { key: 'ocean' as const, label: '海洋蓝', colors: ['#E0F2FE', '#0EA5E9', '#0369A1'] },
                { key: 'forest' as const, label: '森林绿', colors: ['#DCFCE7', '#22C55E', '#15803D'] },
                { key: 'sunset' as const, label: '日落橙', colors: ['#FED7AA', '#F97316', '#C2410C'] },
              ].map((scheme) => (
                <Chip
                  key={scheme.key}
                  label={scheme.label}
                  size="small"
                  onClick={() => updateHeatmap('colorScheme', scheme.key)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#111827' : '#F3F4F6',
                    color: draft.dashboard.heatmap.colorScheme === scheme.key ? '#FFFFFF' : '#6B7280',
                    '&:hover': {
                      backgroundColor: draft.dashboard.heatmap.colorScheme === scheme.key ? '#374151' : '#E5E7EB',
                    },
                    transition: 'all 0.15s ease',
                  }}
                  icon={
                    <Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>
                      {scheme.colors.map((c, i) => (
                        <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                      ))}
                    </Box>
                  }
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* 容积率管理 */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        容积率管理
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        容积率基于件数计算（已用件数/总件数上限）。可在仓库管理页为每个仓库设置件数上限。预警线、满仓线在下方参数中配置。
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => {
            // 动态导入以避免 SSR 问题
            import('../../utils/exportCsv').then((mod) => {
              mod.downloadVolumeTemplate();
            });
          }}
          sx={{ borderColor: '#111827', color: '#111827', fontSize: '0.8rem', '&:hover': { borderColor: '#374151', backgroundColor: '#F9FAFB' } }}
        >
          下载导入模板
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<LinkIcon />}
          onClick={() => {
            const docUrl = 'https://docs.qq.com/doc/volume-rate-guide';
            openInBrowser(docUrl);
          }}
          sx={{ borderColor: '#111827', color: '#111827', fontSize: '0.8rem', '&:hover': { borderColor: '#374151', backgroundColor: '#F9FAFB' } }}
        >
          查看文档
        </Button>
      </Box>

      {/* 容积率文档链接管理 */}
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        容积率文档链接
      </Typography>

      {/* 添加容积率文档链接表单 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, p: 2, mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', mb: 1.5 }}>
          添加文档链接
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="文档链接"
            size="small"
            fullWidth
            placeholder="https://docs.qq.com/doc/..."
            value={newVolumeDocUrl}
            onChange={(e) => {
              setNewVolumeDocUrl(e.target.value);
              setVolumeDocErrors((prev) => { const n = { ...prev }; delete n['volumeDoc.url']; return n; });
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={textFieldSx}
            error={Boolean(volumeDocErrors['volumeDoc.url'])}
            helperText={volumeDocErrors['volumeDoc.url'] || '支持腾讯文档、企业微信文档等链接'}
            FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: '#9CA3AF' } }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField
              label="文档名称（选填）"
              size="small"
              sx={{ flex: 1, ...textFieldSx }}
              value={newVolumeDocTitle}
              onChange={(e) => setNewVolumeDocTitle(e.target.value)}
              placeholder="容积率说明文档"
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.875rem' }}>文档类型</InputLabel>
              <Select
                value={newVolumeDocDataType}
                label="文档类型"
                onChange={(e) => setNewVolumeDocDataType(e.target.value as VolumeDocLinkItem['dataType'])}
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="volume">容积率</MenuItem>
                <MenuItem value="other">其他</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddVolumeDocLink}
              sx={{
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#374151' },
                height: 40,
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </Button>
          </Box>
        </Box>
      </Card>

      {/* 已添加的文档链接列表 */}
      {(draft.volumeDocs?.docLinks ?? []).length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 32, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
            暂无容积率文档链接，请在上方添加
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {(draft.volumeDocs?.docLinks ?? []).map((doc) => (
            <Card key={doc.id} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      backgroundColor: '#6B7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <DescriptionIcon sx={{ color: '#fff', fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </Typography>
                      <Chip
                        label={doc.dataType === 'volume' ? '容积率' : '其他'}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="在浏览器中打开">
                      <IconButton
                        size="small"
                        onClick={() => openInBrowser(doc.url)}
                        sx={{ color: '#6B7280' }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除链接">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveVolumeDocLink(doc.id)}
                        sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* 组件顺序设置 */}
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
        组件顺序
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF', mb: 1 }}>
        拖动调整仪表盘组件的显示顺序
      </Typography>
      <List sx={{ bgcolor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB', py: 0.5 }}>
        {draft.dashboard.componentOrder.map((comp, idx) => {
          const labels: Record<string, string> = {
            'kpi-cards': 'KPI 指标卡片',
            'heatmap': '仓库出货热力图',
            'volume-trend': '容积率趋势图',
            'transit-pie': '在途货物状态分布',
            'warehouse-bar': '各仓库容积使用情况',
            'inventory-alert': '库存预警列表',
            'kpi-comparison': '各仓库KPI对比表',
            'transit-time': '运单时效分析',
          };
          return (
            <ListItem
              key={comp}
              sx={{
                py: 0.5,
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderBottom: idx < draft.dashboard.componentOrder.length - 1 ? '1px solid #E5E7EB' : 'none',
              }}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    disabled={idx === 0}
                    onClick={() => {
                      if (idx === 0) return;
                      const next = [...draft.dashboard.componentOrder];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      updateDashboard('componentOrder', next);
                    }}
                    sx={{ color: '#6B7280', '&.Mui-disabled': { color: '#D1D5DB' } }}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={idx === draft.dashboard.componentOrder.length - 1}
                    onClick={() => {
                      if (idx === draft.dashboard.componentOrder.length - 1) return;
                      const next = [...draft.dashboard.componentOrder];
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      updateDashboard('componentOrder', next);
                    }}
                    sx={{ color: '#6B7280', '&.Mui-disabled': { color: '#D1D5DB' } }}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={<Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>{labels[comp] || comp}</Typography>}
              />
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  // ===================== 模型管理渲染 =====================

  /** 打开添加/编辑模型对话框 */
  const openModelDialog = useCallback((mode: 'add' | 'edit', model?: ModelConfig) => {
    setModelDialogMode(mode);
    if (mode === 'edit' && model) {
      setEditingModel(model);
      setModelForm({
        id: model.id,
        name: model.name,
        provider: model.provider,
        apiEndpoint: model.apiEndpoint || '',
        apiKey: model.apiKey || '',
        enabled: model.enabled,
        description: model.description || '',
        contextWindow: model.contextWindow?.toString() || '',
        maxTokens: model.maxTokens?.toString() || '',
      });
    } else {
      setEditingModel(null);
      setModelForm({
        id: `model-${Date.now()}`,
        name: '',
        provider: 'openai',
        apiEndpoint: '',
        apiKey: '',
        enabled: true,
        description: '',
        contextWindow: '',
        maxTokens: '',
      });
    }
    setModelFormErrors({});
  }, []);

  /** 关闭模型对话框 */
  const closeModelDialog = useCallback(() => {
    setModelDialogMode(null);
    setEditingModel(null);
    setModelFormErrors({});
  }, []);

  /** 验证模型表单 */
  const validateModelForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!modelForm.id.trim()) {
      errors['model.id'] = '模型 ID 不能为空';
    } else if (modelDialogMode === 'add' && draft.models.models.some((m) => m.id === modelForm.id.trim())) {
      errors['model.id'] = '模型 ID 已存在';
    }
    if (!modelForm.name.trim()) {
      errors['model.name'] = '模型名称不能为空';
    }
    if (modelForm.contextWindow && isNaN(Number(modelForm.contextWindow))) {
      errors['model.contextWindow'] = '上下文窗口必须是数字';
    }
    if (modelForm.maxTokens && isNaN(Number(modelForm.maxTokens))) {
      errors['model.maxTokens'] = '最大输出 token 必须是数字';
    }
    setModelFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [modelForm, modelDialogMode, draft.models.models]);

  /** 保存模型（添加或编辑） */
  const handleSaveModel = useCallback(() => {
    if (!validateModelForm()) return;

    const modelData: ModelConfig = {
      id: modelForm.id.trim(),
      name: modelForm.name.trim(),
      provider: modelForm.provider,
      enabled: modelForm.enabled,
      description: modelForm.description.trim() || undefined,
      contextWindow: modelForm.contextWindow ? Number(modelForm.contextWindow) : undefined,
      maxTokens: modelForm.maxTokens ? Number(modelForm.maxTokens) : undefined,
    };

    if (modelForm.apiEndpoint.trim()) {
      modelData.apiEndpoint = modelForm.apiEndpoint.trim();
    }
    if (modelForm.apiKey.trim()) {
      modelData.apiKey = modelForm.apiKey.trim();
    }

    if (modelDialogMode === 'edit' && editingModel) {
      // 编辑现有模型
      setDraft((prev) => ({
        ...prev,
        models: {
          ...prev.models,
          models: prev.models.models.map((m) =>
            m.id === editingModel.id ? { ...m, ...modelData, id: modelForm.id.trim() } : m
          ),
        },
      }));
    } else {
      // 添加新模型
      setDraft((prev) => ({
        ...prev,
        models: {
          ...prev.models,
          models: [...prev.models.models, modelData],
        },
      }));
    }

    closeModelDialog();
  }, [modelForm, modelDialogMode, editingModel, validateModelForm, closeModelDialog]);

  /** 删除模型 */
  const handleDeleteModel = useCallback((modelId: string) => {
    if (!window.confirm('确定要删除此模型吗？此操作不可恢复。')) return;

    setDraft((prev) => {
      const newModels = prev.models.models.filter((m) => m.id !== modelId);
      // 如果删除的是默认模型，将第一个可用模型设为默认
      let newDefaultId = prev.models.defaultModelId;
      if (modelId === prev.models.defaultModelId && newModels.length > 0) {
        const firstEnabled = newModels.find((m) => m.enabled);
        newDefaultId = firstEnabled ? firstEnabled.id : newModels[0].id;
      }
      return {
        ...prev,
        models: {
          ...prev.models,
          models: newModels,
          defaultModelId: newDefaultId,
        },
      };
    });
  }, []);

  /** 设置默认模型 */
  const handleSetDefaultModel = useCallback((modelId: string) => {
    setDraft((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        defaultModelId: modelId,
        models: prev.models.models.map((m) => ({
          ...m,
          isDefault: m.id === modelId,
        })),
      },
    }));
  }, []);

  /** 切换模型启用状态 */
  const handleToggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        models: prev.models.models.map((m) =>
          m.id === modelId ? { ...m, enabled } : m
        ),
      },
    }));
  }, []);

  const renderModelManagement = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>
          模型管理
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => openModelDialog('add')}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            fontSize: '0.8rem',
          }}
        >
          添加模型
        </Button>
      </Box>

      <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
        管理 AI 模型配置，设置默认模型。当前默认模型：
        <Chip
          label={draft.models.models.find((m) => m.id === draft.models.defaultModelId)?.name || '未设置'}
          size="small"
          sx={{ ml: 1, backgroundColor: '#EFF6FF', color: '#1E40AF', fontSize: '0.75rem' }}
        />
      </Typography>

      {/* 模型列表 */}
      <List sx={{ width: '100%', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #E5E7EB' }}>
        {draft.models.models.map((model) => (
          <ListItem
            key={model.id}
            sx={{
              py: 1.5,
              px: 2,
              borderBottom: '1px solid #E5E7EB',
              backgroundColor: model.id === draft.models.defaultModelId ? '#F0FDF4' : 'transparent',
              '&:last-child': { borderBottom: 'none' },
            }}
            secondaryAction={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {model.id !== draft.models.defaultModelId && (
                  <Tooltip title="设为默认">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleSetDefaultModel(model.id)}
                      sx={{
                        borderColor: '#10B981',
                        color: '#10B981',
                        fontSize: '0.7rem',
                        py: 0.2,
                        '&:hover': { borderColor: '#059669', backgroundColor: '#ECFDF5' },
                      }}
                    >
                      默认
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title={model.enabled ? '禁用' : '启用'}>
                  <Switch
                    checked={model.enabled}
                    onChange={(e) => handleToggleModelEnabled(model.id, e.target.checked)}
                    size="small"
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#10B981' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10B981' },
                    }}
                  />
                </Tooltip>
                <Tooltip title="编辑">
                  <IconButton size="small" onClick={() => openModelDialog('edit', model)} sx={{ color: '#6B7280' }}>
                    <TuneIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="删除">
                  <IconButton size="small" onClick={() => handleDeleteModel(model.id)} sx={{ color: '#EF4444' }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            }
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                    {model.name}
                  </Typography>
                  {model.id === draft.models.defaultModelId && (
                    <Chip label="默认" size="small" sx={{ backgroundColor: '#10B981', color: '#FFF', fontSize: '0.65rem' }} />
                  )}
                  <Chip
                    label={model.provider}
                    size="small"
                    sx={{ backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: '0.65rem' }}
                  />
                  {!model.enabled && (
                    <Chip label="已禁用" size="small" sx={{ backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.65rem' }} />
                  )}
                </Box>
              }
              secondary={
                <Box sx={{ mt: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    ID: {model.id}
                  </Typography>
                  {model.description && (
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>
                      {model.description}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    {model.contextWindow && (
                      <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                        上下文：{model.contextWindow.toLocaleString()} tokens
                      </Typography>
                    )}
                    {model.maxTokens && (
                      <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                        最大输出：{model.maxTokens.toLocaleString()} tokens
                      </Typography>
                    )}
                  </Box>
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {/* 模型对话框 */}
      {modelDialogMode && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
          }}
          onClick={closeModelDialog}
        >
          <Card
            sx={{ width: 500, maxWidth: '90%', p: 3 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827', mb: 2 }}>
                {modelDialogMode === 'add' ? '添加模型' : '编辑模型'}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="模型 ID"
                  value={modelForm.id}
                  onChange={(e) => setModelForm((prev) => ({ ...prev, id: e.target.value }))}
                  error={!!modelFormErrors['model.id']}
                  helperText={modelFormErrors['model.id']}
                  disabled={modelDialogMode === 'edit'}
                  fullWidth
                  size="small"
                  sx={textFieldSx}
                />

                <TextField
                  label="模型名称"
                  value={modelForm.name}
                  onChange={(e) => setModelForm((prev) => ({ ...prev, name: e.target.value }))}
                  error={!!modelFormErrors['model.name']}
                  helperText={modelFormErrors['model.name']}
                  fullWidth
                  size="small"
                  sx={textFieldSx}
                />

                <FormControl fullWidth size="small">
                  <InputLabel>提供商</InputLabel>
                  <Select
                    value={modelForm.provider}
                    label="提供商"
                    onChange={(e) => setModelForm((prev) => ({ ...prev, provider: e.target.value as ModelConfig['provider'] }))}
                  >
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="anthropic">Anthropic</MenuItem>
                    <MenuItem value="tencent">腾讯</MenuItem>
                    <MenuItem value="custom">自定义</MenuItem>
                  </Select>
                </FormControl>

                {modelForm.provider === 'custom' && (
                  <TextField
                    label="API 端点"
                    value={modelForm.apiEndpoint}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, apiEndpoint: e.target.value }))}
                    fullWidth
                    size="small"
                    placeholder="https://api.example.com/v1"
                    sx={textFieldSx}
                  />
                )}

                <TextField
                  label="API Key（可选）"
                  value={modelForm.apiKey}
                  onChange={(e) => setModelForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  fullWidth
                  size="small"
                  type="password"
                  sx={textFieldSx}
                />

                <TextField
                  label="描述"
                  value={modelForm.description}
                  onChange={(e) => setModelForm((prev) => ({ ...prev, description: e.target.value }))}
                  fullWidth
                  size="small"
                  multiline
                  rows={2}
                  sx={textFieldSx}
                />

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="上下文窗口 (tokens)"
                    value={modelForm.contextWindow}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, contextWindow: e.target.value }))}
                    error={!!modelFormErrors['model.contextWindow']}
                    helperText={modelFormErrors['model.contextWindow']}
                    size="small"
                    type="number"
                    sx={{ ...textFieldSx, flex: 1 }}
                  />
                  <TextField
                    label="最大输出 (tokens)"
                    value={modelForm.maxTokens}
                    onChange={(e) => setModelForm((prev) => ({ ...prev, maxTokens: e.target.value }))}
                    error={!!modelFormErrors['model.maxTokens']}
                    helperText={modelFormErrors['model.maxTokens']}
                    size="small"
                    type="number"
                    sx={{ ...textFieldSx, flex: 1 }}
                  />
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={modelForm.enabled}
                      onChange={(e) => setModelForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: '0.875rem' }}>启用此模型</Typography>}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                <Button variant="outlined" onClick={closeModelDialog} size="small">
                  取消
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSaveModel}
                  size="small"
                  sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}
                >
                  保存
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setLocalUpdateStatus(null);
    try {
      const result = await globalCheckForUpdates();
      // 如果全局通知已显示（有新版本），则不需要本地状态
      if (!result.hasUpdate) {
        setLocalUpdateStatus(result);
      }
      if (result.error) {
        console.warn('检查更新失败:', result.error);
        setLocalUpdateStatus(result);
      }
    } catch (err) {
      const errorStatus: UpdateStatus = {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        error: err instanceof Error ? err.message : '检查更新失败',
      };
      setLocalUpdateStatus(errorStatus);
    } finally {
      setCheckingUpdate(false);
    }
  }, [globalCheckForUpdates, APP_VERSION]);

  const handleDownloadUpdate = useCallback(() => {
    downloadUpdate();
  }, [downloadUpdate]);


  // 红黄绿按钮偏移量状态
  const [trafficLightOffset, setTrafficLightOffset] = useState({ x: 0, y: 0 });
  const [loadingTrafficLight, setLoadingTrafficLight] = useState(false);
  const [savingTrafficLight, setSavingTrafficLight] = useState(false);
  const [trafficLightMessage, setTrafficLightMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // 初始化加载已保存的偏移量
  useEffect(() => {
    if (!isPyWebView() || !window.pywebview?.api?.get_traffic_light_offset) return;
    setLoadingTrafficLight(true);
    window.pywebview.api.get_traffic_light_offset()
      .then((res: string) => {
        try {
          const data = JSON.parse(res);
          if (data.ok) {
            setTrafficLightOffset({ x: data.offset_x || 0, y: data.offset_y || 0 });
          }
        } catch (e) {
          console.warn('获取红黄绿按钮偏移量失败:', e);
        }
      })
      .catch((err: any) => {
        console.warn('调用 get_traffic_light_offset 失败:', err);
      })
      .finally(() => setLoadingTrafficLight(false));
  }, []);

  // 应用偏移量
  const applyTrafficLightOffset = useCallback(async () => {
    if (!isPyWebView() || !window.pywebview?.api?.set_traffic_light_offset) return;
    setSavingTrafficLight(true);
    setTrafficLightMessage(null);
    try {
      const res = await window.pywebview.api.set_traffic_light_offset(trafficLightOffset.x, trafficLightOffset.y);
      const data = JSON.parse(res);
      if (data.ok) {
        setTrafficLightMessage({ type: 'success', text: '已应用偏移量，请观察红黄绿按钮位置' });
      } else {
        setTrafficLightMessage({ type: 'error', text: data.error || '应用失败' });
      }
    } catch (err: any) {
      setTrafficLightMessage({ type: 'error', text: err.message || '调用失败' });
    } finally {
      setSavingTrafficLight(false);
    }
  }, [trafficLightOffset]);

  // 重置偏移量
  const resetTrafficLightOffset = useCallback(async () => {
    setTrafficLightOffset({ x: 0, y: 0 });
    if (isPyWebView() && window.pywebview?.api?.set_traffic_light_offset) {
      try {
        await window.pywebview.api.set_traffic_light_offset(0, 0);
        setTrafficLightMessage({ type: 'success', text: '已重置为默认位置' });
      } catch (err: any) {
        setTrafficLightMessage({ type: 'error', text: err.message || '重置失败' });
      }
    }
  }, []);
  const renderAbout = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 400 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', mb: 1 }}>
        关于系统
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>系统名称</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>CDF Know CrossWMS</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>版本</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>V{APP_VERSION}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>构建日期</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>运行环境</Typography>
        <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500 }}>
          {window.electronAPI ? 'Electron 桌面应用' : '浏览器'}
        </Typography>
      </Box>

      {/*
       * 自动更新区域
       * 提示：此处由 checkForUpdates() 读取远程 release.json 判断是否有新版本
       */}
      <Box sx={{ mt: 1, mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={handleCheckUpdate}
          disabled={checkingUpdate}
          startIcon={checkingUpdate ? <Box component="span" sx={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #9CA3AF', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} /> : undefined}
          sx={{
            borderColor: '#E5E7EB',
            color: '#6B7280',
            fontSize: '0.8rem',
            '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
          }}
        >
          {checkingUpdate ? '检查中...' : effectiveUpdateStatus ? '重新检查更新' : '检查更新'}
        </Button>

        {effectiveUpdateStatus && !effectiveUpdateStatus.error && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: effectiveUpdateStatus.hasUpdate ? '#FFF7ED' : '#F9FAFB', border: `1px solid ${effectiveUpdateStatus.hasUpdate ? '#FDBA74' : '#E5E7EB'}` }}>
            {effectiveUpdateStatus.hasUpdate && effectiveUpdateStatus.releaseInfo ? (
              <Box>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#9A3412', mb: 0.5 }}>
                  发现新版本 V{formatVersion(effectiveUpdateStatus.latestVersion)}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9A3412', mb: 1, whiteSpace: 'pre-wrap' }}>
                  {effectiveUpdateStatus.releaseInfo.notes}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#B45309', mb: 1 }}>
                  发布时间：{effectiveUpdateStatus.releaseInfo.pubDate}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleDownloadUpdate}
                  sx={{
                    backgroundColor: '#9A3412',
                    '&:hover': { backgroundColor: '#7C2D12' },
                    fontSize: '0.8rem',
                  }}
                >
                  下载最新版本
                </Button>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.8rem', color: '#6B7280' }}>
                ✓ 当前已是最新版本
              </Typography>
            )}
          </Box>
        )}

        {effectiveUpdateStatus?.error && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
            <Typography sx={{ fontSize: '0.8rem', color: '#991B1B' }}>
              检查更新失败：{effectiveUpdateStatus.error}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#991B1B', mt: 0.5 }}>
              请确保应用可以访问互联网，或联系管理员获取最新版本
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 1 }} />

      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', mt: 0.5 }}>
        侧边栏设置
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={draft.sidebar.showVersion}
            onChange={(e) => updateSidebar('showVersion', e.target.checked)}
            size="small"
            sx={switchSx}
          />
        }
        label={
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#111827' }}>显示版本号</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              在侧边栏 Logo 旁显示当前版本号（v{APP_VERSION}）
            </Typography>
          </Box>
        }
      />

      <Divider sx={{ my: 1.5 }} />



      {/* 红黄绿按钮位置调整（仅 macOS pywebview 环境） */}
      {isPyWebView() && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', mt: 0.5, mb: 1 }}>
            红黄绿按钮位置
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mb: 1.5 }}>
            调整 macOS 窗口标题栏左上角红黄绿按钮的偏移量。正值向右/向下，负值向左/向上。
          </Typography>

          {loadingTrafficLight ? (
            <Typography sx={{ fontSize: '0.8rem', color: '#9CA3AF' }}>加载中...</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* 水平偏移 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', color: '#374151', mb: 0.5 }}>
                  水平偏移: {trafficLightOffset.x}px
                </Typography>
                <Slider
                  value={trafficLightOffset.x}
                  onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, x: v as number }))}
                  min={-50}
                  max={150}
                  step={1}
                  valueLabelDisplay="auto"
                  sx={{ color: '#111827', '& .MuiSlider-thumb': { width: 16, height: 16 } }}
                />
              </Box>
              {/* 垂直偏移 */}
              <Box>
                <Typography sx={{ fontSize: '0.8rem', color: '#374151', mb: 0.5 }}>
                  垂直偏移: {trafficLightOffset.y}px
                </Typography>
                <Slider
                  value={trafficLightOffset.y}
                  onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, y: v as number }))}
                  min={-50}
                  max={150}
                  step={1}
                  valueLabelDisplay="auto"
                  sx={{ color: '#111827', '& .MuiSlider-thumb': { width: 16, height: 16 } }}
                />
              </Box>

              {/* 操作按钮 */}
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={applyTrafficLightOffset}
                  disabled={savingTrafficLight}
                  sx={{
                    backgroundColor: '#111827',
                    '&:hover': { backgroundColor: '#1F2937' },
                    fontSize: '0.8rem',
                  }}
                >
                  {savingTrafficLight ? '应用中...' : '应用位置'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={resetTrafficLightOffset}
                  sx={{
                    borderColor: '#E5E7EB',
                    color: '#6B7280',
                    fontSize: '0.8rem',
                    '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
                  }}
                >
                  重置默认
                </Button>
              </Box>

              {/* 提示信息 */}
              {trafficLightMessage && (
                <Alert
                  severity={trafficLightMessage.type}
                  sx={{ fontSize: '0.75rem', py: 0 }}
                  onClose={() => setTrafficLightMessage(null)}
                >
                  {trafficLightMessage.text}
                </Alert>
              )}

              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mt: 0.5 }}>
                提示：此设置仅在 macOS 系统的 pywebview 环境中生效，重启应用后自动生效。
              </Typography>
            </Box>
          )}
        </>
      )}


    </Box>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'tencentDocs': return renderTencentDocs();
      case 'dashboardCalc': return renderDashboardCalc();
      case 'dashboardIndicators': return renderDashboardIndicators();
      case 'modelManagement': return renderModelManagement();
      case 'about': return renderAbout();
    }
  };

  // ===================== Main Layout =====================

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111827' }}>
        系统设置
      </Typography>

      <Box sx={{ display: 'flex', gap: 0, minHeight: 480 }}>
        {/* Left: Tab Navigation */}
        <Box
          sx={{
            width: 200,
            flexShrink: 0,
            borderRight: '1px solid #E5E7EB',
            pr: 0,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  cursor: 'pointer',
                  borderRadius: '0 8px 8px 0',
                  mr: 1,
                  mb: 0.5,
                  backgroundColor: isActive ? '#111827' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#6B7280',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    backgroundColor: isActive ? '#111827' : '#F3F4F6',
                  },
                  '& .tab-icon': {
                    color: isActive ? '#FFFFFF' : '#6B7280',
                    transition: 'color 0.15s ease',
                  },
                  '& .tab-label': {
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                  },
                }}
              >
                <Box className="tab-icon">{tab.icon}</Box>
                <Typography className="tab-label">{tab.label}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Right: Content Area */}
        <Box
          sx={{
            flex: 1,
            pl: 4,
            pr: 2,
            py: 0,
          }}
        >
          {renderContent()}
        </Box>
      </Box>

      {/* Action Buttons — fixed at bottom */}
      <Divider sx={{ my: 3 }} />
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={handleReset}
          sx={{
            borderColor: '#E5E7EB',
            color: '#6B7280',
            '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
          }}
        >
          重置为默认值
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={hasErrors}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            '&.Mui-disabled': { backgroundColor: '#E5E7EB', color: '#9CA3AF' },
          }}
        >
          保存设置
        </Button>
      </Box>

      {/* Snackbar for save/reset feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2500}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsPanel;

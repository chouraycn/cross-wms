import React from 'react';
import {
  Box, Card, Typography, List, ListItem, ListItemText, ListItemIcon, ListItemButton, Divider, IconButton, Tooltip, Chip, Button,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useNavigate } from 'react-router-dom';
import type { DocLinkItem, WeComDocLinkItem } from '../../contexts/AppSettingsContext';
import { getDocTypeFromUrl, extractFileIdFromUrl } from '../../services/tencentDocsApi';
import {
  extractWeComDocIdFromUrl, getWeComDocCategoryFromUrl, getWeComCategoryLabel,
} from '../../services/wecomDocsApi';
import { getWarehouses } from '../../capabilities/warehouse';

/** 腾讯文档品牌色 */
const TDOC_COLOR = '#27A17C';
/** 企业微信品牌色 */
const WECOM_COLOR = '#07C160';

/** 数据类型显示标签 */
const dataTypeLabels: Record<string, string> = {
  warehouses: '仓库信息', inventory: '库存数据', transit: '在途运单', other: '其他',
};

/**
 * 文档链接列表子组件
 *
 * 负责：按仓库分组的文档列表渲染（个人文档 + 企业文档）、空状态、刷新单个文档按钮、缓存时间显示。
 */
interface DocLinkManagerProps {
  docLinks: DocLinkItem[];
  wecomDocLinks: WeComDocLinkItem[];
  lastSync: string | null;
  refreshingDocId: string | null;
  refreshingWecomDocId: string | null;
  cacheKeyFn: (docId: string) => string;
  onOpenDoc: (docId: string, docTitle: string, docUrl: string) => void;
  onOpenWeComDoc: (docId: string, docTitle: string, docUrl: string) => void;
  onRefreshSingleDoc: (doc: DocLinkItem) => void;
  onRefreshSingleWecomDoc: (doc: WeComDocLinkItem) => void;
  onOpenInBrowser: (url: string) => Promise<void>;
}

const DocLinkManager: React.FC<DocLinkManagerProps> = ({
  docLinks, wecomDocLinks, lastSync, refreshingDocId, refreshingWecomDocId,
  cacheKeyFn, onOpenDoc, onOpenWeComDoc, onRefreshSingleDoc, onRefreshSingleWecomDoc, onOpenInBrowser,
}) => {
  const navigate = useNavigate();
  const allWarehouses = getWarehouses();

  /** 按仓库分组文档 */
  const getDocsGroupedByWarehouse = (docs: (DocLinkItem | WeComDocLinkItem)[]) => {
    const grouped: Record<string, { warehouseName: string; docs: (DocLinkItem | WeComDocLinkItem)[] }> = {};
    grouped['__global__'] = { warehouseName: '全局文档', docs: [] };
    docs.forEach((doc) => {
      const wid = doc.warehouseId;
      if (wid && allWarehouses.find((w) => w.id === wid)) {
        if (!grouped[wid]) {
          const wh = allWarehouses.find((w) => w.id === wid);
          grouped[wid] = { warehouseName: wh?.name || '未知仓库', docs: [] };
        }
        grouped[wid].docs.push(doc);
      } else {
        grouped['__global__'].docs.push(doc);
      }
    });
    return Object.entries(grouped).filter(([, v]) => v.docs.length > 0).sort((a, b) => {
      if (a[0] === '__global__') return 1;
      if (b[0] === '__global__') return -1;
      return 0;
    });
  };

  /** 渲染缓存时间 */
  const renderCacheTime = (cacheKey: string) => {
    const cached = localStorage.getItem(cacheKey);
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
      } catch { /* ignore */ }
    }
    return null;
  };

  return (
    <Box>
      {/* === 个人文档空状态 === */}
      {docLinks.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <DescriptionIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ color: '#6B7280', fontSize: '0.95rem', mb: 1 }}>暂无关联文档</Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem', mb: 2 }}>在设置中粘贴腾讯文档链接，即可在应用内读取文档内容</Typography>
          <Button variant="contained" startIcon={<SettingsIcon />} onClick={() => navigate('/settings')} sx={{ backgroundColor: TDOC_COLOR, '&:hover': { backgroundColor: '#1e7a5e' } }}>前往设置添加文档</Button>
        </Box>
      )}

      {/* === 个人文档列表 === */}
      {docLinks.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>已关联文档（{docLinks.length} 个）</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {lastSync && <Typography variant="caption" color="text.secondary">上次检查：{lastSync}</Typography>}
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
                    <ListItem disablePadding secondaryAction={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onOpenInBrowser(doc.url); }} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                        <Tooltip title="刷新文档内容"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onRefreshSingleDoc(doc); }} disabled={refreshingDocId === doc.id} sx={{ color: refreshingDocId === doc.id ? TDOC_COLOR : '#6B7280' }}><RefreshIcon sx={{ fontSize: 16, animation: refreshingDocId === doc.id ? 'spin 1s linear infinite' : 'none' }} /></IconButton></Tooltip>
                      </Box>
                    }>
                      <ListItemButton sx={{ py: 1.5 }} onClick={() => onOpenDoc(doc.id, doc.title, doc.url)}>
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          {doc.url.includes('/sheet/') ? <TableChartIcon sx={{ color: TDOC_COLOR }} /> : <DescriptionIcon sx={{ color: '#111827' }} />}
                        </ListItemIcon>
                        <ListItemText primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{doc.title}</Typography>
                            <Chip label={dataTypeLabels[doc.dataType] ?? '其他'} size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
                            <Chip label={getDocTypeFromUrl(doc.url) === 'sheet' ? '表格' : '文档'} size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: TDOC_COLOR }} />
                          </Box>
                        } secondary={
                          <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 300 }}>{doc.url}</Typography>
                            {renderCacheTime(cacheKeyFn(extractFileIdFromUrl(doc.url) || ''))}
                          </Box>
                        } />
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

      <Divider sx={{ my: 3 }} />

      {/* === 企业文档空状态 === */}
      {wecomDocLinks.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1.5 }} />
          <Typography sx={{ color: '#6B7280', fontSize: '0.9rem', mb: 0.5 }}>暂无企业文档</Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>在设置中添加企业微信文档链接（doc.weixin.qq.com）</Typography>
        </Box>
      )}

      {/* === 企业文档列表 === */}
      {wecomDocLinks.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>企业文档（{wecomDocLinks.length} 个）</Typography>
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
                      <ListItem disablePadding secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="在浏览器中打开"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onOpenInBrowser(doc.url); }} sx={{ color: '#6B7280' }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                          <Tooltip title="刷新文档内容"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onRefreshSingleWecomDoc(doc); }} disabled={refreshingWecomDocId === doc.id} sx={{ color: refreshingWecomDocId === doc.id ? WECOM_COLOR : '#6B7280' }}><RefreshIcon sx={{ fontSize: 16, animation: refreshingWecomDocId === doc.id ? 'spin 1s linear infinite' : 'none' }} /></IconButton></Tooltip>
                        </Box>
                      }>
                        <ListItemButton sx={{ py: 1.5 }} onClick={() => onOpenWeComDoc(doc.id, doc.title, doc.url)}>
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            {category === 'smartpage' ? <DescriptionIcon sx={{ color: WECOM_COLOR }} /> : category === 'smartsheet' ? <TableChartIcon sx={{ color: WECOM_COLOR }} /> : <DescriptionIcon sx={{ color: '#111827' }} />}
                          </ListItemIcon>
                          <ListItemText primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{doc.title}</Typography>
                              <Chip label={dataTypeLabels[doc.dataType] ?? '其他'} size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
                              <Chip label={getWeComCategoryLabel(category)} size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#ECFDF5', color: WECOM_COLOR }} />
                            </Box>
                          } secondary={
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 300 }}>{doc.url}</Typography>
                              {(() => {
                                const docid = extractWeComDocIdFromUrl(doc.url);
                                if (docid) return renderCacheTime(`crosswms-wecom-cache-${docid}`);
                                return null;
                              })()}
                            </Box>
                          } />
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
    </Box>
  );
};

export default DocLinkManager;

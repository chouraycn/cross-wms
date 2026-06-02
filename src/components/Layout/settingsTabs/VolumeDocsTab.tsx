import React from 'react';
import { Box, Typography, IconButton, Card, CardContent, Divider, Tooltip } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { AppSettings, DocLinkItem } from '../../../contexts/AppSettingsContext';

export interface VolumeDocsTabProps {
  draft: AppSettings;
  openInBrowser: (url: string) => void;
  onNavigateToTencentDocs?: () => void;
}

const VolumeDocsTab: React.FC<VolumeDocsTabProps> = ({ draft, openInBrowser, onNavigateToTencentDocs }) => {
  const volumeRelatedDocs = draft.tencentDocs.docLinks.filter(d => d.dataType === 'warehouses' || d.dataType === 'other');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        </Card>
      </Box>

      <Divider />

      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>关联文档</Typography>
      {volumeRelatedDocs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 2, border: '1px dashed #E5E7EB', borderRadius: 2 }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 28, color: '#D1D5DB', mb: 0.5 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>暂无容积率相关文档</Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>请在「腾讯文档」中先添加文档链接</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {volumeRelatedDocs.map((doc) => (
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
};

export default VolumeDocsTab;

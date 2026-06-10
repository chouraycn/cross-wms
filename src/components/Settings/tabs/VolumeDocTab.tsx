import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  Tooltip,
  IconButton,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DescriptionIcon from '@mui/icons-material/Description';
import type { AppSettings, VolumeDocLinkItem } from '../../../contexts/AppSettingsContext';
import { downloadVolumeTemplate } from '../../../utils/exportCsv';
import { textFieldSx } from '../sharedStyles';
import { getGrayScale } from '../../../constants/theme';

// ===================== Props =====================

export interface VolumeDocTabProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  openInBrowser: (url: string) => void;
}

// ===================== Component =====================

const VolumeDocTab: React.FC<VolumeDocTabProps> = ({
  draft,
  setDraft,
  openInBrowser,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // Volume doc link form state
  const [newVolumeDocUrl, setNewVolumeDocUrl] = useState('');
  const [newVolumeDocTitle, setNewVolumeDocTitle] = useState('');
  const [newVolumeDocDataType, setNewVolumeDocDataType] = useState<VolumeDocLinkItem['dataType']>('volume');
  const [volumeDocErrors, setVolumeDocErrors] = useState<Record<string, string>>({});

  /** Add a new volume doc link */
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
  }, [newVolumeDocUrl, newVolumeDocTitle, newVolumeDocDataType, draft.volumeDocs?.docLinks, setDraft]);

  /** Remove a volume doc link */
  const handleRemoveVolumeDocLink = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      volumeDocs: {
        docLinks: (prev.volumeDocs?.docLinks ?? []).filter((d) => d.id !== id),
      },
    }));
  }, [setDraft]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 480 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
        容积率文档
      </Typography>

      {/* Volume rate management description */}
      <Typography sx={{ fontSize: '0.8rem', color: gs.textDisabled, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 0.5, mb: 0.5 }}>
        容积率管理
      </Typography>
      <Typography sx={{ fontSize: '0.8rem', color: gs.textDisabled, mb: 1 }}>
        容积率基于件数计算（已用件数/总件数上限）。可在仓库管理页为每个仓库设置件数上限。预警线、满仓线在下方参数中配置。
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => {
            downloadVolumeTemplate();
          }}
          sx={{ borderColor: gs.textPrimary, color: gs.textPrimary, fontSize: '0.8rem', '&:hover': { borderColor: gs.textSecondary, backgroundColor: gs.bgHover } }}
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
          sx={{ borderColor: gs.textPrimary, color: gs.textPrimary, fontSize: '0.8rem', '&:hover': { borderColor: gs.textSecondary, backgroundColor: gs.bgHover } }}
        >
          查看文档
        </Button>
      </Box>

      {/* Volume doc link management */}
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
        容积率文档链接
      </Typography>

      {/* Add volume doc link form */}
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, p: 2, mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
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
                  <LinkIcon sx={{ fontSize: 18, color: gs.textDisabled }} />
                </InputAdornment>
              ),
            }}
            sx={textFieldSx}
            error={Boolean(volumeDocErrors['volumeDoc.url'])}
            helperText={volumeDocErrors['volumeDoc.url'] || '支持腾讯文档、企业微信文档等链接'}
            FormHelperTextProps={{ sx: { fontSize: '0.75rem', color: gs.textDisabled } }}
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
                backgroundColor: gs.textPrimary,
                '&:hover': { backgroundColor: gs.textSecondary },
                height: 40,
                whiteSpace: 'nowrap',
              }}
            >
              添加
            </Button>
          </Box>
        </Box>
      </Card>

      {/* Existing doc links list */}
      {(draft.volumeDocs?.docLinks ?? []).length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, border: `1px dashed ${gs.border}`, borderRadius: 2 }}>
          <DescriptionIcon sx={{ fontSize: 32, color: gs.borderDarker, mb: 1 }} />
          <Typography sx={{ color: gs.textDisabled, fontSize: '0.85rem' }}>
            暂无容积率文档链接，请在上方添加
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {(draft.volumeDocs?.docLinks ?? []).map((doc) => (
            <Card key={doc.id} elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      backgroundColor: gs.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <DescriptionIcon sx={{ color: gs.bgPanel, fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </Typography>
                      <Chip
                        label={doc.dataType === 'volume' ? '容积率' : '其他'}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem', backgroundColor: gs.bgHover, color: gs.textMuted }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <Tooltip title="在浏览器中打开">
                      <IconButton
                        size="small"
                        onClick={() => openInBrowser(doc.url)}
                        sx={{ color: gs.textMuted }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除链接">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveVolumeDocLink(doc.id)}
                        sx={{ color: gs.textDisabled, '&:hover': { color: '#EF4444' } }}
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
    </Box>
  );
};

export default VolumeDocTab;

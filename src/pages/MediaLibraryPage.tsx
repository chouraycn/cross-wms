import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Tooltip,
  Pagination,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CardActionArea,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import {
  listAssets,
  uploadAsset,
  deleteAsset,
  getDownloadUrl,
  getAssetDirectUrl,
  type MediaAsset,
  type MediaType,
} from '../services/mediaLibraryApi';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

const PAGE_SIZE = 12;

/** 类型筛选选项。 */
const TYPE_FILTERS: { value: MediaType | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
  { value: 'other', label: '其他' },
];

export default function MediaLibraryPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); // 1-based
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选
  const [typeFilter, setTypeFilter] = useState<MediaType | ''>('');
  const [formatFilter, setFormatFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // YYYY-MM-DD

  // 上传
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 删除确认对话框
  const [pendingDelete, setPendingDelete] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 预览对话框
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  /** 拉取资产列表。 */
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const offset = (page - 1) * PAGE_SIZE;
      const since = dateFilter ? new Date(dateFilter).toISOString() : undefined;
      const resp = await listAssets({
        type: typeFilter || undefined,
        format: formatFilter || undefined,
        since,
        limit: PAGE_SIZE,
        offset,
      });
      setAssets(resp.data);
      setTotal(resp.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取媒体资产列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, formatFilter, dateFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [typeFilter, formatFilter, dateFilter]);

  /** 处理文件上传（可批量）。 */
  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      try {
        setUploading(true);
        setUploadError('');
        // 串行上传，避免后端 multipart 解析冲突
        for (const file of list) {
          await uploadAsset(file);
        }
        // 上传完成后回到第一页并刷新
        setPage(1);
        await fetchAssets();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [fetchAssets],
  );

  /** 文件选择框 change。 */
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
      // 重置 input 以便相同文件可再次选择
      e.target.value = '';
    }
  };

  /** 拖拽相关事件。 */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  /** 触发删除（弹出确认）。 */
  const handleAskDelete = (asset: MediaAsset) => {
    setPendingDelete(asset);
  };

  /** 确认删除。 */
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await deleteAsset(pendingDelete.id);
      setAssets((prev) => prev.filter((a) => a.id !== pendingDelete.id));
      setTotal((t) => Math.max(0, t - 1));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  /** 复制资源直链到剪贴板。 */
  const handleCopyLink = async (asset: MediaAsset) => {
    const url = getAssetDirectUrl(asset);
    try {
      await navigator.clipboard.writeText(url);
      // 简单的视觉反馈：通过 alert 文本展示，不阻塞 UI
      setError('');
    } catch {
      // 降级：使用 prompt 让用户手动复制
      window.prompt('复制链接:', url);
    }
  };

  /** 打开下载。 */
  const handleDownload = (asset: MediaAsset) => {
    const url = getDownloadUrl(asset.id);
    window.open(url, '_blank');
  };

  /** 根据类型返回图标。 */
  const getTypeIcon = (type: MediaType) => {
    switch (type) {
      case 'image':
        return <ImageIcon fontSize="small" />;
      case 'audio':
        return <AudioFileIcon fontSize="small" />;
      case 'video':
        return <VideoFileIcon fontSize="small" />;
      default:
        return <InsertDriveFileIcon fontSize="small" />;
    }
  };

  /** 格式化文件大小。 */
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  /** 格式化时长（秒）。 */
  const formatDuration = (seconds?: number) => {
    if (seconds == null) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  };

  /** 格式化日期。 */
  const formatDate = (ts: number) => {
    try {
      return new Date(ts).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  /** 类型标签颜色。 */
  const getTypeColor = (type: MediaType): 'primary' | 'success' | 'warning' | 'default' => {
    switch (type) {
      case 'image':
        return 'primary';
      case 'audio':
        return 'success';
      case 'video':
        return 'warning';
      default:
        return 'default';
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** 缩略图渲染。 */
  const renderThumbnail = (asset: MediaAsset) => {
    const url = getAssetDirectUrl(asset);
    if (asset.type === 'image') {
      return (
        <Box
          sx={{
            width: '100%',
            height: 120,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: gs.bgHover,
          }}
        >
          <img
            src={url}
            alt={asset.originalName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            loading="lazy"
          />
        </Box>
      );
    }
    return (
      <Box
        sx={{
          width: '100%',
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: gs.bgHover,
          color: gs.textMuted,
        }}
      >
        {asset.type === 'audio' ? (
          <AudioFileIcon sx={{ fontSize: 48 }} />
        ) : asset.type === 'video' ? (
          <VideoFileIcon sx={{ fontSize: 48 }} />
        ) : (
          <InsertDriveFileIcon sx={{ fontSize: 48 }} />
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 顶部标题与刷新 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUploadIcon color="primary" />
          <Typography variant="h5">媒体资产库</Typography>
          <Chip size="small" label={`共 ${total} 项`} variant="outlined" />
        </Box>
        <Button
          onClick={fetchAssets}
          startIcon={<RefreshIcon />}
          variant="outlined"
          size="small"
          disabled={loading}
        >
          刷新
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {uploadError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setUploadError('')}>
          上传失败：{uploadError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* 左侧：上传区域 */}
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: gs.bgPanel, position: 'sticky', top: 16 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>上传资产</Typography>
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  border: `2px dashed ${dragOver ? gs.bgActive : gs.borderDarker}`,
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  bgcolor: dragOver ? gs.bgHover : 'transparent',
                  '&:hover': { bgcolor: gs.bgHover },
                }}
              >
                {uploading ? (
                  <Stack spacing={1} alignItems="center">
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary">
                      上传中…
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={1} alignItems="center">
                    <CloudUploadIcon sx={{ fontSize: 40, color: gs.textMuted }} />
                    <Typography variant="body2">
                      拖拽文件到此处
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      或点击选择文件
                    </Typography>
                  </Stack>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleFileInputChange}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                支持图片 / 音频 / 视频文件，单文件最大 10MB
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 右侧：筛选与资产列表 */}
        <Grid item xs={12} md={9}>
          <Card sx={{ bgcolor: gs.bgPanel, mb: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={typeFilter}
                  onChange={(_e, v: MediaType | '') => setTypeFilter(v ?? '')}
                >
                  {TYPE_FILTERS.map((t) => (
                    <ToggleButton key={t.value} value={t.value}>
                      {t.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <TextField
                  size="small"
                  placeholder="按格式筛选（如 mp3、png）"
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value)}
                  sx={{ minWidth: 180 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="开始日期"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                {(typeFilter || formatFilter || dateFilter) && (
                  <Button
                    size="small"
                    onClick={() => {
                      setTypeFilter('');
                      setFormatFilter('');
                      setDateFilter('');
                    }}
                  >
                    清除筛选
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : assets.length === 0 ? (
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无符合条件的资产，请上传文件或调整筛选条件。
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <>
              <Grid container spacing={2}>
                {assets.map((asset) => (
                  <Grid item xs={12} sm={6} md={4} key={asset.id}>
                    <Card
                      sx={{
                        bgcolor: gs.bgPanel,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                      }}
                    >
                      <CardActionArea onClick={() => setPreviewAsset(asset)}>
                        {renderThumbnail(asset)}
                      </CardActionArea>
                      <CardContent sx={{ flex: 1, pb: '12px !important' }}>
                        <Tooltip title={asset.originalName}>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ fontWeight: 500, mb: 0.5 }}
                          >
                            {asset.originalName}
                          </Typography>
                        </Tooltip>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                          <Chip
                            size="small"
                            icon={getTypeIcon(asset.type)}
                            label={asset.type}
                            color={getTypeColor(asset.type)}
                            variant="outlined"
                          />
                          <Chip size="small" label={asset.format} variant="outlined" />
                          {asset.duration != null && (
                            <Chip
                              size="small"
                              label={formatDuration(asset.duration)}
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {formatSize(asset.size)} · {formatDate(asset.createdAt)}
                        </Typography>
                      </CardContent>
                      <Box sx={{ p: 1, borderTop: `1px solid ${gs.border}` }}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="下载">
                            <IconButton size="small" onClick={() => handleDownload(asset)}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="复制链接">
                            <IconButton size="small" onClick={() => handleCopyLink(asset)}>
                              <LinkIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              onClick={() => handleAskDelete(asset)}
                              color="error"
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* 分页 */}
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_e, p) => setPage(p)}
                  color="primary"
                />
              </Box>
            </>
          )}
        </Grid>
      </Grid>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!pendingDelete}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            确定要删除资产「{pendingDelete?.originalName}」吗？该操作不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
            取消
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : undefined}
          >
            {deleting ? '删除中…' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 预览对话框 */}
      <Dialog
        open={!!previewAsset}
        onClose={() => setPreviewAsset(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            {previewAsset && getTypeIcon(previewAsset.type)}
            <Typography variant="subtitle1" noWrap>
              {previewAsset?.originalName}
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {previewAsset && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
              {previewAsset.type === 'image' && (
                <img
                  src={getAssetDirectUrl(previewAsset)}
                  alt={previewAsset.originalName}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
              )}
              {previewAsset.type === 'audio' && (
                <audio src={getAssetDirectUrl(previewAsset)} controls style={{ width: '100%' }} />
              )}
              {previewAsset.type === 'video' && (
                <video
                  src={getAssetDirectUrl(previewAsset)}
                  controls
                  style={{ maxWidth: '100%', maxHeight: '70vh' }}
                />
              )}
              {previewAsset.type === 'other' && (
                <Typography variant="body2" color="text.secondary">
                  该文件类型不支持在线预览，请下载后查看。
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => previewAsset && handleCopyLink(previewAsset)} startIcon={<LinkIcon />}>
            复制链接
          </Button>
          <Button
            onClick={() => previewAsset && handleDownload(previewAsset)}
            startIcon={<DownloadIcon />}
          >
            下载
          </Button>
          <Button onClick={() => setPreviewAsset(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

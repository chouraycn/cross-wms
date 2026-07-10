/**
 * CodeIndexPage — 代码索引管理面板
 *
 * 提供代码索引的状态展示、构建、统计、文件列表查看和符号搜索功能。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  LinearProgress,
  CircularProgress,
  Divider,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BuildIcon from '@mui/icons-material/Build';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import CodeIcon from '@mui/icons-material/Code';
import FolderIcon from '@mui/icons-material/Folder';
import TimerIcon from '@mui/icons-material/Timer';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ClearIcon from '@mui/icons-material/Clear';

import * as codeIndexApi from '../services/codeIndexApi';
import { getGrayScale } from '../constants/theme';

const CodeIndexPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [indexStatus, setIndexStatus] = useState<codeIndexApi.IndexStatus | null>(null);
  const [indexStats, setIndexStats] = useState<codeIndexApi.IndexStats | null>(null);
  const [indexedFiles, setIndexedFiles] = useState<codeIndexApi.IndexedFile[]>([]);
  const [searchResults, setSearchResults] = useState<codeIndexApi.SearchResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 表单输入
  const [rootPath, setRootPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');

  // 加载索引状态
  const loadIndexStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await codeIndexApi.getIndexStatus();
      if (result.success) {
        setIndexStatus(result.status);
      } else {
        setError(result.error || '获取索引状态失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取索引状态失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载索引统计
  const loadIndexStats = useCallback(async () => {
    try {
      const result = await codeIndexApi.getIndexStats();
      if (result.success) {
        setIndexStats(result.stats);
      }
    } catch (e) {
      console.error('加载索引统计失败:', e);
    }
  }, []);

  // 加载已索引文件列表
  const loadIndexedFiles = useCallback(async () => {
    try {
      const options: { language?: string; limit?: number } = {};
      if (languageFilter) options.language = languageFilter;
      options.limit = 100;

      const result = await codeIndexApi.getIndexedFiles(options);
      if (result.success) {
        let files = result.files;
        if (fileFilter) {
          files = files.filter((f) =>
            f.filePath.toLowerCase().includes(fileFilter.toLowerCase())
          );
        }
        setIndexedFiles(files);
      }
    } catch (e) {
      console.error('加载已索引文件失败:', e);
    }
  }, [languageFilter, fileFilter]);

  // 页面初始化时加载数据
  useEffect(() => {
    loadIndexStatus();
    loadIndexStats();
    loadIndexedFiles();
  }, [loadIndexStatus, loadIndexStats, loadIndexedFiles]);

  // 定期刷新索引状态（如果正在索引中）
  useEffect(() => {
    if (!indexStatus?.isIndexing) return;

    const interval = setInterval(() => {
      loadIndexStatus();
      loadIndexStats();
    }, 2000);

    return () => clearInterval(interval);
  }, [indexStatus?.isIndexing, loadIndexStatus, loadIndexStats]);

  // 构建索引
  const handleBuildIndex = useCallback(async () => {
    setBuilding(true);
    setError(null);
    setNotice(null);
    try {
      const options: codeIndexApi.BuildIndexOptions = {
        rootPath: rootPath.trim() || process.cwd(),
        clearExisting: true,
      };
      const result = await codeIndexApi.buildIndex(options);
      if (result.success) {
        setNotice(result.message || '索引构建已启动');
        // 立即刷新状态
        setTimeout(() => {
          loadIndexStatus();
          loadIndexStats();
          loadIndexedFiles();
        }, 500);
      } else {
        setError(result.error || '构建索引失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '构建索引失败');
    } finally {
      setBuilding(false);
    }
  }, [rootPath, loadIndexStatus, loadIndexStats, loadIndexedFiles]);

  // 清除索引
  const handleClearIndex = useCallback(async () => {
    if (!confirm('确定要清除所有代码索引吗？此操作不可撤销。')) return;

    setClearing(true);
    setError(null);
    try {
      const result = await codeIndexApi.clearIndex();
      if (result.success) {
        setNotice(result.message || '索引已清除');
        setIndexStatus(null);
        setIndexStats(null);
        setIndexedFiles([]);
        setSearchResults([]);
      } else {
        setError(result.error || '清除索引失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '清除索引失败');
    } finally {
      setClearing(false);
    }
  }, []);

  // 搜索符号
  const handleSearchSymbols = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setSearching(true);
    setError(null);
    try {
      const result = await codeIndexApi.searchSymbols(query, { limit: 50 });
      if (result.success) {
        setSearchResults(result.results);
        if (result.results.length === 0) {
          setNotice('未找到匹配的符号');
        }
      } else {
        setError(result.error || '搜索失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 格式化耗时
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms} ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    return `${minutes} 分 ${remainSeconds} 秒`;
  };

  // 获取符号类型颜色
  const getKindColor = (kind: string): 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'default' => {
    const colorMap: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'default'> = {
      function: 'primary',
      class: 'secondary',
      method: 'success',
      variable: 'warning',
      interface: 'primary',
      constant: 'default',
      property: 'default',
      module: 'secondary',
    };
    return colorMap[kind] || 'default';
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* 标题与操作 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          代码索引管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              loadIndexStatus();
              loadIndexStats();
              loadIndexedFiles();
            }}
            disabled={loading || building}
          >
            刷新
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={clearing ? <CircularProgress size={16} /> : <DeleteIcon />}
            onClick={handleClearIndex}
            disabled={clearing || building || !indexStats || indexStats.totalFiles === 0}
          >
            清除索引
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* 索引状态卡片 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <StorageIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              索引状态
            </Typography>
            {indexStatus?.isIndexing && (
              <Chip
                icon={<CircularProgress size={14} />}
                label="索引中..."
                color="primary"
                size="small"
              />
            )}
            {indexStatus && !indexStatus.isIndexing && indexStatus.indexedFiles > 0 && (
              <Chip
                icon={<CheckCircleIcon />}
                label="已索引"
                color="success"
                size="small"
              />
            )}
          </Box>

          {/* 进度条 */}
          {indexStatus?.isIndexing && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  索引进度
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {indexStatus.indexedFiles} / {indexStatus.totalFiles} 文件
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={indexStatus.progress || 0}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}

          {/* 构建索引 */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color={gs.textSecondary} sx={{ mb: 1 }}>
              构建索引
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="索引路径（留空使用工作区根目录）"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                disabled={building || indexStatus?.isIndexing}
              />
              <Button
                variant="contained"
                startIcon={building ? <CircularProgress size={16} /> : <BuildIcon />}
                onClick={handleBuildIndex}
                disabled={building || indexStatus?.isIndexing}
              >
                构建索引
              </Button>
            </Box>
          </Box>

          {/* 状态指标 */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <FolderIcon color="primary" fontSize="small" />
                    <Typography variant="body2" color="text.secondary">
                      已索引文件
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {indexStatus?.indexedFiles ?? 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CodeIcon color="secondary" fontSize="small" />
                    <Typography variant="body2" color="text.secondary">
                      符号数量
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {indexStatus?.totalSymbols ?? 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TimerIcon color="info" fontSize="small" />
                    <Typography variant="body2" color="text.secondary">
                      索引耗时
                    </Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={600}>
                    {indexStatus?.startTime && indexStatus?.endTime
                      ? formatDuration(indexStatus.endTime - indexStatus.startTime)
                      : indexStatus?.isIndexing
                      ? '进行中...'
                      : '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TrendingUpIcon color="success" fontSize="small" />
                    <Typography variant="body2" color="text.secondary">
                      进度
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {indexStatus?.progress ? `${indexStatus.progress.toFixed(1)}%` : '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 索引统计 */}
      {indexStats && (
        <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TrendingUpIcon fontSize="small" />
              <Typography variant="h6" fontWeight={600}>
                索引统计
              </Typography>
            </Box>

            <Grid container spacing={3}>
              {/* 符号类型分布 */}
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                  符号类型分布
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: gs.bgHover }}>
                        <TableCell>类型</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell>占比</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.keys(indexStats.symbolsByKind).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 3, color: gs.textMuted }}>
                            暂无数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        Object.entries(indexStats.symbolsByKind)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 10)
                          .map(([kind, count]) => {
                            const total = indexStats.totalSymbols || 1;
                            const percent = (count / total) * 100;
                            return (
                              <TableRow key={kind} hover>
                                <TableCell>
                                  <Chip
                                    label={kind}
                                    size="small"
                                    color={getKindColor(kind)}
                                    variant="outlined"
                                  />
                                </TableCell>
                                <TableCell align="right">{count}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <LinearProgress
                                      variant="determinate"
                                      value={percent}
                                      sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                    />
                                    <Typography variant="caption" sx={{ minWidth: 40 }}>
                                      {percent.toFixed(1)}%
                                    </Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              {/* 语言分布 */}
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                  语言分布
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: gs.bgHover }}>
                        <TableCell>语言</TableCell>
                        <TableCell align="right">文件数</TableCell>
                        <TableCell align="right">符号数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.keys(indexStats.filesByLanguage).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 3, color: gs.textMuted }}>
                            暂无数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        Object.entries(indexStats.filesByLanguage)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 10)
                          .map(([language, fileCount]) => (
                            <TableRow key={language} hover>
                              <TableCell>
                                <Chip label={language} size="small" variant="outlined" />
                              </TableCell>
                              <TableCell align="right">{fileCount}</TableCell>
                              <TableCell align="right">
                                {indexStats.symbolsByLanguage[language] || 0}
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* 符号搜索 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SearchIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              符号搜索
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="输入符号名称搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearchSymbols();
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              disabled={searching}
            />
            <Button
              variant="contained"
              startIcon={searching ? <CircularProgress size={16} /> : <SearchIcon />}
              onClick={handleSearchSymbols}
              disabled={searching || !searchQuery.trim()}
            >
              搜索
            </Button>
          </Box>

          {searchResults.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: gs.bgHover }}>
                    <TableCell>符号名称</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>文件路径</TableCell>
                    <TableCell align="right">位置</TableCell>
                    <TableCell align="right">评分</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {searchResults.map((result, idx) => (
                    <TableRow key={`${result.name}-${result.filePath}-${idx}`} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {result.name}
                          </Typography>
                          {result.containerName && (
                            <Typography variant="caption" color={gs.textMuted}>
                              {result.containerName}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={result.kind}
                          size="small"
                          color={getKindColor(result.kind)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.filePath}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption">
                          {result.line}:{result.column}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {result.score.toFixed(2)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* 已索引文件列表 */}
      <Card sx={{ bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ListAltIcon fontSize="small" />
              <Typography variant="h6" fontWeight={600}>
                已索引文件
              </Typography>
              <Chip label={indexedFiles.length} size="small" />
            </Box>
          </Box>

          {/* 过滤器 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              size="small"
              placeholder="过滤文件路径..."
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>语言</InputLabel>
              <Select
                value={languageFilter}
                label="语言"
                onChange={(e) => setLanguageFilter(e.target.value)}
              >
                <MenuItem value="">全部</MenuItem>
                {indexStats &&
                  Object.keys(indexStats.filesByLanguage).map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {lang}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: gs.bgHover }}>
                  <TableCell>文件路径</TableCell>
                  <TableCell>语言</TableCell>
                  <TableCell align="right">符号数</TableCell>
                  <TableCell align="right">文件大小</TableCell>
                  <TableCell align="right">行数</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {indexedFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: gs.textMuted }}>
                      暂无已索引文件
                    </TableCell>
                  </TableRow>
                ) : (
                  indexedFiles.slice(0, 50).map((file, idx) => (
                    <TableRow key={`${file.filePath}-${idx}`} hover>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {file.filePath}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={file.language} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{file.symbolCount}</TableCell>
                      <TableCell align="right">{formatFileSize(file.fileSize)}</TableCell>
                      <TableCell align="right">{file.lineCount}</TableCell>
                      <TableCell>
                        <Chip
                          icon={file.status === 'indexed' ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={file.status === 'indexed' ? '已索引' : '错误'}
                          color={file.status === 'indexed' ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {indexedFiles.length > 50 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              仅显示前 50 条记录，共 {indexedFiles.length} 条
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CodeIndexPage;
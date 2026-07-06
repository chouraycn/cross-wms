/**
 * 模板市场页面 — 模板浏览、搜索、安装
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Rating,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  IconButton,
  Skeleton,
  Alert,
  useTheme,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  Star as StarIcon,
  TrendingUp as TrendingUpIcon,
  Notifications as NotificationsIcon,
  IntegrationInstructions as IntegrationIcon,
  Analytics as AnalyticsIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
  getTemplates,
  getTemplateCategories,
  installTemplate,
  type WorkflowTemplate,
} from '../services/templatesApi';

// ===================== Types =====================

interface CategoryInfo {
  name: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

// ===================== Constants =====================

const CATEGORY_CONFIG: CategoryInfo[] = [
  { name: 'automation', label: '自动化', icon: <TrendingUpIcon />, color: '#3B82F6' },
  { name: 'notification', label: '通知', icon: <NotificationsIcon />, color: '#F59E0B' },
  { name: 'integration', label: '集成', icon: <IntegrationIcon />, color: '#10B981' },
  { name: 'analysis', label: '分析', icon: <AnalyticsIcon />, color: '#8B5CF6' },
];

// ===================== Helper Functions =====================

function getCategoryInfo(category: string): CategoryInfo {
  return CATEGORY_CONFIG.find(c => c.name === category) ?? { name: category, label: category, icon: <TrendingUpIcon />, color: '#6B7280' };
}

function formatDownloads(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

// ===================== Component =====================

const TemplateMarketPage: React.FC = React.memo(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // 状态
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 过滤
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 详情对话框
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const templatesData = await getTemplates();
      setTemplates(templatesData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载分类
  const loadCategories = useCallback(async () => {
    try {
      const categoriesData = await getTemplateCategories();
      setCategories(categoriesData);
    } catch (err) {
      console.error('加载分类失败:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadCategories();
  }, [loadData, loadCategories]);

  // 过滤后的模板列表
  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (selectedCategory) {
      result = result.filter(t => t.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [templates, selectedCategory, searchQuery]);

  // 查看详情
  const handleViewDetail = useCallback((template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setDetailDialogOpen(true);
    setInstallSuccess(false);
  }, []);

  // 安装模板
  const handleInstall = useCallback(async () => {
    if (!selectedTemplate) return;

    setInstalling(true);
    try {
      await installTemplate(selectedTemplate.id);
      setInstallSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '安装失败';
      setError(msg);
    } finally {
      setInstalling(false);
    }
  }, [selectedTemplate]);

  // 关闭详情对话框
  const handleCloseDetail = useCallback(() => {
    setDetailDialogOpen(false);
    setSelectedTemplate(null);
    setInstallSuccess(false);
  }, []);

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          模板市场
        </Typography>
        <Typography variant="body2" color="text.secondary">
          浏览预置工作流模板，快速创建自动化流程
        </Typography>

        {/* 搜索框 */}
        <TextField
          fullWidth
          size="small"
          placeholder="搜索模板..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mt: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {/* 分类过滤 */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Chip
            label="全部"
            onClick={() => setSelectedCategory(null)}
            color={selectedCategory === null ? 'primary' : 'default'}
            variant={selectedCategory === null ? 'filled' : 'outlined'}
          />
          {categories.map((cat) => {
            const info = getCategoryInfo(cat);
            return (
              <Chip
                key={cat}
                label={info.label}
                icon={info.icon as React.ReactElement}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                color={selectedCategory === cat ? 'primary' : 'default'}
                variant={selectedCategory === cat ? 'filled' : 'outlined'}
              />
            );
          })}
        </Box>
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 模板网格 */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Grid container spacing={2}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
                <Card>
                  <CardContent>
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="80%" />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : filteredTemplates.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              暂无模板
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {filteredTemplates.map((template) => {
              const categoryInfo = getCategoryInfo(template.category);
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: theme.shadows[4],
                      },
                    }}
                    onClick={() => handleViewDetail(template)}
                  >
                    <CardContent sx={{ flex: 1 }}>
                      {/* 头部 */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                        <Chip
                          size="small"
                          label={categoryInfo.label}
                          sx={{ bgcolor: categoryInfo.color, color: '#fff' }}
                        />
                        {template.author && (
                          <Typography variant="caption" color="text.secondary">
                            {template.author}
                          </Typography>
                        )}
                      </Box>

                      {/* 标题 */}
                      <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                        {template.name}
                      </Typography>

                      {/* 描述 */}
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
                        {template.description.slice(0, 80)}...
                      </Typography>

                      {/* 标签 */}
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                        {(template.tags || []).slice(0, 3).map((tag) => (
                          <Chip key={tag} size="small" label={tag} variant="outlined" />
                        ))}
                      </Box>

                      {/* 统计 */}
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <DownloadIcon fontSize="small" color="action" />
                          <Typography variant="caption" color="text.secondary">
                            {formatDownloads(template.downloads)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <StarIcon fontSize="small" color="action" />
                          <Typography variant="caption" color="text.secondary">
                            {template.rating}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                    <CardActions>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetail(template);
                        }}
                      >
                        查看详情
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>

      {/* 详情对话框 */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleCloseDetail}
        maxWidth="md"
        fullWidth
      >
        {selectedTemplate && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="h6">{selectedTemplate.name}</Typography>
                <Chip
                  size="small"
                  label={getCategoryInfo(selectedTemplate.category).label}
                  sx={{ bgcolor: getCategoryInfo(selectedTemplate.category).color, color: '#fff' }}
                />
              </Box>
            </DialogTitle>
            <DialogContent>
              {/* 基本信息 */}
              <Typography variant="body1" sx={{ mb: 2 }}>
                {selectedTemplate.description}
              </Typography>

              {/* 标签 */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                {(selectedTemplate.tags || []).map((tag) => (
                  <Chip key={tag} size="small" label={tag} />
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 统计 */}
              <Box sx={{ display: 'flex', gap: 4, mb: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">下载量</Typography>
                  <Typography variant="h6">{selectedTemplate.downloads}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">评分</Typography>
                  <Rating value={selectedTemplate.rating} readOnly size="small" />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 工作流预览 */}
              <Typography variant="subtitle2" gutterBottom>
                工作流预览
              </Typography>
              <Paper sx={{ p: 2, bgcolor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.05)' }}>
                <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {JSON.stringify(selectedTemplate.workflow, null, 2)}
                </Typography>
              </Paper>

              {/* 安装成功提示 */}
              {installSuccess && (
                <Alert severity="success" sx={{ mt: 2 }} icon={<CheckCircleIcon />}>
                  模板已安装成功！可在工作流编辑器中查看和编辑。
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDetail}>关闭</Button>
              <Button
                variant="contained"
                onClick={handleInstall}
                disabled={installing || installSuccess}
                startIcon={installing ? <Skeleton width={16} height={16} /> : <DownloadIcon />}
              >
                {installSuccess ? '已安装' : '安装模板'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
});

TemplateMarketPage.displayName = 'TemplateMarketPage';

export default TemplateMarketPage;
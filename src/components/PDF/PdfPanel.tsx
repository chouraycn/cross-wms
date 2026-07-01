/**
 * PdfPanel - PDF 工具操作面板
 *
 * 提供 PDF 文件的多种操作功能：
 * - 提取内容（文本/表格/图片）
 * - AI 智能总结
 * - 合并 PDF
 * - 拆分 PDF
 * - 转换格式（图片/Markdown/HTML）
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Alert,
  Chip,
  Divider,
  IconButton,
  Tabs,
  Tab,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  useTheme,
  CircularProgress,
} from '@mui/material';
import {
  UploadFile as UploadIcon,
  PlayArrow as PlayIcon,
  Clear as ClearIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  TableChart as TableIcon,
  AutoAwesome as SummarizeIcon,
  Merge as MergeIcon,
  CallSplit as SplitIcon,
  Transform as ConvertIcon,
  Folder as FolderIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useToast } from '../../contexts/ToastContext';
import { getGrayScale } from '../../constants/theme';
import type {
  PdfToolType,
  PdfExtractMode,
  PdfSummaryType,
  PdfSplitMode,
  PdfConvertFormat,
  PdfImageFormat,
  PdfFileInfo,
} from '../../types/pdf';

// ===================== Tool Definitions =====================

interface ToolDefinition {
  type: PdfToolType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'extract',
    label: '提取内容',
    icon: <DescriptionIcon />,
    description: '从 PDF 中提取文本、表格或图片',
  },
  {
    type: 'summarize',
    label: 'AI 总结',
    icon: <SummarizeIcon />,
    description: '使用 AI 智能总结 PDF 文档',
  },
  {
    type: 'merge',
    label: '合并 PDF',
    icon: <MergeIcon />,
    description: '将多个 PDF 文件合并为一个',
  },
  {
    type: 'split',
    label: '拆分 PDF',
    icon: <SplitIcon />,
    description: '将 PDF 拆分为多个小文件',
  },
  {
    type: 'convert',
    label: '转换格式',
    icon: <ConvertIcon />,
    description: '转换为图片、Markdown 或 HTML',
  },
];

// ===================== Main Component =====================

const PdfPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  // State
  const [activeTool, setActiveTool] = useState<PdfToolType>('extract');
  const [selectedFiles, setSelectedFiles] = useState<PdfFileInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Tool-specific parameters
  const [extractParams, setExtractParams] = useState({
    mode: 'text' as PdfExtractMode,
    pages: '',
    max_chars: 20000,
    use_ocr: false,
  });

  const [summarizeParams, setSummarizeParams] = useState({
    summary_type: 'brief' as PdfSummaryType,
    ai_provider: 'openai' as 'openai' | 'anthropic' | 'google',
    custom_prompt: '',
    pages: '',
    max_tokens: 2000,
  });

  const [splitParams, setSplitParams] = useState({
    mode: 'pages' as PdfSplitMode,
    pages_per_file: 1,
    ranges: '',
    naming_pattern: '{index}',
  });

  const [convertParams, setConvertParams] = useState({
    format: 'images' as PdfConvertFormat,
    image_format: 'png' as PdfImageFormat,
    image_quality: 90,
    image_dpi: 200,
    pages: '',
  });

  // File selection handler
  const handleFileSelect = useCallback(() => {
    // TODO: Implement file selection dialog (Electron dialog or web input)
    showToast('文件选择功能待实现', 'info');
  }, [showToast]);

  const handleFileRemove = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    setResult(null);
    setError(null);
  }, []);

  // Execute tool
  const handleExecute = useCallback(async () => {
    if (selectedFiles.length === 0) {
      showToast('请先选择 PDF 文件', 'warning');
      return;
    }

    if (activeTool === 'merge' && selectedFiles.length < 2) {
      showToast('合并操作至少需要 2 个文件', 'warning');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      // Prepare request payload
      let payload: any = {};
      let endpoint = '';

      switch (activeTool) {
        case 'extract':
          endpoint = '/api/pdf/extract';
          payload = {
            path: selectedFiles[0].path,
            ...extractParams,
          };
          break;

        case 'summarize':
          endpoint = '/api/pdf/summarize';
          payload = {
            path: selectedFiles[0].path,
            ...summarizeParams,
          };
          break;

        case 'merge':
          endpoint = '/api/pdf/merge';
          payload = {
            paths: selectedFiles.map((f) => f.path),
            output_path: '~/Desktop/merged.pdf',
          };
          break;

        case 'split':
          endpoint = '/api/pdf/split';
          payload = {
            path: selectedFiles[0].path,
            output_dir: '~/Desktop/split_output',
            ...splitParams,
          };
          break;

        case 'convert':
          endpoint = '/api/pdf/convert';
          payload = {
            path: selectedFiles[0].path,
            output_dir: '~/Desktop/converted',
            ...convertParams,
          };
          break;
      }

      // Call API (mock for now)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      clearInterval(progressInterval);
      setProgress(100);

      // Mock result
      const mockResult = {
        success: true,
        message: `${TOOLS.find((t) => t.type === activeTool)?.label} 完成`,
        data: {
          path: selectedFiles[0].path,
          pageCount: 10,
          outputFiles: [],
        },
      };

      setResult(mockResult);
      showToast('操作成功', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '操作失败';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    }

    setIsProcessing(false);
  }, [
    activeTool,
    selectedFiles,
    extractParams,
    summarizeParams,
    splitParams,
    convertParams,
    showToast,
  ]);

  // Render tool-specific parameters
  const renderToolParams = () => {
    switch (activeTool) {
      case 'extract':
        return (
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>提取模式</InputLabel>
              <Select
                value={extractParams.mode}
                onChange={(e) =>
                  setExtractParams({
                    ...extractParams,
                    mode: e.target.value as PdfExtractMode,
                  })
                }
              >
                <MenuItem value="text">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" />
                    文本内容
                  </Box>
                </MenuItem>
                <MenuItem value="tables">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TableIcon fontSize="small" />
                    表格数据
                  </Box>
                </MenuItem>
                <MenuItem value="images">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ImageIcon fontSize="small" />
                    图片提取
                  </Box>
                </MenuItem>
                <MenuItem value="all">全部内容</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="页码范围（如 1-5,8,10-15）"
              value={extractParams.pages}
              onChange={(e) =>
                setExtractParams({ ...extractParams, pages: e.target.value })
              }
              sx={{ mb: 2 }}
              placeholder="可选，默认全部页面"
            />

            <TextField
              fullWidth
              type="number"
              label="最大返回字符数"
              value={extractParams.max_chars}
              onChange={(e) =>
                setExtractParams({
                  ...extractParams,
                  max_chars: Number(e.target.value),
                })
              }
              sx={{ mb: 2 }}
            />

            <FormControl fullWidth>
              <InputLabel>使用 OCR</InputLabel>
              <Select
                value={extractParams.use_ocr ? 'yes' : 'no'}
                onChange={(e) =>
                  setExtractParams({
                    ...extractParams,
                    use_ocr: e.target.value === 'yes',
                  })
                }
              >
                <MenuItem value="no">否（普通文本提取）</MenuItem>
                <MenuItem value="yes">是（扫描版 PDF）</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 'summarize':
        return (
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>总结类型</InputLabel>
              <Select
                value={summarizeParams.summary_type}
                onChange={(e) =>
                  setSummarizeParams({
                    ...summarizeParams,
                    summary_type: e.target.value as PdfSummaryType,
                  })
                }
              >
                <MenuItem value="brief">简要总结（200 字以内）</MenuItem>
                <MenuItem value="detailed">详细总结</MenuItem>
                <MenuItem value="structured">结构化总结</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>AI 提供商</InputLabel>
              <Select
                value={summarizeParams.ai_provider}
                onChange={(e) =>
                  setSummarizeParams({
                    ...summarizeParams,
                    ai_provider: e.target.value as any,
                  })
                }
              >
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic Claude</MenuItem>
                <MenuItem value="google">Google Gemini</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="自定义提示词"
              value={summarizeParams.custom_prompt}
              onChange={(e) =>
                setSummarizeParams({
                  ...summarizeParams,
                  custom_prompt: e.target.value,
                })
              }
              sx={{ mb: 2 }}
              multiline
              rows={3}
              placeholder="可选"
            />

            <TextField
              fullWidth
              label="页码范围"
              value={summarizeParams.pages}
              onChange={(e) =>
                setSummarizeParams({
                  ...summarizeParams,
                  pages: e.target.value,
                })
              }
              sx={{ mb: 2 }}
              placeholder="可选"
            />

            <TextField
              fullWidth
              type="number"
              label="最大 Token 数"
              value={summarizeParams.max_tokens}
              onChange={(e) =>
                setSummarizeParams({
                  ...summarizeParams,
                  max_tokens: Number(e.target.value),
                })
              }
            />
          </Box>
        );

      case 'merge':
        return (
          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              合并操作需要选择至少 2 个 PDF 文件，将按选择顺序合并
            </Alert>
            {selectedFiles.length >= 2 && (
              <Typography variant="body2" color="text.secondary">
                已选择 {selectedFiles.length} 个文件，将合并为单个 PDF
              </Typography>
            )}
          </Box>
        );

      case 'split':
        return (
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>拆分模式</InputLabel>
              <Select
                value={splitParams.mode}
                onChange={(e) =>
                  setSplitParams({
                    ...splitParams,
                    mode: e.target.value as PdfSplitMode,
                  })
                }
              >
                <MenuItem value="pages">按页数拆分</MenuItem>
                <MenuItem value="range">按范围拆分</MenuItem>
              </Select>
            </FormControl>

            {splitParams.mode === 'pages' && (
              <TextField
                fullWidth
                type="number"
                label="每文件页数"
                value={splitParams.pages_per_file}
                onChange={(e) =>
                  setSplitParams({
                    ...splitParams,
                    pages_per_file: Number(e.target.value),
                  })
                }
                sx={{ mb: 2 }}
              />
            )}

            {splitParams.mode === 'range' && (
              <TextField
                fullWidth
                label="页码范围（如 1-5,6-10,11-15）"
                value={splitParams.ranges}
                onChange={(e) =>
                  setSplitParams({ ...splitParams, ranges: e.target.value })
                }
                sx={{ mb: 2 }}
              />
            )}

            <TextField
              fullWidth
              label="文件命名模式"
              value={splitParams.naming_pattern}
              onChange={(e) =>
                setSplitParams({
                  ...splitParams,
                  naming_pattern: e.target.value,
                })
              }
              placeholder="支持 {index}, {page}"
            />
          </Box>
        );

      case 'convert':
        return (
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>目标格式</InputLabel>
              <Select
                value={convertParams.format}
                onChange={(e) =>
                  setConvertParams({
                    ...convertParams,
                    format: e.target.value as PdfConvertFormat,
                  })
                }
              >
                <MenuItem value="images">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ImageIcon fontSize="small" />
                    图片
                  </Box>
                </MenuItem>
                <MenuItem value="markdown">Markdown</MenuItem>
                <MenuItem value="html">HTML</MenuItem>
              </Select>
            </FormControl>

            {convertParams.format === 'images' && (
              <>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>图片格式</InputLabel>
                  <Select
                    value={convertParams.image_format}
                    onChange={(e) =>
                      setConvertParams({
                        ...convertParams,
                        image_format: e.target.value as PdfImageFormat,
                      })
                    }
                  >
                    <MenuItem value="png">PNG</MenuItem>
                    <MenuItem value="jpg">JPG</MenuItem>
                    <MenuItem value="webp">WebP</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  type="number"
                  label="图片质量（1-100）"
                  value={convertParams.image_quality}
                  onChange={(e) =>
                    setConvertParams({
                      ...convertParams,
                      image_quality: Number(e.target.value),
                    })
                  }
                  inputProps={{ min: 1, max: 100 }}
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  type="number"
                  label="图片分辨率（DPI）"
                  value={convertParams.image_dpi}
                  onChange={(e) =>
                    setConvertParams({
                      ...convertParams,
                      image_dpi: Number(e.target.value),
                    })
                  }
                  sx={{ mb: 2 }}
                />
              </>
            )}

            <TextField
              fullWidth
              label="页码范围"
              value={convertParams.pages}
              onChange={(e) =>
                setConvertParams({ ...convertParams, pages: e.target.value })
              }
              placeholder="可选"
            />
          </Box>
        );

      default:
        return null;
    }
  };

  // Render result preview
  const renderResultPreview = () => {
    if (!result) return null;

    return (
      <Paper sx={{ p: 2, mt: 2, bgcolor: isDark ? '#1a1a1a' : '#f5f5f5' }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          操作结果
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {result.success ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              {result.message}
            </Alert>

            {result.data && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    文件路径: {result.data.path}
                  </Typography>
                  {result.data.pageCount && (
                    <Typography variant="body2" color="text.secondary">
                      页数: {result.data.pageCount}
                    </Typography>
                  )}
                  {result.data.outputFiles && result.data.outputFiles.length > 0 && (
                    <List dense>
                      {result.data.outputFiles.map((file: any, idx: number) => (
                        <ListItem key={idx}>
                          <ListItemText primary={file.path} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              startIcon={<DownloadIcon />}
              sx={{ mt: 2 }}
              variant="outlined"
            >
              查看输出文件
            </Button>
          </Box>
        ) : (
          <Alert severity="error">{result.error || '操作失败'}</Alert>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2, color: gs.textPrimary }}>
        PDF 工具集
      </Typography>

      {/* Tool Tabs */}
      <Tabs
        value={activeTool}
        onChange={(e, v) => setActiveTool(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TOOLS.map((tool) => (
          <Tab
            key={tool.type}
            value={tool.type}
            icon={tool.icon as React.ReactElement}
            label={tool.label}
            iconPosition="start"
          />
        ))}
      </Tabs>

      {/* Tool Description */}
      <Alert severity="info" sx={{ mb: 2 }}>
        {TOOLS.find((t) => t.type === activeTool)?.description}
      </Alert>

      {/* Content Area */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Left: File Selection */}
        <Paper sx={{ flex: 1, p: 2, overflow: 'auto' }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              文件选择
            </Typography>

            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={handleFileSelect}
              fullWidth
              sx={{ mb: 2 }}
            >
              选择 PDF 文件
            </Button>

            {selectedFiles.length > 0 && (
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClearFiles}
                size="small"
                sx={{ mb: 1 }}
              >
                清空列表
              </Button>
            )}
          </Box>

          {/* Selected Files List */}
          {selectedFiles.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 200,
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <FolderIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography color="text.secondary">暂未选择文件</Typography>
            </Box>
          ) : (
            <List>
              {selectedFiles.map((file, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleFileRemove(index)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={file.name}
                    secondary={`${file.path} • ${Math.round(file.size / 1024)} KB`}
                  />
                  {file.pageCount && (
                    <Chip label={`${file.pageCount} 页`} size="small" sx={{ ml: 1 }} />
                  )}
                </ListItem>
              ))}
            </List>
          )}
        </Paper>

        {/* Right: Parameters & Execution */}
        <Paper sx={{ flex: 2, p: 2, overflow: 'auto' }}>
          {/* Tool Parameters */}
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            参数配置
          </Typography>
          {renderToolParams()}

          <Divider sx={{ my: 3 }} />

          {/* Execution */}
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={isProcessing ? <CircularProgress size={20} /> : <PlayIcon />}
              onClick={handleExecute}
              disabled={isProcessing || selectedFiles.length === 0}
              fullWidth
              sx={{ mb: 2 }}
            >
              {isProcessing ? '处理中...' : '执行操作'}
            </Button>

            {isProcessing && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={progress} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  进度: {progress}%
                </Typography>
              </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Box>

          {/* Result Preview */}
          {renderResultPreview()}
        </Paper>
      </Box>
    </Box>
  );
};

export default PdfPanel;
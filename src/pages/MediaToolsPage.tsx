import React, { useState, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, Chip, Paper, Tabs, Tab,
  TextField, CircularProgress, Alert, Divider,
  Card, CardContent, CardMedia, useTheme,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import {
  analyzeFile, analyzeUrl,
  extractTextFromFile, extractTextFromUrl,
  transcribeFile, transcribeUrl,
  describeFile, describeUrl,
  type AnalyzeResponse, type ExtractTextResponse, type TranscribeResponse, type DescribeResponse,
  type ImageDescription, type VideoAnalysis, type AudioAnalysis, type DocumentAnalysis,
} from '../services/mediaUnderstandingApi';
import {
  extractLink, previewLink, summarizeLink,
  type ExtractResponse, type PreviewResponse, type SummarizeResponse,
} from '../services/linkUnderstandingApi';

// ===================== 媒体理解 Tab =====================

type MediaAction = 'analyze' | 'extract-text' | 'transcribe' | 'describe';

/** 媒体理解结果联合类型 — 覆盖 analyze/extract-text/transcribe/describe 四种操作的返回值 */
type MediaResult =
  | ImageDescription
  | VideoAnalysis
  | AudioAnalysis
  | DocumentAnalysis
  | ExtractTextResponse
  | TranscribeResponse
  | DescribeResponse;

const MEDIA_ACTIONS: { value: MediaAction; label: string; desc: string }[] = [
  { value: 'analyze', label: '综合分析', desc: '类型检测 + 描述 + 标签 + OCR/转录' },
  { value: 'extract-text', label: '文本提取', desc: 'OCR 文本 / 文档文本' },
  { value: 'transcribe', label: '转录', desc: '音频/视频转录' },
  { value: 'describe', label: '描述', desc: '生成媒体描述' },
];

const MediaUnderstandingTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [action, setAction] = useState<MediaAction>('analyze');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [resultType, setResultType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const handleExecute = useCallback(async () => {
    if (!file && !url.trim()) {
      showToast('请上传文件或输入 URL', 'warning');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (action === 'analyze') {
        let res: AnalyzeResponse;
        if (file) {
          res = await analyzeFile(file);
        } else {
          res = await analyzeUrl(url.trim());
        }
        setResult(res.result);
        setResultType(res.kind);
      } else if (action === 'extract-text') {
        let res: ExtractTextResponse;
        if (file) {
          res = await extractTextFromFile(file);
        } else {
          res = await extractTextFromUrl(url.trim());
        }
        setResult(res);
        setResultType('text');
      } else if (action === 'transcribe') {
        let res: TranscribeResponse;
        if (file) {
          res = await transcribeFile(file);
        } else {
          res = await transcribeUrl(url.trim());
        }
        setResult(res);
        setResultType('transcript');
      } else if (action === 'describe') {
        let res: DescribeResponse;
        if (file) {
          res = await describeFile(file);
        } else {
          res = await describeUrl(url.trim());
        }
        setResult(res);
        setResultType('describe');
      }
      showToast('分析完成', 'success');
    } catch (e) {
      showToast(`失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [action, file, url, showToast]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 操作类型选择 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {MEDIA_ACTIONS.map((a) => (
          <Chip
            key={a.value}
            label={a.label}
            onClick={() => setAction(a.value)}
            color={action === a.value ? 'primary' : 'default'}
            variant={action === a.value ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ color: gs.textMuted, mt: -1 }}>
        {MEDIA_ACTIONS.find((a) => a.value === action)?.desc}
      </Typography>

      {/* 输入区 */}
      <Paper sx={{ p: 2, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textSecondary }}>
          方式一：上传文件
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            选择文件
          </Button>
          {file && (
            <Typography variant="body2" sx={{ color: gs.textSecondary }}>
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textSecondary }}>
          方式二：输入 URL
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="https://example.com/image.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          sx={{ backgroundColor: gs.bgInput }}
        />
      </Paper>

      {/* 执行按钮 */}
      <Box>
        <Button
          variant="contained"
          onClick={handleExecute}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <ImageIcon />}
        >
          {loading ? '分析中...' : '执行'}
        </Button>
      </Box>

      {/* 结果展示 */}
      {result && (
        <Paper sx={{ p: 2, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textPrimary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {resultType === 'image' && <ImageIcon fontSize="small" />}
            {resultType === 'text' && <TextFieldsIcon fontSize="small" />}
            {resultType === 'describe' && <DescriptionIcon fontSize="small" />}
            分析结果
            <Chip label={resultType} size="small" sx={{ ml: 1 }} />
          </Typography>
          <Box component="pre" sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.8rem',
            color: gs.textSecondary,
            maxHeight: 500,
            overflowY: 'auto',
            m: 0,
            fontFamily: 'monospace',
          }}>
            {JSON.stringify(result, null, 2)}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

// ===================== 链接理解 Tab =====================

type LinkAction = 'extract' | 'preview' | 'summarize';

const LINK_ACTIONS: { value: LinkAction; label: string; desc: string }[] = [
  { value: 'extract', label: '内容提取', desc: '标题 + 描述 + 正文 + 图片 + 元数据' },
  { value: 'preview', label: '预览卡片', desc: 'OpenGraph / Twitter Card 预览' },
  { value: 'summarize', label: '内容摘要', desc: '总结链接主要内容' },
];

const LinkUnderstandingTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [action, setAction] = useState<LinkAction>('extract');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResponse | PreviewResponse | SummarizeResponse | null>(null);

  const handleExecute = useCallback(async () => {
    if (!url.trim()) {
      showToast('请输入 URL', 'warning');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (action === 'extract') {
        const res = await extractLink(url.trim());
        setResult(res);
      } else if (action === 'preview') {
        const res = await previewLink(url.trim());
        setResult(res);
      } else if (action === 'summarize') {
        const res = await summarizeLink(url.trim());
        setResult(res);
      }
      showToast('处理完成', 'success');
    } catch (e) {
      showToast(`失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [action, url, showToast]);

  // 渲染预览卡片
  const renderPreviewCard = (preview: PreviewResponse['preview']) => (
    <Card sx={{ maxWidth: 500, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
      {preview.image && (
        <CardMedia
          component="img"
          image={preview.image}
          alt={preview.title || '预览图'}
          sx={{ maxHeight: 200, objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          {preview.icon && (
            <img src={preview.icon} alt="" style={{ width: 16, height: 16 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <Typography variant="caption" sx={{ color: gs.textMuted }}>
            {preview.siteName || ''}
          </Typography>
        </Box>
        <Typography variant="subtitle2" sx={{ color: gs.textPrimary, mb: 0.5 }}>
          {preview.title || '(无标题)'}
        </Typography>
        {preview.description && (
          <Typography variant="body2" sx={{ color: gs.textSecondary, mb: 1 }}>
            {preview.description.length > 150 ? preview.description.slice(0, 150) + '…' : preview.description}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: gs.textMuted, wordBreak: 'break-all' }}>
          {preview.finalUrl || preview.url}
        </Typography>
        <Chip label={preview.cardType} size="small" sx={{ ml: 1 }} />
      </CardContent>
    </Card>
  );

  // 渲染安全检查结果
  const renderSafety = (safety?: { safe: boolean; riskLevel: string; risks: string[]; reasons: string[] }) => {
    if (!safety) return null;
    const color = safety.riskLevel === 'safe' || safety.riskLevel === 'low' ? 'success' : safety.riskLevel === 'medium' ? 'warning' : 'error';
    return (
      <Alert severity={color as 'success' | 'warning' | 'error'} sx={{ mt: 1 }} icon={false}>
        <Typography variant="caption">
          安全检查：{safety.safe ? '安全' : '有风险'}（{safety.riskLevel}）
          {safety.reasons.length > 0 && ` — ${safety.reasons.join('; ')}`}
        </Typography>
      </Alert>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 操作类型选择 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {LINK_ACTIONS.map((a) => (
          <Chip
            key={a.value}
            label={a.label}
            onClick={() => setAction(a.value)}
            color={action === a.value ? 'primary' : 'default'}
            variant={action === a.value ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ color: gs.textMuted, mt: -1 }}>
        {LINK_ACTIONS.find((a) => a.value === action)?.desc}
      </Typography>

      {/* URL 输入 */}
      <Paper sx={{ p: 2, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textSecondary }}>
          输入 URL
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          sx={{ backgroundColor: gs.bgInput }}
        />
      </Paper>

      {/* 执行按钮 */}
      <Box>
        <Button
          variant="contained"
          onClick={handleExecute}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <LinkIcon />}
        >
          {loading ? '处理中...' : '执行'}
        </Button>
      </Box>

      {/* 结果展示 */}
      {result && (
        <Paper sx={{ p: 2, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textPrimary }}>
            结果
          </Typography>

          {/* preview 模式：渲染卡片 */}
          {action === 'preview' && result && 'preview' in (result as PreviewResponse) && (
            <Box sx={{ mb: 2 }}>
              {renderPreviewCard((result as PreviewResponse).preview)}
            </Box>
          )}

          {/* 安全检查结果 */}
          {'safety' in result && result.safety && renderSafety(result.safety)}

          {/* extract 模式：展示图片列表 */}
          {action === 'extract' && (result as ExtractResponse).images && (result as ExtractResponse).images.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: gs.textSecondary }}>
                图片列表（{(result as ExtractResponse).images.length}）
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {(result as ExtractResponse).images.slice(0, 6).map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`图片 ${i + 1}`}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, border: `1px solid ${gs.border}` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* JSON 原始结果 */}
          <Box component="pre" sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.8rem',
            color: gs.textSecondary,
            maxHeight: 500,
            overflowY: 'auto',
            m: 0,
            fontFamily: 'monospace',
          }}>
            {JSON.stringify(result, null, 2)}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

// ===================== 主页面 =====================

const MediaToolsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <LanguageOutlinedIcon sx={{ color: gs.textPrimary }} />
        <Typography variant="h5" sx={{ fontWeight: 600, color: gs.textPrimary }}>
          媒体工具
        </Typography>
        <Typography variant="caption" sx={{ color: gs.textMuted, ml: 1 }}>
          媒体理解 & 链接理解
        </Typography>
      </Box>

      <Paper sx={{ mb: 2, border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ minHeight: 40, px: 1 }}
        >
          <Tab
            icon={<ImageIcon />}
            iconPosition="start"
            label="媒体理解"
            sx={{ minHeight: 40, fontSize: '0.85rem', textTransform: 'none' }}
          />
          <Tab
            icon={<LinkIcon />}
            iconPosition="start"
            label="链接理解"
            sx={{ minHeight: 40, fontSize: '0.85rem', textTransform: 'none' }}
          />
        </Tabs>
      </Paper>

      <Box sx={{ mt: 2 }}>
        {tab === 0 && <MediaUnderstandingTab />}
        {tab === 1 && <LinkUnderstandingTab />}
      </Box>
    </Box>
  );
};

export default MediaToolsPage;

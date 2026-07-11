import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import PsychologyIcon from '@mui/icons-material/Psychology';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import StorageIcon from '@mui/icons-material/Storage';

import {
  matchSkills,
  generateEmbeddings,
  getEmbeddingStatus,
  getMatchConfig,
  updateMatchConfig,
  resetMatchConfig,
  submitMatchFeedback,
} from '../services/matchingApi';
import type { MatchResponse, EmbeddingStatus, MatchEngineConfig } from '../services/matchingApi';
import SkillMatchResult from '../components/Matching/SkillMatchResult';
import MatchFeedbackWidget from '../components/Matching/MatchFeedbackWidget';
import type { SemanticMatchResult } from '../components/Matching/SkillMatchResult';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export default function MatchingPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [config, setConfig] = useState<MatchEngineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<SemanticMatchResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await getEmbeddingStatus();
      setStatus(data);
    } catch (e) {
      console.error('获取状态失败:', e);
    }
  };

  const fetchConfig = async () => {
    try {
      const data = await getMatchConfig();
      setConfig(data);
    } catch (e) {
      console.error('获取配置失败:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    setLoading(false);
  }, []);

  const handleGenerateEmbeddings = async () => {
    try {
      setGenerating(true);
      await generateEmbeddings();
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成嵌入向量失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleTestMatch = async () => {
    if (!query.trim()) return;
    try {
      setTesting(true);
      const result = await matchSkills(query, { topK: 5 });
      setMatchResult(result);
      // 以置信度最高的匹配项作为默认反馈对象
      const top = [...result.results].sort((a, b) => b.score - a.score)[0];
      setFeedbackTarget(top
        ? { skillId: top.skillId, skillName: top.skillName, confidence: top.score, reasons: top.reasons, matchMode: top.matchMode }
        : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '匹配测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await updateMatchConfig(config);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存配置失败');
    }
  };

  const handleResetConfig = async () => {
    try {
      await resetMatchConfig();
      await fetchConfig();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置配置失败');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">语义匹配</Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>引擎状态</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                {status?.modelInfo?.ready ? (
                  <Chip icon={<NetworkCheckIcon />} label="就绪" color="success" />
                ) : (
                  <Chip icon={<CircularProgress size={16} />} label="加载中" color="warning" />
                )}
              </Box>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                模型: {status?.modelInfo?.name || '-'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                维度: {status?.modelInfo?.dimension || '-'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                嵌入数量: {status?.embedded || 0}
              </Typography>
              <Button
                fullWidth
                onClick={handleGenerateEmbeddings}
                startIcon={<StorageIcon />}
                disabled={generating}
              >
                {generating ? '生成中...' : '重建嵌入向量'}
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ bgcolor: gs.bgPanel, mt: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>匹配测试</Typography>
              <TextField
                fullWidth
                label="测试查询"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入查询语句..."
                sx={{ mb: 2 }}
              />
              <Button
                fullWidth
                onClick={handleTestMatch}
                startIcon={<PlayArrowIcon />}
                disabled={testing || !query.trim()}
              >
                {testing ? '测试中...' : '执行匹配'}
              </Button>
              {matchResult && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" mb={1}>匹配结果 ({matchResult.totalResults})</Typography>
                  <SkillMatchResult
                    matches={matchResult.results.map(r => ({
                      skillId: r.skillId,
                      skillName: r.skillName,
                      confidence: r.score,
                      reasons: r.reasons,
                      matchMode: r.matchMode,
                    }))}
                    onSelect={(skillId) => {
                      const selected = matchResult.results.find(r => r.skillId === skillId);
                      if (selected) {
                        setFeedbackTarget({
                          skillId: selected.skillId,
                          skillName: selected.skillName,
                          confidence: selected.score,
                          reasons: selected.reasons,
                          matchMode: selected.matchMode,
                        });
                      }
                    }}
                    onDismiss={() => {
                      setMatchResult(null);
                      setFeedbackTarget(null);
                    }}
                  />
                  {feedbackTarget && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" mb={1}>匹配反馈</Typography>
                      <MatchFeedbackWidget
                        userInput={query}
                        matchedSkillId={feedbackTarget.skillId}
                        matchedSkillName={feedbackTarget.skillName}
                        confidence={feedbackTarget.confidence}
                        onSubmit={async (feedback) => {
                          try {
                            await submitMatchFeedback(feedback);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : '提交反馈失败');
                          }
                        }}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>匹配配置</Typography>
              {config && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" mb={1}>语义权重: {config.semanticWeight}</Typography>
                    <Slider
                      value={config.semanticWeight}
                      onChange={(e, v) => setConfig({ ...config, semanticWeight: v as number })}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" mb={1}>关键词权重: {config.keywordWeight}</Typography>
                    <Slider
                      value={config.keywordWeight}
                      onChange={(e, v) => setConfig({ ...config, keywordWeight: v as number })}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" mb={1}>默认阈值: {config.defaultThreshold}</Typography>
                    <Slider
                      value={config.defaultThreshold}
                      onChange={(e, v) => setConfig({ ...config, defaultThreshold: v as number })}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" mb={1}>返回数量: {config.defaultTopK}</Typography>
                    <Slider
                      value={config.defaultTopK}
                      onChange={(e, v) => setConfig({ ...config, defaultTopK: v as number })}
                      min={1}
                      max={20}
                      step={1}
                    />
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button onClick={handleSaveConfig} startIcon={<EditIcon />}>保存配置</Button>
                    <Button onClick={handleResetConfig} startIcon={<RotateLeftIcon />} variant="outlined">重置默认</Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
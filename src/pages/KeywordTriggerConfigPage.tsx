/**
 * KeywordTriggerConfigPage — 关键词触发配置面板
 *
 * 提供关键词触发功能的配置 UI：配置项、统计、关键词列表、匹配测试与规则刷新。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Switch,
  Select,
  MenuItem,
  FormControl,
  FormControlLabel,
  Button,
  TextField,
  Slider,
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
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TuneIcon from '@mui/icons-material/Tune';
import BarChartIcon from '@mui/icons-material/BarChart';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ScienceIcon from '@mui/icons-material/Science';
import SearchIcon from '@mui/icons-material/Search';

import {
  getKeywordTriggerConfig,
  updateKeywordTriggerConfig,
  getKeywordTriggerStats,
  getAllKeywords,
  testKeywordMatch,
  refreshKeywordRules,
  type KeywordTriggerConfig,
  type KeywordTriggerStats,
  type KeywordInfo,
  type KeywordMatchResult,
} from '../services/keywordTriggerApi';
import { getGrayScale } from '../constants/theme';

const MATCH_MODE_LABELS: Record<KeywordTriggerConfig['matchMode'], string> = {
  exact: '精确匹配',
  fuzzy: '模糊匹配',
  semantic: '语义匹配',
};

const KeywordTriggerConfigPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [config, setConfig] = useState<KeywordTriggerConfig | null>(null);
  const [draft, setDraft] = useState<KeywordTriggerConfig | null>(null);
  const [stats, setStats] = useState<KeywordTriggerStats | null>(null);
  const [keywords, setKeywords] = useState<KeywordInfo[]>([]);
  const [testMessage, setTestMessage] = useState('');
  const [testResults, setTestResults] = useState<KeywordMatchResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, st, kw] = await Promise.all([
        getKeywordTriggerConfig(),
        getKeywordTriggerStats(),
        getAllKeywords(),
      ]);
      setConfig(cfg);
      setDraft(cfg);
      setStats(st);
      setKeywords(kw.keywords || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateDraft = useCallback(<K extends keyof KeywordTriggerConfig>(key: K, value: KeywordTriggerConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateKeywordTriggerConfig(draft);
      setConfig(result.config);
      setDraft(result.config);
      setNotice('配置已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存配置失败');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleTest = useCallback(async () => {
    const message = testMessage.trim();
    if (!message) return;
    setTesting(true);
    setError(null);
    try {
      const result = await testKeywordMatch(message);
      setTestResults(result.matches || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '匹配测试失败');
    } finally {
      setTesting(false);
    }
  }, [testMessage]);

  const handleRefreshRules = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshKeywordRules();
      // 刷新规则后重新加载关键词列表与统计
      const [kw, st] = await Promise.all([getAllKeywords(), getKeywordTriggerStats()]);
      setKeywords(kw.keywords || []);
      setStats(st);
      setNotice('关键词规则已刷新');
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新规则失败');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const isDirty = Boolean(draft && config && JSON.stringify(draft) !== JSON.stringify(config));

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* 标题与操作 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          关键词触发配置
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefreshRules}
          disabled={refreshing || loading}
        >
          刷新规则
        </Button>
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

      {/* 配置区 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TuneIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              触发配置
            </Typography>
          </Box>

          {!draft ? (
            <Typography color={gs.textMuted}>配置加载中…</Typography>
          ) : (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={draft.enabled}
                      onChange={(e) => updateDraft('enabled', e.target.checked)}
                    />
                  }
                  label="启用关键词触发"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={draft.ignoreCase}
                      onChange={(e) => updateDraft('ignoreCase', e.target.checked)}
                    />
                  }
                  label="忽略大小写"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <FormControl fullWidth size="small">
                  <Typography variant="body2" color={gs.textSecondary} sx={{ mb: 1 }}>
                    匹配模式
                  </Typography>
                  <Select
                    value={draft.matchMode}
                    onChange={(e) => updateDraft('matchMode', e.target.value as KeywordTriggerConfig['matchMode'])}
                  >
                    <MenuItem value="exact">{MATCH_MODE_LABELS.exact}</MenuItem>
                    <MenuItem value="fuzzy">{MATCH_MODE_LABELS.fuzzy}</MenuItem>
                    <MenuItem value="semantic">{MATCH_MODE_LABELS.semantic}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Typography variant="body2" color={gs.textSecondary} sx={{ mb: 1 }}>
                  匹配阈值：{draft.threshold.toFixed(2)}
                </Typography>
                <Slider
                  value={draft.threshold}
                  onChange={(_, value) => updateDraft('threshold', value as number)}
                  min={0}
                  max={1}
                  step={0.01}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="最大触发次数"
                  value={draft.maxTriggers}
                  onChange={(e) => updateDraft('maxTriggers', Number(e.target.value))}
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="关键词最小长度"
                  value={draft.minKeywordLength}
                  onChange={(e) => updateDraft('minKeywordLength', Number(e.target.value))}
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                  >
                    保存配置
                  </Button>
                </Box>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* 统计区 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <BarChartIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              触发统计
            </Typography>
          </Box>

          {stats ? (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                  <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                    <CardContent>
                      <Typography variant="body2" color={gs.textSecondary}>
                        总触发次数
                      </Typography>
                      <Typography variant="h4" fontWeight={600}>
                        {stats.totalTriggers}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                    <CardContent>
                      <Typography variant="body2" color={gs.textSecondary}>
                        总匹配次数
                      </Typography>
                      <Typography variant="h4" fontWeight={600}>
                        {stats.totalMatches}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card variant="outlined" sx={{ bgcolor: gs.bgHover }}>
                    <CardContent>
                      <Typography variant="body2" color={gs.textSecondary}>
                        平均匹配耗时
                      </Typography>
                      <Typography variant="h4" fontWeight={600}>
                        {stats.avgMatchTime}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    热门关键词
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: gs.bgHover }}>
                          <TableCell>关键词</TableCell>
                          <TableCell align="right">触发次数</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {stats.topKeywords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} align="center" sx={{ py: 3, color: gs.textMuted }}>
                              暂无数据
                            </TableCell>
                          </TableRow>
                        ) : (
                          stats.topKeywords.map((item) => (
                            <TableRow key={item.keyword} hover>
                              <TableCell>{item.keyword}</TableCell>
                              <TableCell align="right">{item.count}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    热门技能
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: gs.bgHover }}>
                          <TableCell>技能</TableCell>
                          <TableCell align="right">触发次数</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {stats.topSkills.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} align="center" sx={{ py: 3, color: gs.textMuted }}>
                              暂无数据
                            </TableCell>
                          </TableRow>
                        ) : (
                          stats.topSkills.map((item) => (
                            <TableRow key={item.skillId} hover>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>
                                    {item.skillName}
                                  </Typography>
                                  <Typography variant="caption" color={gs.textMuted}>
                                    {item.skillId}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="right">{item.count}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>
            </>
          ) : (
            <Typography color={gs.textMuted}>统计加载中…</Typography>
          )}
        </CardContent>
      </Card>

      {/* 关键词列表 */}
      <Card sx={{ mb: 3, bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ListAltIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              已注册关键词
            </Typography>
            <Chip label={keywords.length} size="small" sx={{ ml: 1 }} />
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: gs.bgHover }}>
                  <TableCell>关键词</TableCell>
                  <TableCell>所属技能</TableCell>
                  <TableCell align="right">权重</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keywords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 4, color: gs.textMuted }}>
                      暂无已注册关键词
                    </TableCell>
                  </TableRow>
                ) : (
                  keywords.map((kw, idx) => (
                    <TableRow key={`${kw.keyword}-${kw.skillId}-${idx}`} hover>
                      <TableCell>
                        <Chip label={kw.keyword} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {kw.skillName}
                          </Typography>
                          <Typography variant="caption" color={gs.textMuted}>
                            {kw.skillId}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{kw.weight}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 匹配测试区 */}
      <Card sx={{ bgcolor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ScienceIcon fontSize="small" />
            <Typography variant="h6" fontWeight={600}>
              匹配测试
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              maxRows={4}
              placeholder="输入要测试的消息文本…"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleTest}
              disabled={testing || !testMessage.trim()}
            >
              测试
            </Button>
          </Box>

          {testing && <LinearProgress sx={{ mb: 2 }} />}

          {testResults.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: gs.bgHover }}>
                    <TableCell>关键词</TableCell>
                    <TableCell>匹配技能</TableCell>
                    <TableCell align="right">权重</TableCell>
                    <TableCell align="right">匹配分数</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {testResults.map((m, idx) => (
                    <TableRow key={`${m.keyword}-${m.skillId}-${idx}`} hover>
                      <TableCell>
                        <Chip label={m.keyword} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {m.skillName}
                          </Typography>
                          <Typography variant="caption" color={gs.textMuted}>
                            {m.skillId}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{m.weight}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {m.score.toFixed(2)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            !testing && testMessage.trim() && (
              <Alert severity="info" icon={<SearchIcon />} sx={{ mt: 1 }}>
                未匹配到任何关键词技能
              </Alert>
            )
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default KeywordTriggerConfigPage;

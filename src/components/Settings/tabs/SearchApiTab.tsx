/**
 * SearchApiTab - 搜索 API 配置页
 *
 * 配置 Kimi Search API 和 MiniMax Search API
 * 注意：这是搜索专用的 API Key，区别于模型 API Key
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  Link,
  useTheme,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getGrayScale } from '../../../constants/theme';
import { useToast } from '../../../contexts/ToastContext';

interface SearchApiConfig {
  kimiApiKey: string;
  minimaxApiKey: string;
  minimaxGroupId: string;
}

interface ApiStatus {
  kimi: 'unknown' | 'configured' | 'valid' | 'invalid';
  minimax: 'unknown' | 'configured' | 'valid' | 'invalid';
}

const SearchApiTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [config, setConfig] = useState<SearchApiConfig>({
    kimiApiKey: '',
    minimaxApiKey: '',
    minimaxGroupId: '',
  });

  const [showKeys, setShowKeys] = useState({
    kimi: false,
    minimax: false,
  });

  const [status, setStatus] = useState<ApiStatus>({
    kimi: 'unknown',
    minimax: 'unknown',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState({
    kimi: false,
    minimax: false,
  });

  // 加载已保存的配置
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/secrets/list?provider=all');
      const data = await response.json();
      
      if (data.data) {
        const secrets = data.data as Array<{ key: string; value?: string }>;
        const kimiKey = secrets.find(s => s.key === 'KIMI_API_KEY' || s.key === 'MOONSHOT_API_KEY');
        const minimaxKey = secrets.find(s => s.key === 'MINIMAX_API_KEY');
        const minimaxGroupId = secrets.find(s => s.key === 'MINIMAX_GROUP_ID');

        setConfig({
          kimiApiKey: kimiKey ? '(已配置)' : '',
          minimaxApiKey: minimaxKey ? '(已配置)' : '',
          minimaxGroupId: minimaxGroupId ? '(已配置)' : '',
        });

        setStatus({
          kimi: kimiKey ? 'configured' : 'unknown',
          minimax: minimaxKey ? 'configured' : 'unknown',
        });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises: Promise<void>[] = [];

      // 保存 Kimi API Key
      if (config.kimiApiKey && config.kimiApiKey !== '(已配置)') {
        promises.push(
          fetch('/api/secrets/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'encrypted',
              key: 'KIMI_API_KEY',
              value: config.kimiApiKey,
              type: 'api_key',
              description: 'Kimi/Moonshot 搜索 API Key',
            }),
          }).then(() => {})
        );
      }

      // 保存 MiniMax API Key
      if (config.minimaxApiKey && config.minimaxApiKey !== '(已配置)') {
        promises.push(
          fetch('/api/secrets/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'encrypted',
              key: 'MINIMAX_API_KEY',
              value: config.minimaxApiKey,
              type: 'api_key',
              description: 'MiniMax 搜索 API Key',
            }),
          }).then(() => {})
        );
      }

      // 保存 MiniMax Group ID
      if (config.minimaxGroupId && config.minimaxGroupId !== '(已配置)') {
        promises.push(
          fetch('/api/secrets/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'encrypted',
              key: 'MINIMAX_GROUP_ID',
              value: config.minimaxGroupId,
              type: 'other',
              description: 'MiniMax Group ID',
            }),
          }).then(() => {})
        );
      }

      await Promise.all(promises);
      showToast('搜索 API 配置已保存', 'success');
      loadConfig();
    } catch (error) {
      showToast(`保存失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 测试 API 连接
  const handleTest = async (provider: 'kimi' | 'minimax') => {
    setIsTesting(prev => ({ ...prev, [provider]: true }));
    try {
      const response = await fetch('/api/web-search/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          query: 'test',
          maxResults: 1,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus(prev => ({ ...prev, [provider]: 'valid' }));
        showToast(`${provider === 'kimi' ? 'Kimi' : 'MiniMax'} 搜索 API 连接成功`, 'success');
      } else {
        setStatus(prev => ({ ...prev, [provider]: 'invalid' }));
        showToast(`${provider === 'kimi' ? 'Kimi' : 'MiniMax'} 搜索 API 连接失败: ${data.error}`, 'error');
      }
    } catch (error) {
      setStatus(prev => ({ ...prev, [provider]: 'invalid' }));
      showToast(`测试失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsTesting(prev => ({ ...prev, [provider]: false }));
    }
  };

  // 清除配置
  const handleClear = async (key: 'KIMI_API_KEY' | 'MINIMAX_API_KEY' | 'MINIMAX_GROUP_ID') => {
    try {
      await fetch('/api/secrets/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'encrypted', key }),
      });
      showToast('配置已清除', 'info');
      loadConfig();
    } catch (error) {
      showToast('清除失败', 'error');
    }
  };

  const getStatusIcon = (s: ApiStatus['kimi']) => {
    switch (s) {
      case 'configured':
        return <Chip size="small" label="已配置" color="primary" variant="outlined" />;
      case 'valid':
        return <CheckCircleIcon sx={{ fontSize: 18, color: '#22c55e' }} />;
      case 'invalid':
        return <ErrorIcon sx={{ fontSize: 18, color: '#ef4444' }} />;
      default:
        return <Chip size="small" label="未配置" variant="outlined" />;
    }
  };

  return (
    <Box sx={{ maxWidth: 600 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <SearchIcon sx={{ fontSize: 24, color: gs.textPrimary }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary }}>
          搜索 API 配置
        </Typography>
      </Box>

      {/* Important Notice */}
      <Alert severity="info" sx={{ mb: 3, fontSize: '0.85rem' }}>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>重要说明</Typography>
        <Typography sx={{ fontSize: '0.8rem' }}>
          这些是<strong>搜索专用</strong>的 API Key，与模型 API Key 不同。配置后将在搜索时优先使用，
          未配置时自动回退到必应国内版 → 360搜索 → DuckDuckGo。
        </Typography>
      </Alert>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {/* Kimi Search API */}
          <Box sx={{ mb: 3, p: 2, borderRadius: 2, border: `1px solid ${gs.border}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 600 }}>Kimi 搜索 API</Typography>
                {getStatusIcon(status.kimi)}
              </Box>
              <Link
                href="https://platform.moonshot.cn/console/api-keys"
                target="_blank"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: gs.textMuted }}
              >
                申请 API Key <OpenInNewIcon sx={{ fontSize: 14 }} />
              </Link>
            </Box>

            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1.5 }}>
              Kimi (Moonshot AI) 搜索 API，新用户可享 15 元免费额度
            </Typography>

            <TextField
              fullWidth
              size="small"
              label="Kimi API Key (KIMI_API_KEY)"
              type={showKeys.kimi ? 'text' : 'password'}
              value={config.kimiApiKey}
              onChange={(e) => setConfig({ ...config, kimiApiKey: e.target.value })}
              placeholder="sk-..."
              disabled={config.kimiApiKey === '(已配置)'}
              InputProps={{
                endAdornment: (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => setShowKeys(prev => ({ ...prev, kimi: !prev.kimi }))}>
                      {showKeys.kimi ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                    {config.kimiApiKey === '(已配置)' && (
                      <Tooltip title="清除配置">
                        <IconButton size="small" color="error" onClick={() => handleClear('KIMI_API_KEY')}>
                          ×
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                ),
              }}
              sx={{ mb: 1 }}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={isTesting.kimi || status.kimi === 'unknown'}
                onClick={() => handleTest('kimi')}
                startIcon={isTesting.kimi ? <CircularProgress size={14} /> : undefined}
              >
                测试连接
              </Button>
            </Box>
          </Box>

          {/* MiniMax Search API */}
          <Box sx={{ mb: 3, p: 2, borderRadius: 2, border: `1px solid ${gs.border}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 600 }}>MiniMax 搜索 API</Typography>
                {getStatusIcon(status.minimax)}
              </Box>
              <Link
                href="https://platform.minimaxi.com/"
                target="_blank"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: gs.textMuted }}
              >
                申请 API Key <OpenInNewIcon sx={{ fontSize: 14 }} />
              </Link>
            </Box>

            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1.5 }}>
              MiniMax 搜索 API，通过 ChatCompletion + web_search tool 实现
            </Typography>

            <TextField
              fullWidth
              size="small"
              label="MiniMax API Key (MINIMAX_API_KEY)"
              type={showKeys.minimax ? 'text' : 'password'}
              value={config.minimaxApiKey}
              onChange={(e) => setConfig({ ...config, minimaxApiKey: e.target.value })}
              placeholder="eyJhbGciOiJ..."
              disabled={config.minimaxApiKey === '(已配置)'}
              InputProps={{
                endAdornment: (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => setShowKeys(prev => ({ ...prev, minimax: !prev.minimax }))}>
                      {showKeys.minimax ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                    {config.minimaxApiKey === '(已配置)' && (
                      <Tooltip title="清除配置">
                        <IconButton size="small" color="error" onClick={() => handleClear('MINIMAX_API_KEY')}>
                          ×
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                ),
              }}
              sx={{ mb: 1.5 }}
            />

            <TextField
              fullWidth
              size="small"
              label="MiniMax Group ID (可选)"
              type="text"
              value={config.minimaxGroupId}
              onChange={(e) => setConfig({ ...config, minimaxGroupId: e.target.value })}
              placeholder="Group ID"
              disabled={config.minimaxGroupId === '(已配置)'}
              InputProps={{
                endAdornment: config.minimaxGroupId === '(已配置)' ? (
                  <Tooltip title="清除配置">
                    <IconButton size="small" color="error" onClick={() => handleClear('MINIMAX_GROUP_ID')}>
                      ×
                    </IconButton>
                  </Tooltip>
                ) : undefined,
              }}
              sx={{ mb: 1 }}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={isTesting.minimax || status.minimax === 'unknown'}
                onClick={() => handleTest('minimax')}
                startIcon={isTesting.minimax ? <CircularProgress size={14} /> : undefined}
              >
                测试连接
              </Button>
            </Box>
          </Box>

          {/* Fallback Info */}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.02)' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>搜索回退顺序</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted }}>
              配置 API Key 后按以下优先级使用：
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip size="small" label="Kimi" color={status.kimi !== 'unknown' ? 'primary' : 'default'} />
              <Typography sx={{ color: gs.textMuted }}>→</Typography>
              <Chip size="small" label="MiniMax" color={status.minimax !== 'unknown' ? 'primary' : 'default'} />
              <Typography sx={{ color: gs.textMuted }}>→</Typography>
              <Chip size="small" label="必应国内版" variant="outlined" />
              <Typography sx={{ color: gs.textMuted }}>→</Typography>
              <Chip size="small" label="360搜索" variant="outlined" />
              <Typography sx={{ color: gs.textMuted }}>→</Typography>
              <Chip size="small" label="DuckDuckGo" variant="outlined" />
            </Box>
          </Box>

          {/* Save Button */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={isSaving ? <CircularProgress size={18} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={isSaving}
              sx={{
                backgroundColor: gs.textPrimary,
                '&:hover': { backgroundColor: gs.textSecondary },
              }}
            >
              保存配置
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default SearchApiTab;
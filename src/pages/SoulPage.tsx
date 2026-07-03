import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Paper, CircularProgress,
  useTheme, Alert, Stack, List, ListItem, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useToast } from '../contexts/ToastContext';
import { getGrayScale } from '../constants/theme';
import type { SoulProfile, SoulFile } from '../services/api';
import { fetchSoulCurrent, fetchSoulFiles, reloadSoul } from '../services/api';

const SoulPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [currentProfile, setCurrentProfile] = useState<SoulProfile | null>(null);
  const [systemMessage, setSystemMessage] = useState('');
  const [strategyPrefs, setStrategyPrefs] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<SoulFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [expanded, setExpanded] = useState<string | false>('profile');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [current, filesData] = await Promise.all([
        fetchSoulCurrent(),
        fetchSoulFiles(),
      ]);
      setCurrentProfile(current.profile);
      setSystemMessage(current.systemMessage);
      setStrategyPrefs(current.strategyPreferences);
      setFiles(filesData);
    } catch (e) {
      showToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadSoul();
      showToast('规则已重新加载', 'success');
      loadData();
    } catch (e) {
      showToast(`重载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setReloading(false);
    }
  };

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
          Soul 规则配置
        </Typography>
        <Stack direction="row" spacing={1}>
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={handleReload}
            disabled={reloading}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            {reloading ? '重载中...' : '重新加载'}
          </Button>
        </Stack>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Stack spacing={1.5}>
          <Accordion
            expanded={expanded === 'profile'}
            onChange={handleAccordionChange('profile')}
            sx={{ borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <AutoFixHighIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>当前规则配置</Typography>
                {currentProfile && (
                  <Chip label={currentProfile.version} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {currentProfile ? (
                <Stack spacing={2}>
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>
                      {currentProfile.name}
                    </Typography>
                    {currentProfile.description && (
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {currentProfile.description}
                      </Typography>
                    )}
                  </Box>
                  <Divider />
                  <Box>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 1 }}>
                      策略偏好
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" spacing={1}>
                      {Object.entries(strategyPrefs).map(([key, value]) => (
                        <Chip
                          key={key}
                          label={`${key}: ${typeof value === 'boolean' ? (value ? '开启' : '关闭') : String(value)}`}
                          size="small"
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              ) : (
                <Alert severity="info" sx={{ borderRadius: 1 }}>
                  未加载 Soul 配置
                </Alert>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expanded === 'systemMessage'}
            onChange={handleAccordionChange('systemMessage')}
            sx={{ borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <DescriptionIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>系统消息</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  ({systemMessage.length} 字符)
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  maxHeight: 300,
                  overflowY: 'auto',
                  backgroundColor: gs.bgHover,
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {systemMessage || '无系统消息'}
              </Paper>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expanded === 'files'}
            onChange={handleAccordionChange('files')}
            sx={{ borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <SettingsIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  规则文件
                </Typography>
                <Chip label={`${files.length} 个`} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {files.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 1 }}>
                  暂无规则文件
                </Alert>
              ) : (
                <List dense disablePadding>
                  {files.map((file) => (
                    <ListItem key={file.id} sx={{ px: 0, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{file.name}</Typography>
                            <Chip
                              label={file.type === 'system' ? '系统' : '自定义'}
                              size="small"
                              sx={{
                                fontSize: '0.6rem',
                                height: 18,
                                backgroundColor: file.type === 'system' ? '#EFF6FF22' : '#FEF3C722',
                                color: file.type === 'system' ? '#2563EB' : '#D97706',
                              }}
                            />
                          </Stack>
                        }
                        secondary={
                          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                            {file.path}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
    </Box>
  );
};

export default SoulPage;
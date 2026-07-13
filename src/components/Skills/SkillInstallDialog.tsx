import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import FileIcon from '@mui/icons-material/Description';
import { installSkill, cancelInstall } from '../../services/proposalApi';
import type { InstallProgress, InstallStatus, InstallResult } from '../../types/proposal';

interface SkillInstallDialogProps {
  open: boolean;
  onClose: () => void;
  source: string;
  onInstalled?: (result: InstallResult) => void;
}

const STEP_INFO: Record<string, { label: string; icon: string }> = {
  downloading: { label: '下载中', icon: '⬇️' },
  extracting: { label: '解压中', icon: '📦' },
  installing: { label: '安装中', icon: '🔧' },
  scanning: { label: '安全扫描', icon: '🔍' },
  completed: { label: '完成', icon: '✅' },
  failed: { label: '失败', icon: '❌' },
};

export const SkillInstallDialog: React.FC<SkillInstallDialogProps> = ({
  open,
  onClose,
  source,
  onInstalled,
}) => {
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<InstallStatus>('pending');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [stepName, setStepName] = useState('');
  const [stepCurrent, setStepCurrent] = useState(0);
  const [stepTotal, setStepTotal] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [eta, setEta] = useState(0);
  const [skillName, setSkillName] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<InstallResult | null>(null);
  const installIdRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      setStatus('pending');
      setProgress(0);
      setMessage('');
      setError('');
      setWarnings([]);
      setResult(null);
      installIdRef.current = '';
    }
  }, [open]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setStatus('downloading');
    setError('');
    setWarnings([]);

    try {
      const finalResult = await installSkill(source, (p: InstallProgress) => {
        switch (p.type) {
          case 'progress':
            setProgress(p.progress ?? 0);
            setMessage(p.message ?? '');
            setStepName(p.stepName ?? '');
            setStepCurrent(p.stepCurrent ?? 0);
            setStepTotal(p.stepTotal ?? 0);
            setDownloadedBytes(p.downloadedBytes ?? 0);
            setTotalBytes(p.totalBytes ?? 0);
            setEta(p.eta ?? 0);
            setSkillName(p.skillName ?? '');
            setVersion(p.version ?? '');

            if (p.step) {
              const stepMap: Record<string, InstallStatus> = {
                download: 'downloading',
                extract: 'extracting',
                install: 'installing',
                scan: 'scanning',
              };
              setStatus(stepMap[p.step] || 'installing');
            }
            break;
          case 'warning':
            const warningMsg = p.warning;
            if (warningMsg) {
              setWarnings((prev) => [...prev, warningMsg]);
            }
            break;
          case 'log':
            setMessage(p.message ?? '');
            break;
          case 'result':
            installIdRef.current = (p.result as any)?.installId || '';
            setStatus('completed');
            break;
          case 'error':
            setError(p.error || '安装失败');
            setStatus('failed');
            break;
        }
      });

      setResult(finalResult);
      setStatus('completed');

      if (onInstalled) {
        onInstalled(finalResult);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus('failed');
    } finally {
      setInstalling(false);
    }
  }, [source, onInstalled]);

  const handleCancel = useCallback(async () => {
    if (installIdRef.current) {
      await cancelInstall(installIdRef.current);
    }
    setStatus('cancelled');
    onClose();
  }, [onClose]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatEta = (seconds: number): string => {
    if (seconds <= 0) return '';
    if (seconds < 60) return `约 ${seconds} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `约 ${mins} 分${secs > 0 ? `${secs}秒` : ''}`;
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'downloading':
      case 'extracting':
      case 'installing':
      case 'scanning':
        return 'info';
      default:
        return 'info';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="install-dialog-title"
    >
      <DialogTitle id="install-dialog-title">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DownloadIcon color="primary" />
            <Typography variant="h6" component="span">
              安装技能
            </Typography>
            {skillName && (
              <Chip
                label={skillName}
                size="small"
                variant="outlined"
                sx={{ fontSize: 11 }}
              />
            )}
          </Box>
          <IconButton onClick={handleCancel} size="small" disabled={installing}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ fontSize: 32 }}>
              {STEP_INFO[status]?.icon || '📥'}
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {STEP_INFO[status]?.label || '安装中'}
              </Typography>
              {stepName && (
                <Typography variant="body2" color="text.secondary">
                  {stepName}
                  {stepTotal > 0 && ` (${stepCurrent}/${stepTotal})`}
                </Typography>
              )}
            </Box>
          </Box>

          {(status === 'downloading' ||
            status === 'extracting' ||
            status === 'installing' ||
            status === 'scanning') && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(progress, 100)}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {downloadedBytes > 0 && totalBytes > 0
                    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                    : `${Math.round(progress)}%`}
                </Typography>
                {eta > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {formatEta(eta)}
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {message && (
            <Alert severity={getStatusColor()} sx={{ fontSize: 12 }}>
              {message}
            </Alert>
          )}

          {warnings.length > 0 && (
            <Box sx={{ gap: 1, display: 'flex', flexDirection: 'column' }}>
              {warnings.map((w, i) => (
                <Alert key={i} severity="warning" sx={{ fontSize: 11 }}>
                  <WarningIcon sx={{ fontSize: 14, mr: 1 }} />
                  {w}
                </Alert>
              ))}
            </Box>
          )}

          {error && (
            <Alert severity="error">
              <ErrorIcon sx={{ fontSize: 16, mr: 1 }} />
              {error}
            </Alert>
          )}

          {status === 'completed' && result && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" color="success.main" gutterBottom>
                安装成功！
              </Typography>
              {skillName && (
                <Typography variant="body2" color="text.secondary">
                  技能 "{skillName}"
                  {version && ` v${version}`} 已安装
                </Typography>
              )}
            </Box>
          )}

          {status === 'pending' && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                即将从以下来源安装技能：
              </Typography>
              <Box
                sx={{
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FileIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {source}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {status === 'pending' && (
          <>
            <Button onClick={handleCancel} color="inherit">
              取消
            </Button>
            <Button
              onClick={handleInstall}
              color="primary"
              variant="contained"
              startIcon={<DownloadIcon />}
            >
              开始安装
            </Button>
          </>
        )}

        {(status === 'downloading' ||
          status === 'extracting' ||
          status === 'installing' ||
          status === 'scanning') && (
          <>
            <Button onClick={handleCancel} color="inherit" disabled={installing}>
              取消安装
            </Button>
            <Button disabled>
              <CircularProgress size={20} />
              安装中...
            </Button>
          </>
        )}

        {(status === 'completed' || status === 'failed') && (
          <Button onClick={handleCancel} color="primary" variant="contained">
            {status === 'completed' ? '完成' : '关闭'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SkillInstallDialog;

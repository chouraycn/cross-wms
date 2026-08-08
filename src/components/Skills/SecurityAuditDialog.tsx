import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Divider, Chip, Stack,
  List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import { SkillAudit, AuditFinding } from '../../types/skill';

interface SecurityAuditDialogProps {
  open: boolean;
  audit: SkillAudit;
  /** 是否允许仍然安装（suspicious 可安装，malicious 禁止） */
  allowForceInstall: boolean;
  onInstall: () => void;
  onCancel: () => void;
  onViewReport: () => void;
}

const levelIcon: Record<string, React.ReactNode> = {
  'safe': <CheckCircleIcon sx={{ fontSize: 48, color: '#16A34A' }} />,
  'suspicious': <WarningAmberIcon sx={{ fontSize: 48, color: '#EA580C' }} />,
  'malicious': <ErrorIcon sx={{ fontSize: 48, color: '#DC2626' }} />,
};

const levelColor: Record<string, string> = {
  'safe': '#16A34A',
  'suspicious': '#EA580C',
  'malicious': '#DC2626',
};

const levelLabel: Record<string, string> = {
  'safe': '安全',
  'suspicious': '可疑',
  'malicious': '恶意',
};

const severityIcon: Record<string, React.ReactNode> = {
  'malicious': <ErrorIcon sx={{ color: '#DC2626', fontSize: 18 }} />,
  'suspicious': <WarningAmberIcon sx={{ color: '#EA580C', fontSize: 18 }} />,
  'informational': <InfoIcon sx={{ color: '#6B7280', fontSize: 18 }} />,
};

const SecurityAuditDialog: React.FC<SecurityAuditDialogProps> = ({
  open, audit, allowForceInstall, onInstall, onCancel, onViewReport,
}) => {
  // 解析 reportJson 获取 findings
  let report: any = {};
  try {
    report = JSON.parse(audit.reportJson);
  } catch {
    // JSON 解析失败时使用空对象
  }

  const findings: AuditFinding[] = [
    ...(report.maliciousFindings || []),
    ...(report.suspiciousFindings || []),
    ...(report.informationalNotes || []),
  ];

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
        安全审查
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        {/* 评分环 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
          {levelIcon[audit.level] || levelIcon['suspicious']}
          <Typography variant="h4" sx={{ fontWeight: 700, color: levelColor[audit.level], my: 1 }}>
            {audit.score}/100
          </Typography>
          <Chip
            label={`${levelLabel[audit.level]} (${audit.level === 'safe' ? 'Safe' : audit.level === 'suspicious' ? 'Suspicious' : 'Malicious'})`}
            size="small"
            sx={{
              bgcolor: audit.level === 'safe' ? '#DCFCE7' : audit.level === 'suspicious' ? '#FEF3C7' : '#FEE2E2',
              color: levelColor[audit.level],
              fontWeight: 600,
            }}
          />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* 风险列表 */}
        {findings.length > 0 && (
          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              发现 {findings.length} 项风险：
            </Typography>
            <List dense disablePadding>
              {findings.map((f, i) => (
                <ListItem key={i} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {severityIcon[f.severity]}
                  </ListItemIcon>
                  <ListItemText
                    primary={f.description}
                    secondary={f.location}
                    primaryTypographyProps={{ fontSize: '0.8rem' }}
                    secondaryTypographyProps={{ fontSize: '0.65rem' }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {findings.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            未发现明显风险
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onViewReport}>
          查看完整报告
        </Button>
        {allowForceInstall && (
          <Button variant="outlined" color="warning" onClick={onInstall}>
            仍要安装
          </Button>
        )}
        <Button
          variant={allowForceInstall ? 'contained' : 'contained'}
          color={allowForceInstall ? 'primary' : 'error'}
          onClick={onCancel}
        >
          {allowForceInstall ? '取消' : '不安装'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SecurityAuditDialog;

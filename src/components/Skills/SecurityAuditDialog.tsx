import React from 'react';
import {
  Button, Typography, Box, Chip,
  List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import ShieldIcon from '@mui/icons-material/Security';
import { SkillAudit, AuditFinding } from '../../types/skill';
import SkillDialogShell, { PrimaryPill, SecondaryGhost, WarningPill } from './SkillDialogShell';

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

  const auditLevel = audit.level || 'suspicious';
  const subtitle = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <span>安全评分</span>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          px: 1.25,
          py: 0.25,
          borderRadius: '6px',
          backgroundColor: auditLevel === 'safe' ? '#DCFCE7' : auditLevel === 'suspicious' ? '#FEF3C7' : '#FEE2E2',
          color: levelColor[auditLevel],
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      >
        {audit.score}/100 · {levelLabel[auditLevel]}
      </Box>
    </Box>
  );

  return (
    <SkillDialogShell
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      icon={
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          {levelIcon[auditLevel] || levelIcon['suspicious']}
        </Box>
      }
      title="安全审查"
      subtitle={subtitle}
      headerExtra={
        <Chip
          label={`${levelLabel[auditLevel] || '可疑'} (${auditLevel === 'safe' ? 'Safe' : auditLevel === 'suspicious' ? 'Suspicious' : 'Malicious'})`}
          size="small"
          sx={{
            bgcolor: auditLevel === 'safe' ? '#DCFCE7' : auditLevel === 'suspicious' ? '#FEF3C7' : '#FEE2E2',
            color: levelColor[auditLevel],
            fontWeight: 600,
          }}
        />
      }
      actions={
        <>
          <Button {...SecondaryGhost} onClick={onViewReport}>
            查看完整报告
          </Button>
          {allowForceInstall && (
            <Button {...WarningPill} onClick={onInstall}>
              仍要安装
            </Button>
          )}
          <Button
            {...allowForceInstall ? PrimaryPill : { ...PrimaryPill, sx: { ...(PrimaryPill.sx as any), bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } } }}
            onClick={onCancel}
          >
            {allowForceInstall ? '取消' : '不安装'}
          </Button>
        </>
      }
    >
      {/* 评分环 + 标签 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: levelColor[auditLevel], my: 0.5 }}>
          {audit.score}/100
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2,
            py: 1.25,
            bgcolor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '10px',
          }}
        >
          <ShieldIcon sx={{ fontSize: 18, color: levelColor[auditLevel] }} />
          <Typography sx={{ fontSize: '0.875rem', color: '#111827', fontWeight: 600 }}>
            结论：<span style={{ color: levelColor[auditLevel] }}>{levelLabel[auditLevel] || '可疑'}</span>
            {allowForceInstall
              ? '（风险可控，可选择仍然安装）'
              : '（禁止安装，建议删除来源）'}
          </Typography>
        </Box>
      </Box>

      {/* 风险列表 */}
      {findings.length > 0 && (
        <Box sx={{ textAlign: 'left' }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#6B7280', fontWeight: 600, fontSize: '0.8125rem' }}>
            发现 {findings.length} 项风险：
          </Typography>
          <List dense disablePadding sx={{
            bgcolor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '10px',
            p: 0.5,
          }}>
            {findings.map((f, i) => (
              <ListItem key={i} disablePadding sx={{
                mb: 0.5,
                '&:not(:last-child)': {
                  borderBottom: '1px dashed #E5E7EB',
                },
              }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {severityIcon[f.severity] || <InfoIcon sx={{ color: '#6B7280', fontSize: 18 }} />}
                </ListItemIcon>
                <ListItemText
                  primary={f.description}
                  secondary={f.location}
                  primaryTypographyProps={{ fontSize: '0.8rem', color: '#111827' }}
                  secondaryTypographyProps={{ fontSize: '0.6875rem', color: '#6B7280' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {findings.length === 0 && (
        <Box sx={{
          textAlign: 'center',
          p: 2,
          bgcolor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '10px',
        }}>
          <CheckCircleIcon sx={{ fontSize: 28, color: '#16A34A', mb: 0.5 }} />
          <Typography variant="body2" color="#374151">
            未发现明显风险
          </Typography>
        </Box>
      )}
    </SkillDialogShell>
  );
};

export default SecurityAuditDialog;

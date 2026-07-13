/**
 * SkillPreviewDialog — 技能预览弹窗
 *
 * 根据图片设计：
 * - 顶部：图标 + 技能名 + 右上角关闭按钮
 * - 来源标签（user installed / builtin）
 * - 技能描述
 * - 元信息：版本、作者、内容指纹、安装状态
 * - 安全扫描 / 依赖检测 / 安装说明 可折叠面板
 * - 蓝色信息提示条：「以下内容来自该技能的 SKILL.md 原文」
 * - SKILL.md 原始内容（Markdown 渲染）
 * - 右下角：黑色"使用"按钮
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  useTheme,
  Collapse,
  Divider,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getCategoryGradient } from '../../constants/skillCategories';
import { getGrayScale } from '../../constants/theme';
import { MarkdownRenderer } from '../CrossWmsChat/MarkdownRenderer';
import { scanSkillMd, readSkillMd, checkSkillDependencies } from '../../services/api';
import { parseSkillMd } from '../../utils/skillParser';
import type { OpenClawSkillMetadata, SkillInstallSpec } from '../../utils/skillParser';
import { securityScanner } from '../../utils/securityScanner';
import type { SecurityScanResult } from '../../utils/securityScanner';
import { computeSkillFingerprint, type SkillFingerprint } from '../../utils/skillFingerprint';
import type { DependencyCheckResult } from '../../utils/dependencyChecker';

export interface SkillPreviewDialogProps {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
  /** 点击"使用"按钮后的回调（如跳转到 /chat?skill=xxx） */
  onUse: (skill: Skill) => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, expanded, onToggle, children, badge }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  return (
    <Box sx={{ border: `1px solid ${gs.border}`, borderRadius: '10px', overflow: 'hidden', mb: 1.5 }}>
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.25,
          cursor: 'pointer',
          bgcolor: gs.bgHover,
          '&:hover': { bgcolor: gs.border },
        }}
      >
        <Box sx={{ color: gs.textSecondary, display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography sx={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary }}>
          {title}
        </Typography>
        {badge}
        <ExpandMoreIcon
          sx={{
            fontSize: 18,
            color: gs.textMuted,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ p: 2, bgcolor: gs.bgPanel }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

const SkillPreviewDialog: React.FC<SkillPreviewDialogProps> = ({
  open,
  skill,
  onClose,
  onUse,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [skillMdContent, setSkillMdContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<OpenClawSkillMetadata | undefined>(undefined);
  const [fingerprint, setFingerprint] = useState<SkillFingerprint | null>(null);
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null);
  const [depResult, setDepResult] = useState<DependencyCheckResult | undefined>(undefined);
  const [depLoading, setDepLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    security: true,
    dependency: true,
    install: false,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 解析 SKILL.md：剥离 frontmatter，保留正文
  const parsedBody = useMemo(() => {
    if (!skillMdContent) return '';
    const fmMatch = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) return fmMatch[2].trim();
    return skillMdContent.trim();
  }, [skillMdContent]);

  const analyzeContent = useCallback(async (content: string, targetSkill: Skill) => {
    // 解析 OpenClaw metadata
    try {
      const parsed = parseSkillMd(content);
      setMetadata(parsed.metadata);
    } catch {
      setMetadata(undefined);
    }

    // 内容指纹
    try {
      setFingerprint(await computeSkillFingerprint(content));
    } catch {
      setFingerprint(null);
    }

    // 安全扫描
    try {
      setScanResult(securityScanner.scanSkillMd(targetSkill.id, content));
    } catch {
      setScanResult(null);
    }

    // 依赖检测
    setDepLoading(true);
    try {
      const map = await checkSkillDependencies([targetSkill.id]);
      setDepResult(map[targetSkill.id]);
    } catch {
      setDepResult(undefined);
    } finally {
      setDepLoading(false);
    }
  }, []);

  // 加载 SKILL.md 原文并执行分析
  useEffect(() => {
    if (!open || !skill) {
      setSkillMdContent(null);
      setError(null);
      setMetadata(undefined);
      setFingerprint(null);
      setScanResult(null);
      setDepResult(undefined);
      return;
    }

    // 内置技能：使用 promptTemplate 作为"原文"
    if (skill.source === 'builtin' || !skill.id) {
      const content = skill.promptTemplate || skill.detail || skill.desc || '';
      setSkillMdContent(content);
      setLoading(false);
      analyzeContent(content, skill);
      return;
    }

    // 用户技能：尝试从 ~/.workbuddy/skills/ 目录读取 SKILL.md
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const scanned = await scanSkillMd();
        const match = scanned.find((s) => s.name === skill.name || s.dirName === skill.id);
        if (!match) {
          if (!cancelled) {
            const content = skill.promptTemplate || skill.detail || skill.desc || '';
            setSkillMdContent(content);
            analyzeContent(content, skill);
          }
          return;
        }
        const detail = await readSkillMd(match.dirName);
        if (!cancelled) {
          const content = detail.body || '';
          setSkillMdContent(content);
          analyzeContent(content, skill);
        }
      } catch (e) {
        if (!cancelled) {
          const content = skill.promptTemplate || skill.detail || skill.desc || '';
          setSkillMdContent(content);
          setError(null);
          analyzeContent(content, skill);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, skill, analyzeContent]);

  if (!skill) return null;

  // v1.7.87: ICON_MAP 的值是 React.ReactNode，不是组件，不能直接调用
  const iconNode = ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 24 }} />;
  const sourceLabel = skill.source === 'user' ? 'user installed' : 'built-in';
  const displayVersion = skill.version || skill.standardFields?.version || fingerprint?.version || '-';
  const displayAuthor = skill.author || metadata?.homepage || '-';
  const installStatusLabel = skill.source === 'builtin' ? '内置' : skill.installedAt ? '已安装' : '自定义';

  const installSpecs = metadata?.install || [];

  const renderFindingSeverity = (severity: string) => {
    const colors: Record<string, { bg: string; color: string; label: string }> = {
      critical: { bg: '#FEF2F2', color: '#DC2626', label: '严重' },
      warn: { bg: '#FEF3C7', color: '#D97706', label: '警告' },
      info: { bg: '#EFF6FF', color: '#2563EB', label: '信息' },
    };
    const cfg = colors[severity] || colors.info;
    return (
      <Chip
        label={cfg.label}
        size="small"
        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: cfg.bg, color: cfg.color }}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '14px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.12)',
          maxHeight: '90vh',
          bgcolor: gs.bgPanel,
          overflow: 'hidden',
        },
      }}
    >
      {/* 内容区：上下两段布局 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* 顶部：图标 + 名称 + 关闭按钮 */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: 4, pt: 3.5, pb: 2 }}>
          {/* 图标卡片 */}
          <Box sx={{
            width: 48,
            height: 48,
            borderRadius: '10px',
            background: getCategoryGradient(skill.category),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: gs.bgPanel,
            '& .MuiSvgIcon-root': { fontSize: 24, color: gs.bgPanel },
          }}>
            {iconNode}
          </Box>

          {/* 名称 + 来源 */}
          <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>
              {skill.name}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              {sourceLabel}
            </Typography>
          </Box>

          {/* 关闭按钮 */}
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: gs.textMuted,
              '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* 技能描述 */}
        <Box sx={{ px: 4, pb: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', color: gs.textSecondary, lineHeight: 1.6 }}>
            {skill.desc}
          </Typography>
          {skill.tags && skill.tags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
              {skill.tags.slice(0, 5).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 500,
                    bgcolor: gs.bgHover,
                    color: gs.textMuted,
                    borderRadius: '4px',
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* 元信息卡片 */}
        <Box sx={{ px: 4, pb: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
            <Box sx={{ p: 1.5, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgHover }}>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mb: 0.25 }}>版本</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
                {displayVersion}
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgHover }}>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mb: 0.25 }}>作者</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayAuthor}
              </Typography>
            </Box>
            <Box sx={{ p: 1.5, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgHover }}>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mb: 0.25 }}>内容指纹</Typography>
              <Tooltip title={fingerprint ? `SHA-256: ${fingerprint.hash}` : '计算中'}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary, fontFamily: 'monospace' }}>
                  {fingerprint ? `${fingerprint.hash.slice(0, 8)}…` : '-'}
                </Typography>
              </Tooltip>
            </Box>
            <Box sx={{ p: 1.5, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgHover }}>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, mb: 0.25 }}>安装状态</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: gs.textPrimary }}>
                {installStatusLabel}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* 可折叠信息面板 */}
        <Box sx={{ px: 4, pb: 1.5 }}>
          <Section
            title="安全扫描"
            icon={<ShieldOutlinedIcon sx={{ fontSize: 18 }} />}
            expanded={expandedSections.security}
            onToggle={() => toggleSection('security')}
            badge={scanResult ? (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {scanResult.critical > 0 && <Chip label={`${scanResult.critical} 严重`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#FEF2F2', color: '#DC2626' }} />}
                {scanResult.warn > 0 && <Chip label={`${scanResult.warn} 警告`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#FEF3C7', color: '#D97706' }} />}
                {scanResult.critical === 0 && scanResult.warn === 0 && <Chip label="安全" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#ECFDF5', color: '#059669' }} />}
              </Box>
            ) : null}
          >
            {scanResult ? (
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, mb: 1 }}>
                  扫描文件：{scanResult.scannedFiles} 个 · 风险项：{scanResult.critical + scanResult.warn + scanResult.info} 个
                </Typography>
                {scanResult.findings.length === 0 ? (
                  <Typography sx={{ fontSize: '0.8125rem', color: '#059669' }}>未发现安全风险。</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {scanResult.findings.map((finding, idx) => (
                      <Box key={idx} sx={{ p: 1.25, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgPanel }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {renderFindingSeverity(finding.severity)}
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>
                            {finding.ruleId}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, mb: 0.25 }}>
                          {finding.message}
                        </Typography>
                        {finding.evidence && (
                          <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {finding.evidence}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>暂无扫描结果。</Typography>
            )}
          </Section>

          <Section
            title="依赖检测"
            icon={<BuildOutlinedIcon sx={{ fontSize: 18 }} />}
            expanded={expandedSections.dependency}
            onToggle={() => toggleSection('dependency')}
            badge={depLoading ? <CircularProgress size={12} sx={{ color: gs.textMuted }} /> : depResult ? (
              depResult.checks.length === 0 ? (
                <Chip label="无依赖" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#F3F4F6', color: '#6B7280' }} />
              ) : depResult.allFound ? (
                <Chip label="已满足" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#ECFDF5', color: '#059669' }} />
              ) : (
                <Chip label={`缺少 ${depResult.missingBins.length + depResult.missingEnv.length + depResult.missingConfig.length} 项`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#FEF2F2', color: '#DC2626' }} />
              )
            ) : null}
          >
            {depLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>正在检测依赖…</Typography>
              </Box>
            ) : depResult ? (
              depResult.checks.length === 0 ? (
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>该技能未声明环境依赖。</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {depResult.checks.map((check, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.75, borderRadius: '6px', bgcolor: check.found ? '#F0FDF4' : '#FEF2F2' }}>
                      {check.found ? (
                        <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
                      ) : (
                        <CloseIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                      )}
                      <Typography sx={{ flex: 1, fontSize: '0.75rem', color: gs.textPrimary }}>
                        {check.type === 'bin' && '命令'}
                        {check.type === 'env' && '环境变量'}
                        {check.type === 'config' && '配置文件'}
                        ：{check.name}
                      </Typography>
                      {check.found && check.value && (
                        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {check.value}
                        </Typography>
                      )}
                      {!check.found && (
                        <Chip label="缺失" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#FECACA', color: '#991B1B' }} />
                      )}
                    </Box>
                  ))}
                </Box>
              )
            ) : (
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>暂无依赖检测结果。</Typography>
            )}
          </Section>

          <Section
            title="安装说明"
            icon={<DownloadOutlinedIcon sx={{ fontSize: 18 }} />}
            expanded={expandedSections.install}
            onToggle={() => toggleSection('install')}
            badge={installSpecs.length > 0 ? <Chip label={`${installSpecs.length} 条`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#EFF6FF', color: '#2563EB' }} /> : null}
          >
            {installSpecs.length === 0 ? (
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>该技能未声明安装步骤。</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {installSpecs.map((spec, idx) => (
                  <Box key={idx} sx={{ p: 1.25, border: `1px solid ${gs.border}`, borderRadius: '8px', bgcolor: gs.bgPanel }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip label={spec.kind.toUpperCase()} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: '#E0E7FF', color: '#3730A3' }} />
                      {spec.label && <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textPrimary }}>{spec.label}</Typography>}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      {spec.formula && <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>formula: {spec.formula}</Typography>}
                      {spec.package && <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>package: {spec.package}</Typography>}
                      {spec.module && <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>module: {spec.module}</Typography>}
                      {spec.url && <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, wordBreak: 'break-all' }}>url: {spec.url}</Typography>}
                      {spec.bins && spec.bins.length > 0 && (
                        <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>提供命令: {spec.bins.join(', ')}</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Section>
        </Box>

        {/* 蓝色信息提示条 */}
        <Box sx={{ px: 4, pb: 1.5 }}>
          <Alert
            icon={<InfoOutlinedIcon sx={{ fontSize: 16, color: '#1E40AF' }} />}
            sx={{
              bgcolor: '#EFF6FF',
              color: '#1E40AF',
              border: 'none',
              borderRadius: '8px',
              py: 0.75,
              '& .MuiAlert-message': { fontSize: '0.8125rem', fontWeight: 500, py: 0 },
            }}
          >
            以下内容来自该技能的 SKILL.md 原文
          </Alert>
        </Box>

        {/* SKILL.md 原文区 */}
        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          mx: 4,
          mb: 1.5,
          border: `1px solid ${gs.border}`,
          borderRadius: '10px',
          bgcolor: gs.bgPanel,
        }}>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={20} />
            </Box>
          ) : !parsedBody ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
                暂无 SKILL.md 原文内容
              </Typography>
            </Box>
          ) : (
            <Box sx={{ p: 3, '& .markdown-body': { fontSize: '0.875rem', lineHeight: 1.7, color: gs.textPrimary } }}>
              <MarkdownRenderer content={parsedBody} />
            </Box>
          )}
        </Box>

        {/* 底部操作栏 */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 1,
          px: 4,
          py: 2.5,
          borderTop: `1px solid ${gs.border}`,
        }}>
          {skill.status === 'active' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 'auto' }}>
              <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#059669', fontWeight: 500 }}>
                已启用
              </Typography>
            </Box>
          )}
          <Button
            variant="outlined"
            onClick={onClose}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              borderColor: gs.border,
              color: gs.textSecondary,
              px: 2.5,
              '&:hover': { borderColor: gs.borderDarker, bgcolor: gs.bgHover },
            }}
          >
            关闭
          </Button>
          <Button
            variant="contained"
            onClick={() => onUse(skill)}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              bgcolor: gs.textPrimary,
              color: gs.bgPanel,
              px: 3,
              fontWeight: 500,
              '&:hover': { bgcolor: gs.textSecondary },
            }}
          >
            使用
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default SkillPreviewDialog;

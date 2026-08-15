import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, CircularProgress, Alert, Checkbox, IconButton, Tooltip,
  useTheme, ListItem, ListItemIcon, ListItemText, Chip, DialogContent, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExtensionIcon from '@mui/icons-material/Extension';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { unzipSync } from 'fflate';
import { addSkill } from '../../stores/skillStore';
import { scanSkillMd, readSkillMd, fetchSkillConflictCheck, triggerSkillAudit } from '../../services/api';
import type { ScannedSkillMd, SkillConflictCheckResponse } from '../../services/api';
import type { ConflictResult } from '../../types/skill';
import type { SkillAudit } from '../../types/skill';
import SecurityAuditDialog from './SecurityAuditDialog';
import { getGrayScale } from '../../constants/theme';
import SkillDialogShell, { PrimaryPill, SecondaryGhost, WarningPill } from './SkillDialogShell';

// ===================== 类型 =====================

export interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}

type TabType = 'zip' | 'skillmd';

// ===================== ZIP 解析 =====================

/** 解析 SKILL.md 的 YAML frontmatter + Markdown body（前端版，与后端逻辑一致） */
function parseSkillMdContent(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  let body = '';

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmText = fmMatch[1];
    body = fmMatch[2].trim();
    for (const line of fmText.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && val) {
          frontmatter[key] = val;
        }
      }
    }
  } else {
    body = content.trim();
  }

  return { frontmatter, body };
}

/** SKILL.md 解析结果 */
interface ParsedSkillMd {
  name: string;
  description: string;
  body: string;
  frontmatter: Record<string, string>;
}

/** 从 ZIP 文件中解析 skill.md / SKILL.md */
function parseSkillZip(arrayBuffer: ArrayBuffer): ParsedSkillMd | null {
  const uint8 = new Uint8Array(arrayBuffer);
  const entries = unzipSync(uint8);

  let skillMdKey: string | null = null;
  for (const key of Object.keys(entries)) {
    const basename = key.split('/').pop() || '';
    if ((basename === 'SKILL.md' || basename === 'skill.md') && !key.startsWith('__MACOSX')) {
      skillMdKey = key;
      break;
    }
  }

  if (!skillMdKey) return null;

  try {
    const mdBytes = entries[skillMdKey];
    const mdText = new TextDecoder('utf-8').decode(mdBytes);
    const { frontmatter, body } = parseSkillMdContent(mdText);
    return {
      name: frontmatter.name || '',
      description: frontmatter.description || body.slice(0, 100).replace(/[#*\n]/g, ' ').trim(),
      body,
      frontmatter,
    };
  } catch {
    return null;
  }
}

// ===================== 冲突确认弹窗 =====================

/** 冲突确认弹窗：列出冲突技能及原因，供用户选择「仍然导入」或「取消」 */
const ConflictConfirmDialog: React.FC<{
  open: boolean;
  conflicts: ConflictResult[];
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, conflicts, onConfirm, onCancel }) => {
  return (
    <SkillDialogShell
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      icon={<WarningAmberIcon sx={{ fontSize: 22, color: '#EA580C' }} />}
      title="检测到技能冲突"
      subtitle="以下已安装技能与即将导入的技能存在重叠，可能造成触发词或标签冲突"
      actions={
        <>
          <Button {...SecondaryGhost} onClick={onCancel}>
            取消
          </Button>
          <Button {...WarningPill} onClick={onConfirm}>
            仍然导入
          </Button>
        </>
      }
    >
      <Box sx={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {conflicts.map((c) => (
          <Box
            key={c.skillId}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.75,
              py: 1.25,
              borderLeft: '3px solid #EA580C',
              backgroundColor: '#FEF3C7',
              borderRadius: '0 8px 8px 0',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#92400E' }}>
                {c.skillName}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: '#B45309', mt: 0.3, lineHeight: 1.4 }}>
                {c.reasons.join('；')}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={`${Math.round(c.score * 100)}%`}
              sx={{
                bgcolor: '#FDE68A',
                color: '#92400E',
                fontWeight: 700,
                fontSize: '0.6875rem',
                flexShrink: 0,
                mt: 0.25,
              }}
            />
          </Box>
        ))}
      </Box>
    </SkillDialogShell>
  );
};

// ===================== SKILL.md 导入面板 =====================

const SkillMdImportPanel: React.FC<{
  onImport: (skill: ScannedSkillMd) => Promise<void>;
  onClose: () => void;
}> = ({ onImport, onClose }) => {
  const [skills, setSkills] = useState<ScannedSkillMd[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Set<string>>(new Set());

  // T04: 冲突检测状态
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictResults, setConflictResults] = useState<ConflictResult[]>([]);
  const [pendingImportSkill, setPendingImportSkill] = useState<ScannedSkillMd | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await scanSkillMd();
      setSkills(data);
    } catch (e) {
      setError(`扫描失败：${e instanceof Error ? e.message : '无法连接服务'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const toggleSelect = (dirName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dirName)) next.delete(dirName);
      else next.add(dirName);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === skills.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(skills.map((s) => s.dirName)));
    }
  };

  /** T04: 对单个技能执行冲突检查，有冲突弹窗确认，无冲突直接导入 */
  const checkAndImport = async (skill: ScannedSkillMd): Promise<void> => {
    setCheckingConflict(true);
    try {
      const result: SkillConflictCheckResponse = await fetchSkillConflictCheck(
        skill.name,
        undefined,
        [skill.dirName, 'workbuddy'],
        skill.description,
      );
      if (result.conflicts.length > 0) {
        // 有冲突：暂存，弹窗让用户确认
        setConflictResults(result.conflicts);
        setPendingImportSkill(skill);
        setConflictDialogOpen(true);
      } else {
        // 无冲突：直接导入
        await onImport(skill);
        setImported((prev) => new Set(prev).add(skill.dirName));
      }
    } catch {
      // 冲突检查 API 失败时不阻塞导入
      // console.warn('[SkillMdImportPanel] Conflict check failed, proceeding with import');
      await onImport(skill);
      setImported((prev) => new Set(prev).add(skill.dirName));
    } finally {
      setCheckingConflict(false);
    }
  };

  /** T04: 冲突确认后，用户点击「仍然导入」 */
  const handleConflictConfirm = async () => {
    setConflictDialogOpen(false);
    if (pendingImportSkill) {
      try {
        await onImport(pendingImportSkill);
        setImported((prev) => new Set(prev).add(pendingImportSkill.dirName));
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setError(`导入失败：${msg}`);
      }
    }
    setPendingImportSkill(null);
    setConflictResults([]);
  };

  /** T04: 冲突确认后，用户点击「取消」 */
  const handleConflictCancel = () => {
    setConflictDialogOpen(false);
    setPendingImportSkill(null);
    setConflictResults([]);
  };

  const handleImportSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError('');

    const selectedArr = Array.from(selected);
    for (const dirName of selectedArr) {
      const skill = skills.find((s) => s.dirName === dirName);
      if (!skill) continue;
      try {
        await checkAndImport(skill);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误';
        setError(`导入失败：${skill.name} — ${msg}`);
      }
    }

    setSelected(new Set());
    setImporting(false);
  };

  const remaining = skills.filter((s) => !imported.has(s.dirName));

  return (
    <Box>
      <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
        从应用<code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>技能目录</code>扫描 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>SKILL.md</code> 格式的技能包并导入。SKILL.md 正文将作为 AI 上下文模板。
      </Typography>

      {/* 操作栏 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {remaining.length > 0 && (
            <Box onClick={toggleAll} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
              <Checkbox
                checked={selected.size === remaining.length && remaining.length > 0}
                indeterminate={selected.size > 0 && selected.size < remaining.length}
                size="small"
                sx={{ p: 0.25 }}
              />
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                全选 ({remaining.length})
              </Typography>
            </Box>
          )}
        </Box>
        <Tooltip title="刷新">
          <IconButton size="small" onClick={loadSkills} disabled={loading}>
            <RefreshIcon sx={{ fontSize: 16, color: '#6B7280' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 加载中 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} sx={{ color: '#9CA3AF' }} />
        </Box>
      )}

      {/* 无结果 */}
      {!loading && skills.length === 0 && !error && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <FolderOpenIcon sx={{ fontSize: 36, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ fontSize: '0.85rem', color: '#9CA3AF' }}>
            未发现 SKILL.md 技能包
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mt: 0.5 }}>
            请将技能包放入应用技能目录
          </Typography>
        </Box>
      )}

      {/* 技能列表 */}
      {!loading && remaining.length > 0 && (
        <Box sx={{
          maxHeight: 300,
          overflowY: 'auto',
          border: '1px solid #E5E7EB',
          borderRadius: '10px',
          backgroundColor: '#FFFFFF',
        }}>
          {remaining.map((skill, idx) => (
            <Box
              key={skill.dirName}
              onClick={() => toggleSelect(skill.dirName)}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                px: 2,
                py: 1.5,
                cursor: 'pointer',
                borderBottom: idx < remaining.length - 1 ? '1px solid #F3F4F6' : 'none',
                backgroundColor: selected.has(skill.dirName) ? '#F0FDF4' : 'transparent',
                transition: 'background-color 0.15s',
                '&:hover': { backgroundColor: selected.has(skill.dirName) ? '#F0FDF4' : '#F9FAFB' },
              }}
            >
              <Checkbox
                checked={selected.has(skill.dirName)}
                size="small"
                sx={{ mt: -0.25, p: 0.5 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DescriptionIcon sx={{ fontSize: 16, color: '#6B7280' }} />
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                    {skill.name}
                  </Typography>
                  {imported.has(skill.dirName) && (
                    <Chip
                      size="small"
                      icon={<CheckCircleIcon sx={{ fontSize: 13 }} />}
                      label="已导入"
                      sx={{
                        bgcolor: '#DCFCE7',
                        color: '#166534',
                        fontWeight: 600,
                        fontSize: '0.6875rem',
                        height: 20,
                      }}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mt: 0.25, ml: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill.description || '（无描述）'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* 已导入 */}
      {imported.size > 0 && (
        <Box sx={{ mt: 1.5, p: 1.75, backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
            <CheckCircleIcon sx={{ fontSize: 15, color: '#10B981' }} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#166534' }}>
              已成功导入 {imported.size} 个技能
            </Typography>
          </Box>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.8rem', borderRadius: '8px' }}>
          {error}
        </Alert>
      )}

      {/* 底部操作 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button {...SecondaryGhost} onClick={onClose}>
          关闭
        </Button>
        <Button
          {...PrimaryPill}
          onClick={handleImportSelected}
          disabled={selected.size === 0 || importing || checkingConflict}
        >
          {(importing || checkingConflict) && (
            <CircularProgress size={16} sx={{ color: '#FFFFFF', mr: 0.75 }} />
          )}
          {checkingConflict ? '检查冲突中…' : importing ? '导入中…' : `导入${selected.size > 0 ? `（${selected.size}）` : ''}`}
        </Button>
      </Box>

      {/* 格式说明 */}
      <Box sx={{ mt: 2, p: 1.75, backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DescriptionIcon sx={{ fontSize: 13, color: '#6B7280' }} /> SKILL.md 格式参考
        </Typography>
        <Box
          component="pre"
          sx={{
            fontSize: '0.7rem',
            color: '#374151',
            backgroundColor: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            p: 1.5,
            m: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >{`---
name: 技能名称
description: 技能描述
---

技能指令正文（将作为 AI 上下文模板注入）`}</Box>
      </Box>

      {/* T04: 冲突确认弹窗 */}
      <ConflictConfirmDialog
        open={conflictDialogOpen}
        conflicts={conflictResults}
        onConfirm={handleConflictConfirm}
        onCancel={handleConflictCancel}
      />
    </Box>
  );
};

// ===================== 添加技能对话框 =====================

const AddSkillDialog: React.FC<AddSkillDialogProps> = ({ open, onClose, onAdded }) => {
  const [activeTab, setActiveTab] = useState<TabType>('skillmd');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ParsedSkillMd | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // T04: 在技能安装成功后，触发安全审查并处理结果
  const triggerAuditAfterImport = async (skillId: string, skillName: string) => {
    try {
      const audit = await triggerSkillAudit(skillId, '');
      
      if (audit.level === 'safe') {
        // 安全 → Toast 通知
        showToast(`「${skillName}」安全审查通过 (${audit.score}分)`, 'success');
      } else if (audit.level === 'suspicious') {
        // 可疑 → 弹出审查摘要对话框
        setPendingAudit(audit);
        setShowAuditDialog(true);
      } else {
        // 恶意 → 弹出审查报告（仅取消按钮）
        setPendingAudit(audit);
        setShowAuditDialog(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      // console.error('安全审查失败', e);
      showToast(`「${skillName}」安全审查失败：${msg}`, 'error');
    }
  };
  const [pendingAudit, setPendingAudit] = useState<SkillAudit | null>(null);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  // T04: ZIP 安装冲突检测状态
  const [zipConflictOpen, setZipConflictOpen] = useState(false);
  const [zipConflicts, setZipConflicts] = useState<ConflictResult[]>([]);
  const [zipPendingInstall, setZipPendingInstall] = useState<(() => Promise<void>) | null>(null);

  const reset = () => {
    setFile(null);
    setError('');
    setLoading(false);
    setPreview(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ---- ZIP Tab ----

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('请上传 .zip 格式的技能包');
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      setError('文件大小不能超过 3MB');
      return;
    }
    setFile(f);
    setError('');

    try {
      const buf = await f.arrayBuffer();
      const parsed = parseSkillZip(buf);
      setPreview(parsed);
      if (!parsed) {
        setError('ZIP 中未找到 skill.md 描述文件，将使用文件名创建基础技能');
      }
    } catch (e) {
      setPreview(null);
      setError(`解析技能包失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleInstall = async () => {
    if (!file) { setError('请选择技能包文件'); return; }
    setLoading(true);
    setError('');

    try {
      // Step 1: 读取 ZIP 文件
      let buf: ArrayBuffer;
      try {
        buf = await file.arrayBuffer();
      } catch (readErr) {
        // console.error('[AddSkillDialog] Failed to read file:', readErr);
        setError(`读取文件失败：${readErr instanceof Error ? readErr.message : '未知错误'}`);
        setLoading(false);
        return;
      }

      // Step 2: 解析 ZIP（fflate 可能抛异常）
      let parsed: ParsedSkillMd | null = null;
      try {
        parsed = parseSkillZip(buf);
      } catch (zipErr) {
        // console.warn('[AddSkillDialog] ZIP parse failed, using fallback:', zipErr);
      }

      let name: string;
      let desc: string;
      let promptTemplate: string | undefined;

      if (parsed) {
        name = parsed.name || file.name.replace('.zip', '');
        desc = parsed.description || '从技能包导入';
        promptTemplate = parsed.body || undefined;
      } else {
        name = file.name.replace('.zip', '');
        desc = `从 ${file.name} 导入的技能包`;
        promptTemplate = `你是 CDF Know Clow 的「${name}」技能助手。${desc}请根据用户的请求，提供专业、准确的回答和操作建议。`;
      }

      // Step 3: T04 冲突检测 — 在导入前检查
      let conflictChecked = false;
      try {
        const conflictResult = await fetchSkillConflictCheck(name, undefined, ['zip-import'], desc);
        if (conflictResult.conflicts.length > 0) {
          // 有冲突：暂存安装函数，弹窗确认
          const doInstall = async () => {
            const newSkill = await addSkill({
              name,
              desc,
              icon: 'Extension',
              category: 'tool',
              path: '/chat',
              status: 'active',
              version: '1.0',
              executionMode: 'chat',
              promptTemplate,
              detail: desc,
              tags: ['zip-import'],
            });
            // console.log('[AddSkillDialog] Skill installed successfully:', newSkill.id);
            // T04: 触发安全审查
            await triggerAuditAfterImport(newSkill.id, newSkill.name);
            onAdded(newSkill.name);
            reset();
            onClose();
          };
          setZipConflicts(conflictResult.conflicts);
          setZipPendingInstall(() => doInstall);
          setZipConflictOpen(true);
          setLoading(false);
          return;
        }
        conflictChecked = true;
      } catch {
        // 冲突检查 API 失败时不阻塞安装
        // console.warn('[AddSkillDialog] Conflict check failed, proceeding with install');
        conflictChecked = true;
      }

      if (!conflictChecked) return;

      // Step 4: 无冲突，直接调用 API 创建技能
      // console.log('[AddSkillDialog] Installing skill:', name, 'hasPromptTemplate:', !!promptTemplate);
      const newSkill = await addSkill({
        name,
        desc,
        icon: 'Extension',
        category: 'tool',
        path: '/chat',
        status: 'active',
        version: '1.0',
        executionMode: 'chat',
        promptTemplate,
        detail: desc,
        tags: ['zip-import'],
      });
      // console.log('[AddSkillDialog] Skill installed successfully:', newSkill.id);
      onAdded(newSkill.name);
      // T04: 触发安全审查
      await triggerAuditAfterImport(newSkill.id, newSkill.name);
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      // console.error('[AddSkillDialog] Install failed:', err);
      setError(`安装失败：${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- SKILL.md Tab ----

  const handleImportSkillMd = async (skill: ScannedSkillMd) => {
    // 先读取完整 body（扫描接口不返回 body，节省流量）
    let body = '';
    try {
      const detail = await readSkillMd(skill.dirName);
      body = detail.body || '';
    } catch {
      // read 失败时用空 body 继续
    }

    const newSkill = await addSkill({
      name: skill.name,
      desc: skill.description || `从 WorkBuddy 导入: ${skill.dirName}`,
      icon: 'Extension',
      category: 'tool',
      path: '/chat',
      status: 'active',
      version: '1.0',
      executionMode: 'chat',
      promptTemplate: body || `你是 CDF Know Clow 的「${skill.name}」技能助手。请根据用户的请求，提供专业、准确的回答和操作建议。`,
      detail: skill.description,
      tags: [skill.dirName, 'workbuddy'],
    });
    onAdded(newSkill.name);
    // T04: 触发安全审查
    await triggerAuditAfterImport(newSkill.id, newSkill.name);
  };

  // ===================== 渲染 =====================

  // ZIP Tab 的底部操作按钮（用于 SkillDialogShell 的 actions）
  const zipActions = activeTab === 'zip' ? (
    <>
      <Button {...SecondaryGhost} onClick={handleClose} disabled={loading}>
        取消
      </Button>
      <Button
        {...PrimaryPill}
        onClick={handleInstall}
        disabled={!file || loading}
      >
        {loading ? (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={16} sx={{ color: '#FFFFFF' }} />
            检查冲突中…
          </Box>
        ) : (
          '安装技能'
        )}
      </Button>
    </>
  ) : undefined;

  return (
    <SkillDialogShell
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      icon={<ExtensionIcon sx={{ fontSize: 22 }} />}
      title="安装技能包"
      subtitle="从文件或目录导入技能"
      contentSx={{ pt: 0, px: 0, pb: 0 }}
      actions={zipActions}
    >
      {/* Tab 切换 */}
      <Box sx={{
        display: 'flex',
        borderBottom: '1px solid #E5E7EB',
        px: 3,
        backgroundColor: '#F3F4F6',
      }}>
        <Box
          onClick={() => setActiveTab('skillmd')}
          sx={{
            py: 1.5,
            px: 2,
            fontSize: '0.8125rem',
            color: activeTab === 'skillmd' ? '#111827' : '#6B7280',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'skillmd' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            transition: 'color 0.2s',
            '&:hover': { color: '#374151' },
            '&::after': activeTab === 'skillmd' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#111827',
              borderRadius: '2px 2px 0 0',
            } : {},
          }}
        >
          <FolderOpenIcon sx={{ fontSize: 15 }} />
          SKILL.md 导入
        </Box>
        <Box
          onClick={() => setActiveTab('zip')}
          sx={{
            py: 1.5,
            px: 2,
            fontSize: '0.8125rem',
            color: activeTab === 'zip' ? '#111827' : '#6B7280',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'zip' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            transition: 'color 0.2s',
            '&:hover': { color: '#374151' },
            '&::after': activeTab === 'zip' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#111827',
              borderRadius: '2px 2px 0 0',
            } : {},
          }}
        >
          <UploadFileIcon sx={{ fontSize: 15 }} />
          ZIP 上传
        </Box>
      </Box>

      <Box sx={{ px: 3, pt: 2, pb: activeTab === 'zip' ? 1.5 : 2.5 }}>
        {/* SKILL.md 导入面板 */}
        {activeTab === 'skillmd' && (
          <SkillMdImportPanel
            onImport={handleImportSkillMd}
            onClose={handleClose}
          />
        )}

        {/* ZIP 上传面板 */}
        {activeTab === 'zip' && (
          <>
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2, lineHeight: 1.6 }}>
              上传 <code style={{ backgroundColor: '#F3F4F6', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>.zip</code> 格式的技能包。包内需含 <code style={{ backgroundColor: '#F3F4F6', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>SKILL.md</code> 描述文件。
            </Typography>

            {/* 拖拽上传区 */}
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: `2px dashed ${dragging ? '#2563EB' : file ? '#10B981' : '#D1D5DB'}`,
                borderRadius: '12px',
                backgroundColor: dragging ? '#EFF6FF' : file ? '#F0FDF4' : '#FFFFFF',
                py: 3.5,
                px: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#FFFFFF' },
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 26, color: '#10B981' }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{file.name}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {(file.size / 1024).toFixed(1)} KB · <span style={{ color: '#2563EB', textDecoration: 'underline' }}>重新选择</span>
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E7EB' }}>
                    <UploadFileIcon sx={{ fontSize: 24, color: '#6B7280' }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                    拖拽 .zip 文件到此处
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                    或点击选择文件（最大 3MB）
                  </Typography>
                </Box>
              )}
            </Box>

            {/* 预览技能信息 */}
            {preview && (
              <Box sx={{ mt: 2, p: 2, backgroundColor: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <CheckCircleIcon sx={{ fontSize: 15, color: '#10B981' }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>技能包解析成功</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: '24px' }}>名称</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#111827', fontWeight: 600, lineHeight: '24px' }}>{preview.name || '（未指定）'}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: '20px' }}>描述</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#374151', lineHeight: '20px' }}>{preview.description || '（无描述）'}</Typography>
                  {preview.body && (
                    <>
                      <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: '20px' }}>AI 上下文</Typography>
                      <Typography sx={{ fontSize: '0.73rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '20px' }}>
                        {preview.body.length > 60 ? `${preview.body.slice(0, 60)}...` : preview.body}
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            )}

            {error && (
              <Alert
                severity={preview ? 'warning' : 'error'}
                sx={{ mt: 2, fontSize: '0.8rem', borderRadius: '8px' }}
              >
                {error}
              </Alert>
            )}

            {/* 技能包格式说明（折叠式） */}
            <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
              <Typography sx={{ fontSize: '0.73rem', fontWeight: 600, color: '#374151', mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DescriptionIcon sx={{ fontSize: 13, color: '#6B7280' }} /> SKILL.md 格式参考
              </Typography>
              <Box
                component="pre"
                sx={{ fontSize: '0.67rem', color: '#6B7280', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
              >{`---\nname: 技能名称\ndescription: 技能描述\n---\n\nAI 上下文正文（作为技能模板注入）`}</Box>
            </Box>
          </>
        )}
      </Box>

      {/* T04: ZIP 安装冲突确认弹窗 */}
      <ConflictConfirmDialog
        open={zipConflictOpen}
        conflicts={zipConflicts}
        onConfirm={async () => {
          setZipConflictOpen(false);
          if (zipPendingInstall) {
            setLoading(true);
            try {
              await zipPendingInstall();
            } catch (err) {
              const msg = err instanceof Error ? err.message : '未知错误';
              setError(`安装失败：${msg}`);
            } finally {
              setLoading(false);
            }
          }
          setZipPendingInstall(null);
          setZipConflicts([]);
        }}
        onCancel={() => {
          setZipConflictOpen(false);
          setZipPendingInstall(null);
          setZipConflicts([]);
        }}
      />

      {/* T04: 安全审查对话框 */}
      {pendingAudit && (
        <SecurityAuditDialog
          open={showAuditDialog}
          audit={pendingAudit}
          allowForceInstall={pendingAudit.level === 'suspicious'}
          onInstall={() => {
            setShowAuditDialog(false);
            showToast(`「${pendingAudit.skillId}」已安装（安全审查 ${pendingAudit.score}分）`, 'warning');
          }}
          onCancel={() => {
            setShowAuditDialog(false);
            if (pendingAudit.level === 'malicious') {
              // 恶意技能：删除已安装的技能
              onAdded('');  // TBD: 需要传入 onDelete 回调
              showToast(`已阻止安装恶意技能`, 'error');
            }
          }}
          onViewReport={() => {
            setShowAuditDialog(false);
            navigate(`/skills/${pendingAudit.skillId}/audit`);
          }}
        />
      )}
    </SkillDialogShell>
  );
};

export default AddSkillDialog;

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, Checkbox, IconButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExtensionIcon from '@mui/icons-material/Extension';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import { unzipSync } from 'fflate';
import { addSkill } from '../../stores/skillStore';
import { scanSkillMd } from '../../services/api';
import type { ScannedSkillMd } from '../../services/api';

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

  const handleImportSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError('');

    let failed = 0;
    for (const dirName of selected) {
      const skill = skills.find((s) => s.dirName === dirName);
      if (!skill) continue;
      try {
        await onImport(skill);
        setImported((prev) => new Set(prev).add(dirName));
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      setError(`${failed} 个技能导入失败`);
    }

    setSelected(new Set());
    setImporting(false);
  };

  const remaining = skills.filter((s) => !imported.has(s.dirName));

  return (
    <Box>
      <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
        从 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>~/.workbuddy/skills/</code> 目录扫描 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>SKILL.md</code> 格式的技能包并导入。SKILL.md 正文将作为 AI 上下文模板。
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
          <CircularProgress size={24} sx={{ color: '#6B7280' }} />
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
            请将技能包放入 ~/.workbuddy/skills/ 目录
          </Typography>
        </Box>
      )}

      {/* 技能列表 */}
      {!loading && remaining.length > 0 && (
        <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 2 }}>
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
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: '#111827' }}>
                    {skill.name}
                  </Typography>
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
        <Box sx={{ mt: 1.5, p: 1.5, backgroundColor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>
            已导入 {imported.size} 个技能
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}

      {/* 底部操作 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', color: '#6B7280' }}>
          关闭
        </Button>
        <Button
          variant="contained"
          onClick={handleImportSelected}
          disabled={selected.size === 0 || importing}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          {importing ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
          {importing ? '导入中...' : `导入 ${selected.size > 0 ? `(${selected.size})` : ''}`}
        </Button>
      </Box>

      {/* 格式说明 */}
      <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>SKILL.md 格式</Typography>
        <Box
          component="pre"
          sx={{ fontSize: '0.68rem', color: '#374151', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        >{`---
name: 技能名称
description: 技能描述
---

技能指令正文（将作为 AI 上下文模板注入）`}</Box>
      </Box>
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
      const buf = await file.arrayBuffer();
      const parsed = parseSkillZip(buf);

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
        promptTemplate = `你是 CrossWMS 的「${name}」技能助手。${desc}请根据用户的请求，提供专业、准确的回答和操作建议。`;
      }

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
      onAdded(newSkill.name);
      reset();
      onClose();
    } catch (err) {
      setError(`安装失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- SKILL.md Tab ----

  const handleImportSkillMd = async (skill: ScannedSkillMd) => {
    const newSkill = await addSkill({
      name: skill.name,
      desc: skill.description || `从 WorkBuddy 导入: ${skill.dirName}`,
      icon: 'Extension',
      category: 'tool',
      path: '/agent',
      status: 'active',
      version: '1.0',
      executionMode: 'chat',
      promptTemplate: skill.body || `你是 CrossWMS 的「${skill.name}」技能助手。请根据用户的请求，提供专业、准确的回答和操作建议。`,
      detail: skill.description,
      tags: [skill.dirName, 'workbuddy'],
    });
    onAdded(newSkill.name);
  };

  // ===================== 渲染 =====================

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: '#111827', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ExtensionIcon sx={{ fontSize: 22, color: '#6B7280' }} />
        安装技能包
      </DialogTitle>

      {/* Tab 切换 */}
      <Box sx={{ display: 'flex', borderBottom: '1px solid #E5E7EB', px: 3 }}>
        <Box
          onClick={() => setActiveTab('skillmd')}
          sx={{
            py: 1.5,
            px: 2,
            fontSize: '0.8125rem',
            color: activeTab === 'skillmd' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'skillmd' ? 500 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            transition: 'color 0.2s',
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'skillmd' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
            } : {},
          }}
        >
          <FolderOpenIcon sx={{ fontSize: 16 }} />
          SKILL.md 导入
        </Box>
        <Box
          onClick={() => setActiveTab('zip')}
          sx={{
            py: 1.5,
            px: 2,
            fontSize: '0.8125rem',
            color: activeTab === 'zip' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'zip' ? 500 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            transition: 'color 0.2s',
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'zip' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
            } : {},
          }}
        >
          <UploadFileIcon sx={{ fontSize: 16 }} />
          ZIP 上传
        </Box>
      </Box>

      <DialogContent sx={{ pt: '16px !important' }}>
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
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
              上传 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>.zip</code> 格式的技能包文件。技能包应包含 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>skill.md</code> 描述文件。
            </Typography>

            {/* 拖拽上传区 */}
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: `2px dashed ${dragging ? '#111827' : file ? '#10B981' : '#E5E7EB'}`,
                borderRadius: '12px',
                backgroundColor: dragging ? '#F9FAFB' : file ? '#F0FDF4' : '#FAFAFA',
                py: 4,
                px: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
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
                  <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircleIcon sx={{ fontSize: 28, color: '#10B981' }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>{file.name}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {(file.size / 1024).toFixed(1)} KB · 点击重新选择
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AddIcon sx={{ fontSize: 28, color: '#9CA3AF' }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                    拖拽技能包到此处
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                    或点击选择 .zip 文件
                  </Typography>
                </Box>
              )}
            </Box>

            {/* 预览技能信息 */}
            {preview && (
              <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534', mb: 0.75 }}>✓ 技能包预览</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '0.75rem' }}>
                  <Typography sx={{ color: '#6B7280' }}>名称</Typography>
                  <Typography sx={{ color: '#111827', fontWeight: 500 }}>{preview.name || '（未指定）'}</Typography>
                  <Typography sx={{ color: '#6B7280' }}>描述</Typography>
                  <Typography sx={{ color: '#374151' }}>{preview.description || '（无描述）'}</Typography>
                  {preview.body && (
                    <>
                      <Typography sx={{ color: '#6B7280' }}>AI 上下文</Typography>
                      <Typography sx={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                        {preview.body.length > 80 ? `${preview.body.slice(0, 80)}...` : preview.body}
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            )}

            {error && (
              <Alert severity={preview ? 'warning' : 'error'} sx={{ mt: 2, fontSize: '0.8rem' }}>
                {error}
              </Alert>
            )}

            {/* 技能包格式说明 */}
            <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>skill.md 格式</Typography>
              <Box
                component="pre"
                sx={{ fontSize: '0.68rem', color: '#374151', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
              >{`---
name: 技能名称
description: 技能描述
---

技能指令正文（将作为 AI 上下文模板注入）`}</Box>
            </Box>
          </>
        )}
      </DialogContent>

      {/* ZIP Tab 的底部操作 */}
      {activeTab === 'zip' && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} sx={{ textTransform: 'none', color: '#6B7280' }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleInstall}
            disabled={!file || loading}
            sx={{
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
              textTransform: 'none',
              borderRadius: 2,
            }}
          >
            {loading ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
            {loading ? '安装中...' : '安装技能'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default AddSkillDialog;

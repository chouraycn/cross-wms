import React, { useState } from 'react';
import {
  Box, Typography, Button, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExtensionIcon from '@mui/icons-material/Extension';
import { unzipSync } from 'fflate';
import { addSkill } from '../../stores/skillStore';
import type { SkillExecutionMode } from '../../types/skill';

// ===================== 类型 =====================

export interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}

/** skill.json 的完整结构 */
interface SkillManifest {
  name: string;
  desc: string;
  icon?: string;
  category?: 'core' | 'data' | 'auto' | 'tool';
  path?: string;
  trigger?: string;
  tags?: string[];
  version?: string;
  /** 技能执行模式 */
  executionMode?: SkillExecutionMode;
  /** AI 上下文模板：选择此技能后注入到 AI prompt */
  promptTemplate?: string;
  /** 详细描述 */
  detail?: string;
  /** 关联的自动化任务类型 */
  automationTaskType?: string;
  /** 快捷方式说明 */
  shortcut?: string;
  /** 是否推荐 */
  featured?: boolean;
}

// ===================== ZIP 解析 =====================

/** 从 ZIP 文件中解析 skill.json */
function parseSkillZip(arrayBuffer: ArrayBuffer): SkillManifest | null {
  const uint8 = new Uint8Array(arrayBuffer);
  const entries = unzipSync(uint8);

  // 查找 skill.json（支持根目录和子目录）
  let skillJsonKey: string | null = null;
  for (const key of Object.keys(entries)) {
    const basename = key.split('/').pop() || '';
    if (basename === 'skill.json' && !key.startsWith('__MACOSX')) {
      skillJsonKey = key;
      break;
    }
  }

  if (!skillJsonKey) return null;

  try {
    const jsonBytes = entries[skillJsonKey];
    const jsonText = new TextDecoder('utf-8').decode(jsonBytes);
    return JSON.parse(jsonText) as SkillManifest;
  } catch {
    return null;
  }
}

/** 自动生成 promptTemplate（当 skill.json 未提供时） */
function buildAutoPrompt(manifest: SkillManifest): string {
  const parts: string[] = [`你是 CrossWMS 的「${manifest.name}」技能助手。`];
  if (manifest.desc) parts.push(manifest.desc);
  if (manifest.trigger) parts.push(`触发方式：${manifest.trigger}`);
  parts.push('请根据用户的请求，提供专业、准确的回答和操作建议。');
  return parts.join(' ');
}

// ===================== 添加技能对话框 =====================

const AddSkillDialog: React.FC<AddSkillDialogProps> = ({ open, onClose, onAdded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SkillManifest | null>(null);
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

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('请上传 .zip 格式的技能包');
      return;
    }
    setFile(f);
    setError('');

    // 预览 skill.json 内容
    try {
      const buf = await f.arrayBuffer();
      const manifest = parseSkillZip(buf);
      setPreview(manifest);
      if (!manifest) {
        setError('ZIP 中未找到 skill.json 文件，将使用文件名创建基础技能');
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
      const manifest = parseSkillZip(buf);

      let name: string;
      let desc: string;
      let icon: string;
      let category: 'core' | 'data' | 'auto' | 'tool';
      let path: string;
      let trigger: string | undefined;
      let tags: string[] | undefined;
      let version: string;
      let executionMode: SkillExecutionMode | undefined;
      let promptTemplate: string | undefined;
      let detail: string | undefined;
      let automationTaskType: string | undefined;
      let shortcut: string | undefined;
      let featured: boolean | undefined;

      if (manifest) {
        name = manifest.name || file.name.replace('.zip', '');
        desc = manifest.desc || '从技能包导入';
        icon = manifest.icon || 'Extension';
        category = manifest.category || 'tool';
        path = manifest.path || '/chat';
        trigger = manifest.trigger;
        tags = manifest.tags;
        version = manifest.version || '1.0';
        executionMode = manifest.executionMode;
        promptTemplate = manifest.promptTemplate;
        detail = manifest.detail;
        automationTaskType = manifest.automationTaskType;
        shortcut = manifest.shortcut;
        featured = manifest.featured;

        // 如果没有 promptTemplate 也没有 navigation path，自动生成一个基础 prompt
        if (!promptTemplate && (!executionMode || executionMode === 'chat' || executionMode === 'hybrid')) {
          promptTemplate = buildAutoPrompt(manifest);
        }

        // 推断 executionMode
        if (!executionMode) {
          if (promptTemplate && path && path !== '/' && path !== '/chat') {
            executionMode = 'hybrid';
          } else if (promptTemplate) {
            executionMode = 'chat';
          } else if (automationTaskType) {
            executionMode = 'automation';
          } else if (path && path !== '/') {
            executionMode = 'navigate';
          } else {
            executionMode = 'chat';
          }
        }
      } else {
        // 无 skill.json — 使用文件名创建基础技能
        name = file.name.replace('.zip', '');
        desc = `从 ${file.name} 导入的技能包`;
        icon = 'Extension';
        category = 'tool';
        path = '/chat';
        version = '1.0';
        executionMode = 'chat';
        promptTemplate = `你是 CrossWMS 的「${name}」技能助手。${desc}请根据用户的请求，提供专业、准确的回答和操作建议。`;
      }

      const newSkill = await addSkill({
        name, desc, icon, category, path, trigger, tags, status: 'active', version,
        executionMode, promptTemplate, detail, automationTaskType, shortcut, featured,
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
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
          上传 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>.zip</code> 格式的技能包文件。技能包应包含 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>skill.json</code> 描述文件。
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
              <Typography sx={{ color: '#111827', fontWeight: 500 }}>{preview.name}</Typography>
              <Typography sx={{ color: '#6B7280' }}>描述</Typography>
              <Typography sx={{ color: '#374151' }}>{preview.desc}</Typography>
              <Typography sx={{ color: '#6B7280' }}>分类</Typography>
              <Typography sx={{ color: '#374151' }}>{preview.category || 'tool'}</Typography>
              {preview.executionMode && (
                <>
                  <Typography sx={{ color: '#6B7280' }}>执行模式</Typography>
                  <Typography sx={{ color: '#374151' }}>{preview.executionMode}</Typography>
                </>
              )}
              {preview.trigger && (
                <>
                  <Typography sx={{ color: '#6B7280' }}>触发词</Typography>
                  <Typography sx={{ color: '#374151' }}>{preview.trigger}</Typography>
                </>
              )}
              {preview.promptTemplate && (
                <>
                  <Typography sx={{ color: '#6B7280' }}>AI 上下文</Typography>
                  <Typography sx={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{preview.promptTemplate.slice(0, 60)}...</Typography>
                </>
              )}
              {preview.tags && preview.tags.length > 0 && (
                <>
                  <Typography sx={{ color: '#6B7280' }}>标签</Typography>
                  <Typography sx={{ color: '#374151' }}>{preview.tags.join(', ')}</Typography>
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
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>技能包格式（skill.json）</Typography>
          <Box
            component="pre"
            sx={{ fontSize: '0.68rem', color: '#374151', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
          >{`{
  "name": "技能名称",
  "desc": "技能描述",
  "icon": "Extension",
  "category": "tool",
  "trigger": "触发词（可选）",
  "executionMode": "chat",
  "promptTemplate": "AI上下文模板（可选）",
  "path": "/chat",
  "detail": "详细说明（可选）",
  "tags": ["标签1", "标签2"]
}`}</Box>
        </Box>
      </DialogContent>
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
    </Dialog>
  );
};

export default AddSkillDialog;

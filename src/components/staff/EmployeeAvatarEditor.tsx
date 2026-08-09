import { CheckOutlined, UploadOutlined } from './icons.js';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  notify,
} from './ui/index.js';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { api, TENANT_ID } from './api/client.js';
import {
  EMPLOYEE_AVATAR_PRESETS,
  employeeDisplayName,
  employeeProfile,
  type EmployeeProfile,
} from './employee.js';
import type { AgentProfileRead } from './types/index.js';
import EmployeeAvatar from './EmployeeAvatar.js';
import { staffTokens } from './lib/staffTokens.js';

const MAX_INPUT_IMAGE_BYTES = 5 * 1024 * 1024;
const AVATAR_CANVAS_SIZE = 360;

type AvatarDraft = Pick<EmployeeProfile, 'avatarKind' | 'avatarImage' | 'avatarPreset' | 'avatarText' | 'avatarTone'>;

export type EmployeeAvatarEditorProps = {
  agent?: AgentProfileRead | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (agent: AgentProfileRead) => void;
};

export default function EmployeeAvatarEditor({
  agent,
  open,
  onClose,
  onSaved,
}: EmployeeAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'preset' | 'upload'>('preset');
  const [selectedPreset, setSelectedPreset] = useState(EMPLOYEE_AVATAR_PRESETS[0].key);
  const [uploadedImage, setUploadedImage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !agent) return;
    const profile = employeeProfile(agent);
    setMode(profile.avatarKind);
    setSelectedPreset(profile.avatarPreset || EMPLOYEE_AVATAR_PRESETS[0].key);
    setUploadedImage(profile.avatarImage || '');
  }, [agent, open]);

  const selected = EMPLOYEE_AVATAR_PRESETS.find((item) => item.key === selectedPreset) || EMPLOYEE_AVATAR_PRESETS[0];
  const profile: AvatarDraft = mode === 'upload' && uploadedImage
    ? {
      avatarKind: 'upload',
      avatarImage: uploadedImage,
      avatarPreset: selected.key,
      avatarText: selected.text,
      avatarTone: selected.tone,
    }
    : {
      avatarKind: 'preset',
      avatarImage: '',
      avatarPreset: selected.key,
      avatarText: selected.text,
      avatarTone: selected.tone,
    };

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setUploadedImage(dataUrl);
      setMode('upload');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '头像读取失败');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function save() {
    if (!agent) return;
    setSaving(true);
    try {
      const metadata = { ...(agent.metadata || {}) };
      metadata.avatar_kind = profile.avatarKind;
      metadata.avatar_preset = profile.avatarPreset;
      metadata.avatar_text = profile.avatarText;
      metadata.avatar_tone = profile.avatarTone;
      if (profile.avatarKind === 'upload' && profile.avatarImage) {
        metadata.avatar_image = profile.avatarImage;
      } else {
        delete metadata.avatar_image;
      }

      // 调用 api.put 更新员工头像（api 已带 /api/staffdeck 前缀，路径用 /agents/:id）
      const saved = await api.put<AgentProfileRead>(`/agents/${agent.id}`, {
        tenant_id: TENANT_ID,
        metadata,
      });
      notify.success('员工头像已更新');
      onSaved?.(saved);
      onClose();
      window.dispatchEvent(new Event('ultrarag-enterprise-agent-scope-refresh'));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存头像失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        sx={
          {
            position: 'relative',
            display: 'flex',
            maxHeight: 'calc(100dvh - 4rem)',
            width: 'calc(100% - 2rem)',
            flexDirection: 'column',
            gap: '16px',
            overflow: 'hidden',
            borderRadius: '14px',
            px: '20px',
            py: '16px',
            '@media (min-width: 640px)': { maxWidth: '680px' },
          } as SxProps<Theme>
        }
      >
        <DialogHeader sx={{ px: '12px' } as SxProps<Theme>}>
          <DialogTitle sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1, color: 'var(--muted-foreground)' } as SxProps<Theme>}>
            {agent ? `设置头像：${employeeDisplayName(agent)}` : '设置头像'}
          </DialogTitle>
        </DialogHeader>

        <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '12px', '& > * + *': { marginTop: '18px' } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0,1fr)',
              alignItems: 'center',
              gap: '18px',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: 'var(--border)',
              bgcolor: '#fafbfc',
              p: '18px',
            }}
          >
            <EmployeeAvatar profile={profile} width={104} height={122} />
            <Box>
              <Box component="strong" sx={{ display: 'block', fontSize: '14px', color: 'var(--foreground)' }}>
                {mode === 'upload' ? '自定义头像' : selected.label}
              </Box>
              <Box component="p" sx={{ mt: '4px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                头像会显示在我的数字员工、数字员工档案页和对话端的员工选择中。
              </Box>
            </Box>
          </Box>

          <Box component="section" sx={{ '& > * + *': { marginTop: '12px' } }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
              <Box component="strong" sx={{ fontSize: '13px', color: 'var(--foreground)' }}>默认头像</Box>
              <Box component="span" sx={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>选择一个适合岗位的默认头像。</Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '10px' }}>
              {EMPLOYEE_AVATAR_PRESETS.map((preset) => {
                const active = mode === 'preset' && selectedPreset === preset.key;
                return (
                  <Box
                    component="button"
                    key={preset.key}
                    type="button"
                    data-active={active}
                    onClick={() => {
                      setSelectedPreset(preset.key);
                      setMode('preset');
                    }}
                    sx={[
                      {
                        display: 'grid',
                        minHeight: '88px',
                        minWidth: 0,
                        gridTemplateColumns: 'auto minmax(0,1fr) auto',
                        alignItems: 'center',
                        gap: '10px',
                        borderRadius: '14px',
                        border: '1px solid',
                        borderColor: 'var(--border)',
                        bgcolor: '#fff',
                        p: '12px',
                        textAlign: 'left',
                        color: 'var(--foreground)',
                        transition: 'all 0.2s',
                      },
                      {
                        '&:hover': { transform: 'translateY(-1px)', borderColor: '#cbd3e6' },
                        '&[data-active="true"]': { transform: 'translateY(-1px)', borderColor: 'var(--foreground)' },
                      },
                    ] as SxProps<Theme>}
                  >
                    <EmployeeAvatar
                      profile={{
                        avatarKind: 'preset',
                        avatarImage: '',
                        avatarPreset: preset.key,
                        avatarText: preset.text,
                        avatarTone: preset.tone,
                      }}
                      size={52}
                    />
                    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontWeight: 600 }}>
                      {preset.label}
                    </Box>
                    {active && <CheckOutlined size={16} style={{ color: 'var(--foreground)' }} />}
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box
            component="button"
            type="button"
            onClick={() => inputRef.current?.click()}
            sx={[
              {
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: '14px',
                borderRadius: '16px',
                border: '1px dashed',
                borderColor: '#cbd3e6',
                bgcolor: '#fafbfc',
                px: '16px',
                py: '14px',
                textAlign: 'left',
                transition: 'all 0.2s',
              },
              {
                '&:hover': { borderColor: 'var(--foreground)', boxShadow: '0 12px 28px rgba(30,24,16,0.07)' },
                '&:focus-visible': { boxShadow: '0 0 0 3px rgba(24,24,26,0.12)', outline: 'none' },
              },
            ] as SxProps<Theme>}
          >
            <Box
              component="input"
              ref={inputRef}
              type="file"
              accept="image/*"
              sx={{ display: 'none' }}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => void handleUpload(event.target.files?.[0])}
            />
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                width: '40px',
                height: '40px',
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                bgcolor: '#f2f4f8',
                fontSize: '18px',
                color: 'var(--foreground)',
              }}
            >
              <UploadOutlined size={20} />
            </Box>
            <Box component="span" sx={{ display: 'grid', minWidth: 0, gap: '2px' }}>
              <Box component="span" sx={{ fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>上传自定义头像</Box>
              <Box component="span" sx={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>支持常见图片格式，会自动裁剪为方形头像。</Box>
            </Box>
          </Box>
        </Box>

        <DialogFooter sx={{ gap: '8px', px: '12px', py: 0, '@media (min-width: 640px)': { justifyContent: 'flex-end' } } as SxProps<Theme>}>
          <Button
            variant="outline"
            disabled={saving}
            onClick={onClose}
            sx={[
              staffTokens.dialogCancelButton,
              {
                width: '92px',
                height: '32px',
                px: '12px',
                fontSize: '14px',
                fontWeight: 400,
                color: 'var(--ink-soft)',
                '&:hover': { borderColor: 'var(--border)', bgcolor: 'var(--surface-muted)', color: 'var(--foreground)' },
              },
            ] as SxProps<Theme>}
          >
            取消
          </Button>
          <Button
            disabled={saving}
            onClick={() => void save()}
            sx={[
              staffTokens.primaryButton,
              { width: '92px', height: '32px', px: '12px', fontSize: '14px', fontWeight: 400 },
            ] as SxProps<Theme>}
          >
            保存头像
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('无法解析头像图片'));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }
  if (file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error('头像图片不能超过 5MB');
  }

  const image = await loadImage(await readFileAsDataUrl(file));
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_CANVAS_SIZE;
  canvas.height = AVATAR_CANVAS_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像图片');

  const side = Math.min(image.width, image.height);
  const sx = Math.max(0, (image.width - side) / 2);
  const sy = Math.max(0, (image.height - side) / 2);
  context.fillStyle = '#f7f4ee';
  context.fillRect(0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE);
  context.drawImage(image, sx, sy, side, side, 0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE);

  const png = canvas.toDataURL('image/png');
  return png.length < 650_000 ? png : canvas.toDataURL('image/jpeg', 0.86);
}

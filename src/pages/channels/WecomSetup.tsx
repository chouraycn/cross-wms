import { useState } from 'react';
import { Box, Typography, TextField, Chip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

const DEFAULT_FIELDS = [
  { key: 'bot_id', label: '机器人 ID', secret: false, optional: false, placeholder: '' },
  { key: 'secret', label: '机器人 Secret', secret: true, optional: false, placeholder: '' },
  { key: 'corp_id', label: '企业 ID', secret: false, optional: false, placeholder: '' },
];

const panelSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  borderRadius: '10px',
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  p: 2,
};

const labelSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0.75,
  fontSize: 12,
  color: 'text.primary',
};

export interface WecomSetupProps {
  credentials: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export default function WecomSetup({ credentials, onChange }: WecomSetupProps) {
  const fields = DEFAULT_FIELDS;
  const configuredBotId = credentials.bot_id ?? '';
  const configuredCorpId = credentials.corp_id ?? '';
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(!configuredBotId);

  const commit = (key: string, val: string) => {
    if (val) onChange({ ...credentials, [key]: val });
    else {
      const { [key]: _omit, ...rest } = credentials;
      onChange(rest);
    }
  };

  if (configuredBotId && !editing) {
    return (
      <Box sx={panelSx}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>凭证已配置</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>bot_id：{configuredBotId}</Typography>
          {configuredCorpId && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>企业 ID：{configuredCorpId}</Typography>
          )}
          <Chip label="已连接" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
          <Box sx={{ flex: 1 }} />
          <Typography
            component="button"
            onClick={() => {
              setValues({ bot_id: configuredBotId, ...(configuredCorpId ? { corp_id: configuredCorpId } : {}) });
              setEditing(true);
            }}
            sx={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'primary.main',
              p: 0,
            }}
          >
            重新配置
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={panelSx}>
      <Typography sx={{ fontSize: 12, lineHeight: 1.6, color: 'text.secondary' }}>
        凭证获取路径：企业微信管理后台 → 智能机器人。
      </Typography>
      {fields.map((field) => (
        <Box key={field.key} sx={labelSx}>
          {field.label}
          <TextField
            type={field.secret ? 'password' : 'text'}
            size="small"
            value={values[field.key] ?? credentials[field.key] ?? ''}
            placeholder={field.placeholder}
            autoComplete="off"
            onChange={(e) => {
              setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
              commit(field.key, e.target.value);
            }}
            sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
          />
          {field.key === 'corp_id' && (
            <Typography sx={{ fontSize: 11, lineHeight: 1.5, color: 'text.disabled' }}>
              企业身份隔离的必要字段，激活后不可在原绑定上修改
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

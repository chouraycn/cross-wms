import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  Tooltip,
  IconButton,
  useTheme,
  alpha,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const REQUIRED_PERMISSIONS = [
  '读取用户发给机器人的单聊消息（im:message.p2p_msg:readonly）',
  '接收群聊中 @ 机器人消息事件（im:message.group_at_msg:readonly）',
  '以应用的身份发消息（im:message:send_as_bot）',
  '查看消息表情回复（im:message.reactions:read）',
  '发送、删除消息表情回复（im:message.reactions:write_only）',
];

const REMOVABLE_PERMISSIONS = [
  '任务-创建、更新任务或清单时可指定的人员范围',
  '邮箱-用户邮箱管理 / 邮件数据',
  '飞书人事（企业版）-员工 / 待入职人员',
  '妙记-妙记基本信息',
  '通讯录权限范围 / 获取用户 user ID / 读取群内全部消息',
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

const hintSx: SxProps<Theme> = {
  display: 'flex',
  gap: 1,
  borderRadius: '10px',
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.default',
  p: 1.5,
  fontSize: 12,
  color: 'text.secondary',
  lineHeight: 1.6,
};

const labelSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0.75,
  fontSize: 12,
  color: 'text.primary',
};

function FeishuPermissionHint() {
  const theme = useTheme();
  return (
    <Box sx={hintSx}>
      <Box sx={{ mt: '2px', color: 'text.secondary', display: 'flex' }}>
        <Tooltip
          title="这个飞书接入只需要机器人消息收发和 reaction 能力；其余权限一般可以不加，尤其是任务、邮箱、人事、妙记和通讯录相关权限。"
          slotProps={{ tooltip: { sx: { maxWidth: 340 } } }}
        >
          <IconButton size="small" aria-label="查看飞书权限说明" sx={{ p: 0.25 }}>
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
          建议仅保留最小权限集。
        </Typography>{' '}
        下面这些是首版需要的；其余大多可删。
        <Box sx={{ mt: 1, display: 'grid', gap: 1, gridTemplateColumns: { md: '1fr 1fr' } }}>
          <Box>
            <Typography sx={{ mb: 0.5, fontSize: 11, fontWeight: 500, color: 'text.secondary' }}>
              必需权限
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {REQUIRED_PERMISSIONS.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  size="small"
                  sx={{
                    fontSize: 11,
                    height: 'auto',
                    py: 0.25,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography sx={{ mb: 0.5, fontSize: 11, fontWeight: 500, color: 'text.secondary' }}>
              通常可删除
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {REMOVABLE_PERMISSIONS.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  size="small"
                  sx={{ fontSize: 11, height: 'auto', py: 0.25, bgcolor: 'action.hover', color: 'text.secondary' }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export interface FeishuSetupProps {
  credentials: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export default function FeishuSetup({ credentials, onChange }: FeishuSetupProps) {
  const [appId, setAppId] = useState(credentials.app_id ?? '');
  const [appSecret, setAppSecret] = useState(credentials.app_secret ?? '');
  const configured = Boolean(appId);

  const commit = (patch: Record<string, string>) => {
    onChange({ ...credentials, ...patch });
  };

  return (
    <Box sx={panelSx}>
      <FeishuPermissionHint />
      {configured && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          凭证已配置 · App ID：{appId}
        </Typography>
      )}
      <Box sx={labelSx}>
        App ID
        <TextField
          type="text"
          size="small"
          value={appId}
          autoComplete="off"
          disabled={configured}
          onChange={(e) => {
            setAppId(e.target.value);
            commit({ app_id: e.target.value });
          }}
          sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
        />
      </Box>
      <Box sx={labelSx}>
        App Secret
        <TextField
          type="password"
          size="small"
          value={appSecret}
          autoComplete="off"
          placeholder={configured ? '留空表示保持原值' : ''}
          onChange={(e) => {
            setAppSecret(e.target.value);
            if (e.target.value) commit({ app_secret: e.target.value });
            else {
              const { app_secret, ...rest } = credentials;
              onChange(rest);
            }
          }}
          sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
        />
      </Box>
    </Box>
  );
}

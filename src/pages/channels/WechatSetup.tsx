import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { Box, Typography, TextField, Alert, Button, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { getWechatQrcode, getWechatQrcodeStatus, confirmWechatQrcode } from '../../services/channelsApi';

// 凭证字段（可选，用于消息收发配置）；二维码扫码绑定是主接入方式。
const FIELDS = [
  { key: 'app_id', label: 'AppID', secret: false },
  { key: 'app_secret', label: 'AppSecret', secret: true },
  { key: 'token', label: '消息校验 Token', secret: false },
  { key: 'encoding_aes_key', label: '消息加解密 AES Key', secret: true },
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

type QrStatus = 'idle' | 'loading' | 'wait' | 'expired' | 'confirmed';
interface QrState {
  qrcode: string;
  content: string;
  imageUrl: string;
}

export interface WechatSetupProps {
  channelName?: string;
  credentials: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export default function WechatSetup({ channelName, credentials, onChange }: WechatSetupProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  // ----- 二维码绑定流（轮询用 setTimeout 递归，符合 WKWebView 约束，不使用 rAF） -----
  const [qr, setQr] = useState<QrState | null>(null);
  const [qrStatus, setQrStatus] = useState<QrStatus>('idle');
  const [qrError, setQrError] = useState<string | null>(null);
  const qrSessionRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用 ref 持有最新 credentials，避免异步轮询回调里写回绑定键时丢失用户正在填写的凭证字段
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetQrFlow = useCallback(() => {
    qrSessionRef.current += 1;
    clearPollTimer();
    setQr(null);
    setQrStatus('idle');
    setQrError(null);
  }, [clearPollTimer]);

  useEffect(() => {
    return () => {
      qrSessionRef.current += 1;
      clearPollTimer();
    };
  }, [clearPollTimer]);

  const isBound = credentials.wechat_bound === 'true';

  const pollQrStatus = useCallback(
    async (session: number, name: string, code: string) => {
      try {
        const result = await getWechatQrcodeStatus(name, code);
        if (session !== qrSessionRef.current) return;
        const status = String(result.status || 'wait');
        if (status === 'confirmed') {
          clearPollTimer();
          // 写回绑定信息（合并最新 credentials，避免丢失其他字段）
          onChange({
            ...credentialsRef.current,
            wechat_bound: 'true',
            wechat_bind_token: code,
            wechat_bound_at: new Date().toISOString(),
          });
          setQrStatus('confirmed');
          return;
        }
        if (status === 'expired') {
          clearPollTimer();
          setQrStatus('expired');
          return;
        }
        setQrStatus('wait');
        schedulePoll(session, name, code);
      } catch (err) {
        if (session !== qrSessionRef.current) return;
        clearPollTimer();
        setQrError(err instanceof Error ? err.message : '确认接入状态失败');
      }
    },
    [onChange, clearPollTimer],
  );

  const schedulePoll = useCallback(
    (session: number, name: string, code: string) => {
      clearPollTimer();
      pollTimerRef.current = setTimeout(() => {
        void pollQrStatus(session, name, code);
      }, 2000);
    },
    [clearPollTimer, pollQrStatus],
  );

  const startQr = useCallback(async () => {
    if (!channelName) {
      setQrError('缺少通道名称，无法生成二维码');
      return;
    }
    const session = ++qrSessionRef.current;
    clearPollTimer();
    setQrError(null);
    setQrStatus('loading');
    try {
      const result = await getWechatQrcode(channelName);
      const code = String(result.qrcode || '');
      const content = String(result.qrcode_img_content || result.qrcode_img_url || '');
      if (!code || !content) throw new Error('获取微信二维码失败');
      const imageUrl = await QRCode.toDataURL(content, { width: 220, margin: 1 });
      if (session !== qrSessionRef.current) return;
      setQr({ qrcode: code, content, imageUrl });
      setQrStatus('wait');
      schedulePoll(session, channelName, code);
    } catch (err) {
      if (session === qrSessionRef.current) {
        setQrError(err instanceof Error ? err.message : '获取微信二维码失败');
        setQrStatus('idle');
      }
    }
  }, [channelName, clearPollTimer, schedulePoll]);

  // 模拟扫码确认（本地演示 / 调试入口；真实环境由微信回调调用同一 confirm 端点）
  const handleSimulateConfirm = useCallback(async () => {
    if (!channelName || !qr) return;
    try {
      await confirmWechatQrcode(channelName, qr.qrcode);
      // 下一轮 poll 会拿到 confirmed
    } catch (err) {
      setQrError(err instanceof Error ? err.message : '确认失败');
    }
  }, [channelName, qr]);

  const commit = (key: string, val: string) => {
    if (val) onChange({ ...credentials, [key]: val });
    else {
      const { [key]: _omit, ...rest } = credentials;
      onChange(rest);
    }
  };

  const filled = FIELDS.some((f) => (values[f.key] ?? credentials[f.key] ?? '').trim());

  const qrHint =
    qrStatus === 'expired'
      ? '二维码已过期，请重新获取'
      : qrStatus === 'confirmed'
        ? '微信接入成功'
        : '请使用微信扫描二维码完成接入';

  return (
    <Box sx={panelSx}>
      {/* ===== 二维码绑定区 ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600 }}>
          扫码接入
        </Typography>
        {isBound && qrStatus !== 'confirmed' && (
          <Alert severity="success" sx={{ fontSize: 12, py: 0.5 }}>
            已绑定（token: {String(credentials.wechat_bind_token || '').slice(0, 8)}…）
          </Alert>
        )}
        {qrStatus === 'idle' && !qr && (
          <Box>
            <Button size="small" variant="contained" onClick={() => void startQr()} disabled={!channelName}>
              {isBound ? '重新扫码' : '扫码接入'}
            </Button>
          </Box>
        )}
        {qrStatus === 'loading' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
              正在获取二维码…
            </Typography>
          </Box>
        )}
        {qr && (qrStatus === 'wait' || qrStatus === 'confirmed') && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              borderRadius: '10px',
              bgcolor: '#fafbfc',
            }}
          >
            <img
              src={qr.imageUrl}
              alt="微信接入二维码"
              width={180}
              height={180}
              style={{ borderRadius: 8, border: '1px solid #eef0f4' }}
            />
            <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {qrHint}
            </Typography>
            {qrStatus === 'wait' && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={() => void handleSimulateConfirm()}>
                  模拟扫码确认（演示）
                </Button>
                <Button size="small" variant="text" onClick={resetQrFlow}>
                  取消
                </Button>
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, maxWidth: '100%' }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: 'text.disabled' }}>
                扫码失败时，可复制以下内容手动打开
              </Typography>
              <Box
                component="code"
                sx={{ fontSize: 11, lineHeight: 1.5, wordBreak: 'break-all', color: 'text.secondary', maxWidth: 380, textAlign: 'center' }}
              >
                {qr.content}
              </Box>
            </Box>
          </Box>
        )}
        {qrStatus === 'expired' && (
          <Button size="small" variant="contained" onClick={() => void startQr()}>
            刷新二维码
          </Button>
        )}
        {qrError && (
          <Alert severity="error" sx={{ fontSize: 12, py: 0.5 }}>
            {qrError}
          </Alert>
        )}
      </Box>

      <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1.5 }}>
        <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>
          凭证（可选，用于消息收发配置）
        </Typography>
      </Box>

      {FIELDS.map((field) => (
        <Box key={field.key} sx={labelSx}>
          {field.label}
          <TextField
            type={field.secret ? 'password' : 'text'}
            size="small"
            value={values[field.key] ?? credentials[field.key] ?? ''}
            autoComplete="off"
            onChange={(e) => {
              setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
              commit(field.key, e.target.value);
            }}
            sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
          />
        </Box>
      ))}
      {filled && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="small" variant="text" onClick={() => setValues({})}>
            清空已填
          </Button>
        </Box>
      )}
    </Box>
  );
}

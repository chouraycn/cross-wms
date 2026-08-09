import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  CircularProgress,
  useTheme,
} from '@mui/material';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';
import BrandLogo from '../../components/staff/BrandLogo';
import { api, TENANT_ID } from '../../components/staff/api/client';
import {
  setEnterpriseAuthSession,
  type EnterpriseAuthSession,
  type EnterpriseAuthUser,
} from '../../components/staff/auth';
import { staffdeckContent } from '../../assets/staffdeck-assets';

/**
 * LoginPage — 签出态着陆 / 登录页（复刻 StaffDeck-main LoginPage）
 *
 * 全幅 hero + StaffDeck 字标 + 产品预览占位；点击「登录」凭证表单滑入。
 * 登录动作走真实 `/api/staffdeck/auth/login`，成功后写入企业会话并进入画廊。
 * 现有桌面端默认会话（ensureDefaultSession）逻辑不变，本页作为可路由的独立登录入口。
 *
 * 路由：/staff/login
 */
export default function LoginPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  async function login() {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    setUsernameError(trimmedUsername ? '' : '请输入账号');
    setPasswordError(trimmedPassword ? '' : '请输入密码');
    if (!trimmedUsername || !trimmedPassword) return;

    setLoading(true);
    setFormError('');
    try {
      const result = await api.post<{
        access_token: string;
        token_type: string;
        user: EnterpriseAuthUser;
      }>('/auth/login', {
        tenant_id: TENANT_ID,
        username: trimmedUsername,
        password: trimmedPassword,
      });
      const payload = result;
      const session: EnterpriseAuthSession = {
        token: payload.access_token,
        user: payload.user,
      };
      setEnterpriseAuthSession(session);
      navigate('/enterprise/gallery');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  function handleUsernameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void login();
    }
  }

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#fbfaf6',
        background: 'linear-gradient(180deg, #fbfaf6 0%, #f3f0e8 100%)',
        overflow: 'hidden',
      }}
    >
      {/* 顶部字标 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pt: '28px' }}>
        <BrandLogo markSize={32} />
      </Box>

      {/* 英雄区 */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          pb: '12vh',
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: 30, md: 42 },
            fontWeight: 700,
            color: '#20201d',
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: 720,
          }}
        >
          把每一个 AI Agent 当作企业里的正式员工
        </Typography>
        <Typography
          sx={{
            mt: 2,
            fontSize: { xs: 14, md: 16 },
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            maxWidth: 560,
            lineHeight: 1.7,
          }}
        >
          为专业员工固化经验、流程与判断标准，构建可复用、可迭代、可追溯的数字员工。
        </Typography>

        <Box sx={{ mt: 5, minHeight: showForm ? 320 : 56, width: '100%', maxWidth: 360 }}>
          {!showForm ? (
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => setShowForm(true)}
              sx={{
                height: 52,
                borderRadius: '12px',
                textTransform: 'none',
                fontSize: 15,
                boxShadow: '0 10px 30px rgba(37,32,24,0.12)',
              }}
            >
              登录
            </Button>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 3,
                borderRadius: '16px',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'var(--border)',
                boxShadow: '0 20px 54px rgba(37,32,24,0.1)',
              }}
            >
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: '#20201d' }}>登录到数字员工平台</Typography>
              <TextField
                fullWidth
                size="small"
                label="账号"
                value={username}
                error={Boolean(usernameError)}
                helperText={usernameError}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleUsernameKeyDown}
                InputProps={{
                  endAdornment: username ? (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label="清空账号" onClick={() => setUsername('')}>
                        <ClearOutlinedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
                sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
              />
              <TextField
                fullWidth
                size="small"
                type={showPassword ? 'text' : 'password'}
                label="密码"
                value={password}
                error={Boolean(passwordError)}
                helperText={passwordError}
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleUsernameKeyDown}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiInputBase-root': { borderRadius: '10px' } }}
              />
              {formError && (
                <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>{formError}</Typography>
              )}
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                onClick={() => void login()}
                sx={{ height: 46, borderRadius: '10px', textTransform: 'none', fontSize: 15 }}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : '进入工作台'}
              </Button>
              <Typography
                component="button"
                onClick={() => setShowForm(false)}
                sx={{ alignSelf: 'center', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted-foreground)' }}
              >
                返回
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* 底部产品预览大图（StaffDeck login-preview.png，100% 迁移展现） */}
      <Box
        component="img"
        src={staffdeckContent.loginPreview}
        alt="数字员工平台产品预览"
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: '26vh',
          objectFit: 'cover',
          objectPosition: 'center top',
          borderTop: '1px solid',
          borderColor: 'var(--border)',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}

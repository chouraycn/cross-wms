/**
 * WMS×AI 代办 —「让仓库专员帮我查」通用按钮
 *
 * 点击后写入 sessionStorage['cdf-chat-prefill'] 并 navigate('/chat')，
 * AI 对话输入框会读取 sessionStorage 预填文本（TopBarChatInput useEffect）。
 *
 * 用法：
 *   <AskWarehouseAgentButton
 *     buildPrompt={() => `帮我分析...`}
 *     label="让仓库专员帮我查"
 *     tooltip="提示文案（可省略，默认=label）"
 *     disabled={items.length === 0}
 *   />
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tooltip } from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

interface Props {
  buildPrompt: () => string;
  label?: string;
  tooltip?: string;
  disabled?: boolean;
  /** 默认蓝色描边；若传 true 则用 text 样式 */
  variant?: 'outlined' | 'text' | 'contained';
  size?: 'small' | 'medium';
}

const AskWarehouseAgentButton: React.FC<Props> = ({
  buildPrompt,
  label = '让仓库专员帮我查',
  tooltip,
  disabled = false,
  variant = 'outlined',
  size = 'small',
}) => {
  const navigate = useNavigate();

  const onClick = () => {
    const prompt = buildPrompt();
    if (prompt) {
      try { sessionStorage.setItem('cdf-chat-prefill', prompt); } catch { /* ignore */ }
    }
    navigate('/chat');
  };

  const button = (
    <Button
      variant={variant}
      size={size}
      startIcon={<SupportAgentIcon sx={{ fontSize: 16 }} />}
      onClick={onClick}
      disabled={disabled}
      sx={variant === 'outlined' ? {
        textTransform: 'none',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        borderColor: '#2563EB',
        color: '#2563EB',
        '&:hover': { borderColor: '#1D4ED8', backgroundColor: '#EFF6FF' },
        '&:disabled': { borderColor: '#E5E7EB', color: '#9CA3AF' },
      } : variant === 'contained' ? {
        textTransform: 'none',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        backgroundColor: '#2563EB',
        color: '#fff',
        '&:hover': { backgroundColor: '#1D4ED8' },
        '&:disabled': { backgroundColor: '#E5E7EB', color: '#9CA3AF' },
      } : {
        textTransform: 'none',
        borderRadius: '8px',
        fontSize: '0.8125rem',
        color: '#2563EB',
        '&:hover': { backgroundColor: '#EFF6FF' },
      }}
    >
      {label}
    </Button>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{button}</Tooltip>;
  }
  return button;
};

export default AskWarehouseAgentButton;

import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

interface ChatHeroProps {
  onPromptClick: (prompt: string) => void;
  prompts?: { title: string; desc: string; icon: string }[];
  /** 是否显示 CDF Know 标题区域（空状态已有品牌时可关闭）默认 true */
  showTitle?: boolean;
}

const DEFAULT_PROMPTS = [
  { title: '查询今日入库单', desc: '查看今天的所有入库记录和状态', icon: '📥' },
  { title: '生成库存周报', desc: '按仓库维度汇总本周库存变动', icon: '📊' },
  { title: '维护SKU信息', desc: '批量更新商品编码和分类', icon: '🏷️' },
  { title: '分析拣货效率', desc: '对比各波次的拣货时长和准确率', icon: '⚡' },
];

export const ChatHero = React.memo(({ onPromptClick, prompts = DEFAULT_PROMPTS, showTitle = true }: ChatHeroProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const glowBackground = isDark
    ? 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.06) 40%, transparent 70%)'
    : 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, rgba(99,102,241,0.04) 40%, transparent 70%)';

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Hero Glow */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: glowBackground,
          filter: 'blur(40px)',
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {showTitle && (
          <>
            <Typography
              sx={{
                fontSize: '1.5rem',
                fontWeight: 600,
                mb: 1,
                background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              CDF Know
            </Typography>
            <Typography
              sx={{
                fontSize: '0.875rem',
                color: gs.textMuted,
                mb: 3,
              }}
            >
              我可以帮你查询库存、生成报表、维护商品信息，试试下面的快捷指令
            </Typography>
          </>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1.5,
            maxWidth: 480,
            width: '100%',
          }}
        >
          {prompts.map((p) => (
            <Box
              key={p.title}
              onClick={() => onPromptClick(p.title)}
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${gs.border}`,
                bgcolor: gs.bgPanel,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#3B82F6',
                  boxShadow: '0 2px 12px rgba(59,130,246,0.08)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <Box sx={{ fontSize: '1.5rem', mb: 0.5, lineHeight: 1 }}>{p.icon}</Box>
              <Typography
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: gs.textPrimary,
                  mb: 0.25,
                }}
              >
                {p.title}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: gs.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {p.desc}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
});

ChatHero.displayName = 'ChatHero';

export default ChatHero;

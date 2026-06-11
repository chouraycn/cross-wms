import React, { useMemo } from 'react';
import { Box, Typography, Link } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import { getGrayScale } from '../../constants/theme';
import { useTheme } from '@mui/material/styles';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain: string;
}

interface LinkPreviewProps {
  url: string;
}

/**
 * 从 URL 中提取域名
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // 简单正则兜底
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    return match?.[1] || url;
  }
}

/**
 * 从 URL 路径中提取可能的页面标题（兜底）
 */
function extractPathTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '').replace(/\/+$/, '');
    if (!path) return parsed.hostname;
    // 将路径中的连字符和下划线替换为空格，并首字母大写
    return path
      .split('/')
      .pop()
      ?.replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * 生成域名对应的 favicon URL
 */
function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * 链接卡片预览组件
 *
 * 由于跨域限制，无法直接获取 OpenGraph 信息，
 * 因此使用 URL 解析提取域名和路径信息作为兜底展示。
 */
export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const data = useMemo<LinkPreviewData>(() => {
    const domain = extractDomain(url);
    const title = extractPathTitle(url);
    return {
      url,
      domain,
      title,
      description: `来自 ${domain} 的链接`,
      image: getFaviconUrl(domain),
    };
  }, [url]);

  return (
    <Link
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      underline="none"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: '10px',
        border: `1px solid ${gs.border}`,
        bgcolor: isDark ? '#1A1A1A' : '#FAFAFA',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          bgcolor: isDark ? '#222222' : '#F3F4F6',
          borderColor: gs.borderDarker,
        },
        maxWidth: 480,
        width: '100%',
      }}
    >
      {/* 左侧图片 / Favicon */}
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '8px',
          bgcolor: isDark ? '#2A2A2A' : '#FFFFFF',
          border: `1px solid ${gs.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {data.image ? (
          <img
            src={data.image}
            alt={data.domain}
            style={{ width: 32, height: 32, objectFit: 'contain' }}
            onError={(e) => {
              // favicon 加载失败时显示默认图标
              const target = e.currentTarget;
              target.style.display = 'none';
              target.parentElement?.querySelector('.fallback-icon')?.setAttribute('style', 'display:flex');
            }}
          />
        ) : null}
        <Box
          className="fallback-icon"
          sx={{
            display: data.image ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinkIcon sx={{ fontSize: 24, color: gs.textMuted }} />
        </Box>
      </Box>

      {/* 右侧标题 / 描述 */}
      <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: gs.textPrimary,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.title}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            color: gs.textSecondary,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.description}
        </Typography>
        <Typography
          sx={{
            fontSize: 10,
            color: gs.textMuted,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.domain}
        </Typography>
      </Box>
    </Link>
  );
};

export default LinkPreview;

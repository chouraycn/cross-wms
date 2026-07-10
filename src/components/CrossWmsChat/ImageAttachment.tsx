import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import { GrayScale } from '../../constants/theme.js';

interface ImageAttachmentProps {
  att: {
    id: string;
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
  };
  isDark: boolean;
  gs: GrayScale;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ att, isDark, gs }) => {
  const [loadError, setLoadError] = useState(false);

  const handleClick = () => {
    window.open(att.url, '_blank');
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        borderRadius: '8px',
        bgcolor: isDark ? '#1E293B' : '#F8FAFC',
        border: `1px solid ${gs.border}`,
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: isDark ? '#263348' : '#EFF6FF' },
        maxWidth: 280,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '6px',
          overflow: 'hidden',
          flexShrink: 0,
          border: '1px solid',
          borderColor: gs.border,
          bgcolor: isDark ? '#0F172A' : '#F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loadError ? (
          <ImageIcon sx={{ fontSize: 20, color: '#F59E0B' }} />
        ) : (
          <img
            src={att.url}
            alt={att.fileName}
            onError={() => setLoadError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </Box>
      <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 12,
            color: gs.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
          }}
        >
          {att.fileName}
        </Typography>
        <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
          {formatFileSize(att.size)}
        </Typography>
      </Box>
    </Box>
  );
};

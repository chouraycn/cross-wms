import React, { useState } from 'react';
import { Box, Chip } from '@mui/material';
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

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ att, isDark, gs }) => {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <Chip
        icon={<ImageIcon sx={{ fontSize: 16, color: '#F59E0B' }} />}
        label={`${att.fileName} (${(att.size / 1024).toFixed(1)}KB)`}
        size="small"
        clickable
        onClick={() => window.open(att.url, '_blank')}
        sx={{
          height: 30,
          fontSize: 12,
          bgcolor: isDark ? '#1E293B' : '#F8FAFC',
          border: `1px solid ${gs.border}`,
          '& .MuiChip-label': { px: 1 },
          '&:hover': { bgcolor: isDark ? '#263348' : '#EFF6FF' },
        }}
      />
    );
  }

  return (
    <Box
      component="img"
      src={att.url}
      alt={att.fileName}
      onError={() => setLoadError(true)}
      onClick={() => window.open(att.url, '_blank')}
      sx={{
        maxHeight: 200,
        maxWidth: '100%',
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        objectFit: 'cover',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        '&:hover': { opacity: 0.85 },
      }}
    />
  );
};
